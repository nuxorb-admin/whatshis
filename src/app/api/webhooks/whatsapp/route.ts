import { createHmac, timingSafeEqual } from "node:crypto";
import { after, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { processWebhook, type WebhookPayload } from "@/lib/whatsapp/ingest";

// Verificación del webhook al configurarlo en el panel de Meta.
export function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  if (
    params.get("hub.mode") === "subscribe" &&
    params.get("hub.verify_token") === env.metaWebhookVerifyToken()
  ) {
    return new Response(params.get("hub.challenge") ?? "", { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

function validSignature(rawBody: string, header: string | null) {
  if (!header?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", env.metaAppSecret()).update(rawBody).digest("hex");
  const received = header.slice("sha256=".length);
  return (
    expected.length === received.length &&
    timingSafeEqual(Buffer.from(expected), Buffer.from(received))
  );
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  if (!validSignature(rawBody, request.headers.get("x-hub-signature-256"))) {
    return new Response("Invalid signature", { status: 401 });
  }

  const payload = JSON.parse(rawBody) as WebhookPayload;
  const change = payload.entry?.[0]?.changes?.[0];
  const db = createAdminClient();

  // Guardamos el evento crudo primero; si el procesamiento falla se puede reprocesar.
  const { data: event, error } = await db
    .from("webhook_events")
    .insert({
      field: change?.field ?? null,
      phone_number_id: change?.value.metadata?.phone_number_id ?? null,
      payload,
    })
    .select("id")
    .single();
  if (error) return new Response("DB error", { status: 500 }); // Meta reintentará

  // Respondemos 200 rápido y procesamos después.
  after(async () => {
    try {
      await processWebhook(db, payload);
      await db
        .from("webhook_events")
        .update({ processed_at: new Date().toISOString() })
        .eq("id", event.id);
    } catch (err) {
      await db
        .from("webhook_events")
        .update({ error: err instanceof Error ? err.message : String(err) })
        .eq("id", event.id);
    }
  });

  return new Response("OK", { status: 200 });
}
