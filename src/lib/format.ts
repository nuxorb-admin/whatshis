import { TIME_ZONE } from "@/lib/analysis/metrics";

export const formatDate = (iso: string | null) =>
  iso
    ? new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short", timeZone: TIME_ZONE }).format(
        new Date(iso),
      )
    : "—";

export const formatMinutes = (min: number | null) => {
  if (min === null) return "—";
  if (min < 1) return "< 1 min";
  if (min < 60) return `${Math.round(min)} min`;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h >= 24 ? `${Math.round(h / 24)} d` : m ? `${h} h ${m} min` : `${h} h`;
};

export const historyStatusLabel: Record<string, string> = {
  pending: "Pendiente",
  requested: "Solicitado a WhatsApp",
  in_progress: "Importando",
  completed: "Completado",
  declined: "El negocio no compartió el historial",
  failed: "Falló",
};
