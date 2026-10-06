import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runAccountAnalysis } from "@/lib/analysis/run";

// El análisis sigue corriendo en after() tras responder; Vercel lo limita a este tiempo.
export const maxDuration = 300;

const STALE_MS = 10 * 60_000;

/** Inicia un análisis con IA de todas las conversaciones de la cuenta. */
export async function POST(_req: Request, ctx: RouteContext<"/api/accounts/[id]/analysis">) {
  const { id } = await ctx.params;

  // RLS: solo devuelve la cuenta si el usuario pertenece a su organización (o es admin).
  const supabase = await createClient();
  const { data: account } = await supabase.from("whatsapp_accounts").select("id").eq("id", id).maybeSingle();
  if (!account) return Response.json({ error: "Cuenta no encontrada" }, { status: 404 });

  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: "Falta configurar ANTHROPIC_API_KEY en el servidor" }, { status: 500 });
  }

  const db = createAdminClient();
  const { data: running } = await db
    .from("analysis_runs")
    .select("id, started_at")
    .eq("account_id", id)
    .eq("status", "running")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (running && Date.now() - Date.parse(running.started_at) < STALE_MS) {
    return Response.json({ run_id: running.id, already_running: true });
  }

  const { data: run, error } = await db.from("analysis_runs").insert({ account_id: id }).select("id").single();
  if (error) return Response.json({ error: error.message }, { status: 500 });

  after(() => runAccountAnalysis(run.id, id));
  return Response.json({ run_id: run.id });
}
