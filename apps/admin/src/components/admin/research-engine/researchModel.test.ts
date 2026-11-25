import { describe, expect, it } from "vitest";
import {
  carCodes,
  carLabel,
  filterForState,
  howSureLine,
  partTileState,
  placeLabel,
  proposalChecks,
  siteName,
  specSourceLine,
  specTileState,
  statePill,
  TILE_META,
  tileSummary,
  trustRouteLine,
  usd,
  onTrack,
  shortDate,
} from "./researchModel";

const roomy = {
  make: "Toyota",
  model: "Roomy",
  production_start_year: 2016,
  production_end_year: 2020,
  drivetrain: "2WD",
  chassis_code: "M900A",
  engine_code: "1KR-FE",
};

describe("cars and places", () => {
  it("labels a car version and its codes", () => {
    expect(carLabel(roomy)).toBe("Toyota Roomy 2016–2020 2WD");
    expect(carCodes(roomy)).toBe("M900A · 1KR-FE");
    expect(carLabel(null)).toBe("Car not on file");
  });
  it("labels places and leaves an unknown place out", () => {
    expect(placeLabel("rear")).toBe("Rear");
    expect(placeLabel("")).toBeNull();
  });
  it("names catalogue sites", () => {
    expect(siteName("https://www.amayama.com/en/part/x")).toBe("Amayama");
    expect(siteName("jnbk-brakes.com")).toBe("NiBK");
    expect(siteName("example-parts.jp")).toBe("Example-parts");
  });
});

describe("job states", () => {
  it("puts every state in one filter; queued and capped browser checks wait their turn", () => {
    expect(filterForState("queued")).toBe("waiting");
    expect(filterForState("browser_check_queued")).toBe("waiting");
    expect(filterForState("checking")).toBe("researching");
    expect(filterForState("browser_check")).toBe("browser_check");
  });
  it("shows Two makers disagree over the job state until something is added", () => {
    expect(statePill("needs_review", true).label).toBe("Two makers disagree");
    expect(statePill("auto_added", true).label).toBe("Added automatically");
  });
  it("names the source-rule route", () => {
    expect(trustRouteLine("c")).toBe("Two makers agree");
    expect(trustRouteLine(null)).toBeNull();
  });
});

describe("proposals", () => {
  const block = { domain: "jnbk-brakes.com", block: "M900A rear PN-1 rear", readId: "r1" };
  it("proves all checks from one kept block, place included", () => {
    const rows = proposalChecks({ sources: [block], position_key: "rear" });
    expect(rows.map((r) => r.label)).toEqual([
      "Number is on the page",
      "This car is in the same row",
      "Rear position is in the same row",
    ]);
    expect(rows.every((r) => r.ok)).toBe(true);
  });
  it("fails every check when no block was kept", () => {
    const rows = proposalChecks({ sources: [{ domain: "x.com", dropped: true }], position_key: "" });
    expect(rows).toHaveLength(2);
    expect(rows.some((r) => r.ok)).toBe(false);
  });
  it("says how sure from the real route, never a percentage", () => {
    expect(howSureLine({ trust_route: "c", checks: null, sources: [] })).toBe("Two part makers name the same factory number.");
    expect(howSureLine({ trust_route: null, checks: { passes: [{ domain: "masuma.parts", kind: "part_maker", maker: "masuma" }] }, sources: [] }))
      .toMatch(/^One part maker lists it/);
    expect(howSureLine({ trust_route: null, checks: null, sources: [] })).not.toMatch(/%/);
  });
});

describe("coverage tiles (S6)", () => {
  const base = { cell: "missing" as const, jobState: null, conflictId: null };
  it("maps every state to its one action", () => {
    expect(partTileState({ ...base, cell: "verified" })).toBe("confirmed");
    expect(partTileState({ ...base, cell: "not_applicable" })).toBe("not_applicable");
    expect(partTileState({ ...base, conflictId: "c1" })).toBe("disagree");
    expect(partTileState({ ...base, jobState: "browser_check" })).toBe("browser_check");
    expect(partTileState({ ...base, jobState: "browser_check_queued" })).toBe("waiting");
    expect(partTileState({ ...base, jobState: "not_found" })).toBe("couldnt_find");
    expect(partTileState({ ...base, cell: "unverified" })).toBe("needs_checking");
    expect(partTileState(base)).toBe("not_started");
    expect(TILE_META.not_started.actionLabel).toBe("Research this part");
    expect(TILE_META.couldnt_find.actionLabel).toBe("Research again");
    expect(TILE_META.researching.action).toBeNull();
    expect(TILE_META.not_applicable.action).toBeNull();
  });
  it("waits for identity when the frame code is missing", () => {
    expect(partTileState({ ...base, cell: "verified" }, true)).toBe("waiting_identity");
    expect(specTileState({ value: null, trust: null, jobState: null }, true)).toBe("waiting_identity");
  });
  it("treats a CSV value as Needs checking and counts only states that occur", () => {
    expect(specTileState({ value: "165/65R14", trust: "needs_checking", jobState: null })).toBe("needs_checking");
    expect(tileSummary(["confirmed", "confirmed", "not_started"])).toEqual([
      { state: "confirmed", count: 2 },
      { state: "not_started", count: 1 },
    ]);
  });
  it("writes the spec source line from the real source", () => {
    expect(specSourceLine({ trust: "needs_checking", sourceNote: "CSV import", sourceUrl: null, trustRoute: null, checkedAt: null })).toBe("From the old import");
    expect(specSourceLine({ trust: "confirmed", sourceNote: null, sourceUrl: "https://www.amayama.com/x", trustRoute: "owner_browser", checkedAt: "2026-11-20T10:00:00Z" }))
      .toBe("You checked it on 20 Nov 2026");
    expect(specSourceLine({ trust: "confirmed", sourceNote: null, sourceUrl: "https://sbparts.jp/x", trustRoute: "b", checkedAt: "2026-11-20T10:00:00Z" }))
      .toBe("SB · Read on 20 Nov 2026");
  });
});

describe("money and goal", () => {
  it("formats dollars and says on track only when the finish is before the goal", () => {
    expect(usd(0.0751, 3)).toBe("US$0.075");
    expect(usd(null)).toBe("—");
    expect(onTrack("2027-02-18", "2027-02-01")).toBe(true);
    expect(onTrack("2027-02-18", "2027-03-01")).toBe(false);
    expect(onTrack(null, "2027-03-01")).toBeNull();
    // A goal date is a calendar day: it never moves a day back in a western time zone.
    expect(shortDate("2027-02-18")).toBe("18 Feb 2027");
  });
});

import { catalogueEngineCode, partFinder } from "./researchModel";

describe("browser-check guide (RE-63)", () => {
  it("writes engine codes the way catalogue version tables do", () => {
    expect(catalogueEngineCode("1KR-FE")).toBe("1KRFE");
    expect(catalogueEngineCode("1KR-VET")).toBe("1KRVET");
    expect(catalogueEngineCode(null)).toBe("");
  });

  it("tells what to search and which row to look for in a Toyota / Daihatsu catalogue", () => {
    expect(partFinder("Engine Air Filter", "Toyota")).toEqual({ search: "air cleaner", rowName: "ELEMENT SUB-ASSY, AIR CLEANER FILTER" });
    expect(partFinder("Spark Plugs", "Toyota")).toEqual({ search: "spark plug", rowName: "PLUG, SPARK" });
    expect(partFinder("Cabin A/C Filter", "Daihatsu").search).toBe("air filter");
    expect(partFinder("Shock absorber", "Toyota").rowName).toBe("ABSORBER ASSY, SHOCK");
    // Owner 25 Nov: a front / rear check names Amayama's picture and the words every such row has.
    expect(partFinder("Shock absorber", "Toyota", "Front")).toEqual({
      search: "shock absorber",
      picture: "Front spring & shock absorber",
      rowName: "SHOCK, FRONT",
      rowContains: true,
    });
    expect(partFinder("Shock absorber", "Toyota", "rear").picture).toBe("Rear spring & shock absorber");
  });

  it("falls back to the part's own name for other makers and unknown parts", () => {
    expect(partFinder("Engine Air Filter", "Honda")).toEqual({ search: "engine air filter", rowName: null });
    expect(partFinder("Mystery part", "Toyota")).toEqual({ search: "mystery part", rowName: null });
  });
});

describe("browser-check guide — no wrong row names (code review)", () => {
  it("parts that only sit near a known part get no row name", () => {
    expect(partFinder("Timing belt", "Toyota").rowName).toBeNull();
    expect(partFinder("Strut mount", "Toyota").rowName).toBeNull();
    expect(partFinder("Brake pad wear sensor", "Toyota").rowName).toBeNull();
    expect(partFinder("Air con compressor belt", "Toyota").rowName).toBeNull();
  });
  it("the real core part names still get their rows", () => {
    expect(partFinder("Drive / Serpentine Belt", "Toyota").rowName).toBe("BELT, V-RIBBED");
    expect(partFinder("Brakes", "Toyota").rowName).toBeNull();
    expect(partFinder("Front brake pads", "Toyota").rowName).toBe("PAD KIT, DISC BRAKE");
    expect(partFinder("Wiper Blades", "Toyota").rowName).toBe("BLADE ASSY, WIPER");
  });
});

import { versionRowWords } from "./researchModel";

describe("short guide (RE-65)", () => {
  it("names the version-list row in three words the catalogue shows", () => {
    const car = { id: "x", make: "Toyota", model: "Roomy", production_start_year: 2016, production_start_month: 11, production_end_year: 2020,
      production_end_month: 8, chassis_code: "M900A", engine_code: "1KR-FE", drivetrain: "2WD", transmission: "CVT" };
    expect(versionRowWords(car)).toBe("1KRFE · 11.2016 · ROOMY");
    expect(versionRowWords({ ...car, production_start_month: null })).toBe("1KRFE · 2016 · ROOMY");
    expect(versionRowWords(null)).toBeNull();
  });
});

import { catalogueVersionRow } from "./researchModel";

describe("version row (RE-67)", () => {
  const car = { id: "x", make: "Toyota", model: "Roomy", production_start_year: 2016, production_start_month: 11, production_end_year: 2020,
    production_end_month: 8, chassis_code: "M900A", engine_code: "1KR-FE", drivetrain: "2WD", transmission: "CVT", catalog_trim: "Custom G" };
  it("uses the catalogue's own words when stored", () => {
    expect(catalogueVersionRow(car, { code: "M900A-AGBVE", engine: "1KRFE", prodPeriod: "11.2016 - 09.2020", grade: "CTMG", transmission: "CVT" }).map((c) => c.value))
      .toEqual(["M900A-AGBVE", "1KRFE", "11.2016 - 09.2020", "CTMG", "CVT"]);
  });
  it("falls back to Dominion's values, and a dash when unknown", () => {
    expect(catalogueVersionRow(car, null).map((c) => c.value)).toEqual(["—", "1KRFE", "11.2016 – 08.2020", "Custom G", "CVT"]);
  });
});

import { checkPositions } from "./researchModel";

describe("positions to ask (RE-69)", () => {
  it("four corners → front/rear × left/right; one axle when the job has it", () => {
    expect(checkPositions("four_corners", null)?.map((p) => p.label)).toEqual(["Front left", "Front right", "Rear left", "Rear right"]);
    expect(checkPositions("four_corners", "rear")?.map((p) => p.label)).toEqual(["Rear left", "Rear right"]);
    expect(checkPositions("axle", null)?.map((p) => p.label)).toEqual(["Front", "Rear"]);
    expect(checkPositions("none", null)).toBeNull();
    expect(checkPositions(undefined, "front")).toBeNull();
  });
});

describe("RE-73: jobs the owner closed", () => {
  it("show as Closed with their note; a real failure stays Failed", async () => {
    const { closedNoteOf, filterForState, statePill } = await import("./researchModel");
    const note = closedNoteOf("failed", "replaced by front and rear checks (owner)");
    expect(note).toBe("replaced by front and rear checks");
    expect(statePill("failed", false, note)).toEqual({ label: "Closed", tone: "grey-outline" });
    expect(filterForState("failed", note)).toBe("closed");
    expect(closedNoteOf("failed", "max_reads")).toBeNull();
    expect(statePill("failed", false, null).label).toBe("Failed");
    expect(filterForState("failed", null)).toBe("failed");
  });
});
