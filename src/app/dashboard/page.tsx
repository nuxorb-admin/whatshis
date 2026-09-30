import Link from "next/link";
import ConnectWhatsApp from "@/components/ConnectWhatsApp";
import { createClient } from "@/lib/supabase/server";
import { formatDate, historyStatusLabel } from "@/lib/format";

export default async function DashboardPage() {
  const supabase = await createClient();

  const { data: accounts } = await supabase
    .from("whatsapp_accounts")
    .select(
      "id, display_phone_number, verified_name, status, history_sync_status, history_progress, last_error, onboarded_at",
    )
    .order("created_at", { ascending: false });

  const { data: conversations } = await supabase
    .from("conversations")
    .select("id, account_id, contact_wa_id, last_message_at")
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(50);

  const { data: contacts } = await supabase
    .from("contacts")
    .select("account_id, wa_id, full_name")
    .in("wa_id", (conversations ?? []).map((c) => c.contact_wa_id));
  const nameOf = (accountId: string, waId: string) =>
    contacts?.find((c) => c.account_id === accountId && c.wa_id === waId)?.full_name;

  return (
    <div className="space-y-10">
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Tus números de WhatsApp</h2>

        {accounts?.length ? (
          <div className="grid gap-3">
            {accounts.map((a) => (
              <div key={a.id} className="rounded-xl border border-neutral-200 bg-white p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{a.verified_name ?? "Sin nombre"}</p>
                    <p className="text-sm text-neutral-500">+{a.display_phone_number}</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-xs text-neutral-500">Conectado {formatDate(a.onboarded_at)}</span>
                    <Link href={`/dashboard/accounts/${a.id}`} className="text-sm underline">
                      Mensajes y plantillas
                    </Link>
                  </div>
                </div>
                <div className="mt-3 space-y-1">
                  <p className="text-sm">
                    Historial: <strong>{historyStatusLabel[a.history_sync_status]}</strong>
                    {a.history_sync_status === "in_progress" && ` (${a.history_progress}%)`}
                  </p>
                  {a.history_sync_status === "in_progress" && (
                    <div className="h-1.5 w-full overflow-hidden rounded bg-neutral-100">
                      <div className="h-full bg-[#25D366]" style={{ width: `${a.history_progress}%` }} />
                    </div>
                  )}
                  {a.last_error && <p className="text-sm text-red-600">{a.last_error}</p>}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-neutral-600">Aún no has conectado ningún número.</p>
        )}

        <ConnectWhatsApp />
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Conversaciones recientes</h2>
        {conversations?.length ? (
          <ul className="divide-y divide-neutral-200 rounded-xl border border-neutral-200 bg-white">
            {conversations.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/dashboard/conversations/${c.id}`}
                  className="flex items-center justify-between px-4 py-3 hover:bg-neutral-50"
                >
                  <span>{nameOf(c.account_id, c.contact_wa_id) ?? `+${c.contact_wa_id}`}</span>
                  <span className="text-sm text-neutral-500">{formatDate(c.last_message_at)}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-neutral-600">Las conversaciones aparecerán aquí cuando termine la importación.</p>
        )}
      </section>
    </div>
  );
}
