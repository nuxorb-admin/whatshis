// Métricas deterministas sobre los mensajes (no usan IA).

export const TIME_ZONE = "America/Mexico_City";

export type MetricMessage = {
  conversation_id: string;
  direction: "inbound" | "outbound";
  sent_at: string;
};

export type Metrics = {
  conversations: number;
  messages: { total: number; inbound: number; outbound: number };
  responseTime: {
    samples: number;
    medianMinutes: number | null;
    p90Minutes: number | null;
    within15MinPct: number | null;
    within1hPct: number | null;
  };
  /** Conversaciones cuyo último mensaje es del cliente y nadie respondió. */
  unansweredConversationIds: string[];
  /** Mensajes de clientes por hora local (0-23). */
  inboundByHour: number[];
  /** Mensajes de clientes por día de la semana (0 = domingo). */
  inboundByWeekday: number[];
  firstMessageAt: string | null;
  lastMessageAt: string | null;
};

const hourFmt = new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, hour: "numeric", hourCycle: "h23" });
const weekdayFmt = new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, weekday: "short" });
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function percentile(sorted: number[], p: number) {
  if (!sorted.length) return null;
  const idx = Math.min(sorted.length - 1, Math.floor(p * sorted.length));
  return sorted[idx];
}

const round1 = (n: number | null) => (n === null ? null : Math.round(n * 10) / 10);

export function computeMetrics(messages: MetricMessage[]): Metrics {
  const byConversation = new Map<string, MetricMessage[]>();
  for (const m of messages) {
    const list = byConversation.get(m.conversation_id) ?? [];
    list.push(m);
    byConversation.set(m.conversation_id, list);
  }

  const responseMinutes: number[] = [];
  const unanswered: string[] = [];
  const inboundByHour = Array<number>(24).fill(0);
  const inboundByWeekday = Array<number>(7).fill(0);

  for (const [conversationId, list] of byConversation) {
    list.sort((a, b) => a.sent_at.localeCompare(b.sent_at));

    // Tiempo de respuesta: desde el primer mensaje del cliente sin contestar hasta la siguiente respuesta del negocio.
    let waitingSince: number | null = null;
    for (const m of list) {
      const t = Date.parse(m.sent_at);
      if (m.direction === "inbound") {
        waitingSince ??= t;
        const d = new Date(t);
        inboundByHour[Number(hourFmt.format(d)) % 24]++;
        inboundByWeekday[WEEKDAYS.indexOf(weekdayFmt.format(d))]++;
      } else if (waitingSince !== null) {
        responseMinutes.push((t - waitingSince) / 60_000);
        waitingSince = null;
      }
    }
    if (waitingSince !== null) unanswered.push(conversationId);
  }

  responseMinutes.sort((a, b) => a - b);
  const pct = (limit: number) =>
    responseMinutes.length
      ? Math.round((responseMinutes.filter((m) => m <= limit).length / responseMinutes.length) * 100)
      : null;
  const sortedDates = messages.map((m) => m.sent_at).sort();

  return {
    conversations: byConversation.size,
    messages: {
      total: messages.length,
      inbound: messages.filter((m) => m.direction === "inbound").length,
      outbound: messages.filter((m) => m.direction === "outbound").length,
    },
    responseTime: {
      samples: responseMinutes.length,
      medianMinutes: round1(percentile(responseMinutes, 0.5)),
      p90Minutes: round1(percentile(responseMinutes, 0.9)),
      within15MinPct: pct(15),
      within1hPct: pct(60),
    },
    unansweredConversationIds: unanswered,
    inboundByHour,
    inboundByWeekday,
    firstMessageAt: sortedDates[0] ?? null,
    lastMessageAt: sortedDates.at(-1) ?? null,
  };
}
