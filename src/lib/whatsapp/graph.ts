import "server-only";
import { env } from "@/lib/env";

const base = () => `https://graph.facebook.com/${env.graphVersion()}`;

async function graph<T>(path: string, init: RequestInit & { token?: string } = {}): Promise<T> {
  const { token, headers, ...rest } = init;
  const res = await fetch(`${base()}${path}`, {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    cache: "no-store",
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = body?.error?.message ?? res.statusText;
    throw new Error(`Graph API ${path}: ${message}`);
  }
  return body as T;
}

/** Intercambia el código de Embedded Signup por un token de negocio. */
export async function exchangeCodeForToken(code: string): Promise<string> {
  const params = new URLSearchParams({
    client_id: env.metaAppId(),
    client_secret: env.metaAppSecret(),
    code,
  });
  const data = await graph<{ access_token: string }>(`/oauth/access_token?${params}`);
  return data.access_token;
}

/** Suscribe nuestra app a los webhooks de la WABA del cliente. */
export function subscribeAppToWaba(wabaId: string, token: string) {
  return graph<{ success: boolean }>(`/${wabaId}/subscribed_apps`, { method: "POST", token });
}

export function getPhoneNumber(phoneNumberId: string, token: string) {
  return graph<{ display_phone_number: string; verified_name: string }>(
    `/${phoneNumberId}?fields=display_phone_number,verified_name`,
    { token },
  );
}

/**
 * Pide a Meta que sincronice contactos ("smb_app_state_sync") o historial ("history")
 * de la app WhatsApp Business. Solo se puede dentro de las 24 h posteriores al onboarding.
 */
export function requestSmbSync(
  phoneNumberId: string,
  token: string,
  syncType: "smb_app_state_sync" | "history",
) {
  return graph<{ request_id: string }>(`/${phoneNumberId}/smb_app_data`, {
    method: "POST",
    token,
    body: JSON.stringify({ messaging_product: "whatsapp", sync_type: syncType }),
  });
}
