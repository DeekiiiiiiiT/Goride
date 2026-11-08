export type KeyPartJob = {
  opCode?: string;
  label?: string;
  status?: string;
  position?: string | null;
  parts?: Array<{ partNumber?: string; oem_part_number?: string; tier?: number | null }>;
};

export type KeyPartRowStatus = "verified" | "unverified" | "missing" | "not_applicable";

export type KeyPartRow = {
  label: string;
  opCode: string;
  status: KeyPartRowStatus;
  partNumber: string | null;
};

const KEY_PARTS_ORDER: Array<{ opCode: string; label: string; rollup?: boolean }> = [
  { opCode: "ENG-OIL", label: "Engine oil" },
  { opCode: "ENG-SPARK", label: "Spark plugs" },
  { opCode: "ENG-THERM", label: "Thermostat" },
  { opCode: "FILT-AIR", label: "Air filter" },
  { opCode: "HVAC-CABIN", label: "Cabin filter" },
  { opCode: "BRK-PADS", label: "Brake pads" },
  { opCode: "BELT-SERP", label: "Drive belt" },
  { opCode: "LGT-WIPER", label: "Wiper blades", rollup: true },
  { opCode: "BRK-ROTOR", label: "Brake rotor" },
  { opCode: "SUS-SHOCK", label: "Shock absorbers", rollup: true },
];

const STATUS_RANK: Record<KeyPartRowStatus, number> = {
  verified: 3,
  unverified: 2,
  missing: 1,
  not_applicable: 0,
};

function jobOpCode(job: KeyPartJob): string {
  const raw = job.opCode ?? "";
  return raw.toUpperCase();
}

function normalizeStatus(s?: string): KeyPartRowStatus {
  if (s === "verified") return "verified";
  if (s === "unverified") return "unverified";
  if (s === "not_applicable") return "not_applicable";
  return "missing";
}

function pickPartNumber(job: KeyPartJob): string | null {
  const parts = job.parts ?? [];
  if (!parts.length) return null;
  const tiered = parts
    .filter((p) => {
      const t = p.tier;
      return t == null || (t >= 1 && t <= 3);
    })
    .sort((a, b) => (a.tier ?? 99) - (b.tier ?? 99));
  const pick = tiered[0] ?? parts[0];
  const num = pick.partNumber ?? pick.oem_part_number;
  return num?.trim() ? num.trim() : null;
}

function pickJob(jobs: KeyPartJob[], opCode: string, preferPosition?: string): KeyPartJob | undefined {
  const matches = jobs.filter((j) => jobOpCode(j) === opCode);
  if (!matches.length) return undefined;
  if (preferPosition) {
    const pos = preferPosition.toLowerCase();
    const exact = matches.find((m) => (m.position ?? "").toLowerCase() === pos);
    if (exact) return exact;
  }
  return matches[0];
}

function rollupJobs(jobs: KeyPartJob[], opCode: string): KeyPartRowStatus {
  const matches = jobs.filter((j) => jobOpCode(j) === opCode);
  if (!matches.length) return "missing";
  let best: KeyPartRowStatus = "missing";
  for (const m of matches) {
    const st = normalizeStatus(m.status);
    if (STATUS_RANK[st] > STATUS_RANK[best]) best = st;
  }
  return best;
}

function rollupPartNumber(jobs: KeyPartJob[], opCode: string): string | null {
  const matches = jobs.filter((j) => jobOpCode(j) === opCode);
  const ranked = [...matches].sort(
    (a, b) => STATUS_RANK[normalizeStatus(b.status)] - STATUS_RANK[normalizeStatus(a.status)],
  );
  for (const m of ranked) {
    const n = pickPartNumber(m);
    if (n) return n;
  }
  return null;
}

export function buildKeyPartRows(jobs: KeyPartJob[]): KeyPartRow[] {
  return KEY_PARTS_ORDER.map(({ opCode, label, rollup }) => {
    if (rollup) {
      const status = rollupJobs(jobs, opCode);
      return {
        label,
        opCode,
        status,
        partNumber: status === "missing" ? null : rollupPartNumber(jobs, opCode),
      };
    }
    const job =
      opCode === "BRK-PADS"
        ? pickJob(jobs, opCode, "front") ?? pickJob(jobs, opCode)
        : pickJob(jobs, opCode);
    const status = job ? normalizeStatus(job.status) : "missing";
    return {
      label,
      opCode,
      status,
      partNumber: job ? pickPartNumber(job) : null,
    };
  });
}

export function keyPartsVerifiedCount(rows: KeyPartRow[]): number {
  return rows.filter((r) => r.status === "verified").length;
}

export const KEY_PARTS_TOTAL = 10;
