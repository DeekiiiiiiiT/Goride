/** URL fit param: front:both,rear:left */

export type PartsFitAxle = "front" | "rear";
export type PartsFitSide = "left" | "right" | "both";

export type PartsFitPair = {
  axle: PartsFitAxle;
  side: PartsFitSide;
};

const AXLE = new Set<string>(["front", "rear"]);
const SIDE = new Set<string>(["left", "right", "both"]);

export function parsePartsFitParam(raw: string | null | undefined): PartsFitPair[] {
  const text = String(raw ?? "").trim();
  if (!text) return [];
  const pairs: PartsFitPair[] = [];
  for (const chunk of text.split(",")) {
    const part = chunk.trim();
    if (!part) continue;
    const [axleRaw, sideRaw] = part.split(":");
    const axle = String(axleRaw ?? "").trim().toLowerCase();
    const side = String(sideRaw ?? "both").trim().toLowerCase();
    if (!AXLE.has(axle)) continue;
    if (!SIDE.has(side)) continue;
    pairs.push({ axle: axle as PartsFitAxle, side: side as PartsFitSide });
  }
  return pairs;
}

export function formatPartsFitParam(pairs: PartsFitPair[]): string {
  return pairs.map((p) => `${p.axle}:${p.side}`).join(",");
}

/** Legacy pos + side query → single fit pair. */
export function legacyPosSideToFitPair(
  position: string | null | undefined,
  side: string | null | undefined,
): PartsFitPair | null {
  const pos = String(position ?? "").trim().toLowerCase();
  const sd = String(side ?? "both").trim().toLowerCase();
  if (!pos) return null;
  if (pos === "both") {
    return { axle: "front", side: (SIDE.has(sd) ? sd : "both") as PartsFitSide };
  }
  if (!AXLE.has(pos)) return null;
  return {
    axle: pos as PartsFitAxle,
    side: (SIDE.has(sd) ? sd : "both") as PartsFitSide,
  };
}

export function resolvePartsFitPairs(input: {
  fit?: string | null;
  position?: string | null;
  side?: string | null;
}): PartsFitPair[] {
  const fromFit = parsePartsFitParam(input.fit);
  if (fromFit.length) return fromFit;
  const pos = String(input.position ?? "").trim().toLowerCase();
  const sd = String(input.side ?? "both").trim().toLowerCase() || "both";
  if (pos === "both") {
    return [
      { axle: "front", side: sd as PartsFitSide },
      { axle: "rear", side: sd as PartsFitSide },
    ];
  }
  const single = legacyPosSideToFitPair(input.position, input.side);
  return single ? [single] : [];
}
