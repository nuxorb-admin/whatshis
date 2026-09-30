// Vincula manualmente una cuenta de WhatsApp (p. ej. el número de prueba de Meta) a un usuario
// de la plataforma, sin pasar por Embedded Signup. Útil para grabar el video de App Review.
//
// Agrega a .env.local:
//   LINK_USER_EMAIL=correo con el que te registraste en la plataforma
//   LINK_WABA_ID=WhatsApp Business Account ID   (WhatsApp → API Setup)
//   LINK_PHONE_NUMBER_ID=Phone number ID         (WhatsApp → API Setup)
//   LINK_ACCESS_TOKEN=token con permisos de WhatsApp
// y ejecuta:  node scripts/link-test-account.mjs

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);

for (const k of ["LINK_USER_EMAIL", "LINK_WABA_ID", "LINK_PHONE_NUMBER_ID", "LINK_ACCESS_TOKEN"]) {
  if (!env[k]) throw new Error(`Falta ${k} en .env.local`);
}

const graphVersion = env.META_GRAPH_VERSION || "v25.0";
const token = env.LINK_ACCESS_TOKEN;
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const { data: profile } = await db.from("profiles").select("id").eq("email", env.LINK_USER_EMAIL).single();
if (!profile) throw new Error("No existe un usuario con ese correo en la plataforma");
const { data: membership } = await db.from("memberships").select("org_id").eq("user_id", profile.id).limit(1).single();

const phoneRes = await fetch(
  `https://graph.facebook.com/${graphVersion}/${env.LINK_PHONE_NUMBER_ID}?fields=display_phone_number,verified_name`,
  { headers: { Authorization: `Bearer ${token}` } },
);
const phone = await phoneRes.json();
if (!phoneRes.ok) throw new Error(`Meta: ${phone.error?.message}`);

// Suscribe la app a la WABA para recibir webhooks (mensajes entrantes y estados).
const subRes = await fetch(`https://graph.facebook.com/${graphVersion}/${env.LINK_WABA_ID}/subscribed_apps`, {
  method: "POST",
  headers: { Authorization: `Bearer ${token}` },
});
if (!subRes.ok) console.warn("Aviso: no se pudo suscribir la app a la WABA:", (await subRes.json()).error?.message);

// Llamadas de prueba que App Review exige para cada permiso.
const graphGet = async (label, path) => {
  const res = await fetch(`https://graph.facebook.com/${graphVersion}/${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await res.json();
  console.log(`${res.ok ? "OK   " : "FALLA"} ${label}${res.ok ? "" : ` — ${body.error?.message}`}`);
  return res.ok ? body : null;
};
const waba = await graphGet(
  "whatsapp_business_management: datos de la WABA",
  `${env.LINK_WABA_ID}?fields=id,name,owner_business_info`,
);
await graphGet("whatsapp_business_management: plantillas", `${env.LINK_WABA_ID}/message_templates?limit=5`);
const businessId = waba?.owner_business_info?.id;
if (businessId) {
  await graphGet("business_management: portafolio de negocio", `${businessId}?fields=id,name`);
  await graphGet("business_management: WABAs del portafolio", `${businessId}/owned_whatsapp_business_accounts`);
} else {
  console.warn("Aviso: no se obtuvo el business ID; haz la llamada de business_management en el Graph API Explorer (GET me/businesses)");
}

const { data: account, error } = await db
  .from("whatsapp_accounts")
  .upsert(
    {
      org_id: membership.org_id,
      waba_id: env.LINK_WABA_ID,
      phone_number_id: env.LINK_PHONE_NUMBER_ID,
      business_id: businessId ?? null,
      display_phone_number: phone.display_phone_number.replace(/\D/g, ""),
      verified_name: phone.verified_name,
      status: "connected",
      history_sync_status: "pending",
    },
    { onConflict: "phone_number_id" },
  )
  .select("id")
  .single();
if (error) throw error;

const { error: credErr } = await db
  .from("whatsapp_credentials")
  .upsert({ account_id: account.id, access_token: token, updated_at: new Date().toISOString() });
if (credErr) throw credErr;

console.log(`Listo: ${phone.verified_name} (+${phone.display_phone_number}) vinculado a ${env.LINK_USER_EMAIL}`);
