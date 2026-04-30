// Re-write listed .ts files as UTF-8 (no BOM) when saved as UTF-16 LE (breaks Supabase/Deno bundle).
import fs from "node:fs";
import path from "node:path";

const roots = [
  "src/supabase/functions/server/vehicle_catalog_gate.ts",
  "src/utils/vehicleCatalogGate.ts",
  "src/utils/catalogGateErrors.ts",
  "src/utils/chassisPrefix.ts",
  "src/utils/chassisPrefix.test.ts",
  "src/components/vehicles/CatalogVariantPicker.tsx",
  "src/components/vehicles/PendingCatalogRequestsDrawer.tsx",
  "src/components/vehicles/CatalogFacetSelect.tsx",
  "src/components/vehicles/AddVehicleModal.tsx",
  "src/components/vehicles/VehicleDetail.tsx",
  "src/hooks/useMyPendingCatalogRequests.ts",
  "src/hooks/useCatalogCandidates.ts",
  "src/hooks/useVehicleCatalogAnchorFacets.ts",
  "supabase/migrations/20260430120000_vehicle_catalog_pending_disambiguators.sql",
];

function decodeBest(buf) {
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
    return buf.subarray(2).toString("utf16le");
  }
  const sample = buf.subarray(0, Math.min(buf.length, 400));
  let nul = 0;
  for (let i = 0; i < sample.length; i++) {
    if (sample[i] === 0) nul++;
  }
  if (nul > 30 && sample.length > 40) {
    return buf.toString("utf16le");
  }
  return buf.toString("utf8");
}

for (const rel of roots) {
  const p = path.join(process.cwd(), rel);
  if (!fs.existsSync(p)) {
    console.warn("skip (missing):", rel);
    continue;
  }
  const buf = fs.readFileSync(p);
  const text = decodeBest(buf);
  fs.writeFileSync(p, text.replace(/\r\n/g, "\n"), { encoding: "utf8" });
  console.log("normalized:", rel);
}
