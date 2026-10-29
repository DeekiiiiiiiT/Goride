const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatWeek(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [year, month, day] = iso.slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return iso;
  return `${day} ${MONTHS[month - 1]} ${year}`;
}

export function formatJmd(value: number | null | undefined): string {
  if (value == null || Number.isNaN(Number(value))) return "—";
  const amount = Number(value).toLocaleString("en-JM", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `J$${amount}`;
}

export function formatJmdPerLitre(value: number | null | undefined): string {
  if (value == null || Number.isNaN(Number(value))) return "—";
  return `${formatJmd(value)}/L`;
}

export function formatDelta(value: number | null | undefined, base?: number | null): string {
  if (value == null || Number.isNaN(Number(value))) return "—";
  const amount = Number(value);
  const sign = amount > 0 ? "+" : amount < 0 ? "−" : "";
  const money = `${sign}J$${Math.abs(amount).toLocaleString("en-JM", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
  if (base == null || base === 0 || Number.isNaN(Number(base))) return money;
  const pct = (amount / Number(base)) * 100;
  const pctSign = pct > 0 ? "+" : pct < 0 ? "−" : "";
  return `${money} (${pctSign}${Math.abs(pct).toFixed(1)}%)`;
}

export function fewReports(stations: number | null | undefined): boolean {
  return (stations ?? 0) < 3;
}

export function sampleLabel(stations: number, reports: number): string {
  return `n = ${stations} stations · ${reports} reports`;
}

export function confidenceLabel(
  confidence: string | null | undefined,
  reports: number | null | undefined,
  reporters: number | null | undefined,
): string {
  if (!confidence) return "—";
  const name = confidence.charAt(0).toUpperCase() + confidence.slice(1);
  const reportN = reports ?? 0;
  const reporterN = reporters ?? 0;
  return `${name} · ${reportN} ${reportN === 1 ? "report" : "reports"} · ${reporterN} ${reporterN === 1 ? "reporter" : "reporters"}`;
}

export function narrativeSentence(input: {
  gradeLabel: string;
  pumpMedian: number | null;
  stations: number;
  reporters: number;
  gap: number | null;
  petrojam: number | null;
  lowName: string | null;
  lowPrice: number | null;
  benchmarkName: string;
}): string | null {
  if (input.pumpMedian == null) return null;
  const gap = input.gap == null ? "" : `, ${formatJmd(input.gap)} above ${input.benchmarkName}'s ${formatJmd(input.petrojam)}`;
  const low = input.lowName && input.lowPrice != null
    ? ` Lowest: ${input.lowName} at ${formatJmdPerLitre(input.lowPrice)}.`
    : "";
  const caution = fewReports(input.stations) ? " Few reports — treat as indicative." : "";
  return `This week ${input.gradeLabel} is ${formatJmdPerLitre(input.pumpMedian)} at the pump (median of ${input.stations} stations, ${input.reporters} reporter${input.reporters === 1 ? "" : "s"})${gap}.${low}${caution}`;
}

export function formatWhen(iso: string | null | undefined): { relative: string; exact: string } {
  if (!iso) return { relative: "—", exact: "No report yet" };
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return { relative: "—", exact: iso };
  const days = Math.floor((Date.now() - then) / 86_400_000);
  const relative = days <= 0 ? "Today" : days === 1 ? "1 day ago" : `${days} days ago`;
  const exact = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  }).format(new Date(iso));
  return { relative, exact };
}

export function gradeLabel(grade: string): string {
  switch (grade) {
    case "e10_87":
      return "E10-87";
    case "e10_90":
      return "E10-90";
    case "diesel":
      return "Auto diesel";
    case "ulsd":
      return "ULSD";
    default:
      return grade;
  }
}
