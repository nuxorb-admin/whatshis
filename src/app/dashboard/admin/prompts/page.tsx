import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BusinessSummarySchema, ConversationAnalysisSchema, MODEL } from "@/lib/analysis/ai";
import { DEFAULT_PROMPTS, PROMPT_LABELS, promptHash, type PromptKey } from "@/lib/analysis/prompts";
import { formatDate } from "@/lib/format";
import { restoreVersionAction } from "./actions";
import PromptEditor from "./PromptEditor";

const KEYS: PromptKey[] = ["conversation", "summary"];

/** Campos que devuelve cada análisis (fijos: la pantalla de análisis depende de ellos). */
const FIELDS: Record<PromptKey, { name: string; description?: string }[]> = {
  conversation: Object.entries(ConversationAnalysisSchema.shape).map(([name, s]) => ({ name, description: s.description })),
  summary: Object.entries(BusinessSummarySchema.shape).map(([name, s]) => ({ name, description: s.description })),
};

export default async function PromptsPage() {
  const supabase = await createClient();
  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (!isAdmin) notFound();

  const { data: versions } = await supabase
    .from("prompt_versions")
    .select("id, key, content, note, created_at, created_by")
    .order("created_at", { ascending: false })
    .limit(100);

  const authorIds = [...new Set((versions ?? []).map((v) => v.created_by).filter(Boolean))];
  const { data: authors } = authorIds.length
    ? await supabase.from("profiles").select("id, email").in("id", authorIds)
    : { data: [] };
  const emailOf = (id: string | null) => authors?.find((a) => a.id === id)?.email ?? "—";

  return (
    <div className="space-y-8">
      <div>
        <Link href="/dashboard/admin" className="text-sm text-neutral-500 underline">← Administración</Link>
        <h1 className="mt-2 text-xl font-semibold">Prompts del análisis</h1>
        <p className="max-w-3xl text-sm text-neutral-600">
          Estas son las instrucciones que recibe la IA ({MODEL}). Al guardar se crea una versión nueva; el siguiente
          “Analizar conversaciones” de cualquier número la usará y volverá a analizar todas sus conversaciones
          (tiene costo). Los campos que devuelve cada análisis son fijos porque la pantalla de resultados depende de
          ellos.
        </p>
      </div>

      {KEYS.map((key) => {
        const history = (versions ?? []).filter((v) => v.key === key);
        const current = history[0]?.content ?? DEFAULT_PROMPTS[key];
        const isDefault = current.trim() === DEFAULT_PROMPTS[key].trim();

        return (
          <section key={key} className="space-y-4 rounded-xl border border-neutral-200 bg-white p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <h2 className="font-semibold">{PROMPT_LABELS[key].title}</h2>
                <p className="text-sm text-neutral-500">{PROMPT_LABELS[key].description}</p>
              </div>
              <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs text-neutral-600">
                {isDefault ? "Predeterminado" : `Personalizado · ${formatDate(history[0].created_at)}`}
              </span>
            </div>

            <PromptEditor
              key={promptHash(current)}
              promptKey={key}
              current={current}
              defaultContent={DEFAULT_PROMPTS[key]}
            />

            <details className="text-sm">
              <summary className="cursor-pointer text-neutral-600">Campos que devuelve este análisis</summary>
              <ul className="mt-2 space-y-1">
                {FIELDS[key].map((f) => (
                  <li key={f.name}>
                    <code className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs">{f.name}</code>
                    {f.description && <span className="text-neutral-600"> — {f.description}</span>}
                  </li>
                ))}
              </ul>
            </details>

            {history.length > 0 && (
              <details className="text-sm">
                <summary className="cursor-pointer text-neutral-600">Historial ({history.length} versiones)</summary>
                <ul className="mt-2 divide-y divide-neutral-100">
                  {history.map((v, i) => (
                    <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                      <div>
                        <p>
                          {formatDate(v.created_at)} · {emailOf(v.created_by)}
                          {i === 0 && <span className="ml-2 text-xs text-green-700">vigente</span>}
                        </p>
                        {v.note && <p className="text-xs text-neutral-500">{v.note}</p>}
                      </div>
                      {i > 0 && (
                        <form action={restoreVersionAction}>
                          <input type="hidden" name="version_id" value={v.id} />
                          <button className="text-xs underline">Restaurar esta versión</button>
                        </form>
                      )}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </section>
        );
      })}
    </div>
  );
}
