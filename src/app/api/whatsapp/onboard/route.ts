import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  exchangeCodeForToken,
  getPhoneNumber,
  requestSmbSync,
  subscribeAppToWaba,
} from "@/lib/whatsapp/graph";

type Body = {
  code?: string;
  waba_id?: string;
  phone_number_id?: string;
  business_id?: string;
};

/**
 * Se llama al terminar Embedded Signup (coexistencia). Guarda la cuenta y pide
 * de inmediato la sincronización de contactos e historial (Meta da solo 24 h).
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "No autenticado" }, { status: 401 });

  const body = (await request.json()) as Body;
  if (!body.code || !body.waba_id || !body.phone_number_id) {
    return Response.json({ error: "Faltan datos de Embedded Signup" }, { status: 400 });
  }

  const { data: membership } = await supabase
    .from("memberships")
    .select("org_id")
    .eq("user_id", user.id)
    .limit(1)
    .single();
  if (!membership) return Response.json({ error: "Sin organización" }, { status: 403 });

  const db = createAdminClient();

  const { data: existing } = await db
    .from("whatsapp_accounts")
    .select("org_id")
    .eq("phone_number_id", body.phone_number_id)
    .maybeSingle();
  if (existing && existing.org_id !== membership.org_id) {
    return Response.json({ error: "Este número ya está conectado a otra cuenta" }, { status: 409 });
  }

  let accountId: string | undefined;
  try {
    const token = await exchangeCodeForToken(body.code);
    await subscribeAppToWaba(body.waba_id, token);
    const phone = await getPhoneNumber(body.phone_number_id, token);

    const { data: account, error } = await db
      .from("whatsapp_accounts")
      .upsert(
        {
          org_id: membership.org_id,
          waba_id: body.waba_id,
          phone_number_id: body.phone_number_id,
          business_id: body.business_id ?? null,
          display_phone_number: phone.display_phone_number,
          verified_name: phone.verified_name,
          status: "onboarding",
          onboarded_at: new Date().toISOString(),
          history_sync_status: "pending",
          history_progress: 0,
          last_error: null,
        },
        { onConflict: "phone_number_id" },
      )
      .select("id")
      .single();
    if (error) throw error;
    accountId = account.id;

    await db
      .from("whatsapp_credentials")
      .upsert({ account_id: accountId, access_token: token, updated_at: new Date().toISOString() });

    // Orden recomendado por Meta: primero contactos, después historial.
    await requestSmbSync(body.phone_number_id, token, "smb_app_state_sync");
    await db
      .from("whatsapp_accounts")
      .update({ contacts_sync_requested_at: new Date().toISOString() })
      .eq("id", accountId);

    await requestSmbSync(body.phone_number_id, token, "history");
    await db
      .from("whatsapp_accounts")
      .update({
        status: "connected",
        history_sync_requested_at: new Date().toISOString(),
        history_sync_status: "requested",
      })
      .eq("id", accountId);

    return Response.json({ ok: true, account_id: accountId });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (accountId) {
      await db
        .from("whatsapp_accounts")
        .update({ status: "error", last_error: message })
        .eq("id", accountId);
    }
    return Response.json({ error: message }, { status: 502 });
  }
}
