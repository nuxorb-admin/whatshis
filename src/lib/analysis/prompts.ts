import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

export type PromptKey = "conversation" | "summary";

export const PROMPT_LABELS: Record<PromptKey, { title: string; description: string }> = {
  conversation: {
    title: "Análisis de cada conversación",
    description: "Se envía junto con cada chat completo. Define cómo se clasifica resultado, intención, sentimiento, quejas, etc.",
  },
  summary: {
    title: "Resumen del negocio",
    description: "Se envía con las métricas y los análisis de todas las conversaciones. Define el tono y enfoque del diagnóstico.",
  },
};

export const DEFAULT_PROMPTS: Record<PromptKey, string> = {
  conversation: `Eres analista de atención al cliente para pequeños negocios en México.
Recibirás una conversación de WhatsApp entre un negocio ("Negocio") y uno de sus clientes ("Cliente"), con fecha y hora local.
Analízala con objetividad y responde en español con el formato pedido.

Criterios:
- "concretada": el cliente agendó/compró o confirmó. "perdida": pidió algo y no se cerró (no había horario, precio, dejó de responder tras una oferta). "sin_respuesta": el negocio no respondió la última solicitud. "en_curso": la conversación sigue abierta y es reciente. "no_aplica": no hubo solicitud comercial.
- Los mensajes automáticos de bienvenida del negocio no cuentan como respuesta real.
- Sé concreto y breve. No inventes datos que no estén en la conversación.`,
  summary: `Eres consultor de negocio para pequeñas empresas en México.
Recibirás métricas de atención por WhatsApp y el análisis de cada conversación de un negocio.
Escribe un diagnóstico útil para el dueño: claro, directo, en español, sin jerga técnica.
Basa cada afirmación en los datos recibidos y menciona cifras. No inventes información.`,
};

export type ActivePrompt = { content: string; hash: string; versionId: string | null };

export const promptHash = (content: string) => createHash("sha256").update(content).digest("hex").slice(0, 16);

/** Versión vigente de un prompt (la más reciente guardada) o la predeterminada. */
export async function getActivePrompt(db: SupabaseClient, key: PromptKey): Promise<ActivePrompt> {
  const { data } = await db
    .from("prompt_versions")
    .select("id, content")
    .eq("key", key)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const content = data?.content ?? DEFAULT_PROMPTS[key];
  return { content, hash: promptHash(content), versionId: data?.id ?? null };
}
