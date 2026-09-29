import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/format";

export default async function ConversationPage({ params }: PageProps<"/dashboard/conversations/[id]">) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: conversation } = await supabase
    .from("conversations")
    .select("id, account_id, contact_wa_id")
    .eq("id", id)
    .maybeSingle();
  if (!conversation) notFound();

  const [{ data: contact }, { data: messages }] = await Promise.all([
    supabase
      .from("contacts")
      .select("full_name")
      .eq("account_id", conversation.account_id)
      .eq("wa_id", conversation.contact_wa_id)
      .maybeSingle(),
    supabase
      .from("messages")
      .select("id, direction, type, body, sent_at, source")
      .eq("conversation_id", id)
      .order("sent_at", { ascending: true })
      .limit(2000),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/dashboard" className="text-sm text-neutral-500 underline">
          ← Volver
        </Link>
        <h1 className="mt-2 text-xl font-semibold">
          {contact?.full_name ?? `+${conversation.contact_wa_id}`}
        </h1>
        <p className="text-sm text-neutral-500">{messages?.length ?? 0} mensajes</p>
      </div>

      <div className="space-y-2 rounded-xl bg-[#efeae2] p-4">
        {messages?.map((m) => (
          <div key={m.id} className={m.direction === "outbound" ? "flex justify-end" : "flex justify-start"}>
            <div
              className={`max-w-[75%] rounded-lg px-3 py-2 text-sm shadow-sm ${
                m.direction === "outbound" ? "bg-[#d9fdd3]" : "bg-white"
              }`}
            >
              <p className="whitespace-pre-wrap">{m.body ?? `[${m.type}]`}</p>
              <p className="mt-1 text-right text-[10px] text-neutral-500">{formatDate(m.sent_at)}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
