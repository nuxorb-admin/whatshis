"use client";

import { useActionState, useState } from "react";
import { createTemplateAction, sendMessageAction, type ActionState } from "./actions";

const input =
  "w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-neutral-900";
const button =
  "rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50";

function Result({ state }: { state: ActionState }) {
  if (!state) return null;
  return <p className={`text-sm ${state.ok ? "text-green-700" : "text-red-600"}`}>{state.message}</p>;
}

export function SendMessageForm({
  accountId,
  templates,
}: {
  accountId: string;
  templates: { name: string; language: string }[];
}) {
  const [state, action, pending] = useActionState(sendMessageAction, null);
  const [kind, setKind] = useState<"text" | "template">("text");

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="account_id" value={accountId} />
      <input type="hidden" name="kind" value={kind} />
      <input name="to" placeholder="Número destino con código de país (ej. 5215512345678)" className={input} required />

      <div className="flex gap-4 text-sm">
        <label className="flex items-center gap-1.5">
          <input type="radio" checked={kind === "text"} onChange={() => setKind("text")} /> Texto
        </label>
        <label className="flex items-center gap-1.5">
          <input type="radio" checked={kind === "template"} onChange={() => setKind("template")} /> Plantilla
        </label>
      </div>

      {kind === "text" ? (
        <>
          <textarea name="text" rows={3} placeholder="Mensaje" className={input} />
          <p className="text-xs text-neutral-500">
            El texto libre solo llega si esa persona te escribió en las últimas 24 horas. Si no, usa una plantilla aprobada.
          </p>
        </>
      ) : (
        <TemplatePicker templates={templates} />
      )}

      <button disabled={pending} className={button}>
        {pending ? "Enviando…" : "Enviar mensaje"}
      </button>
      <Result state={state} />
    </form>
  );
}

function TemplatePicker({ templates }: { templates: { name: string; language: string }[] }) {
  const [selected, setSelected] = useState(0);
  if (templates.length === 0) {
    return <p className="text-sm text-neutral-500">No hay plantillas aprobadas todavía.</p>;
  }
  const t = templates[selected];
  return (
    <>
      <select className={input} value={selected} onChange={(e) => setSelected(Number(e.target.value))}>
        {templates.map((t, i) => (
          <option key={`${t.name}-${t.language}`} value={i}>
            {t.name} ({t.language})
          </option>
        ))}
      </select>
      <input type="hidden" name="template_name" value={t.name} />
      <input type="hidden" name="template_language" value={t.language} />
    </>
  );
}

export function CreateTemplateForm({ accountId }: { accountId: string }) {
  const [state, action, pending] = useActionState(createTemplateAction, null);

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="account_id" value={accountId} />
      <input name="name" placeholder="nombre_de_plantilla" className={input} required />
      <div className="grid grid-cols-2 gap-3">
        <select name="category" className={input} defaultValue="UTILITY">
          <option value="UTILITY">Utilidad</option>
          <option value="MARKETING">Marketing</option>
        </select>
        <select name="language" className={input} defaultValue="es_MX">
          <option value="es_MX">Español (MX)</option>
          <option value="es">Español</option>
          <option value="en_US">English (US)</option>
        </select>
      </div>
      <textarea name="body" rows={3} placeholder="Texto del mensaje" className={input} required />
      <button disabled={pending} className={button}>
        {pending ? "Creando…" : "Crear plantilla"}
      </button>
      <Result state={state} />
    </form>
  );
}
