import Link from "next/link";
import { notFound } from "next/navigation";
import { getAccountWithToken } from "@/lib/whatsapp/account";
import { listTemplates, type MessageTemplate } from "@/lib/whatsapp/graph";
import { CreateTemplateForm, SendMessageForm } from "./forms";

const statusLabel: Record<string, string> = {
  APPROVED: "Aprobada",
  PENDING: "En revisión",
  REJECTED: "Rechazada",
  PAUSED: "Pausada",
  DISABLED: "Deshabilitada",
};

export default async function AccountPage({ params }: PageProps<"/dashboard/accounts/[id]">) {
  const { id } = await params;
  const ctx = await getAccountWithToken(id);
  if (!ctx) notFound();
  const { account, token } = ctx;

  let templates: MessageTemplate[] = [];
  let templatesError: string | null = null;
  try {
    templates = await listTemplates(account.waba_id, token);
  } catch (err) {
    templatesError = err instanceof Error ? err.message : String(err);
  }
  // Solo plantillas enviables sin parámetros: texto sin variables {{n}} ni encabezado multimedia.
  const sendable = templates
    .filter(
      (t) =>
        t.status === "APPROVED" &&
        t.components.every(
          (c) => !c.text?.includes("{{") && (c.type !== "HEADER" || c.text !== undefined),
        ) &&
        t.components.every((c) => ["HEADER", "BODY", "FOOTER"].includes(c.type)),
    )
    .sort((a, b) => Number(b.name === "hello_world") - Number(a.name === "hello_world"));

  return (
    <div className="space-y-8">
      <div>
        <Link href="/dashboard" className="text-sm text-neutral-500 underline">
          ← Volver
        </Link>
        <h1 className="mt-2 text-xl font-semibold">{account.verified_name ?? "Cuenta de WhatsApp"}</h1>
        <p className="text-sm text-neutral-500">+{account.display_phone_number}</p>
      </div>

      <section className="space-y-3 rounded-xl border border-neutral-200 bg-white p-5">
        <h2 className="font-semibold">Enviar mensaje</h2>
        <SendMessageForm
          accountId={account.id}
          templates={sendable.map((t) => ({ name: t.name, language: t.language }))}
        />
      </section>

      <section className="space-y-4 rounded-xl border border-neutral-200 bg-white p-5">
        <h2 className="font-semibold">Plantillas de mensaje</h2>

        {templatesError ? (
          <p className="text-sm text-red-600">{templatesError}</p>
        ) : templates.length ? (
          <ul className="divide-y divide-neutral-200 text-sm">
            {templates.map((t) => (
              <li key={t.id} className="flex items-start justify-between gap-4 py-2">
                <div>
                  <p className="font-medium">
                    {t.name} <span className="text-neutral-500">({t.language})</span>
                  </p>
                  <p className="text-neutral-600">{t.components.find((c) => c.type === "BODY")?.text}</p>
                </div>
                <span className="shrink-0 text-xs text-neutral-500">
                  {statusLabel[t.status] ?? t.status} · {t.category}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-neutral-500">Esta cuenta aún no tiene plantillas.</p>
        )}

        <div className="border-t border-neutral-200 pt-4">
          <h3 className="mb-3 text-sm font-medium">Crear plantilla</h3>
          <CreateTemplateForm accountId={account.id} />
        </div>
      </section>
    </div>
  );
}
