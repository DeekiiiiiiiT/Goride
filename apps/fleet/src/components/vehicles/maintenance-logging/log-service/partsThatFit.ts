/**
 * Slice C — "Parts that fit this car" (docs/log-service-parts-gaps-audit.md LC-01, LC-02, LC-05).
 * Reads the GET /parts/find answer into cards, the ask state and the car name. No prices, stock or selling.
 */
import { buildStoreCopyText, carDetailsLine, type StoreBrandNumber } from "../../find-parts/everyday/storeCopyText";

export type FitLabel = "made_for_car" | "also_fits" | "fits_by_size" | "check_before_buying";

export type FitPart = {
  partId: string;
  name: string;
  brand: string;
  number: string;
  fitLabel: FitLabel;
  /** Verified in Dominion (else "Needs checking"). */
  verified: boolean;
};

export type FindAsk = { state: "none" | "looking"; askedAt: string | null; byYou: boolean };

/** The car facts the "Copy part info" text uses (same as Find parts); empty when unknown, never guessed. */
export type CopyCar = {
  /** "Toyota Roomy 2019" */
  line: string;
  chassis: string;
  engine: string;
  drive: string;
  /** Dominion car version, for the part lookup (other brands' numbers). */
  variantId: string | null;
};

export type PartsForJob = {
  /** The car isn't linked to a Dominion model: Roam can't list or look up parts for it. */
  linked: boolean;
  carName: string | null;
  copyCar: CopyCar;
  parts: FitPart[];
  ask: FindAsk | null;
};

export const PARTS_FIT_COPY = {
  title: (car: string | null) => (car ? `Parts that fit your ${car}` : "Parts that fit this car"),
  helper: "Show one of these at the parts store. Tap the one you're using.",
  /** LC-10: an inspection's not-done-yet job. */
  toBuyTitle: (car: string | null) => (car ? `Parts to buy for your ${car}` : "Parts to buy for this car"),
  toBuyHelper: "Buy one of these. Copy the part info or show it at the parts store.",
  forTheStore: "For the parts store:",
  copy: "Copy part info",
  copied: "Copied",
  copyFailed: "Couldn't copy. Write it down from the card.",
  badge: {
    made_for_car: "Made for your car",
    also_fits: "Also fits",
    fits_by_size: "Fits by size",
    check_before_buying: "Check before buying",
  } satisfies Record<FitLabel, string>,
  using: (brand: string, name: string) => `Using ${[brand, name.charAt(0).toLowerCase() + name.slice(1)].filter(Boolean).join(" ")}`,
  change: "Change",
  planIt: "Plan it — I'll buy it first",
  planItHelper: "Adds this job to the car's Not done yet list.",
  pickPlaceFirst: "Pick where on the car to see the parts that fit.",
  loading: "Looking for parts that fit…",
  loadFailed: "Couldn't load the parts",
  loadFailedBody: "You can still save this job without a part.",
  tryAgain: "Try again",
  notLinked: "Roam can't list parts for this car yet. You can still save this job.",
  noneTitle: (car: string | null) => `Roam doesn't have this part for your ${car ?? "car"} yet`,
  noneBody: (part: string) =>
    `Tap below and Roam's team will find the right ${part} for your car. We'll tell you when it's added — usually within a few days.`,
  ask: "Ask Roam to find it",
  asking: "Asking…",
  askFailed: "Couldn't send. Try again.",
  saveAnyway: "You can still save this job now and add the part later.",
  lookingTitle: "Roam is looking for it",
  askedOn: (date: string) => `Asked on ${date}`,
  lookingBody: (part: string, car: string | null) =>
    `We'll send you a notification when the ${part} for your ${car ?? "car"} is added.`,
  planItLater: "Plan it — I'll buy it later",
} as const;

const FIT_LABELS = new Set<FitLabel>(["made_for_car", "also_fits", "fits_by_size", "check_before_buying"]);

function str(v: unknown): string {
  return v == null ? "" : String(v).trim();
}

/** "2019 Toyota Roomy" → "Toyota Roomy" (the panel title never shows the year). */
export function carNameOf(body: Record<string, unknown> | null | undefined): string | null {
  if (!body) return null;
  const car = (body.car ?? null) as Record<string, unknown> | null;
  const make = str(car?.make ?? body.make);
  const model = str(car?.model ?? body.model);
  const name = [make, model].filter(Boolean).join(" ");
  return name || null;
}

function fitLabelOf(item: Record<string, unknown>): FitLabel {
  const raw = str(item.fitLabel) as FitLabel;
  if (FIT_LABELS.has(raw)) return raw;
  if (str(item.status) === "needs_checking") return "check_before_buying";
  if (Number(item.tier) === 1) return "made_for_car";
  return Number(item.tier) === 5 ? "fits_by_size" : "also_fits";
}

/** The /parts/find answer → cards in the server's order (best tier first), one card per part. */
export function partsFromFindBody(raw: unknown): PartsForJob {
  const body = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const linked = body.linked !== false;
  const sections = Array.isArray(body.plainSections) ? (body.plainSections as Array<Record<string, unknown>>) : [];
  const seen = new Set<string>();
  const parts: FitPart[] = [];
  for (const section of sections) {
    const items = Array.isArray(section.items) ? (section.items as Array<Record<string, unknown>>) : [];
    for (const item of items) {
      const partId = str(item.partId);
      if (!partId || seen.has(partId)) continue;
      seen.add(partId);
      parts.push({
        partId,
        name: str(item.name),
        brand: str(item.brand),
        number: str(item.number),
        fitLabel: fitLabelOf(item),
        verified: str(item.status) !== "needs_checking",
      });
    }
  }
  const a = body.ask as Record<string, unknown> | undefined;
  const ask: FindAsk | null =
    a && (a.state === "none" || a.state === "looking")
      ? { state: a.state, askedAt: a.askedAt ? String(a.askedAt) : null, byYou: a.byYou === true }
      : null;
  return { linked, carName: carNameOf(body), copyCar: copyCarOf(body), parts, ask };
}

/**
 * "Copy part info": the same block Find parts copies — car, chassis / engine / drive, part, whose number it is, and the
 * other brands' numbers for the same part (from the part lookup, when it has loaded). Nothing is guessed.
 */
export function partCopyText(
  car: CopyCar | null | undefined,
  part: Pick<FitPart, "name" | "brand" | "number">,
  brandNumbers?: StoreBrandNumber[],
  placeLabels?: string[],
): string {
  return buildStoreCopyText({
    carLine: car?.line ?? "",
    carDetails: car ? carDetailsLine({ chassis: car.chassis, engine: car.engine, drive: car.drive }) : "",
    partName: nameWithMakerName(part.name, placeLabels),
    number: part.number,
    numberBrand: part.brand,
    brandNumbers,
  });
}

/**
 * "Front oxygen sensor" + place "Front (Air fuel ratio sensor)" → "Front oxygen sensor (Air fuel ratio sensor)".
 * The bracket is the car maker's own name from the one place picked; never added for several places or when the
 * name already says it.
 */
export function nameWithMakerName(name: string, placeLabels?: string[]): string {
  const places = (placeLabels ?? []).filter(Boolean);
  if (places.length !== 1) return name;
  const m = places[0].match(/\(([^)]+)\)\s*$/);
  const maker = m?.[1]?.trim();
  if (!maker || !name || name.toLowerCase().includes(maker.toLowerCase())) return name;
  return `${name} (${maker})`;
}

/** The part lookup answer → every brand's number (reference first), as Find parts reads it. */
export function brandNumbersFromLookup(raw: unknown): StoreBrandNumber[] {
  const body = (raw && typeof raw === "object" ? raw : {}) as {
    reference?: { brand?: string; number?: string };
    brandNumbers?: Array<{ brand?: string; number?: string }>;
  };
  return [
    ...(body.reference?.number ? [{ brand: String(body.reference.brand ?? ""), number: String(body.reference.number) }] : []),
    ...(body.brandNumbers ?? []).map((b) => ({ brand: String(b.brand ?? ""), number: String(b.number ?? "") })),
  ].filter((b) => b.number);
}

/** Car line + chassis / engine / drive from the find answer's car version (the one Find parts copies too). */
export function copyCarOf(body: Record<string, unknown>): CopyCar {
  const car = (body.car ?? null) as Record<string, unknown> | null;
  const variants = Array.isArray(body.variants) ? (body.variants as Array<Record<string, unknown>>) : [];
  const picked = ((body.picked as Record<string, unknown> | null) ?? (variants.length === 1 ? variants[0] : null)) as
    | Record<string, unknown>
    | null;
  const year = str(car?.year ?? body.year);
  const line = [str(car?.make ?? body.make), str(car?.model ?? body.model), year].filter(Boolean).join(" ");
  return {
    line,
    chassis: str(picked?.chassis_code),
    engine: str(picked?.engine_code),
    drive: str(picked?.drivetrain),
    variantId: str(body.pickedVariantId) || str(picked?.id) || null,
  };
}

/**
 * Query for /parts/find: the job and its places as picked. "Not sure" is sent too: the server lists every place
 * for it, and the ask state is keyed on the same places the ask is sent with.
 */
export function findQueryFor(vehicleId: string, componentId: string, places: string[]): Record<string, string> {
  const q: Record<string, string> = { vehicleId, componentId };
  const kept = places.filter(Boolean);
  if (kept.length) q.places = kept.join(",");
  return q;
}

/** "18 Nov 2026" from an ISO date / timestamp. */
export function shortDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/** The maker's round tile: short name in its own colour pair (no maker logos are stored). */
export function makerTile(brand: string): { text: string; cls: string } {
  const b = brand.trim();
  const short = (b.split(/[\s(]/)[0] || "?").slice(0, 6).toUpperCase();
  const palette = [
    "bg-[#fef2f2] text-[#dc2626] dark:bg-[#450a0a] dark:text-[#fca5a5]",
    "bg-[#fff1f2] text-[#e11d48] dark:bg-[#4c0519] dark:text-[#fda4af]",
    "bg-[#f0fdf4] text-[#15803d] dark:bg-[#052e16] dark:text-[#86efac]",
    "bg-[#eff6ff] text-[#1d4ed8] dark:bg-[#172554] dark:text-[#93c5fd]",
    "bg-[#f5f3ff] text-[#6d28d9] dark:bg-[#2e1065] dark:text-[#c4b5fd]",
  ];
  let h = 0;
  for (const ch of short) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return { text: short, cls: palette[h % palette.length] };
}

/** The "Ask Roam" need text: job + place in words, never a part number (rule 8). */
export function askNeedText(jobName: string, placeLabels: string[]): string {
  const places = placeLabels.filter(Boolean);
  return places.length ? `${jobName} · ${places.join(", ")}` : jobName;
}

/** "Oxygen sensor · Front (Air fuel ratio sensor)" for the Plan it overlay and the Not done yet card. */
export function jobWithPlaces(jobName: string, placeLabels: string[]): string {
  return askNeedText(jobName, placeLabels);
}
