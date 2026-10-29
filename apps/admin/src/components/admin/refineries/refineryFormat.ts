export type Freshness = "Current" | "Due" | "Late";

export function formatJmd(value: number | null | undefined, decimals: number): string {
  if (value == null || Number.isNaN(value)) return "—";
  const n = Math.abs(value).toLocaleString("en-JM", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return `J$${n}`;
}

export function formatUnit(unit: string | null | undefined): string {
  return unit && unit.trim() ? unit : "unit not set";
}

export function formatWeek(iso: string | null | undefined, withYear = true): string {
  if (!iso) return "—";
  const date = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: withYear ? "numeric" : undefined,
    timeZone: "UTC",
  });
}

export function formatSynced(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  const day = date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "America/Jamaica",
  });
  const time = date.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "America/Jamaica",
  });
  return `${day}, ${time}`;
}

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null) return "";
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest ? `${minutes}m ${rest}s` : `${minutes}m`;
}

export function formatChange(change: number | null | undefined, pct: number | null | undefined, prevWeek?: string | null): string {
  if (change == null || Number.isNaN(change)) return "—";
  const arrow = change > 0 ? "▲" : change < 0 ? "▼" : "—";
  const money = formatJmd(Math.abs(change), 2);
  const percent = pct == null
    ? "0.0%"
    : `${pct > 0 ? "+" : pct < 0 ? "−" : ""}${Math.abs(pct).toFixed(1)}%`;
  const versus = prevWeek ? ` vs ${formatWeek(prevWeek, false)}` : "";
  if (change === 0) return `— · ${percent}${versus}`;
  return `${arrow} ${money} · ${percent}${versus}`;
}

export function freshnessOf(latestWeek: string | null | undefined, today: string): Freshness | null {
  if (!latestWeek) return null;
  const latest = Date.parse(`${latestWeek.slice(0, 10)}T00:00:00Z`);
  const now = Date.parse(`${today.slice(0, 10)}T00:00:00Z`);
  const days = Math.round((now - latest) / 86400000);
  if (days <= 7) return "Current";
  if (days > 8) return "Late";
  return "Due";
}

export function sparklinePath(values: number[]): string {
  if (values.length === 0) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  return values.map((value, index) => {
    const x = values.length === 1 ? 100 : (index / (values.length - 1)) * 100;
    const y = 22 - ((value - min) / span) * 18;
    return `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(" ");
}

export const PRODUCT_COLORS: Record<string, string> = {
  gasolene_87: "#316bf3",
  gasolene_90: "#0d9488",
  auto_diesel: "#8b5cf6",
  ulsd: "#d97706",
  kerosene: "#64748b",
  propane: "#64748b",
  butane: "#64748b",
  hfo: "#64748b",
  asphalt: "#64748b",
};
