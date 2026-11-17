#!/usr/bin/env node
/**
 * T22 — reset script on local test copy (C4).
 * Seeds 2 vehicles, 8 storage files, runs dry-run / apply / second apply.
 *
 * Requires local Supabase (pnpm testcopy) and service role key in env or .testcopy/service-role.txt
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const BUCKET = "make-37f42386-vehicles";
const ORG = "org-t22";
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01]);

function loadEnv() {
  const url = process.env.SUPABASE_URL || "http://127.0.0.1:54321";
  let key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const keyFile = join(root, ".testcopy", "service-role.txt");
  if (!key && existsSync(keyFile)) key = readFileSync(keyFile, "utf8").trim();
  if (!key) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
  return { url, key };
}

function runReset(apply) {
  const args = ["scripts/vehicle-pictures-reset.mjs"];
  if (apply) args.push("--apply");
  const r = spawnSync(process.execPath, args, {
    cwd: root,
    env: process.env,
    encoding: "utf8",
  });
  return { code: r.status, stdout: r.stdout || "", stderr: r.stderr || "" };
}

async function seed(sb) {
  const ids = ["T22A", "T22B"];
  const storagePaths = [
    "t22/v1.png",
    "t22/v2.png",
    "t22/unused1.png",
    "t22/unused2.png",
    "t22/fit-a.jpg",
    "t22/reg-a.jpg",
    "t22/fit-b.jpg",
    "t22/reg-b.jpg",
  ];
  for (const p of storagePaths) {
    await sb.storage.from(BUCKET).upload(p, PNG, { upsert: true, contentType: "image/png" });
  }

  const baseUrl = `${process.env.SUPABASE_URL || "http://127.0.0.1:54321"}/storage/v1/object/public/${BUCKET}`;

  const vehicles = [
    {
      id: "T22A",
      organization_id: ORG,
      license_plate: "T22A",
      color: "WHITE",
      color_standard: null,
      vehicle_catalog_id: null,
      legacy_kv_id: "vehicle:T22A",
    },
    {
      id: "T22B",
      organization_id: ORG,
      license_plate: "T22B",
      color: "GREY",
      color_standard: null,
      vehicle_catalog_id: null,
      legacy_kv_id: "vehicle:T22B",
    },
  ];

  for (const v of vehicles) {
    const suffix = v.id;
    const payload = {
      id: suffix,
      licensePlate: suffix,
      color: v.color,
      image: `${baseUrl}/t22/v${suffix === "T22A" ? "1" : "2"}.png`,
      fitnessCertificateUrl: `${baseUrl}/t22/fit-${suffix === "T22A" ? "a" : "b"}.jpg`,
      registrationCertificateUrl: `${baseUrl}/t22/reg-${suffix === "T22A" ? "a" : "b"}.jpg`,
    };
    await sb.from("fleet_vehicles").upsert({
      ...v,
      payload_json: payload,
      status: "Inactive",
    }, { onConflict: "id" });
    await sb.from("kv_store_37f42386").upsert({ key: `vehicle:${suffix}`, value: payload });
  }
}

async function countBucket(sb) {
  const { data, error } = await sb.storage.from(BUCKET).list("t22", { limit: 100 });
  if (error) return -1;
  return data?.length ?? 0;
}

async function main() {
  const { url, key } = loadEnv();
  process.env.SUPABASE_URL = url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = key;

  const sb = createClient(url, key);

  await seed(sb);

  const dry = runReset(false);
  if (dry.code !== 0) throw new Error(`dry-run failed: ${dry.stderr}`);
  if (!dry.stdout.includes("totalUniqueObjects") || !dry.stdout.includes("8")) {
    throw new Error(`T22 dry-run: expected 8 objects in output, got:\n${dry.stdout}`);
  }

  const before = await countBucket(sb);
  const apply1 = runReset(true);
  if (apply1.code !== 0) throw new Error(`apply failed: ${apply1.stderr}`);

  const after = await countBucket(sb);
  const { data: fvA } = await sb.from("fleet_vehicles").select("payload_json").eq("id", "T22A").single();
  const { data: rows } = await sb.from("fleet_vehicles").select("id, color_standard").in("id", ["T22A", "T22B"]);

  const colors = Object.fromEntries((rows || []).map((r) => [r.id, r.color_standard]));
  if (colors.T22A !== "white" || colors.T22B !== "grey") {
    throw new Error(`T22 color map failed: ${JSON.stringify(colors)}`);
  }
  if (fvA?.payload_json?.image) throw new Error("T22: payload still has image after apply");

  const apply2 = runReset(true);
  if (apply2.code !== 0) throw new Error(`second apply failed: ${apply2.stderr}`);
  if (!apply2.stdout.includes("nothing to change") && !apply2.stdout.includes("already clean")) {
    throw new Error(`T22 second apply should noop:\n${apply2.stdout}`);
  }

  console.log(JSON.stringify({
    pass: true,
    bucketBefore: before,
    bucketAfter: after,
    colors,
  }));
}

main().catch((e) => {
  console.error("T22 FAIL", e);
  process.exit(1);
});