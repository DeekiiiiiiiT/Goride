type FitPair = { axle: "front" | "rear"; side: "left" | "right" | "both" };

export const POSITION_SCHEMES = [
  "none",
  "axle",
  "four_corners",
  "driver_passenger_rear",
  "low_high_beam",
  "before_after_catalyst",
  "front_rear_side",
  "axle_left_right",
  "axle_inner_outer",
  "axle_numbered",
] as const;

export type PositionScheme = (typeof POSITION_SCHEMES)[number];

export const WHEEL_SCHEMES = ["axle", "four_corners", "axle_left_right", "axle_inner_outer"] as const;

export function isWheelScheme(scheme: string | null | undefined): boolean {
  const s = String(scheme ?? "").trim();
  return (WHEEL_SCHEMES as readonly string[]).includes(s);
}

export const WHEEL_CODES = ["LF", "RF", "LR", "RR"] as const;
export const NOT_SURE = "unknown";

export type PositionJobInput = {
  code?: string | null;
  position_aware?: boolean | null;
  position_scheme?: string | null;
};

function normalizedScheme(scheme: string | null | undefined): string {
  return String(scheme ?? "").trim().toLowerCase();
}

function isKnownScheme(scheme: string): boolean {
  return (POSITION_SCHEMES as readonly string[]).includes(scheme);
}

function wheelCodeOptions(): { code: string; label: string }[] {
  return WHEEL_CODES.map((code) => ({ code, label: code }));
}

function schemeHasSelectablePositions(scheme: string): boolean {
  if (!scheme || scheme === "none") return false;
  if (!isKnownScheme(scheme)) return false;
  return true;
}

/** Dominion add-parts position UI (moved from Step2FitBlock). */
export const AXLE_POSITIONS = [
  { id: "front", label: "Front Axle", icon: "adjust" as const },
  { id: "rear", label: "Rear Axle", icon: "radio_button_unchecked" as const },
];

export const CATALYST_POSITIONS = [
  { id: "before_cat", label: "Before cat" },
  { id: "after_cat", label: "After cat" },
];

export const CORNER_SIDES = [
  { pos: "front", side: "left", label: "Front left" },
  { pos: "front", side: "right", label: "Front right" },
  { pos: "rear", side: "left", label: "Rear left" },
  { pos: "rear", side: "right", label: "Rear right" },
];

export const DRIVER_PASSENGER_REAR = [
  { id: "driver", label: "Driver" },
  { id: "passenger", label: "Passenger" },
  { id: "rear", label: "Rear" },
];

export const LOW_HIGH_BEAM = [
  { id: "low", label: "Low beam" },
  { id: "high", label: "High beam" },
];

export const FRONT_REAR_SIDE = [
  { id: "front", label: "Front" },
  { id: "rear", label: "Rear" },
  { id: "side", label: "Side" },
];

export function fleetPositionOptions(job: PositionJobInput): { code: string; label: string }[] {
  const code = String(job.code ?? "").trim().toLowerCase();
  let options: { code: string; label: string }[];

  if (code === "front_stabilizer_link") {
    options = [
      { code: "LF", label: "Left" },
      { code: "RF", label: "Right" },
    ];
  } else if (code === "rear_stabilizer_link") {
    options = [
      { code: "LR", label: "Left" },
      { code: "RR", label: "Right" },
    ];
  } else if (job.position_aware === true) {
    options = wheelCodeOptions();
  } else {
    const scheme = normalizedScheme(job.position_scheme);
    if (!schemeHasSelectablePositions(scheme)) {
      options = [];
    } else if (isWheelScheme(scheme)) {
      options = wheelCodeOptions();
    } else if (scheme === "before_after_catalyst") {
      options = [
        { code: "before_cat", label: "Front (before converter)" },
        { code: "after_cat", label: "Rear (after converter)" },
      ];
    } else if (scheme === "driver_passenger_rear") {
      options = [
        { code: "driver", label: "Driver" },
        { code: "passenger", label: "Passenger" },
        { code: "rear", label: "Rear" },
      ];
    } else if (scheme === "low_high_beam") {
      options = [
        { code: "low", label: "Low beam" },
        { code: "high", label: "High beam" },
      ];
    } else if (scheme === "front_rear_side") {
      options = [
        { code: "front", label: "Front" },
        { code: "rear", label: "Rear" },
        { code: "side", label: "Side" },
      ];
    } else if (scheme === "axle_numbered") {
      options = [
        { code: "front", label: "Front" },
        { code: "rear", label: "Rear" },
      ];
    } else {
      options = [];
    }
  }

  const scheme = normalizedScheme(job.position_scheme);
  if (
    job.position_aware !== true &&
    schemeHasSelectablePositions(scheme) &&
    code !== "front_stabilizer_link" &&
    code !== "rear_stabilizer_link"
  ) {
    options = [...options, { code: NOT_SURE, label: "Not sure" }];
  }

  return options;
}

export function allowedPositionCodes(job: PositionJobInput): string[] {
  return fleetPositionOptions(job).map((o) => o.code);
}

export function positionCodesProblem(
  job: PositionJobInput,
  codes: string[],
): null | "code_not_allowed" | "not_sure_with_others" {
  if (!codes.length) return null;
  const distinct = [...new Set(codes)];
  if (distinct.includes(NOT_SURE) && distinct.length > 1) {
    return "not_sure_with_others";
  }
  const allowed = new Set(allowedPositionCodes(job));
  for (const c of distinct) {
    if (!allowed.has(c)) return "code_not_allowed";
  }
  return null;
}

export function positionLabel(job: PositionJobInput, code: string): string {
  const hit = fleetPositionOptions(job).find((o) => o.code === code);
  return hit?.label ?? code;
}

export function positionsLabel(job: PositionJobInput, codes: string[]): string {
  return codes.map((c) => positionLabel(job, c)).join(", ");
}

export function wheelCodesToFitPairs(codes: string[]): FitPair[] {
  const set = new Set(codes.filter((c) => (WHEEL_CODES as readonly string[]).includes(c)));
  if (set.size === 0) return [];

  const pairs: FitPair[] = [];
  const hasLF = set.has("LF");
  const hasRF = set.has("RF");
  const hasLR = set.has("LR");
  const hasRR = set.has("RR");

  if (hasLF && hasRF) {
    pairs.push({ axle: "front", side: "both" });
  } else if (hasLF) {
    pairs.push({ axle: "front", side: "left" });
  } else if (hasRF) {
    pairs.push({ axle: "front", side: "right" });
  }

  if (hasLR && hasRR) {
    pairs.push({ axle: "rear", side: "both" });
  } else if (hasLR) {
    pairs.push({ axle: "rear", side: "left" });
  } else if (hasRR) {
    pairs.push({ axle: "rear", side: "right" });
  }

  return pairs;
}