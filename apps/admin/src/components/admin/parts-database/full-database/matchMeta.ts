export const MATCH_CHIPS = [
  { id: "all", label: "All fitments", dot: "" },
  { id: "oem", label: "Made for the car · OEM", dot: "#0153dc" },
  { id: "sister", label: "Same car, different badge · Sister", dot: "#0e7490" },
  { id: "engine", label: "Fits the engine · Engine", dot: "#b45309" },
  { id: "aftermarket", label: "Other brands · Aftermarket", dot: "#7c3aed" },
  { id: "universal", label: "Fits by size · Universal", dot: "#006e31" },
] as const;

export const TIER_META: Record<number, { label: string; dot: string }> = {
  1: { label: "Made for the car · OEM", dot: "#0153dc" },
  2: { label: "Same car, different badge · Sister", dot: "#0e7490" },
  3: { label: "Fits the engine · Engine", dot: "#b45309" },
  4: { label: "Other brands · Aftermarket", dot: "#7c3aed" },
  5: { label: "Fits by size · Universal", dot: "#006e31" },
};

export function formatUpdated(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
