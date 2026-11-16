/**
 * Screen tests for the powertrain job fit Stitch port (docs/powertrain-job-fit-audit.md section 9,
 * Dominion 01–10). Renders each screen to HTML and checks the Keep / Drop / Add content.
 */
import { describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";

// On Windows Vitest can load React twice (c:/ vs C:/ paths). Use the one native copy everywhere.
vi.mock("react", async () => {
  const { createRequire: cr } = await import("node:module");
  const r = cr(import.meta.url)("react");
  return { ...r, default: r };
});
vi.mock("react/jsx-runtime", async () => {
  const { createRequire: cr } = await import("node:module");
  return cr(import.meta.url)("react/jsx-runtime");
});
const { renderToStaticMarkup } = createRequire(import.meta.url)("react-dom/server") as typeof import("react-dom/server");
import { PowertrainCard, cardMode } from "../vehicle-catalog/vehicles-stitch/PowertrainCard";
import { PowertrainHomeCards } from "../vehicle-catalog/vehicles-stitch/PowertrainHomeCards";
import { PowertrainCheckScreen } from "../vehicle-catalog/vehicles-stitch/PowertrainCheckScreen";
import { FitsSection, HvChip } from "../maintenance-master/jobs/FitsSection";
import type { VehicleCatalogRecord } from "../../../types/vehicleCatalog";

const fit = {
  id: "c1",
  make: "Honda",
  model: "Fit",
  fuel_type: "Hybrid(petrol)",
  engine_type: "Hybrid",
  fuel_category: "Hybrid",
  powertrain: "hev",
  fuel: "petrol",
  powertrain_status: "derived",
  powertrain_note: null,
  powertrain_last_confirmed_at: null,
} as unknown as VehicleCatalogRecord;

const card = (car: Partial<VehicleCatalogRecord>, canWrite = true) =>
  renderToStaticMarkup(<PowertrainCard car={{ ...fit, ...car } as VehicleCatalogRecord} token="t" canWrite={canWrite} onSaved={() => {}} />);

/** Words the Stitch screens invented that must never be built (audit 9, every screen Drop). */
const INVENTED = [/confidence/i, /VIN/, /telemetry/i, /pipeline/i, /Export/i, /ruleset/i, /Reset to default/i, /Undo/, /Inspect raw feed/i];

describe("Dominion 01–04: What powers this car", () => {
  it("picks the Stitch layout from the status", () => {
    expect(cardMode({ powertrain_status: "derived", powertrain_note: null }, false)).toBe("derived");
    expect(cardMode({ powertrain_status: "confirmed", powertrain_note: null }, false)).toBe("confirmed");
    expect(cardMode({ powertrain_status: "needs_check", powertrain_note: "Text changed" }, false)).toBe("reconfirm");
    expect(cardMode({ powertrain_status: "needs_check", powertrain_note: null }, false)).toBe("pick");
    expect(cardMode({ powertrain_status: "confirmed", powertrain_note: null }, true)).toBe("editing");
  });

  it("01 worked out: chip, both rows, the raw text it read, Edit + Confirm", () => {
    const html = card({});
    expect(html).toContain('data-mode="derived"');
    expect(html).toContain("Worked out");
    expect(html).toContain("Hybrid");
    expect(html).toContain("Petrol");
    expect(html).toContain("&quot;Hybrid(petrol) / Hybrid&quot;");
    expect(html).toContain("Confirm</button>");
    expect(html).toContain("Edit");
    for (const re of INVENTED) expect(html).not.toMatch(re);
  });

  it("03 confirmed: green chip, confirmed date, Edit, no Confirm", () => {
    const html = card({ powertrain_status: "confirmed", powertrain_last_confirmed_at: "2026-11-15T12:00:00Z" } as Partial<VehicleCatalogRecord>);
    expect(html).toContain('data-mode="confirmed"');
    expect(html).toContain("Checked and confirmed");
    expect(html).toContain("15 Nov 2026");
    expect(html).not.toContain("Confirm</button>");
  });

  it("04 re-confirm: amber strip, what the record says now, Confirm <values>", () => {
    const html = card({
      engine_type: "Plug-in Hybrid",
      powertrain_status: "needs_check",
      powertrain_note: "Text changed after confirmation: please re-confirm",
      powertrain_last_confirmed_at: "2026-11-15T12:00:00Z",
    } as Partial<VehicleCatalogRecord>);
    expect(html).toContain('data-mode="reconfirm"');
    expect(html).toContain("Needs checking");
    expect(html).toContain("changed after it was confirmed");
    expect(html).toContain("Hybrid(petrol) / Plug-in Hybrid");
    expect(html).toContain("Confirm Hybrid · Petrol");
  });

  it("needs_check with nothing placed opens the pickers (02 layout) without Cancel", () => {
    const html = card({ powertrain: null, fuel: null, powertrain_status: "needs_check" } as Partial<VehicleCatalogRecord>);
    expect(html).toContain('data-mode="pick"');
    expect(html).toContain("Save and confirm");
    expect(html).not.toContain("Cancel</button>");
  });

  it("read-only viewers get no buttons", () => {
    const html = card({}, false);
    expect(html).not.toContain("Confirm</button>");
    expect(html).not.toContain("Edit");
  });
});

describe("Dominion 05 / 10: Powertrain to check", () => {
  it("first paint is the loading state (shimmer rows), not an empty list", () => {
    const html = renderToStaticMarkup(<PowertrainCheckScreen token="t" onBack={() => {}} onConfirmed={() => {}} />);
    expect(html).toContain('data-testid="pt-loading"');
    expect(html).toContain("Back to Vehicles");
    expect(html).not.toContain("Every car model is confirmed");
    for (const re of INVENTED) expect(html).not.toMatch(re);
  });
});

describe("Dominion 06: Vehicles home cards", () => {
  const split: Array<[string, number]> = [["ice", 2075], ["bev", 313], ["hev", 203], ["erev", 34], ["phev", 33], ["mhev", 7], ["fcev", 2]];
  const items = [
    ...split.flatMap(([p, n]) => Array.from({ length: n }, () => ({ make: "X", powertrain: p, powertrain_status: "derived" }))),
    ...Array.from({ length: 12 }, () => ({ make: "Toyota", powertrain: null, powertrain_status: "needs_check" })),
  ] as unknown as VehicleCatalogRecord[];

  it("shows the 3a counts, the 12 to check and a Review button", () => {
    const html = renderToStaticMarkup(<PowertrainHomeCards items={items} onReview={() => {}} />);
    expect(html).toContain("2,679 car models");
    expect(html).toMatch(/data-testid="pt-check-count"[^>]*>12</);
    for (const n of ["2,075", "313", "203", "34", "33", ">7<", ">2<", ">12<"]) expect(html).toContain(n);
    expect(html).toContain("Review");
    expect(html).not.toContain("Updated");
  });

  it("shows nothing before the powertrain columns exist", () => {
    expect(renderToStaticMarkup(<PowertrainHomeCards items={[fit, fit].map((r) => ({ ...r, powertrain_status: null })) as never} onReview={() => {}} />)).toBe("");
  });
});

describe("Dominion 07–09: Fits", () => {
  const jobProps = {
    kind: "job" as const,
    token: "t",
    canWrite: true,
    jobId: "j1",
    groupPt: ["ice", "mhev", "hev", "phev", "erev"],
    groupFu: null,
    groupName: "Engine",
    onPt: () => {},
    onFu: () => {},
    onHv: () => {},
  };

  it("07 same as group: the group's preset with Linked, fuel set for this job, HV switch off", () => {
    const html = renderToStaticMarkup(
      <FitsSection {...jobProps} pt={{ inherit: true, codes: [] }} fu={{ inherit: false, codes: ["petrol", "cng"] }} hv={false} />,
    );
    expect(html).toContain("Combustion");
    expect(html).toContain("Linked");
    expect(html).toContain("Engine");
    expect(html).toContain("Spark-ignition");
    expect(html).toContain('aria-checked="false"');
    expect(html).not.toContain('data-testid="hv-chip"');
    for (const re of INVENTED) expect(html).not.toMatch(re);
  });

  it("08 custom + high-voltage: checkbox chips and the amber chip", () => {
    const html = renderToStaticMarkup(
      <FitsSection {...jobProps} pt={{ inherit: false, codes: ["phev", "erev", "bev", "fcev"] }} fu={{ inherit: true, codes: [] }} hv />,
    );
    expect(html).toContain("Pick which ones");
    expect(html).toContain("Hydrogen fuel cell");
    expect(html).toContain('aria-checked="true"');
    expect(html).toContain('data-testid="hv-chip"');
  });

  it("09 group: four preset cards, no HV switch", () => {
    const html = renderToStaticMarkup(
      <FitsSection
        kind="group"
        token="t"
        canWrite
        sampleJobId="j1"
        byPowertrain={{ ice: 2075, bev: 313, hev: 203, erev: 34, phev: 33, mhev: 7, fcev: 2 }}
        pt={{ inherit: false, codes: ["hev", "phev", "erev", "bev", "fcev"] }}
        fu={{ inherit: false, codes: ["petrol", "diesel", "cng", "hydrogen", "electric"] }}
        onPt={() => {}}
        onFu={() => {}}
      />,
    );
    for (const t of ["All cars", "Combustion", "Electrified", "Plug-in", "Custom…", "585 models match", "380 models"]) expect(html).toContain(t);
    expect(html).not.toContain("High-voltage work");
  });

  it("HV chip says High-voltage", () => {
    expect(renderToStaticMarkup(<HvChip />)).toContain("High-voltage");
  });
});
