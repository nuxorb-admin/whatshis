// Simula la importación de historial por coexistencia a partir de chats exportados de WhatsApp.
//
// Convierte cada carpeta con un chat.txt (exportación "Exportar chat" de WhatsApp) en webhooks
// idénticos a los de Meta (smb_app_state_sync + history por fases), firmados con META_APP_SECRET,
// y los envía al webhook de la plataforma. Así se prueba el flujo real completo.
//
// Uso:
//   node scripts/simulate-history.mjs "<carpeta con chats>" <correo de la cuenta>
//   node scripts/simulate-history.mjs --delete <correo de la cuenta>     (borra la simulación)
//
// Variables (de .env.local): NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, META_APP_SECRET.
// Opcional: SIM_WEBHOOK_URL (por defecto https://whatshis.vercel.app/api/webhooks/whatsapp).

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createHash, createHmac } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);

const WEBHOOK_URL = env.SIM_WEBHOOK_URL || "https://whatshis.vercel.app/api/webhooks/whatsapp";
const SIM_PHONE_NUMBER_ID = "SIM-BARBERIA-NAPOLES";
const SIM_WABA_ID = "SIM-WABA";
const BUSINESS_NUMBER = "5215500000001";
const BUSINESS_NAME = "Barbería Nápoles (simulación)";
const UTC_OFFSET_HOURS = -6; // Ciudad de México
const HISTORY_DAYS = 180; // límite de Meta
const DAY = 86_400_000;

const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

async function orgIdFor(email) {
  const { data: profile } = await db.from("profiles").select("id").eq("email", email).single();
  if (!profile) throw new Error(`No existe un usuario con el correo ${email}`);
  const { data: m } = await db.from("memberships").select("org_id").eq("user_id", profile.id).limit(1).single();
  return m.org_id;
}

// ─── Parser de la exportación .txt de WhatsApp ─────────────────────────────

const LINE = /^‎?\[(\d{1,2})\/(\d{1,2})\/(\d{2}),\s(\d{1,2}):(\d{2}):(\d{2})[\s ]*([AP]M)\]\s([^:]+):\s?([\s\S]*)$/;

function toUtcMs(mo, d, yy, h, mi, s, ampm) {
  let hour = Number(h) % 12;
  if (ampm === "PM") hour += 12;
  return Date.UTC(2000 + Number(yy), Number(mo) - 1, Number(d), hour, Number(mi), Number(s)) - UTC_OFFSET_HOURS * 3_600_000;
}

function parseChat(text) {
  const messages = [];
  for (const raw of text.split(/\r?\n/)) {
    const m = LINE.exec(raw);
    if (m) {
      const [, mo, d, yy, h, mi, s, ampm, sender, body] = m;
      messages.push({ ts: toUtcMs(mo, d, yy, h, mi, s, ampm), sender: sender.trim(), body: body.replace(/‎/g, "") });
    } else if (messages.length) {
      messages[messages.length - 1].body += `\n${raw}`; // continuación de un mensaje multilínea
    }
  }
  return messages.map((msg) => ({ ...msg, body: msg.body.trim() }));
}

/** Convierte un mensaje parseado al formato de mensaje de Meta. Devuelve null si se omite. */
function toMetaMessage(msg, contactWaId, index) {
  const outbound = msg.sender === "Tú";
  if (/^(Eliminaste este mensaje|.*eliminó este mensaje)\.?$/.test(msg.body)) return null;

  const id = "wamid.SIM." + createHash("sha1").update(`${contactWaId}|${msg.ts}|${index}|${msg.body}`).digest("hex").slice(0, 24);
  const base = {
    from: outbound ? BUSINESS_NUMBER : contactWaId,
    id,
    timestamp: String(Math.floor(msg.ts / 1000)),
    history_context: { status: outbound ? "READ" : "DELIVERED" },
  };

  const media = /^<(imagen|video|mensaje de voz|audio|sticker|documento|GIF)[^>]*omitid[oa]>\s*/i.exec(msg.body);
  if (media) {
    const kind = media[1].toLowerCase();
    const caption = msg.body.slice(media[0].length).trim();
    const type =
      kind === "imagen" || kind === "gif" ? "image"
      : kind === "video" ? "video"
      : kind === "sticker" ? "sticker"
      : kind === "documento" ? "document"
      : "audio";
    return { ...base, type, [type]: caption ? { caption } : {} };
  }
  return { ...base, type: "text", text: { body: msg.body } };
}

// ─── Envío de webhooks firmados ────────────────────────────────────────────

async function sendWebhook(field, value) {
  const payload = {
    object: "whatsapp_business_account",
    entry: [
      {
        id: SIM_WABA_ID,
        changes: [
          {
            field,
            value: {
              messaging_product: "whatsapp",
              metadata: { display_phone_number: BUSINESS_NUMBER, phone_number_id: SIM_PHONE_NUMBER_ID },
              ...value,
            },
          },
        ],
      },
    ],
  };
  const raw = JSON.stringify(payload);
  const sig = "sha256=" + createHmac("sha256", env.META_APP_SECRET).update(raw).digest("hex");
  const res = await fetch(WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Hub-Signature-256": sig },
    body: raw,
  });
  if (!res.ok) throw new Error(`Webhook ${field}: HTTP ${res.status} ${await res.text()}`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ─── Main ──────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

if (args[0] === "--delete") {
  const orgId = await orgIdFor(args[1]);
  const { error } = await db
    .from("whatsapp_accounts")
    .delete()
    .eq("org_id", orgId)
    .eq("phone_number_id", SIM_PHONE_NUMBER_ID);
  if (error) throw error;
  await db.from("webhook_events").delete().eq("phone_number_id", SIM_PHONE_NUMBER_ID);
  console.log("Simulación borrada (cuenta, contactos, conversaciones, mensajes y eventos).");
  process.exit(0);
}

const dryRun = args.includes("--dry-run");
const [folder, email] = args.filter((a) => a !== "--dry-run");
if (!folder || (!email && !dryRun) || !existsSync(folder)) {
  console.error('Uso: node scripts/simulate-history.mjs "<carpeta con chats>" <correo> [--dry-run]');
  process.exit(1);
}

const onboardedAt = Date.now();
const cutoff = onboardedAt - HISTORY_DAYS * DAY;

// 1. Leer chats.
const chats = readdirSync(folder, { withFileTypes: true })
  .filter((d) => d.isDirectory() && existsSync(join(folder, d.name, "chat.txt")))
  .map((d, i) => {
    const contactWaId = `52155000001${String(i + 1).padStart(2, "0")}`;
    const parsed = parseChat(readFileSync(join(folder, d.name, "chat.txt"), "utf8"));
    const messages = parsed.map((m, idx) => ({ ts: m.ts, meta: toMetaMessage(m, contactWaId, idx) })).filter((m) => m.meta);
    return { name: d.name, contactWaId, messages };
  });

const total = chats.reduce((n, c) => n + c.messages.length, 0);
const kept = chats.reduce((n, c) => n + c.messages.filter((m) => m.ts >= cutoff).length, 0);
console.log(`${chats.length} chats, ${total} mensajes; ${total - kept} quedan fuera del límite de ${HISTORY_DAYS} días.`);

if (dryRun) {
  for (const c of chats) {
    const out = c.messages.filter((m) => m.meta.from === BUSINESS_NUMBER).length;
    const types = [...new Set(c.messages.map((m) => m.meta.type))].join(",");
    const first = new Date(c.messages[0]?.ts).toISOString().slice(0, 16);
    const last = new Date(c.messages.at(-1)?.ts).toISOString().slice(0, 16);
    console.log(`  ${c.name.padEnd(28)} ${String(c.messages.length).padStart(4)} msgs (${out} del negocio) tipos=${types} ${first} → ${last}`);
  }
  process.exit(0);
}

const orgId = await orgIdFor(email);

// 2. Cuenta simulada, como la dejaría el onboarding justo antes de recibir el historial.
const { data: existing } = await db
  .from("whatsapp_accounts")
  .select("org_id")
  .eq("phone_number_id", SIM_PHONE_NUMBER_ID)
  .maybeSingle();
if (existing && existing.org_id !== orgId) throw new Error("La simulación ya existe en otra cuenta; bórrala primero con --delete");

const { error: accErr } = await db.from("whatsapp_accounts").upsert(
  {
    org_id: orgId,
    waba_id: SIM_WABA_ID,
    phone_number_id: SIM_PHONE_NUMBER_ID,
    display_phone_number: BUSINESS_NUMBER,
    verified_name: BUSINESS_NAME,
    status: "connected",
    onboarded_at: new Date(onboardedAt).toISOString(),
    history_sync_requested_at: new Date(onboardedAt).toISOString(),
    history_sync_status: "requested",
    history_progress: 0,
    last_error: null,
  },
  { onConflict: "phone_number_id" },
);
if (accErr) throw accErr;

// 3. Contactos (smb_app_state_sync), como pide Meta: antes del historial.
await sendWebhook("smb_app_state_sync", {
  state_sync: chats.map((c) => ({
    type: "contact",
    action: "add",
    contact: { full_name: c.name, first_name: c.name.split(" ")[0], phone_number: c.contactWaId },
    metadata: { timestamp: String(Math.floor(onboardedAt / 1000)) },
  })),
});
console.log(`OK contactos (${chats.length})`);

// 4. Historial en 3 fases (0: día 0-1, 1: días 1-90, 2: días 90-180), un fragmento por chat y fase.
const phases = [
  [0, 1],
  [1, 90],
  [90, HISTORY_DAYS],
];
const chunks = [];
phases.forEach(([from, to], phase) => {
  let order = 0;
  for (const c of chats) {
    const msgs = c.messages.filter((m) => {
      const age = (onboardedAt - m.ts) / DAY;
      return age >= from && age < to;
    });
    if (msgs.length) chunks.push({ phase, chunk_order: ++order, thread: { id: c.contactWaId, messages: msgs.map((m) => m.meta) } });
  }
});

for (const [i, ch] of chunks.entries()) {
  const progress = Math.round(((i + 1) / chunks.length) * 100);
  await sendWebhook("history", {
    history: [{ metadata: { phase: ch.phase, chunk_order: ch.chunk_order, progress }, threads: [ch.thread] }],
  });
  console.log(`OK historial fase ${ch.phase} #${ch.chunk_order} (${ch.thread.messages.length} mensajes) → ${progress}%`);
  await sleep(400);
}

console.log(`\nListo: ${kept} mensajes enviados en ${chunks.length} fragmentos. Revisa el panel de ${email}.`);
