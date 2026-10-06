import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatDate, historyStatusLabel } from "@/lib/format";

export default async function AdminAccountPage({ params }: PageProps<"/dashboard/admin/[id]">) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (!isAdmin) notFound();

  const { data: account } = await supabase
    .from("whatsapp_accounts")
    .select("id, verified_name, display_phone_number, status, history_sync_status, history_progress, last_error, onboarded_at, organizations(name)")
    .eq("id", id)
    .maybeSingle();
  if (!account) notFound();

  const [{ data: conversations }, { data: contacts }] = await Promise.all([
    supabase
      .from("conversations")
      .select("id, contact_wa_id, first_message_at, last_message_at")
      .eq("account_id", id)
      .order("last_message_at", { ascending: false, nullsFirst: false }),
    supabase.from("contacts").select("wa_id, full_name").eq("account_id", id),
  ]);

  const org = account.organizations as unknown as { name: string } | null;
  const nameOf = (waId: string) => contacts?.find((c) => c.wa_id === waId)?.full_name ?? `+${waId}`;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/dashboard/admin" className="text-sm text-neutral-500 underline">← Administración</Link>
        <h1 className="mt-2 text-xl font-semibold">{account.verified_name ?? "Sin nombre"}</h1>
        <p className="text-sm text-neutral-500">
          +{account.display_phone_number} · {org?.name} · conectado {formatDate(account.onboarded_at)}
        </p>
        <p className="text-sm text-neutral-500">
          Historial: {historyStatusLabel[account.history_sync_status] ?? account.history_sync_status}
          {account.history_sync_status === "in_progress" && ` (${account.history_progress}%)`}
        </p>
        {account.last_error && <p className="text-sm text-red-600">{account.last_error}</p>}
      </div>

      <div className="flex flex-wrap gap-3">
        <Link href={`/dashboard/accounts/${id}/analisis`} className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white">
          Ver análisis
        </Link>
        <Link href={`/dashboard/accounts/${id}`} className="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium">
          Mensajes y plantillas
        </Link>
      </div>

      <section className="space-y-3">
        <h2 className="font-semibold">Conversaciones ({conversations?.length ?? 0})</h2>
        {conversations?.length ? (
          <ul className="divide-y divide-neutral-200 rounded-xl border border-neutral-200 bg-white">
            {conversations.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/dashboard/conversations/${c.id}`}
                  className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-neutral-50"
                >
                  <span>{nameOf(c.contact_wa_id)}</span>
                  <span className="text-right text-sm text-neutral-500">
                    {formatDate(c.first_message_at)} → {formatDate(c.last_message_at)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-neutral-600">Este número aún no tiene conversaciones.</p>
        )}
      </section>
    </div>
  );
}
