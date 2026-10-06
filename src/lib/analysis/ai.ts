import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import * as z from "zod/v4";
import { TIME_ZONE, type Metrics } from "./metrics";

export const MODEL = "claude-opus-5-5";

// Si el modelo rechaza una solicitud, Anthropic la reintenta en el modelo de respaldo recomendado.
const FALLBACK = { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const };

let client: Anthropic | null = null;
const anthropic = () => (client ??= new Anthropic());

// ─── Análisis por conversación ─────────────────────────────────────────────

export const ConversationAnalysisSchema = z.object({
  resumen: z.string().describe("1-2 frases: qué pidió el cliente y cómo terminó."),
  temas: z.array(z.string()).describe("2-5 etiquetas cortas en minúsculas, p. ej. 'corte y barba', 'precio', 'horarios'."),
  servicios_mencionados: z.array(z.string()).describe("Productos o servicios concretos mencionados."),
  intencion_principal: z.enum(["agendar_cita", "comprar", "cotizar_precio", "informacion", "reprogramar_cancelar", "queja", "seguimiento", "otro"]),
  resultado: z
    .enum(["concretada", "perdida", "sin_respuesta", "en_curso", "no_aplica"])
    .describe("Resultado de la solicitud MÁS RECIENTE del cliente."),
  solicitudes_concretadas: z.number().int().describe("Cuántas veces se concretó una cita/venta en toda la conversación."),
  solicitudes_perdidas: z.number().int().describe("Cuántas solicitudes no se concretaron."),
  motivo_perdida: z.string().nullable().describe("Por qué se perdió la última oportunidad, si aplica; si no, null."),
  sentimiento: z.enum(["positivo", "neutral", "negativo"]),
  queja: z.string().nullable().describe("Queja o molestia concreta del cliente; null si no hubo."),
  calidad_atencion: z.enum(["buena", "regular", "mala"]).describe("Cómo atendió el negocio: rapidez, claridad, amabilidad."),
  sugerencia: z.string().nullable().describe("Acción concreta de seguimiento con este cliente; null si no hace falta."),
});
export type ConversationAnalysis = z.infer<typeof ConversationAnalysisSchema>;

// Los prompts de sistema son editables por administradores: ver prompts.ts y /dashboard/admin/prompts.

function formatTranscript(messages: { direction: string; body: string | null; type: string; sent_at: string }[]) {
  const fmt = new Intl.DateTimeFormat("es-MX", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return messages
    .map((m) => `[${fmt.format(new Date(m.sent_at))}] ${m.direction === "outbound" ? "Negocio" : "Cliente"}: ${m.body ?? `[${m.type}]`}`)
    .join("\n");
}

export async function analyzeConversation(
  systemPrompt: string,
  businessName: string,
  messages: { direction: string; body: string | null; type: string; sent_at: string }[],
): Promise<ConversationAnalysis> {
  const response = await anthropic().beta.messages.parse({
    model: MODEL,
    max_tokens: 4000,
    ...FALLBACK,
    output_config: { effort: "medium", format: betaZodOutputFormat(ConversationAnalysisSchema) },
    system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
    messages: [
      {
        role: "user",
        content: `Negocio: ${businessName}\n\n<conversacion>\n${formatTranscript(messages)}\n</conversacion>`,
      },
    ],
  });

  if (response.stop_reason === "refusal") throw new Error("El modelo rechazó analizar esta conversación");
  if (!response.parsed_output) throw new Error(`Respuesta sin formato válido (stop_reason: ${response.stop_reason})`);
  return response.parsed_output;
}

// ─── Resumen del negocio ───────────────────────────────────────────────────

export const BusinessSummarySchema = z.object({
  resumen_ejecutivo: z.string().describe("3-4 frases con lo más importante para el dueño del negocio."),
  temas_principales: z
    .array(z.object({ tema: z.string(), conversaciones: z.number().int(), detalle: z.string() }))
    .describe("Temas consolidados (une etiquetas equivalentes), de más a menos frecuente."),
  hallazgos: z
    .array(z.object({ titulo: z.string(), detalle: z.string(), tipo: z.enum(["positivo", "problema", "oportunidad"]) }))
    .describe("3-6 hallazgos concretos, citando cifras cuando existan."),
  recomendaciones: z
    .array(z.object({ titulo: z.string(), detalle: z.string(), impacto: z.enum(["alto", "medio", "bajo"]) }))
    .describe("3-5 acciones concretas, ordenadas por impacto."),
});
export type BusinessSummary = z.infer<typeof BusinessSummarySchema>;

export async function summarizeBusiness(
  systemPrompt: string,
  businessName: string,
  metrics: Metrics,
  conversations: { cliente: string; analisis: ConversationAnalysis }[],
): Promise<BusinessSummary> {
  const { unansweredConversationIds, ...metricsForModel } = metrics;
  const payload = {
    negocio: businessName,
    zona_horaria: TIME_ZONE,
    metricas: { ...metricsForModel, conversaciones_sin_responder: unansweredConversationIds.length },
    conversaciones: conversations,
  };

  const response = await anthropic().beta.messages.parse({
    model: MODEL,
    max_tokens: 8000,
    ...FALLBACK,
    output_config: { effort: "high", format: betaZodOutputFormat(BusinessSummarySchema) },
    system: systemPrompt,
    messages: [{ role: "user", content: JSON.stringify(payload) }],
  });

  if (response.stop_reason === "refusal") throw new Error("El modelo rechazó generar el resumen");
  if (!response.parsed_output) throw new Error(`Resumen sin formato válido (stop_reason: ${response.stop_reason})`);
  return response.parsed_output;
}
