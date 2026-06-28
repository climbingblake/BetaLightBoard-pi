export function fmtSendRate(rate: number | null): string {
  if (rate == null) return "—";
  return `${Math.round(rate * 100)}%`;
}

export function fmtRelative(ts: string | null): string {
  if (!ts) return "";
  const then = new Date(ts).getTime();
  const diff = Date.now() - then;
  const day = 86400000;
  if (diff < day) return "today";
  if (diff < 2 * day) return "yesterday";
  if (diff < 30 * day) return `${Math.floor(diff / day)}d ago`;
  if (diff < 365 * day) return `${Math.floor(diff / (30 * day))}mo ago`;
  return `${Math.floor(diff / (365 * day))}y ago`;
}
