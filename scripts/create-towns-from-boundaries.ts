/**
 * Create inactive towns from official admin2 borders.
 *
 *   deno run -A scripts/create-towns-from-boundaries.ts --token "$TOKEN" --dry-run
 *   deno run -A scripts/create-towns-from-boundaries.ts --token "$TOKEN" --parish JM02
 *   deno run -A scripts/create-towns-from-boundaries.ts --token "$TOKEN"
 *
 * Each call only creates an inactive, unpublished town. This script never
 * publishes or activates. "Already exists" is a skip, so a second run is safe.
 * The first real failure stops the run.
 */
import { parse } from "https://deno.land/std@0.224.0/flags/parse.ts";
import { marketSlugFromBoundary } from "../supabase/functions/delivery/admin/marketSlug.ts";

const CREATE_PATH = "/towns-from-boundary";

const args = parse(Deno.args, {
  string: ["token", "url", "parish"],
  boolean: ["dry-run", "help"],
  default: {
    url: Deno.env.get("DELIVERY_FUNCTIONS_URL") ??
      "https://csfllzzastacofsvcdsc.supabase.co/functions/v1/delivery",
  },
});

if (args.help || !args.token) {
  console.log(
    "Usage: deno run -A scripts/create-towns-from-boundaries.ts --token <jwt> [--dry-run] [--parish JM02]",
  );
  Deno.exit(args.help ? 0 : 1);
}

if (CREATE_PATH.includes("publish") || CREATE_PATH.includes("activ")) {
  console.error("Refusing to run: create path must not publish or activate");
  Deno.exit(1);
}

type BoundaryRow = {
  pcode: string;
  parent_pcode?: string | null;
  name: string;
  slug: string;
  admin_level: number;
};

type ParishRow = {
  id: string;
  name: string;
  slug: string;
  pcode?: string | null;
  sort_order?: number | null;
  towns?: Array<{ pcode?: string | null }>;
};

type WorkItem = {
  pcode: string;
  name: string;
  parishId: string;
  parishName: string;
  parishPcode: string;
  slug: string;
};

const base = String(args.url).replace(/\/$/, "");
const headers = {
  Authorization: `Bearer ${args.token}`,
  "Content-Type": "application/json",
};

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${base}${path}`, { headers });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${path} ${res.status}: ${text.slice(0, 400)}`);
  }
  return JSON.parse(text) as T;
}

const [boundaryRes, marketRes] = await Promise.all([
  getJson<{ boundaries: BoundaryRow[] }>("/admin/markets/boundaries?admin_level=2"),
  getJson<{ parishes: ParishRow[]; unassigned?: Array<{ pcode?: string | null }> }>(
    "/admin/markets",
  ),
]);

const parishByPcode = new Map<string, ParishRow>();
const existingPcodes = new Set<string>();
for (const parish of marketRes.parishes ?? []) {
  if (parish.pcode) parishByPcode.set(parish.pcode, parish);
  for (const town of parish.towns ?? []) {
    if (town.pcode) existingPcodes.add(town.pcode);
  }
}
for (const town of marketRes.unassigned ?? []) {
  if (town.pcode) existingPcodes.add(town.pcode);
}

const onlyParish = args.parish ? String(args.parish).trim().toUpperCase() : "";
const work: WorkItem[] = [];
const problems: string[] = [];

for (const boundary of boundaryRes.boundaries ?? []) {
  if (Number(boundary.admin_level) !== 2) continue;
  const pcode = String(boundary.pcode ?? "").trim();
  const parent = String(boundary.parent_pcode ?? "").trim();
  if (!pcode || !parent) {
    problems.push(`${pcode || "(no pcode)"}: missing parent parish code`);
    continue;
  }
  if (onlyParish && parent.toUpperCase() !== onlyParish) continue;
  if (existingPcodes.has(pcode)) continue;
  const parish = parishByPcode.get(parent);
  if (!parish) {
    problems.push(`${pcode} ${boundary.name}: no parish for ${parent}`);
    continue;
  }
  const slug = marketSlugFromBoundary(boundary.slug, parish.slug);
  if (!slug) {
    problems.push(`${pcode} ${boundary.name}: missing web name`);
    continue;
  }
  work.push({
    pcode,
    name: boundary.name,
    parishId: parish.id,
    parishName: parish.name,
    parishPcode: parent,
    slug,
  });
}

work.sort((a, b) => a.parishName.localeCompare(b.parishName) || a.name.localeCompare(b.name));

if (problems.length > 0) {
  console.error("Work list problems:");
  for (const problem of problems) console.error(`  ${problem}`);
  Deno.exit(1);
}

console.log(
  `${args["dry-run"] ? "DRY RUN" : "CREATE"} ${work.length} town(s)${onlyParish ? ` in ${onlyParish}` : ""}`,
);
for (const item of work) {
  console.log(`  ${item.parishPcode} ${item.pcode} ${item.name} (${item.parishName}) -> ${item.slug}`);
}

if (args["dry-run"]) {
  console.log(JSON.stringify({ planned: work.length, skippedExisting: existingPcodes.size, failed: 0 }));
  Deno.exit(0);
}

let created = 0;
let skipped = 0;
let failed = 0;

for (const item of work) {
  const path = `/admin/markets/parishes/${item.parishId}${CREATE_PATH}`;
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify({ pcode: item.pcode }),
  });
  const text = await res.text();
  let body: { error?: string; warning?: string; market?: { name?: string } } = {};
  try {
    body = JSON.parse(text);
  } catch {
    body = { error: text.slice(0, 400) };
  }

  if (res.status === 409) {
    skipped += 1;
    console.log(`  skip ${item.pcode} ${body.error ?? "already exists"}`);
  } else if (res.ok && body.warning) {
    failed += 1;
    console.error(`  FAIL ${item.pcode} border warning: ${body.warning}`);
    break;
  } else if (res.ok) {
    created += 1;
    console.log(`  created ${item.pcode} ${body.market?.name ?? item.name}`);
  } else {
    failed += 1;
    console.error(`  FAIL ${item.pcode} ${res.status} ${body.error ?? text.slice(0, 400)}`);
    break;
  }

  await new Promise((resolve) => setTimeout(resolve, 150));
}

console.log(JSON.stringify({ created, skipped, failed, planned: work.length }));
Deno.exit(failed > 0 ? 1 : 0);
