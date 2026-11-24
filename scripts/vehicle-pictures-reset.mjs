#!/usr/bin/env node
/**
 * Vehicle pictures reset (audit §8, C4 Part 1).
 * Default: --dry-run. Use --apply to mutate. Local test copy unless --allow-remote.
 *
 * Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
 */
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { mapVehicleColor } from "./vehicle-pictures-reset-color.mjs";
import { serverKey } from "./lib/serverKey.mjs";

export { mapVehicleColor } from "./vehicle-pictures-reset-color.mjs";

const BUCKET = "make-37f42386-vehicles";
const STRIP_KEYS = ["image", "fitnessCertificateUrl", "registrationCertificateUrl"];
const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function pathFromVehicleUrl(urlStr) {
  if (!urlStr || typeof urlStr !== "string") return null;
  try {
    const u = new URL(urlStr.trim());
    const idx = u.pathname.indexOf(`/${BUCKET}/`);
    if (idx >= 0) {
      return decodeURIComponent(u.pathname.slice(idx + BUCKET.length + 2));
    }
  } catch {
    /* ignore */
  }
  return null;
}

function vehicleHasOldShape(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return STRIP_KEYS.some((k) => {
    const v = value[k];
    return typeof v === "string" && v.trim().length > 0;
  });
}

function stripPayload(value) {
  const out = { ...value };
  for (const k of STRIP_KEYS) delete out[k];
  return out;
}

async function listAllStoragePaths(sb, bucket, prefix = "") {
  const out = [];
  let offset = 0;
  while (true) {
    const { data, error } = await sb.storage.from(bucket).list(prefix, {
      limit: 100,
      offset,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) throw error;
    if (!data?.length) break;
    for (const item of data) {
      const path = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.id == null) {
        out.push(...await listAllStoragePaths(sb, bucket, path));
      } else {
        out.push(path);
      }
    }
    if (data.length < 100) break;
    offset += data.length;
  }
  return out;
}

async function loadFleetVehiclePayloads(sb) {
  const { data, error } = await sb
    .from("fleet_vehicles")
    .select("id, payload_json");
  if (error) throw error;
  return (data || []).map((row) => ({
    source: "fleet",
    id: row.id,
    value: row.payload_json && typeof row.payload_json === "object" ? row.payload_json : {},
  }));
}

function parseArgs(argv) {
  const apply = argv.includes("--apply");
  const allowRemote = argv.includes("--allow-remote");
  return { apply, allowRemote };
}

function assertLocal(url, allowRemote) {
  const u = String(url);
  if (allowRemote) return;
  if (!/127\.0\.0\.1|localhost/i.test(u)) {
    throw new Error(
      "Refusing to run against non-local SUPABASE_URL (use --allow-remote to override).",
    );
  }
}

async function backupFiles(sb, paths, backupDir) {
  mkdirSync(backupDir, { recursive: true });
  const manifest = [];
  for (const path of paths) {
    const { data, error } = await sb.storage.from(BUCKET).download(path);
    if (error) {
      manifest.push({ path, error: error.message });
      continue;
    }
    const buf = Buffer.from(await data.arrayBuffer());
    const safeName = path.replace(/[/\\]/g, "__");
    const dest = join(backupDir, safeName);
    writeFileSync(dest, buf);
    manifest.push({ path, file: dest, bytes: buf.length });
  }
  writeFileSync(join(backupDir, "manifest.json"), JSON.stringify(manifest, null, 2));
  return manifest;
}

async function main() {
  const { apply, allowRemote } = parseArgs(process.argv.slice(2));
  const url = process.env.SUPABASE_URL;
  const key = serverKey();
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  assertLocal(url, allowRemote);

  const sb = createClient(url, key);

  const bucketPaths = await listAllStoragePaths(sb, BUCKET);
  const fleetRows = await loadFleetVehiclePayloads(sb);

  const certPaths = new Set();
  const vehiclesOldShape = [];
  for (const row of fleetRows) {
    const value = row.value;
    if (!vehicleHasOldShape(value)) continue;
    vehiclesOldShape.push({ source: row.source, id: row.id, value });
    for (const k of STRIP_KEYS) {
      const p = pathFromVehicleUrl(value?.[k]);
      if (p) certPaths.add(p);
    }
  }

  const allObjectPaths = [...new Set([...bucketPaths, ...certPaths])].sort();

  const date = new Date().toISOString().slice(0, 10);
  const backupDir = join(root, ".vehicle-pictures-backup", date);

  console.log(JSON.stringify({
    mode: apply ? "apply" : "dry-run",
    bucketObjectCount: bucketPaths.length,
    certLinkedCount: certPaths.size,
    totalUniqueObjects: allObjectPaths.length,
    vehiclesWithOldPayload: vehiclesOldShape.length,
    objects: allObjectPaths,
  }, null, 2));

  if (!apply) {
    if (allObjectPaths.length === 0 && vehiclesOldShape.length === 0) {
      console.log("Nothing to reset (already clean).");
    } else {
      console.log("Dry run only — re-run with --apply to change data.");
    }
    return;
  }

  if (allObjectPaths.length === 0 && vehiclesOldShape.length === 0) {
    console.log("Second apply: nothing to change.");
    return;
  }

  await backupFiles(sb, allObjectPaths, backupDir);
  console.log(`Backed up to ${backupDir}`);

  if (allObjectPaths.length) {
    const { error: delErr } = await sb.storage.from(BUCKET).remove(allObjectPaths);
    if (delErr) throw delErr;
  }

  for (const row of vehiclesOldShape) {
    const next = stripPayload(row.value);
    const { error } = await sb.from("fleet_vehicles").update({ payload_json: next }).eq("id", row.id);
    if (error) throw error;
    const kvKey = `vehicle:${row.id}`;
    const { data: kvRow } = await sb.from("kv_store_37f42386").select("key").eq("key", kvKey).maybeSingle();
    if (kvRow) {
      const { error: kvErr } = await sb.from("kv_store_37f42386").upsert({ key: kvKey, value: next });
      if (kvErr) throw kvErr;
    }
  }

  const { data: fleetVehicles, error: fvErr } = await sb
    .from("fleet_vehicles")
    .select("id, color, color_standard");
  if (fvErr) throw fvErr;

  const stillNull = [];
  for (const v of fleetVehicles || []) {
    if (v.color_standard) continue;
    const mapped = mapVehicleColor(v.color);
    if (!mapped) {
      stillNull.push(v.id);
      continue;
    }
    const { error } = await sb.from("fleet_vehicles").update({ color_standard: mapped }).eq("id", v.id);
    if (error) throw error;
  }

  if (stillNull.length) {
    console.log("Vehicles still missing color_standard (Fleet must ask owner):", stillNull);
  }

  const unknownIds = (fleetVehicles || []).filter((v) => String(v.id).startsWith("UNKNOWN-")).map((v) => v.id);
  if (unknownIds.length) {
    console.log("UNKNOWN- vehicle ids:", unknownIds);
  } else {
    console.log("UNKNOWN- vehicle ids: none");
  }

  const { error: fillErr } = await sb.rpc("kick_vehicle_picture_fill", { p_after_id: null });
  if (fillErr) {
    console.warn("kick_vehicle_picture_fill skipped:", fillErr.message);
  } else {
    console.log("kick_vehicle_picture_fill: ok");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});