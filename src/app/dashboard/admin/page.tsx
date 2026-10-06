import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatDate, historyStatusLabel } from "@/lib/format";

type Row = {
  account_id: string;
  org_name: string;
  owner_email: string | null;
  verified_name: string | null;
  display_phone_number: string | null;
  status: string;
  history_sync_status: string;
  history_progress: number;
  onboarded_at: string;
  conversations: number;
  messages: number;
  last_message_at: string | null;
  last_analysis_at: string | null;
};

const statusLabel: Record<string, string> = {
  onboarding: "Conectando",
  connected: "Conectado",
  error: "Error",
  disconnected: "Desconectado",
};

export default async function AdminPage() {
  const supabase = await createClient();
  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (!isAdmin) notFound();

  const { data, error } = await supabase.rpc("admin_accounts_overview");
  const rows = (data ?? []) as Row[];
  const totals = rows.reduce(
    (t, r) => ({ conversations: t.conversations + Number(r.conversations), messages: t.messages + Number(r.messages) }),
    { conversations: 0, messages: 0 },
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Administración</h1>
          <p className="text-sm text-neutral-500">
            {rows.length} números registrados · {totals.conversations} conversaciones · {totals.messages} mensajes
          </p>
        </div>
        <Link
          href="/dashboard/admin/prompts"
          className="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium"
        >
          Prompts del análisis
        </Link>
      </div>

      {error && <p className="text-sm text-red-600">{error.message}</p>}

      <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-neutral-200 text-xs text-neutral-500">
            <tr>
              <th className="px-4 py-3 font-medium">Número</th>
              <th className="px-4 py-3 font-medium">Cliente</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3 text-right font-medium">Conversaciones</th>
              <th className="px-4 py-3 text-right font-medium">Mensajes</th>
              <th className="px-4 py-3 font-medium">Último mensaje</th>
              <th className="px-4 py-3 font-medium">Ver</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {rows.map((r) => (
              <tr key={r.account_id} className="align-top hover:bg-neutral-50">
                <td className="px-4 py-3">
                  <Link href={`/dashboard/admin/${r.account_id}`} className="font-medium underline">
                    {r.verified_name ?? "Sin nombre"}
                  </Link>
                  <p className="text-xs text-neutral-500">+{r.display_phone_number}</p>
                </td>
                <td className="px-4 py-3">
                  <p>{r.org_name}</p>
                  <p className="text-xs text-neutral-500">{r.owner_email ?? "—"}</p>
                </td>
                <td className="px-4 py-3">
                  <p>{statusLabel[r.status] ?? r.status}</p>
                  <p className="text-xs text-neutral-500">
                    Historial: {historyStatusLabel[r.history_sync_status] ?? r.history_sync_status}
                    {r.history_sync_status === "in_progress" && ` (${r.history_progress}%)`}
                  </p>
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{r.conversations}</td>
                <td className="px-4 py-3 text-right tabular-nums">{r.messages}</td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {formatDate(r.last_message_at)}
                  <p className="text-xs text-neutral-500">
                    {r.last_analysis_at ? `Análisis: ${formatDate(r.last_analysis_at)}` : "Sin análisis"}
                  </p>
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <div className="flex flex-col gap-1">
                    <Link href={`/dashboard/admin/${r.account_id}`} className="underline">Conversaciones</Link>
                    <Link href={`/dashboard/accounts/${r.account_id}/analisis`} className="underline">Análisis</Link>
                  </div>
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-neutral-500">No hay números registrados.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
