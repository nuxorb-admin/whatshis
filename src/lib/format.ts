export const formatDate = (iso: string | null) =>
  iso
    ? new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso))
    : "—";

export const historyStatusLabel: Record<string, string> = {
  pending: "Pendiente",
  requested: "Solicitado a WhatsApp",
  in_progress: "Importando",
  completed: "Completado",
  declined: "El negocio no compartió el historial",
  failed: "Falló",
};
