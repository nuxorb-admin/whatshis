import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { analyzeConversation, summarizeBusiness, MODEL, type ConversationAnalysis } from "./ai";
import { computeMetrics, type MetricMessage } from "./metrics";

const CONCURRENCY = 4;

type Msg = MetricMessage & { body: string | null; type: string };

/** Supabase devuelve como máximo 1000 filas por consulta; pagina hasta traer todo. */
async function fetchAllMessages(db: SupabaseClient, accountId: string): Promise<Msg[]> {
  const rows: Msg[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from("messages")
      .select("conversation_id, direction, body, type, sent_at")
      .eq("account_id", accountId)
      .order("sent_at", { ascending: true })
      .range(from, from + 999);
    if (error) throw error;
    rows.push(...(data as Msg[]));
    if (data.length < 1000) return rows;
  }
}

async function mapWithConcurrency<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  const queue = [...items];
  await Promise.all(
    Array.from({ length: Math.min(limit, queue.length) }, async () => {
      while (queue.length) await fn(queue.shift()!);
    }),
  );
}

export async function runAccountAnalysis(runId: string, accountId: string) {
  const db = createAdminClient();
  try {
    const { data: account } = await db
      .from("whatsapp_accounts")
      .select("verified_name, display_phone_number")
      .eq("id", accountId)
      .single();
    const businessName = account?.verified_name ?? `+${account?.display_phone_number}`;

    const [{ data: conversations }, { data: contacts }, { data: previous }, messages] = await Promise.all([
      db.from("conversations").select("id, contact_wa_id, last_message_at").eq("account_id", accountId),
      db.from("contacts").select("wa_id, full_name").eq("account_id", accountId),
      db
        .from("analyses")
        .select("conversation_id, result, created_at")
        .eq("account_id", accountId)
        .eq("kind", "conversation")
        .order("created_at", { ascending: false }),
      fetchAllMessages(db, accountId),
    ]);

    const byConversation = new Map<string, Msg[]>();
    for (const m of messages) byConversation.set(m.conversation_id, [...(byConversation.get(m.conversation_id) ?? []), m]);

    // Solo conversaciones donde el cliente escribió algo.
    const targets = (conversations ?? []).filter((c) =>
      (byConversation.get(c.id) ?? []).some((m) => m.direction === "inbound"),
    );
    await db.from("analysis_runs").update({ conversations_total: targets.length }).eq("id", runId);

    const latestPrevious = new Map<string, { result: ConversationAnalysis; created_at: string }>();
    for (const p of previous ?? []) if (!latestPrevious.has(p.conversation_id)) latestPrevious.set(p.conversation_id, p);

    const nameOf = (waId: string) => contacts?.find((c) => c.wa_id === waId)?.full_name ?? `+${waId}`;
    const results: { cliente: string; analisis: ConversationAnalysis }[] = [];

    await mapWithConcurrency(targets, CONCURRENCY, async (conv) => {
      const prev = latestPrevious.get(conv.id);
      let analysis: ConversationAnalysis;
      if (prev && conv.last_message_at && prev.created_at >= conv.last_message_at) {
        analysis = prev.result; // sin mensajes nuevos desde el último análisis
      } else {
        analysis = await analyzeConversation(businessName, byConversation.get(conv.id)!);
        const { error } = await db.from("analyses").insert({
          account_id: accountId,
          conversation_id: conv.id,
          kind: "conversation",
          result: { ...analysis, model: MODEL },
        });
        if (error) throw error;
      }
      results.push({ cliente: nameOf(conv.contact_wa_id), analisis: analysis });
      await db.rpc("bump_analysis_progress", { p_run: runId });
    });

    const metrics = computeMetrics(messages);
    const summary = await summarizeBusiness(businessName, metrics, results);

    const { error } = await db.from("analyses").insert([
      { account_id: accountId, kind: "metrics", result: metrics },
      { account_id: accountId, kind: "summary", result: { ...summary, model: MODEL } },
    ]);
    if (error) throw error;

    await db
      .from("analysis_runs")
      .update({ status: "completed", finished_at: new Date().toISOString() })
      .eq("id", runId);
  } catch (err) {
    await db
      .from("analysis_runs")
      .update({
        status: "failed",
        error: err instanceof Error ? err.message : String(err),
        finished_at: new Date().toISOString(),
      })
      .eq("id", runId);
  }
}
