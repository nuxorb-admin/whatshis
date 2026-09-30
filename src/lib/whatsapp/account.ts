import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Devuelve la cuenta solo si el usuario actual puede verla (RLS), junto con su token de Meta.
 */
export async function getAccountWithToken(accountId: string) {
  const supabase = await createClient();
  const { data: account } = await supabase
    .from("whatsapp_accounts")
    .select("id, waba_id, phone_number_id, display_phone_number, verified_name, status")
    .eq("id", accountId)
    .maybeSingle();
  if (!account) return null;

  const { data: cred } = await createAdminClient()
    .from("whatsapp_credentials")
    .select("access_token")
    .eq("account_id", accountId)
    .maybeSingle();
  if (!cred) return null;

  return { account, token: cred.access_token as string };
}
