"use client";

import { useActionState, useState } from "react";
import { savePromptAction } from "./actions";

export default function PromptEditor({
  promptKey,
  current,
  defaultContent,
}: {
  promptKey: string;
  current: string;
  defaultContent: string;
}) {
  const [state, action, pending] = useActionState(savePromptAction, null);
  const [content, setContent] = useState(current);
  const dirty = content.trim() !== current.trim();

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="key" value={promptKey} />
      <textarea
        name="content"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={14}
        spellCheck={false}
        className="w-full rounded-lg border border-neutral-300 bg-white p-3 font-mono text-sm leading-relaxed outline-none focus:border-neutral-900"
      />
      <div className="flex flex-wrap items-center gap-3">
        <input
          name="note"
          placeholder="Nota del cambio (opcional)"
          className="min-w-56 flex-1 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-neutral-900"
        />
        <button
          name="intent"
          value="save"
          disabled={pending || !dirty}
          className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          {pending ? "Guardando…" : "Guardar nueva versión"}
        </button>
        {dirty && (
          <button type="button" onClick={() => setContent(current)} className="text-sm underline">
            Descartar cambios
          </button>
        )}
        {current.trim() !== defaultContent.trim() && (
          <button
            name="intent"
            value="default"
            disabled={pending}
            className="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium disabled:opacity-40"
          >
            Restaurar predeterminado
          </button>
        )}
      </div>
      {state && <p className={`text-sm ${state.ok ? "text-green-700" : "text-red-600"}`}>{state.message}</p>}
    </form>
  );
}
