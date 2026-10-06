import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { BusinessSummary, ConversationAnalysis } from "@/lib/analysis/ai";
import type { Metrics } from "@/lib/analysis/metrics";
import { formatDate, formatMinutes } from "@/lib/format";
import RunAnalysis from "./RunAnalysis";

export const maxDuration = 60;

const BAR = "#2a78d6"; // una sola serie por gráfica: un solo color, sin leyenda

const resultadoLabel: Record<ConversationAnalysis["resultado"], string> = {
  concretada: "Concretada",
  perdida: "Perdida",
  sin_respuesta: "Sin respuesta",
  en_curso: "En curso",
  no_aplica: "Sin solicitud",
};
const intencionLabel: Record<ConversationAnalysis["intencion_principal"], string> = {
  agendar_cita: "Agendar cita",
  comprar: "Comprar",
  cotizar_precio: "Cotizar precio",
  informacion: "Información",
  reprogramar_cancelar: "Reprogramar / cancelar",
  queja: "Queja",
  seguimiento: "Seguimiento",
  otro: "Otro",
};
const tipoHallazgo = { positivo: "✓ Positivo", problema: "⚠ Problema", oportunidad: "↗ Oportunidad" } as const;
const WEEKDAYS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4">
      <p className="text-xs text-neutral-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
      {hint && <p className="mt-1 text-xs text-neutral-500">{hint}</p>}
    </div>
  );
}

/** Barras horizontales de una sola serie, con el valor como etiqueta directa. */
function HBars({ rows }: { rows: { label: string; value: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="space-y-1.5" role="table">
      {rows.map((r) => (
        <div key={r.label} role="row" className="grid grid-cols-[9rem_1fr_2rem] items-center gap-2 text-sm">
          <span role="cell" className="truncate text-neutral-700">{r.label}</span>
          <span role="cell" className="h-3">
            <span
              className="block h-full rounded-r"
              style={{ width: `${(r.value / max) * 100}%`, minWidth: r.value ? 4 : 0, background: BAR }}
            />
          </span>
          <span role="cell" className="text-right tabular-nums text-neutral-700">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

/** Columnas verticales (una sola serie) con tooltip al pasar el mouse. */
function Columns({ values, labels, unit }: { values: number[]; labels: string[]; unit: string }) {
  const max = Math.max(1, ...values);
  return (
    <div>
      <div className="flex h-32 items-end gap-0.5 border-b border-neutral-200">
        {values.map((v, i) => (
          <div key={i} className="group relative flex h-full flex-1 items-end">
            <div
              className="w-full rounded-t"
              style={{ height: `${(v / max) * 100}%`, minHeight: v ? 4 : 0, background: BAR }}
            />
            <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded bg-neutral-900 px-2 py-1 text-xs text-white group-hover:block">
              {labels[i]}: {v} {unit}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-0.5 text-[10px] text-neutral-500">
        {labels.map((l, i) => (
          <span key={i} className="flex-1 text-center">{values.length > 12 && i % 3 ? "" : l}</span>
        ))}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 rounded-xl border border-neutral-200 bg-white p-5">
      <h2 className="font-semibold">{title}</h2>
      {children}
    </section>
  );
}

export default async function AnalysisPage({ params }: PageProps<"/dashboard/accounts/[id]/analisis">) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: account } = await supabase
    .from("whatsapp_accounts")
    .select("id, verified_name, display_phone_number")
    .eq("id", id)
    .maybeSingle();
  if (!account) notFound();

  const [{ data: run }, { data: latest }, { data: convAnalyses }, { data: conversations }, { data: contacts }] =
    await Promise.all([
      supabase
        .from("analysis_runs")
        .select("status, conversations_total, conversations_done, error, finished_at")
        .eq("account_id", id)
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("analyses")
        .select("kind, result, created_at")
        .eq("account_id", id)
        .in("kind", ["metrics", "summary"])
        .order("created_at", { ascending: false })
        .limit(2),
      supabase
        .from("analyses")
        .select("conversation_id, result, created_at")
        .eq("account_id", id)
        .eq("kind", "conversation")
        .order("created_at", { ascending: false }),
      supabase.from("conversations").select("id, contact_wa_id, last_message_at").eq("account_id", id),
      supabase.from("contacts").select("wa_id, full_name").eq("account_id", id),
    ]);

  const metrics = latest?.find((a) => a.kind === "metrics")?.result as Metrics | undefined;
  const summaryRow = latest?.find((a) => a.kind === "summary");
  const summary = summaryRow?.result as BusinessSummary | undefined;

  // Último análisis de cada conversación.
  const perConversation = new Map<string, ConversationAnalysis>();
  for (const a of convAnalyses ?? []) {
    if (!perConversation.has(a.conversation_id)) perConversation.set(a.conversation_id, a.result as ConversationAnalysis);
  }
  const rows = (conversations ?? [])
    .filter((c) => perConversation.has(c.id))
    .map((c) => ({
      id: c.id,
      name: contacts?.find((k) => k.wa_id === c.contact_wa_id)?.full_name ?? `+${c.contact_wa_id}`,
      lastAt: c.last_message_at,
      a: perConversation.get(c.id)!,
    }))
    .sort((x, y) => (y.lastAt ?? "").localeCompare(x.lastAt ?? ""));

  const count = <K extends string>(key: (a: ConversationAnalysis) => K, labels: Record<K, string>) =>
    (Object.keys(labels) as K[])
      .map((k) => ({ label: labels[k], value: rows.filter((r) => key(r.a) === k).length }))
      .filter((r) => r.value > 0);

  const concretadas = rows.reduce((n, r) => n + r.a.solicitudes_concretadas, 0);
  const perdidas = rows.reduce((n, r) => n + r.a.solicitudes_perdidas, 0);
  const lost = rows.filter((r) => r.a.resultado === "perdida" || r.a.resultado === "sin_respuesta");
  const complaints = rows.filter((r) => r.a.queja);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href="/dashboard" className="text-sm text-neutral-500 underline">← Volver</Link>
          <h1 className="mt-2 text-xl font-semibold">Análisis · {account.verified_name ?? `+${account.display_phone_number}`}</h1>
          {summaryRow && <p className="text-sm text-neutral-500">Actualizado {formatDate(summaryRow.created_at)}</p>}
        </div>
        <RunAnalysis accountId={id} run={run} />
      </div>

      {!summary || !metrics ? (
        <p className="rounded-xl border border-dashed border-neutral-300 p-8 text-center text-neutral-500">
          Aún no hay análisis. Da clic en “Analizar conversaciones” para generarlo con IA.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <Tile label="Conversaciones" value={String(metrics.conversations)} hint={`${metrics.messages.total} mensajes`} />
            <Tile
              label="Tiempo de respuesta (mediana)"
              value={formatMinutes(metrics.responseTime.medianMinutes)}
              hint={`90% en menos de ${formatMinutes(metrics.responseTime.p90Minutes)}`}
            />
            <Tile label="Respondidas en ≤ 15 min" value={`${metrics.responseTime.within15MinPct ?? "—"}%`} hint={`${metrics.responseTime.within1hPct ?? "—"}% en ≤ 1 h`} />
            <Tile label="Citas / ventas concretadas" value={String(concretadas)} hint={`${perdidas} no concretadas`} />
            <Tile label="Sin responder" value={String(metrics.unansweredConversationIds.length)} hint="último mensaje del cliente" />
          </div>

          <Section title="Resumen">
            <p className="leading-relaxed text-neutral-800">{summary.resumen_ejecutivo}</p>
          </Section>

          <div className="grid gap-6 md:grid-cols-2">
            <Section title="Hallazgos">
              <ul className="space-y-3">
                {summary.hallazgos.map((h) => (
                  <li key={h.titulo}>
                    <p className="text-xs font-medium text-neutral-500">{tipoHallazgo[h.tipo]}</p>
                    <p className="font-medium">{h.titulo}</p>
                    <p className="text-sm text-neutral-600">{h.detalle}</p>
                  </li>
                ))}
              </ul>
            </Section>
            <Section title="Recomendaciones">
              <ol className="space-y-3">
                {summary.recomendaciones.map((r, i) => (
                  <li key={r.titulo} className="flex gap-3">
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-xs text-white">{i + 1}</span>
                    <div>
                      <p className="font-medium">
                        {r.titulo} <span className="text-xs font-normal text-neutral-500">· impacto {r.impacto}</span>
                      </p>
                      <p className="text-sm text-neutral-600">{r.detalle}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </Section>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <Section title="Temas más frecuentes">
              <HBars rows={summary.temas_principales.map((t) => ({ label: t.tema, value: t.conversaciones }))} />
            </Section>
            <Section title="Resultado de la última solicitud">
              <HBars rows={count((a) => a.resultado, resultadoLabel)} />
              <h3 className="pt-2 text-sm font-medium text-neutral-600">Sentimiento de los clientes</h3>
              <HBars rows={count((a) => a.sentimiento, { positivo: "Positivo", neutral: "Neutral", negativo: "Negativo" })} />
            </Section>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <Section title="¿A qué hora escriben los clientes?">
              <Columns
                values={metrics.inboundByHour}
                labels={metrics.inboundByHour.map((_, h) => `${h}h`)}
                unit="mensajes"
              />
            </Section>
            <Section title="¿Qué día escriben?">
              <Columns values={metrics.inboundByWeekday} labels={WEEKDAYS} unit="mensajes" />
            </Section>
          </div>

          {(lost.length > 0 || complaints.length > 0) && (
            <div className="grid gap-6 md:grid-cols-2">
              <Section title={`Oportunidades perdidas (${lost.length})`}>
                <ul className="divide-y divide-neutral-100 text-sm">
                  {lost.map((r) => (
                    <li key={r.id} className="py-2">
                      <Link href={`/dashboard/conversations/${r.id}`} className="font-medium underline">{r.name}</Link>
                      <span className="text-neutral-500"> · {resultadoLabel[r.a.resultado]}</span>
                      <p className="text-neutral-600">{r.a.motivo_perdida ?? r.a.resumen}</p>
                      {r.a.sugerencia && <p className="text-neutral-500">→ {r.a.sugerencia}</p>}
                    </li>
                  ))}
                </ul>
              </Section>
              <Section title={`Quejas (${complaints.length})`}>
                {complaints.length ? (
                  <ul className="divide-y divide-neutral-100 text-sm">
                    {complaints.map((r) => (
                      <li key={r.id} className="py-2">
                        <Link href={`/dashboard/conversations/${r.id}`} className="font-medium underline">{r.name}</Link>
                        <p className="text-neutral-600">{r.a.queja}</p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-neutral-500">No se detectaron quejas.</p>
                )}
              </Section>
            </div>
          )}

          <Section title="Detalle por conversación">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs text-neutral-500">
                  <tr>
                    <th className="py-2 pr-3 font-medium">Cliente</th>
                    <th className="py-2 pr-3 font-medium">Intención</th>
                    <th className="py-2 pr-3 font-medium">Resultado</th>
                    <th className="py-2 pr-3 font-medium">Sentimiento</th>
                    <th className="py-2 font-medium">Resumen</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {rows.map((r) => (
                    <tr key={r.id} className="align-top">
                      <td className="py-2 pr-3">
                        <Link href={`/dashboard/conversations/${r.id}`} className="underline">{r.name}</Link>
                      </td>
                      <td className="py-2 pr-3 whitespace-nowrap">{intencionLabel[r.a.intencion_principal]}</td>
                      <td className="py-2 pr-3 whitespace-nowrap">{resultadoLabel[r.a.resultado]}</td>
                      <td className="py-2 pr-3 capitalize">{r.a.sentimiento}</td>
                      <td className="py-2 text-neutral-600">{r.a.resumen}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        </>
      )}
    </div>
  );
}
