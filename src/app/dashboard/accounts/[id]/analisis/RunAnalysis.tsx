"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type Run = {
  status: "running" | "completed" | "failed";
  conversations_total: number;
  conversations_done: number;
  error: string | null;
} | null;

export default function RunAnalysis({ accountId, run }: { accountId: string; run: Run }) {
  const router = useRouter();
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const running = run?.status === "running";

  // Mientras corre, refresca la página cada 3 s para mostrar el progreso.
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(t);
  }, [running, router]);

  const start = async () => {
    setStarting(true);
    setError(null);
    const res = await fetch(`/api/accounts/${accountId}/analysis`, { method: "POST" });
    const data = await res.json();
    if (!res.ok) setError(data.error ?? "No se pudo iniciar el análisis");
    setStarting(false);
    router.refresh();
  };

  const pct = run?.conversations_total ? Math.round((run.conversations_done / run.conversations_total) * 100) : 0;

  return (
    <div className="space-y-2">
      <button
        onClick={start}
        disabled={starting || running}
        className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {running ? "Analizando…" : starting ? "Iniciando…" : run ? "Volver a analizar" : "Analizar conversaciones"}
      </button>
      {running && (
        <div className="w-64 space-y-1">
          <div className="h-1.5 overflow-hidden rounded bg-neutral-200">
            <div className="h-full bg-neutral-900 transition-all" style={{ width: `${pct}%` }} />
          </div>
          <p className="text-xs text-neutral-500">
            {run.conversations_done} de {run.conversations_total} conversaciones
            {run.conversations_total > 0 && run.conversations_done === run.conversations_total && " · generando resumen…"}
          </p>
        </div>
      )}
      {run?.status === "failed" && <p className="text-sm text-red-600">El último análisis falló: {run.error}</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
