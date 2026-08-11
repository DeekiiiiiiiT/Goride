/**
 * Domain registry: KV prefix → fleet table + row mapper.
 */
import type { FleetDomain } from "./fleet_table_flags.ts";

export type FleetDomainDef = {
  domain: FleetDomain;
  table: string;
  /** KV key prefixes that map to this table (first match wins). */
  prefixes: string[];
  mapRow: (key: string, value: Record<string, unknown>) => Record<string, unknown> | null;
};

function str(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s || null;
}

function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function bool(v: unknown): boolean | null {
  if (v === true || v === false) return v;
  if (v === "true" || v === "1") return true;
  if (v === "false" || v === "0") return false;
  return null;
}

function dateOnly(v: unknown): string | null {
  const s = str(v);
  if (!s) return null;
  return s.slice(0, 10);
}

function orgOf(v: Record<string, unknown>): string | null {
  return str(v.organizationId) ?? str(v.organization_id);
}

function idFrom(key: string, value: Record<string, unknown>, prefix: string): string {
  const fromVal = str(value.id);
  if (fromVal) return fromVal;
  return key.startsWith(prefix) ? key.slice(prefix.length) : key;
}

function base(
  key: string,
  value: Record<string, unknown>,
  prefix: string,
  extras: Record<string, unknown>,
): Record<string, unknown> {
  const id = idFrom(key, value, prefix);
  return {
    id,
    organization_id: orgOf(value),
    legacy_kv_id: key,
    payload_json: value,
    ...extras,
  };
}

export const FLEET_DOMAINS: FleetDomainDef[] = [
  {
    domain: "drivers",
    table: "drivers",
    prefixes: ["driver:"],
    mapRow: (key, v) =>
      base(key, v, "driver:", {
        name: str(v.name) ?? str(v.driverName),
        email: str(v.email),
        phone: str(v.phone),
        status: str(v.status),
        assigned_vehicle_id: str(v.assignedVehicleId),
        uber_driver_id: str(v.uberDriverId),
        indrive_driver_id: str(v.inDriveDriverId),
        license_front_url: str(v.licenseFrontUrl),
        license_back_url: str(v.licenseBackUrl),
        proof_of_address_url: str(v.proofOfAddressUrl),
        fuel_scenario_id: str(v.fuelScenarioId),
      }),
  },
  {
    domain: "vehicles",
    table: "vehicles",
    prefixes: ["vehicle:"],
    mapRow: (key, v) =>
      base(key, v, "vehicle:", {
        license_plate: str(v.licensePlate),
        vin: str(v.vin),
        make: str(v.make),
        model: str(v.model),
        year: num(v.year) != null ? Math.trunc(num(v.year)!) : null,
        color: str(v.color),
        status: str(v.status),
        current_driver_id: str(v.currentDriverId),
        toll_tag_id: str(v.tollTagId) ?? str(v.tollTagUuid),
        vehicle_catalog_id: str(v.vehicle_catalog_id) ?? str(v.vehicleCatalogId),
      }),
  },
  {
    domain: "driver_metrics",
    table: "driver_metrics",
    prefixes: ["driver_metric:"],
    mapRow: (key, v) =>
      base(key, v, "driver_metric:", {
        driver_id: str(v.driverId) ?? idFrom(key, v, "driver_metric:"),
      }),
  },
  {
    domain: "vehicle_metrics",
    table: "vehicle_metrics",
    prefixes: ["vehicle_metric:"],
    mapRow: (key, v) =>
      base(key, v, "vehicle_metric:", {
        vehicle_id: str(v.vehicleId) ?? idFrom(key, v, "vehicle_metric:"),
      }),
  },
  {
    domain: "trips",
    table: "trips",
    prefixes: ["trip:"],
    mapRow: (key, v) =>
      base(key, v, "trip:", {
        date: dateOnly(v.date),
        driver_id: str(v.driverId),
        vehicle_id: str(v.vehicleId),
        platform: str(v.platform),
        status: str(v.status),
        amount: num(v.amount),
        batch_id: str(v.batchId),
        payment_method: str(v.paymentMethod),
      }),
  },
  {
    domain: "import_batches",
    table: "import_batches",
    prefixes: ["batch:"],
    mapRow: (key, v) =>
      base(key, v, "batch:", {
        file_name: str(v.fileName),
        upload_date: str(v.uploadDate) ?? str(v.createdAt),
        status: str(v.status),
        record_count: num(v.recordCount) != null ? Math.trunc(num(v.recordCount)!) : null,
        type: str(v.type),
        period_start: dateOnly(v.periodStart) ?? dateOnly(v.dataPeriodStart),
        period_end: dateOnly(v.periodEnd) ?? dateOnly(v.dataPeriodEnd),
      }),
  },
  {
    domain: "import_metadata",
    table: "import_metadata",
    prefixes: ["import_metadata:"],
    mapRow: (key, v) => base(key, v, "import_metadata:", {}),
  },
  {
    domain: "import_insights",
    table: "import_insights",
    prefixes: ["import_insights:"],
    mapRow: (key, v) => base(key, v, "import_insights:", {}),
  },
  {
    domain: "payment_ledger_lines",
    table: "payment_ledger_lines",
    prefixes: ["payment_ledger_line:"],
    mapRow: (key, v) =>
      base(key, v, "payment_ledger_line:", {
        platform: str(v.platform),
        trip_id: str(v.tripId),
        driver_id: str(v.driverId),
        batch_id: str(v.batchId),
        idempotency_key: str(v.idempotencyKey),
        reporting_at: str(v.reportingAt),
        paid_to_you: num(v.paidToYou),
        earnings_gross: num(v.earningsGross),
      }),
  },
  {
    domain: "driver_period_snapshots",
    table: "driver_period_snapshots",
    prefixes: ["driver_period_snapshot:"],
    mapRow: (key, v) =>
      base(key, v, "driver_period_snapshot:", {
        driver_id: str(v.driverId),
        batch_id: str(v.batchId),
      }),
  },
  {
    domain: "toll_ledger",
    table: "toll_ledger",
    prefixes: ["toll_ledger:"],
    mapRow: (key, v) =>
      base(key, v, "toll_ledger:", {
        vehicle_id: str(v.vehicleId),
        driver_id: str(v.driverId),
        toll_tag_id: str(v.tollTagId),
        plaza: str(v.plaza),
        plaza_id: str(v.plazaId),
        date: dateOnly(v.date),
        type: str(v.type),
        amount: num(v.amount),
        payment_method: str(v.paymentMethod),
        status: str(v.status),
        resolution: str(v.resolution),
        is_reconciled: bool(v.isReconciled),
        trip_id: str(v.tripId),
        batch_id: str(v.batchId),
        audit_trail: Array.isArray(v.auditTrail) ? v.auditTrail : [],
        metadata: v.metadata && typeof v.metadata === "object" ? v.metadata : {},
      }),
  },
  {
    domain: "toll_tags",
    table: "toll_tags",
    prefixes: ["toll_tag:"],
    mapRow: (key, v) =>
      base(key, v, "toll_tag:", {
        tag_number: str(v.tagNumber) ?? str(v.number),
        vehicle_id: str(v.vehicleId),
      }),
  },
  {
    domain: "toll_plazas",
    table: "toll_plazas",
    prefixes: ["toll_plaza:"],
    mapRow: (key, v) =>
      base(key, v, "toll_plaza:", {
        name: str(v.name) ?? str(v.plaza) ?? str(v.id),
        highway: str(v.highway),
      }),
  },
  {
    domain: "fuel_entries",
    table: "fuel_entries",
    prefixes: ["fuel_entry:", "fuel-entry:"],
    mapRow: (key, v) => {
      const prefix = key.startsWith("fuel-entry:") ? "fuel-entry:" : "fuel_entry:";
      return base(key, v, prefix, {
        date: dateOnly(v.date),
        vehicle_id: str(v.vehicleId),
        driver_id: str(v.driverId),
        card_id: str(v.cardId),
        amount: num(v.amount),
        liters: num(v.liters),
        type: str(v.type),
        entry_mode: str(v.entryMode),
        payment_source: str(v.paymentSource),
      });
    },
  },
  {
    domain: "fuel_cards",
    table: "fuel_cards",
    prefixes: ["fuel_card:"],
    mapRow: (key, v) => base(key, v, "fuel_card:", {}),
  },
  {
    domain: "stations",
    table: "stations",
    prefixes: ["station:", "learnt_location:", "unverified_vendor:"],
    mapRow: (key, v) => {
      const prefix = key.startsWith("learnt_location:")
        ? "learnt_location:"
        : key.startsWith("unverified_vendor:")
          ? "unverified_vendor:"
          : "station:";
      return base(key, v, prefix, { name: str(v.name) ?? str(v.stationName) });
    },
  },
  {
    domain: "fuel_adjustments",
    table: "fuel_adjustments",
    prefixes: ["fuel_adjustment:"],
    mapRow: (key, v) => base(key, v, "fuel_adjustment:", {}),
  },
  {
    domain: "fuel_disputes",
    table: "fuel_disputes",
    prefixes: ["fuel_dispute:"],
    mapRow: (key, v) => base(key, v, "fuel_dispute:", {}),
  },
  {
    domain: "expense_documents",
    table: "expense_documents",
    prefixes: ["expense_doc:"],
    mapRow: (key, v) =>
      base(key, v, "expense_doc:", {
        status: str(v.status),
        category: str(v.category),
        description: str(v.description),
        vendor_id: str(v.vendorId),
        incurred_date: dateOnly(v.incurredDate),
        gross_amount: num(v.grossAmount),
      }),
  },
  {
    domain: "expense_payments",
    table: "expense_payments",
    prefixes: ["expense_payment:"],
    mapRow: (key, v) =>
      base(key, v, "expense_payment:", {
        document_id: str(v.documentId),
        amount: num(v.amount),
        payment_date: dateOnly(v.paymentDate),
      }),
  },
  {
    domain: "transactions",
    table: "transactions",
    prefixes: ["transaction:"],
    mapRow: (key, v) =>
      base(key, v, "transaction:", {
        date: dateOnly(v.date),
        driver_id: str(v.driverId),
        vehicle_id: str(v.vehicleId),
        trip_id: str(v.tripId),
        type: str(v.type),
        category: str(v.category),
        amount: num(v.amount),
        status: str(v.status),
        batch_id: str(v.batchId),
      }),
  },
  {
    domain: "fixed_expenses",
    table: "fixed_expenses",
    prefixes: ["fixed_expense:"],
    mapRow: (key, v) =>
      base(key, v, "fixed_expense:", {
        vehicle_id: str(v.vehicleId),
        name: str(v.name),
        category: str(v.category),
        amount: num(v.amount),
        frequency: str(v.frequency),
        is_active: bool(v.isActive),
      }),
  },
  {
    domain: "expense_rule_groups",
    table: "expense_rule_groups",
    prefixes: ["expense_rule_group:"],
    mapRow: (key, v) => base(key, v, "expense_rule_group:", {}),
  },
  {
    domain: "expense_rule_assignments",
    table: "expense_rule_assignments",
    prefixes: ["expense_rule_assignment:"],
    mapRow: (key, v) => base(key, v, "expense_rule_assignment:", {}),
  },
  {
    domain: "expense_journal",
    table: "expense_journal",
    prefixes: ["expense_journal:"],
    mapRow: (key, v) => base(key, v, "expense_journal:", {}),
  },
  {
    domain: "bank_statements",
    table: "bank_statements",
    prefixes: ["fleet_bank_statement:"],
    mapRow: (key, v) =>
      base(key, v, "fleet_bank_statement:", {
        file_name: str(v.fileName),
      }),
  },
  {
    domain: "bank_confirmations",
    table: "bank_confirmations",
    prefixes: ["fleet_bank_confirm:"],
    mapRow: (key, v) =>
      base(key, v, "fleet_bank_confirm:", {
        driver_id: str(v.driverId),
        week_start_ymd: dateOnly(v.weekStartYmd),
        status: str(v.status),
        amount_received: num(v.amountReceived),
      }),
  },
  {
    domain: "platform_vendors",
    table: "platform_vendors",
    prefixes: ["platform_vendor:", "expense_vendor:"],
    mapRow: (key, v) => {
      const prefix = key.startsWith("expense_vendor:") ? "expense_vendor:" : "platform_vendor:";
      return base(key, v, prefix, { name: str(v.name) });
    },
  },
  {
    domain: "expense_categories",
    table: "expense_categories",
    prefixes: ["platform_expense_category:", "expense_category:"],
    mapRow: (key, v) => {
      const prefix = key.startsWith("expense_category:")
        ? "expense_category:"
        : "platform_expense_category:";
      return base(key, v, prefix, { name: str(v.name) });
    },
  },
  {
    domain: "claims",
    table: "claims",
    prefixes: ["claim:"],
    mapRow: (key, v) =>
      base(key, v, "claim:", {
        type: str(v.type),
        status: str(v.status),
        driver_id: str(v.driverId),
        trip_id: str(v.tripId),
        amount: num(v.amount),
      }),
  },
  {
    domain: "earnings_policies",
    table: "earnings_policies",
    prefixes: ["earnings_policy:"],
    mapRow: (key, v) =>
      base(key, v, "earnings_policy:", {
        name: str(v.name),
        is_default: bool(v.isDefault),
      }),
  },
  {
    domain: "equipment",
    table: "equipment",
    prefixes: ["equipment:"],
    mapRow: (key, v) => base(key, v, "equipment:", {}),
  },
  {
    domain: "inventory",
    table: "inventory",
    prefixes: ["inventory:"],
    mapRow: (key, v) => base(key, v, "inventory:", {}),
  },
  {
    domain: "checkins",
    table: "checkins",
    prefixes: ["checkin:"],
    mapRow: (key, v) =>
      base(key, v, "checkin:", {
        vehicle_id: str(v.vehicleId),
      }),
  },
  {
    domain: "odometer_readings",
    table: "odometer_readings",
    prefixes: ["odometer_reading:"],
    mapRow: (key, v) =>
      base(key, v, "odometer_reading:", {
        vehicle_id: str(v.vehicleId),
        reading: num(v.reading) ?? num(v.odometer) ?? num(v.odo),
        reading_date: dateOnly(v.date) ?? dateOnly(v.readingDate),
      }),
  },
  {
    domain: "organization_settings",
    table: "organization_settings",
    prefixes: ["organization_settings:"],
    mapRow: (key, v) => base(key, v, "organization_settings:", {}),
  },
  {
    domain: "preferences",
    table: "preferences",
    prefixes: ["preferences:"],
    mapRow: (key, v) => base(key, v, "preferences:", {}),
  },
  {
    domain: "integrations",
    table: "integrations",
    prefixes: ["integration:"],
    mapRow: (key, v) =>
      base(key, v, "integration:", {
        provider: str(v.provider) ?? str(v.type),
      }),
  },
  {
    domain: "ledger_config",
    table: "ledger_config",
    prefixes: ["ledger_config:"],
    mapRow: (key, v) => base(key, v, "ledger_config:", {}),
  },
];

export function resolveDomain(key: string): FleetDomainDef | null {
  for (const d of FLEET_DOMAINS) {
    if (d.prefixes.some((p) => key.startsWith(p))) return d;
  }
  return null;
}
