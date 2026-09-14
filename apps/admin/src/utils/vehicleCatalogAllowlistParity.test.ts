/**
 * §M14 — keep CSV columns, aliases, and writable keys aligned so new catalog
 * fields cannot silently drop on import.
 */
import { describe, it, expect } from "vitest";
import { VEHICLE_CATALOG_CSV_COLUMNS } from "../types/csv-schemas";
import {
  ALIAS_TO_CANONICAL,
  VEHICLE_CATALOG_PROVENANCE_KEYS,
  VEHICLE_CATALOG_BULK_MAX_ROWS,
  VEHICLE_CATALOG_WRITABLE_KEYS,
} from "./vehicleCatalogCsvImport";
import {
  resolveApproveVehicleClass,
  resolveProposedVehicleClassFromVehicle,
  vehicleClassFromUsageCategory,
} from "../types/vehicleCatalog";

const META_CSV_KEYS = new Set(["id", "created_at", "updated_at"]);

/** Pending approve must cover class + motorcycle writable keys (package KEYS). */
const PENDING_APPROVE_REQUIRED_KEYS = [
  "vehicle_class",
  "final_drive",
  "cooling_type",
  "starter_type",
  "front_tire_size",
  "rear_tire_size",
] as const;

describe("vehicle catalog column allowlists (§M14)", () => {
  const aliasTargets = new Set(Object.values(ALIAS_TO_CANONICAL));
  const writable = new Set<string>(VEHICLE_CATALOG_WRITABLE_KEYS);

  it("every export data column is reachable via ALIAS_TO_CANONICAL", () => {
    const missing: string[] = [];
    for (const col of VEHICLE_CATALOG_CSV_COLUMNS) {
      const key = String(col.key);
      if (META_CSV_KEYS.has(key)) continue;
      if (!aliasTargets.has(key)) missing.push(key);
    }
    expect(missing, `CSV keys missing from aliases: ${missing.join(", ")}`).toEqual([]);
  });

  it("vehicle_class and motorcycle writable keys are aliased", () => {
    for (const key of PENDING_APPROVE_REQUIRED_KEYS) {
      expect(writable.has(key), `writable missing ${key}`).toBe(true);
      expect(aliasTargets.has(key), `alias target missing ${key}`).toBe(true);
    }
  });

  it("writable keys (except generation_code legacy / provenance) appear as alias targets or are meta", () => {
    const provenance = new Set<string>(VEHICLE_CATALOG_PROVENANCE_KEYS);
    const missing: string[] = [];
    for (const key of VEHICLE_CATALOG_WRITABLE_KEYS) {
      if (key === "generation_code") continue; // aliased into chassis_code
      if (provenance.has(key)) continue; // edge-stamped, not CSV columns
      if (!aliasTargets.has(key)) missing.push(key);
    }
    expect(missing, `writable keys without aliases: ${missing.join(", ")}`).toEqual([]);
  });

  it("provenance keys are writable so edge stamps are not silently dropped", () => {
    for (const key of VEHICLE_CATALOG_PROVENANCE_KEYS) {
      expect(writable.has(key), `writable missing provenance ${key}`).toBe(true);
    }
  });

  it("bulk max rows is a positive integer at or below PostgREST comfort (50)", () => {
    expect(Number.isInteger(VEHICLE_CATALOG_BULK_MAX_ROWS)).toBe(true);
    expect(VEHICLE_CATALOG_BULK_MAX_ROWS).toBeGreaterThan(0);
    expect(VEHICLE_CATALOG_BULK_MAX_ROWS).toBeLessThanOrEqual(50);
  });

  it("every export data column is writable server-side", () => {
    const missing = VEHICLE_CATALOG_CSV_COLUMNS.map((c) => String(c.key)).filter(
      (k) => !META_CSV_KEYS.has(k) && !writable.has(k),
    );
    expect(missing, `CSV keys missing from writable: ${missing.join(", ")}`).toEqual([]);
  });
});

describe("vehicleClassFromUsageCategory", () => {
  it("maps Motorcycle to motorcycle and everything else to car", () => {
    expect(vehicleClassFromUsageCategory("Motorcycle")).toBe("motorcycle");
    expect(vehicleClassFromUsageCategory("Private")).toBe("car");
    expect(vehicleClassFromUsageCategory(null)).toBe("car");
    expect(vehicleClassFromUsageCategory(undefined)).toBe("car");
  });
});

describe("pending approve class resolution (§M11)", () => {
  it("upsert: Motorcycle usage → proposed motorcycle", () => {
    expect(resolveProposedVehicleClassFromVehicle({ usageCategory: "Motorcycle" })).toBe(
      "motorcycle",
    );
  });

  it("upsert: class hint wins over car usage", () => {
    expect(
      resolveProposedVehicleClassFromVehicle({
        usageCategory: "Private",
        vehicle_catalog_class_hint: "motorcycle",
      }),
    ).toBe("motorcycle");
  });

  it("approve-new without body override uses proposed", () => {
    const r = resolveApproveVehicleClass(undefined, false, "motorcycle");
    expect(r).toEqual({ ok: true, value: "motorcycle" });
  });

  it("approve-new with car override inserts car", () => {
    const r = resolveApproveVehicleClass("car", true, "motorcycle");
    expect(r).toEqual({ ok: true, value: "car" });
  });

  it("approve-new rejects invalid class", () => {
    const r = resolveApproveVehicleClass("boat", true, "car");
    expect(r.ok).toBe(false);
  });
});
