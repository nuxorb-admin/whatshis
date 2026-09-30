import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// Tipos mínimos de los payloads de webhook de WhatsApp que usamos.
export type WaMessage = {
  id: string;
  from: string;
  to?: string;
  timestamp: string;
  type: string;
  [key: string]: unknown;
};

type ChangeValue = {
  metadata?: { phone_number_id: string; display_phone_number: string };
  messages?: WaMessage[];
  contacts?: { wa_id: string; profile?: { name?: string } }[];
  statuses?: { id: string; status: string; recipient_id: string }[];
  message_echoes?: WaMessage[];
  history?: {
    metadata?: { phase: number; chunk_order: number; progress: number };
    threads?: { id: string; messages: (WaMessage & { history_context?: { status?: string } })[] }[];
    errors?: { code: number; message: string }[];
  }[];
  state_sync?: {
    type: string;
    action: "add" | "edit" | "remove";
    contact?: { full_name?: string; first_name?: string; phone_number: string };
  }[];
};

export type WebhookPayload = {
  object: string;
  entry?: { id: string; changes?: { field: string; value: ChangeValue }[] }[];
};

type Account = { id: string; display_phone_number: string | null };

export type MessageRow = {
  contact: string;
  wamid: string;
  direction: "inbound" | "outbound";
  source: "history" | "live" | "echo" | "api";
  type: string;
  body: string | null;
  sent_at: string;
  status: string | null;
  raw: WaMessage;
};

const digits = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");

/** Texto legible de cualquier tipo de mensaje, para búsqueda y análisis. */
export function extractBody(msg: WaMessage): string | null {
  const m = msg as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  switch (msg.type) {
    case "text":
      return m.text?.body ?? null;
    case "image":
    case "video":
    case "document":
      return m[msg.type]?.caption ?? `[${msg.type}]`;
    case "audio":
      return "[audio]";
    case "sticker":
      return "[sticker]";
    case "reaction":
      return m.reaction?.emoji ? `[reacción ${m.reaction.emoji}]` : null;
    case "location":
      return `[ubicación ${m.location?.name ?? ""}]`.trim();
    case "button":
      return m.button?.text ?? null;
    case "interactive":
      return (
        m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? "[interactivo]"
      );
    case "contacts":
      return "[contacto compartido]";
    default:
      return null;
  }
}

const toIso = (ts: string) => new Date(Number(ts) * 1000).toISOString();

export async function saveMessages(db: SupabaseClient, accountId: string, rows: MessageRow[]) {
  if (rows.length === 0) return;

  const contacts = [...new Set(rows.map((r) => r.contact))];
  const { data: convs, error: convErr } = await db
    .from("conversations")
    .upsert(
      contacts.map((c) => ({ account_id: accountId, contact_wa_id: c })),
      { onConflict: "account_id,contact_wa_id" },
    )
    .select("id, contact_wa_id");
  if (convErr) throw convErr;

  const convByContact = new Map(convs!.map((c) => [c.contact_wa_id, c.id as string]));

  const { error: msgErr } = await db.from("messages").upsert(
    rows.map(({ contact, ...r }) => ({
      ...r,
      account_id: accountId,
      conversation_id: convByContact.get(contact),
    })),
    { onConflict: "account_id,wamid", ignoreDuplicates: true },
  );
  if (msgErr) throw msgErr;

  const { error: rpcErr } = await db.rpc("refresh_conversation_bounds", {
    p_ids: [...convByContact.values()],
  });
  if (rpcErr) throw rpcErr;
}

async function handleHistory(db: SupabaseClient, account: Account, value: ChangeValue) {
  const business = digits(account.display_phone_number ?? value.metadata?.display_phone_number);

  for (const chunk of value.history ?? []) {
    if (chunk.errors?.length) {
      const declined = chunk.errors.some((e) => e.code === 2593109);
      await db
        .from("whatsapp_accounts")
        .update({
          history_sync_status: declined ? "declined" : "failed",
          last_error: chunk.errors.map((e) => `${e.code}: ${e.message}`).join("; "),
        })
        .eq("id", account.id);
      continue;
    }

    const rows: MessageRow[] = [];
    for (const thread of chunk.threads ?? []) {
      for (const msg of thread.messages ?? []) {
        rows.push({
          contact: thread.id,
          wamid: msg.id,
          direction: digits(msg.from) === business ? "outbound" : "inbound",
          source: "history",
          type: msg.type,
          body: extractBody(msg),
          sent_at: toIso(msg.timestamp),
          status: msg.history_context?.status?.toLowerCase() ?? null,
          raw: msg,
        });
      }
    }
    await saveMessages(db, account.id, rows);

    const progress = chunk.metadata?.progress ?? 0;
    await db
      .from("whatsapp_accounts")
      .update({
        history_progress: progress,
        history_sync_status: progress >= 100 ? "completed" : "in_progress",
      })
      .eq("id", account.id)
      .lte("history_progress", progress); // los fragmentos pueden llegar desordenados
  }
}

async function handleMessages(db: SupabaseClient, account: Account, value: ChangeValue) {
  if (value.contacts?.length) {
    await db.from("contacts").upsert(
      value.contacts.map((c) => ({
        account_id: account.id,
        wa_id: c.wa_id,
        full_name: c.profile?.name ?? null,
        updated_at: new Date().toISOString(),
      })),
      { onConflict: "account_id,wa_id" },
    );
  }

  await saveMessages(
    db,
    account.id,
    (value.messages ?? []).map((msg) => ({
      contact: msg.from,
      wamid: msg.id,
      direction: "inbound",
      source: "live",
      type: msg.type,
      body: extractBody(msg),
      sent_at: toIso(msg.timestamp),
      status: null,
      raw: msg,
    })),
  );

  for (const s of value.statuses ?? []) {
    await db
      .from("messages")
      .update({ status: s.status })
      .eq("account_id", account.id)
      .eq("wamid", s.id);
  }
}

async function handleEchoes(db: SupabaseClient, account: Account, value: ChangeValue) {
  await saveMessages(
    db,
    account.id,
    (value.message_echoes ?? []).map((msg) => ({
      contact: msg.to!,
      wamid: msg.id,
      direction: "outbound",
      source: "echo",
      type: msg.type,
      body: extractBody(msg),
      sent_at: toIso(msg.timestamp),
      status: null,
      raw: msg,
    })),
  );
}

async function handleStateSync(db: SupabaseClient, account: Account, value: ChangeValue) {
  for (const item of value.state_sync ?? []) {
    if (item.type !== "contact" || !item.contact) continue;
    const waId = digits(item.contact.phone_number);
    if (item.action === "remove") {
      await db.from("contacts").delete().eq("account_id", account.id).eq("wa_id", waId);
    } else {
      await db.from("contacts").upsert(
        {
          account_id: account.id,
          wa_id: waId,
          full_name: item.contact.full_name ?? null,
          first_name: item.contact.first_name ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "account_id,wa_id" },
      );
    }
  }
}

/** Procesa un payload de webhook completo. Lanza error si algo falla (para reintentar). */
export async function processWebhook(db: SupabaseClient, payload: WebhookPayload) {
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const phoneNumberId = change.value.metadata?.phone_number_id;
      if (!phoneNumberId) continue;

      const { data: account } = await db
        .from("whatsapp_accounts")
        .select("id, display_phone_number")
        .eq("phone_number_id", phoneNumberId)
        .maybeSingle();
      if (!account) continue; // número que no pertenece a ningún cliente nuestro

      switch (change.field) {
        case "history":
          await handleHistory(db, account, change.value);
          break;
        case "messages":
          await handleMessages(db, account, change.value);
          break;
        case "smb_message_echoes":
          await handleEchoes(db, account, change.value);
          break;
        case "smb_app_state_sync":
          await handleStateSync(db, account, change.value);
          break;
      }
    }
  }
}
