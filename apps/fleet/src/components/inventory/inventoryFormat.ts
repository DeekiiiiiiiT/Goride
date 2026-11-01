/** JMD display helpers for inventory screens. */
export function formatJmd(amount: number | null | undefined): string {
  if (amount == null || !Number.isFinite(amount)) return "—";
  return new Intl.NumberFormat("en-JM", {
    style: "currency",
    currency: "JMD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatRefNo(ref: string | null | undefined): string {
  const v = String(ref || "").trim();
  return v || "—";
}
