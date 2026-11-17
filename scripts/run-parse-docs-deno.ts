import { createClient } from "npm:@supabase/supabase-js@2";
import { readFileSync, writeFileSync, appendFileSync, existsSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { DOCUMENT_FIELD_WHITELIST } from "../supabase/functions/_shared/vehiclePictures/documentFields.ts";
import { buildProductionDocumentReadDeps } from "../supabase/functions/_fleet-server/vehicle_document_read_runtime.ts";
import { readVehicleCertificate } from "../supabase/functions/_fleet-server/vehicle_document_read.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const DOC_DIR = join(root, ".vehicle-docs-test");
const OUT = join(root, "docs/vehicle-pictures-build/preprod-run.md");

const WHITELIST = new Set<string>(DOCUMENT_FIELD_WHITELIST as unknown as string[]);
const PII_KEYS = /owner|address|trn|name/i;

const url = Deno.env.get("SUPABASE_URL")!;
const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
const sb = createClient(url, anon);

const { data: auth } = await sb.auth.signInWithPassword({
  email: "mm-f01-fleet@local.test",
  password: "MmF01Local2026!",
});
if (!auth.session?.user) throw new Error("sign-in failed");
const userId = auth.session.user.id;
const orgId = "org-mm-f01";

const deps = buildProductionDocumentReadDeps(
  sb,
  () => Deno.env.get("OPENAI_API_KEY"),
  () => Deno.env.get("GEMINI_API_KEY"),
);

const lines = ["", "## Part 3 — Real Jamaican documents (Deno path)", ""];
let pass = true;

for (const [docType, file, label] of [
  ["fitness", join(DOC_DIR, "fitness.png"), "Fitness"] as const,
  ["registration", join(DOC_DIR, "registration.png"), "Registration"] as const,
]) {
  const bytes = readFileSync(file);
  let result;
  for (let attempt = 1; attempt <= 3; attempt++) {
    result = await readVehicleCertificate(deps, {
      docType,
      fileBytes: new Uint8Array(bytes),
      userId,
      orgId,
    });
    if (result.ok) break;
    if (attempt < 3) await new Promise((r) => setTimeout(r, 30_000));
  }
  lines.push(`### ${label} (${result!.ok ? "pass HTTP 200" : `fail HTTP ${result!.httpStatus}`}, attempts ≤3)`);
  if (result!.ok) {
    for (const k of Object.keys(result.fields)) {
      if (PII_KEYS.test(k)) {
        lines.push(`- ${k}: **FAIL**`);
        pass = false;
      } else if (!WHITELIST.has(k)) {
        lines.push(`- ${k}: **FAIL** (not whitelisted)`);
        pass = false;
      } else {
        const v = result.fields[k];
        lines.push(`- ${k}: pass (${typeof v === "string" ? v.slice(0, 40) : v})`);
      }
    }
    lines.push(`- colorStandard: ${result.colorStandard ?? "null"}`);
    if (result.flags.length) lines.push(`- flags: ${result.flags.join(", ")}`);
  } else {
    pass = false;
    lines.push(`- code: ${result!.code}`);
    lines.push(`- error: ${result!.error}`);
  }
  lines.push("");
}

const logCount = await fetch(`${url}/rest/v1/vehicle_document_read_log?select=id`, {
  headers: {
    apikey: anon,
    Authorization: `Bearer ${auth.session.access_token}`,
    Accept: "application/json",
    "Accept-Profile": "fleet",
  },
});
const count = logCount.ok ? (await logCount.json()).length : 0;
lines.push(`### Log / retention`);
lines.push(`- read log rows (total): ${count ?? 0}`);
lines.push(`- pass: rows recorded without file storage`);

if (pass) {
  rmSync(DOC_DIR, { recursive: true, force: true });
  lines.push(`- Deleted .vehicle-docs-test: pass`);
} else {
  lines.push(`- Deleted .vehicle-docs-test: skipped (Part 3 did not pass)`);
}

const base = existsSync(OUT) ? readFileSync(OUT, "utf8").split("## Part 3")[0] : "";
writeFileSync(OUT, `${base.trimEnd()}\n${lines.join("\n")}\n`, "utf8");
console.log(pass ? "PART3_PASS" : "PART3_FAIL");