"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAccountWithToken } from "@/lib/whatsapp/account";
import { createTemplate, sendMessage, type SendMessageInput } from "@/lib/whatsapp/graph";
import { saveMessages, type WaMessage } from "@/lib/whatsapp/ingest";

export type ActionState = { ok: boolean; message: string } | null;

const digits = (s: string) => s.replace(/\D/g, "");

/** wa_id con el que WhatsApp identifica al contacto en los webhooks (México 521…, Argentina 549…). */
const toWaId = (n: string) =>
  /^52\d{10}$/.test(n) ? `521${n.slice(2)}` : /^54\d{10}$/.test(n) ? `549${n.slice(2)}` : n;

/** El otro formato del mismo número (con o sin el 1/9 de móvil), o null si no aplica. */
const alternateFormat = (n: string) =>
  /^52\d{10}$/.test(n) || /^54\d{10}$/.test(n)
    ? toWaId(n)
    : /^521\d{10}$/.test(n) || /^549\d{10}$/.test(n)
      ? n.slice(0, 2) + n.slice(3)
      : null;

export async function sendMessageAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const accountId = String(formData.get("account_id"));
  const to = digits(String(formData.get("to") ?? ""));
  const kind = formData.get("kind") === "template" ? "template" : "text";

  const ctx = await getAccountWithToken(accountId);
  if (!ctx) return { ok: false, message: "Cuenta no encontrada" };
  if (to.length < 8) return { ok: false, message: "Escribe el número con código de país, ej. 5215512345678" };

  const input: SendMessageInput =
    kind === "text"
      ? { kind, to, text: String(formData.get("text") ?? "").trim() }
      : {
          kind,
          to,
          name: String(formData.get("template_name") ?? ""),
          language: String(formData.get("template_language") ?? ""),
        };
  if (input.kind === "text" && !input.text) return { ok: false, message: "Escribe un mensaje" };

  try {
    let res;
    try {
      res = await sendMessage(ctx.account.phone_number_id, ctx.token, input);
    } catch (err) {
      // La lista de destinatarios de prueba guarda el número tal como se registró (52… o 521…).
      const alt = alternateFormat(to);
      if (!alt || !(err instanceof Error) || !err.message.includes("131030")) throw err;
      res = await sendMessage(ctx.account.phone_number_id, ctx.token, { ...input, to: alt });
    }
    const wamid = res.messages[0].id;
    const now = Math.floor(Date.now() / 1000).toString();
    const body = input.kind === "text" ? input.text : `[plantilla ${input.name}]`;

    await saveMessages(createAdminClient(), accountId, [
      {
        contact: toWaId(to),
        wamid,
        direction: "outbound",
        source: "api",
        type: input.kind,
        body,
        sent_at: new Date().toISOString(),
        status: "sent",
        raw: { id: wamid, from: ctx.account.display_phone_number ?? "", to, timestamp: now, type: input.kind } as WaMessage,
      },
    ]);
    revalidatePath("/dashboard");
    return { ok: true, message: `Mensaje enviado (${wamid})` };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

export async function createTemplateAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const accountId = String(formData.get("account_id"));
  const ctx = await getAccountWithToken(accountId);
  if (!ctx) return { ok: false, message: "Cuenta no encontrada" };

  const name = String(formData.get("name") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  if (!/^[a-z0-9_]{1,512}$/.test(name)) {
    return { ok: false, message: "El nombre solo puede tener minúsculas, números y guion bajo" };
  }
  if (!body) return { ok: false, message: "Escribe el texto de la plantilla" };

  try {
    const res = await createTemplate(ctx.account.waba_id, ctx.token, {
      name,
      body,
      language: String(formData.get("language") ?? "es_MX"),
      category: formData.get("category") === "MARKETING" ? "MARKETING" : "UTILITY",
    });
    revalidatePath(`/dashboard/accounts/${accountId}`);
    return { ok: true, message: `Plantilla creada: ${res.status}` };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}
