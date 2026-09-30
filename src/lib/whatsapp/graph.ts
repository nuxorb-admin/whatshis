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

export type SendMessageInput =
  | { kind: "text"; to: string; text: string }
  | { kind: "template"; to: string; name: string; language: string };

/**
 * Envía un mensaje. El texto libre solo se entrega si el contacto escribió en las últimas 24 h;
 * fuera de esa ventana hay que usar una plantilla aprobada.
 */
export function sendMessage(phoneNumberId: string, token: string, input: SendMessageInput) {
  const body =
    input.kind === "text"
      ? { type: "text", text: { body: input.text } }
      : { type: "template", template: { name: input.name, language: { code: input.language } } };

  return graph<{ messages: { id: string }[] }>(`/${phoneNumberId}/messages`, {
    method: "POST",
    token,
    body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to: input.to, ...body }),
  });
}

export type MessageTemplate = {
  id: string;
  name: string;
  language: string;
  status: string;
  category: string;
  components: { type: string; text?: string }[];
};

export async function listTemplates(wabaId: string, token: string) {
  const data = await graph<{ data: MessageTemplate[] }>(
    `/${wabaId}/message_templates?fields=id,name,language,status,category,components&limit=100`,
    { token },
  );
  return data.data;
}

export function createTemplate(
  wabaId: string,
  token: string,
  input: { name: string; language: string; category: "UTILITY" | "MARKETING"; body: string },
) {
  return graph<{ id: string; status: string; category: string }>(`/${wabaId}/message_templates`, {
    method: "POST",
    token,
    body: JSON.stringify({
      name: input.name,
      language: input.language,
      category: input.category,
      components: [{ type: "BODY", text: input.body }],
    }),
  });
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
