/**
 * @vitest-environment jsdom
 */
import { useState } from "react";
import { act, fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyCatalogDraft, type CatalogPageDraft, type CatalogPartRow, type PartTypeRow } from "../addPartsTypes";

const api = vi.hoisted(() => ({
  fetchSelfServeLinkHints: vi.fn(),
  fetchSelfServePartTypes: vi.fn(),
  lookupSelfServePart: vi.fn(),
  saveCatalogPage: vi.fn(),
  undoSelfServePart: vi.fn(),
  fetchSisterVehicles: vi.fn(),
  searchAddPartVehicles: vi.fn(),
  fetchAddPartVehicle: vi.fn(),
  submitPartTypeRequest: vi.fn(),
}));
const research = vi.hoisted(() => ({ addSite: vi.fn() }));

vi.mock("../addPartsApi", () => api);
vi.mock("../../../../auth/AuthContext", () => ({
  useAuth: () => ({ session: { access_token: "token" }, role: "platform_owner" }),
}));
vi.mock("../../../../../services/researchEngineService", () => ({ researchApi: research }));
vi.mock("../../../vehicle-catalog/MakerLogo", () => ({ MakerLogo: () => null }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { CatalogStep1Page } from "./CatalogStep1Page";
import { CatalogStep2Cars } from "./CatalogStep2Cars";
import { CatalogStep3Parts } from "./CatalogStep3Parts";
import { CatalogStep4Save } from "./CatalogStep4Save";
import { CatalogStep4Trust } from "./CatalogStep4Trust";
import { CatalogSaved } from "./CatalogSaved";
import { CatalogAddPartsFlow } from "./CatalogAddPartsFlow";

const PAGE_URL = "https://partsouq.com/en/catalog/toyota/diagram/JP/2019/TANK-ROOMY/M900A-AGBGE/category/2/diagram/4601/illustration/461556B";

const TYPES = [
  {
    id: "t-o2", opCode: "ENG-O2", name: "Oxygen sensor", tradeTerm: "O2 sensor", editorHint: null,
    defaultFitMode: "specific", positionScheme: "before_after_catalyst", status: "active",
    iconKey: "bolt", areaId: null, specFields: [],
  },
  {
    id: "t-cable", opCode: "BRK-HB-CABL", name: "Handbrake cable", tradeTerm: null, editorHint: null,
    defaultFitMode: "specific", positionScheme: "axle_numbered", status: "active",
    iconKey: "wrench", areaId: null, specFields: [],
  },
] as unknown as PartTypeRow[];

function vehicle(over: Record<string, unknown>) {
  return {
    id: "v1", make: "Toyota", model: "Roomy", chassis_code: "M900A",
    production_start_year: 2016, production_end_year: 2020,
    engine_code: "1KR", version_name: null, platform_id: "p", drivetrain: "2WD",
    ...over,
  };
}

function listing(over: Partial<CatalogPageDraft["vehicleListings"][number]> = {}) {
  return {
    vehicleId: "v1", label: "Toyota Roomy", make: "Toyota", model: "Roomy", chassisCode: "M900A",
    diffLabel: "2WD · 1.0 petrol", yearFrom: 2016, yearTo: 2020, trust: "confirmed" as const,
    ...over,
  };
}

function partRow(over: Partial<CatalogPartRow> = {}): CatalogPartRow {
  return { clientId: `row-${Math.random()}`, partTypeId: "", brand: "", partNumber: "", ...over };
}

function wrap(node: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{node}</QueryClientProvider>);
}

/** Step 1 and 2 are controlled: give them real state so their answers render. */
function Step1Harness({ initial, owner = true }: { initial?: CatalogPageDraft; owner?: boolean }) {
  const [draft, setDraft] = useState<CatalogPageDraft>(initial ?? emptyCatalogDraft());
  return (
    <CatalogStep1Page
      draft={draft}
      setDraft={setDraft}
      onNext={vi.fn()}
      onCancel={vi.fn()}
      owner={owner}
    />
  );
}

function Step2Harness({ initial }: { initial: CatalogPageDraft }) {
  const [draft, setDraft] = useState<CatalogPageDraft>(initial);
  const [done, setDone] = useState(false);
  return (
    <CatalogStep2Cars
      draft={draft}
      setDraft={setDraft}
      onNext={vi.fn()}
      onBack={vi.fn()}
      framePreTickDone={done}
      setFramePreTickDone={setDone}
    />
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  window.history.replaceState({}, "", "/");
  api.fetchSelfServePartTypes.mockResolvedValue(TYPES);
  api.fetchSelfServeLinkHints.mockResolvedValue({ ok: true });
  api.lookupSelfServePart.mockResolvedValue({ found: false });
  api.searchAddPartVehicles.mockResolvedValue([]);
  api.fetchSisterVehicles.mockResolvedValue([]);
  api.fetchAddPartVehicle.mockResolvedValue(null);
  api.saveCatalogPage.mockResolvedValue({ batchId: "batch-1", partCount: 2, carCount: 2, fitCount: 4, savedNames: ["Front oxygen sensor", "Rear oxygen sensor"] });
  api.undoSelfServePart.mockResolvedValue({ ok: true });
  api.submitPartTypeRequest.mockResolvedValue({});
  research.addSite.mockResolvedValue({ ok: true });
});

afterEach(() => cleanup());

describe("Step 1 — the page", () => {
  it("fills the answers from a link that names the maker", async () => {
    api.fetchSelfServeLinkHints.mockResolvedValue({
      ok: true, host: "partsouq.com", trustedSite: true, catalogMaker: "Toyota", sourceTrust: "confirmed", frameCodes: ["M900A"],
    });
    wrap(<Step1Harness />);
    fireEvent.change(screen.getByLabelText("Catalogue page link"), { target: { value: PAGE_URL } });
    await waitFor(() => expect(api.fetchSelfServeLinkHints).toHaveBeenCalledWith(PAGE_URL));
    expect(await screen.findByText(/own catalogue/)).toBeTruthy();
    expect(screen.getByText(/Trusted site/)).toBeTruthy();
    expect((screen.getByRole("button", { name: /Next: the cars/ }) as HTMLButtonElement).disabled).toBe(false);
    // Genuine parts never ask for a brand (F-09).
    expect(screen.queryByLabelText("Brand")).toBeNull();
  });

  it("asks for the maker when the link doesn't name one", async () => {
    api.fetchSelfServeLinkHints.mockResolvedValue({ ok: true, host: "toyodiy.com", trustedSite: false, catalogMaker: null });
    wrap(<Step1Harness />);
    fireEvent.change(screen.getByLabelText("Catalogue page link"), { target: { value: PAGE_URL } });
    expect(await screen.findByText(/We could not read the maker from this link/)).toBeTruthy();
    expect((screen.getByRole("button", { name: /Next: the cars/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("Pick the car maker.")).toBeTruthy();
  });

  it("re-checks trust for the picked maker in place, without a reload", async () => {
    api.fetchSelfServeLinkHints
      .mockResolvedValueOnce({ ok: true, host: "toyodiy.com", trustedSite: false, catalogMaker: null, sourceTrust: "needs_checking" })
      .mockResolvedValueOnce({ ok: true, host: "toyodiy.com", trustedSite: true, catalogMaker: null, sourceTrust: "confirmed", trustMaker: "Toyota" });
    wrap(<Step1Harness />);
    fireEvent.change(screen.getByLabelText("Catalogue page link"), { target: { value: PAGE_URL } });
    fireEvent.click(await screen.findByRole("button", { name: "Toyota" }));
    await waitFor(() => expect(api.fetchSelfServeLinkHints).toHaveBeenLastCalledWith(PAGE_URL, "Toyota"));
    expect(await screen.findByText(/Trusted site/)).toBeTruthy();
    expect(window.location.search).toBe("");
  });

  it("another brand needs its brand before Next, and the car maker is never typed in", async () => {
    api.fetchSelfServeLinkHints.mockResolvedValue({
      ok: true, host: "jnbk-brakes.com", trustedSite: true, catalogMaker: "Toyota", sourceTrust: "confirmed",
    });
    wrap(<Step1Harness />);
    fireEvent.change(screen.getByLabelText("Catalogue page link"), { target: { value: PAGE_URL } });
    fireEvent.click(await screen.findByRole("button", { name: /Another brand/ }));
    expect(screen.getByText("Type or pick the brand.")).toBeTruthy();
    const brand = screen.getByLabelText("Brand") as HTMLInputElement;
    expect(brand.value).toBe("");
    expect((screen.getByRole("button", { name: /Next: the cars/ }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(brand, { target: { value: "Brembo" } });
    expect((screen.getByRole("button", { name: /Next: the cars/ }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "NiBK" }));
    expect((screen.getByLabelText("Brand") as HTMLInputElement).value).toBe("NiBK");
  });

  it("trusting a site opens an in-place dialog for the owner and re-checks trust", async () => {
    api.fetchSelfServeLinkHints
      .mockResolvedValueOnce({ ok: true, host: "partsouq.com", trustedSite: false, catalogMaker: "Toyota", sourceTrust: "needs_checking" })
      .mockResolvedValueOnce({ ok: true, host: "partsouq.com", trustedSite: true, catalogMaker: "Toyota", sourceTrust: "confirmed" });
    wrap(<Step1Harness />);
    fireEvent.change(screen.getByLabelText("Catalogue page link"), { target: { value: PAGE_URL } });
    fireEvent.click(await screen.findByRole("button", { name: "Trust this site" }));
    expect(await screen.findByText("Trust this site?")).toBeTruthy();
    expect(screen.getByText("Only the platform owner can change trusted sites.")).toBeTruthy();
    // Nothing typed is lost: the link stays.
    expect((screen.getByLabelText("Catalogue page link") as HTMLInputElement).value).toBe(PAGE_URL);
    const buttons = screen.getAllByRole("button", { name: "Trust this site" });
    fireEvent.click(buttons[buttons.length - 1]);
    await waitFor(() =>
      expect(research.addSite).toHaveBeenCalledWith("token", expect.objectContaining({
        domain: "partsouq.com",
        kind: "car_maker",
        makers: ["Toyota"],
      })),
    );
    await waitFor(() => expect(api.fetchSelfServeLinkHints).toHaveBeenLastCalledWith(PAGE_URL, "Toyota"));
    expect(window.location.search).toBe("");
  });

  it("a non-owner sees the ask-the-owner line and no trust button", async () => {
    api.fetchSelfServeLinkHints.mockResolvedValue({
      ok: true, host: "partsouq.com", trustedSite: false, catalogMaker: "Toyota", sourceTrust: "needs_checking",
    });
    wrap(<Step1Harness owner={false} />);
    fireEvent.change(screen.getByLabelText("Catalogue page link"), { target: { value: PAGE_URL } });
    expect(await screen.findByText("Ask the owner to trust this site.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Trust this site" })).toBeNull();
  });
});

describe("Step 2 — the cars", () => {
  const baseDraft = (): CatalogPageDraft => ({
    ...emptyCatalogDraft(),
    evidenceUrl: PAGE_URL,
    catalogCarMaker: "Toyota",
    linkHints: { ok: true, trustedSite: true, frameCodes: ["M900A"], catalogMaker: "Toyota" },
  });

  it("ticks only the versions in the page years; a later version stays visible and unticked", async () => {
    api.searchAddPartVehicles.mockResolvedValue([
      vehicle({ id: "v-2016" }),
      vehicle({ id: "v-2021", production_start_year: 2021, production_end_year: 2022 }),
      vehicle({ id: "v-tank", model: "Tank" }),
    ]);
    wrap(<Step2Harness initial={baseDraft()} />);
    await screen.findByLabelText("Tick Toyota Roomy M900A 2016");
    fireEvent.change(screen.getByLabelText("Page year from"), { target: { value: "2016" } });
    fireEvent.change(screen.getByLabelText("Page year to"), { target: { value: "2020" } });
    await waitFor(() =>
      expect((screen.getByLabelText("Tick Toyota Roomy M900A 2016") as HTMLInputElement).checked).toBe(true),
    );
    expect((screen.getByLabelText("Tick Toyota Tank M900A 2016") as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText("Tick Toyota Roomy M900A 2021") as HTMLInputElement).checked).toBe(false);
    expect(screen.getByText("After 2020 — not on this page")).toBeTruthy();
  });

  it("with no years entered nothing is ticked and Next stays disabled", async () => {
    api.searchAddPartVehicles.mockResolvedValue([vehicle({ id: "v-2016" })]);
    wrap(<Step2Harness initial={baseDraft()} />);
    await screen.findByLabelText("Tick Toyota Roomy M900A 2016");
    expect((screen.getByLabelText("Tick Toyota Roomy M900A 2016") as HTMLInputElement).checked).toBe(false);
    expect(screen.getByText("Tick at least one car.")).toBeTruthy();
    expect((screen.getByRole("button", { name: /Next: the parts/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("changing the years never unticks a car already ticked", async () => {
    api.searchAddPartVehicles.mockResolvedValue([vehicle({ id: "v-2016" })]);
    wrap(<Step2Harness initial={{ ...baseDraft(), pageYearsFrom: 2016, pageYearsTo: 2020 }} />);
    await waitFor(() =>
      expect((screen.getByLabelText("Tick Toyota Roomy M900A 2016") as HTMLInputElement).checked).toBe(true),
    );
    fireEvent.change(screen.getByLabelText("Page year to"), { target: { value: "2018" } });
    expect((screen.getByLabelText("Tick Toyota Roomy M900A 2016") as HTMLInputElement).checked).toBe(true);
  });

  it("ticked cars carry the page years", async () => {
    api.searchAddPartVehicles.mockResolvedValue([vehicle({ id: "v-2016" })]);
    wrap(<Step2Harness initial={{ ...baseDraft(), pageYearsFrom: 2016, pageYearsTo: 2020 }} />);
    await waitFor(() => expect(screen.getByLabelText("Toyota Roomy year from")).toBeTruthy());
    expect((screen.getByLabelText("Toyota Roomy year from") as HTMLInputElement).value).toBe("2016");
    expect((screen.getByLabelText("Toyota Roomy year to") as HTMLInputElement).value).toBe("2020");
  });

  it("adds a sister car with the same page years", async () => {
    api.searchAddPartVehicles.mockResolvedValue([vehicle({ id: "v-2016" })]);
    api.fetchSisterVehicles.mockResolvedValue([vehicle({ id: "v-thor", model: "Thor", chassis_code: "M900A" })]);
    wrap(<Step2Harness initial={{ ...baseDraft(), pageYearsFrom: 2016, pageYearsTo: 2020 }} />);
    expect(await screen.findByText("1 sister cars")).toBeTruthy();
    expect(screen.getByText("These are built on the same car. Add the matching versions?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Add these cars" }));
    expect(await screen.findByText("Selected · 2 cars")).toBeTruthy();
  });
});

describe("Step 3 — the parts", () => {
  const draft = (rows: CatalogPartRow[]): CatalogPageDraft => ({
    ...emptyCatalogDraft(),
    evidenceUrl: PAGE_URL,
    catalogCarMaker: "Toyota",
    brandDefault: "Toyota",
    partKind: "oem",
    vehicleListings: [listing(), listing({ vehicleId: "v2", label: "Toyota Tank", model: "Tank" })],
    pageYearsFrom: 2016,
    pageYearsTo: 2020,
    partRows: rows,
  });

  function Step3Harness({ initial }: { initial: CatalogPageDraft }) {
    const [d, setD] = useState(initial);
    return (
      <CatalogStep3Parts
        draft={d}
        setDraft={setD}
        onNext={vi.fn()}
        onBack={vi.fn()}
        onEditCars={vi.fn()}
      />
    );
  }

  it("an unfinished row blocks Next and names the row", async () => {
    wrap(<Step3Harness initial={draft([partRow({ partTypeId: "t-cable" })])} />);
    await screen.findByText("Handbrake cable");
    fireEvent.change(screen.getByLabelText("Part 1 part number"), { target: { value: "46410-B1011" } });
    expect(screen.getAllByText("Part 1 needs a place.").length).toBeGreaterThan(0);
    expect((screen.getByRole("button", { name: /Next: check and save/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("refuses the same part number twice, naming both rows", async () => {
    wrap(<Step3Harness initial={draft([
      partRow({ partTypeId: "t-cable", partNumber: "46410-B1011", position: "front", catalogueNumber: 1 }),
      partRow({ partTypeId: "t-cable", partNumber: "46410 b1011", position: "rear", catalogueNumber: 2 }),
    ])} />);
    expect(
      await screen.findByText("Part 2 has the same number as part 1 (46410 b1011). Change one, or remove it."),
    ).toBeTruthy();
  });

  it("place buttons read plainly and Saves as matches", async () => {
    wrap(<Step3Harness initial={draft([partRow({ partTypeId: "t-o2" })])} />);
    fireEvent.change(await screen.findByLabelText("Part 1 part number"), { target: { value: "89467-B1040" } });
    const front = screen.getByRole("button", { name: "Front (before converter)" });
    const rear = screen.getByRole("button", { name: "Rear (after converter)" });
    expect(front).toBeTruthy();
    expect(rear).toBeTruthy();
    // The catalogue's own words sit under the plain buttons.
    expect(screen.getByText(/The catalogue calls these/)).toBeTruthy();
    fireEvent.click(front);
    const savesAs = screen.getByTestId("saves-as-0").textContent ?? "";
    expect(savesAs).toContain("Front (before converter)");
    expect(savesAs.toLowerCase()).toContain("oxygen sensor");
    // No raw place code anywhere on the screen.
    expect(document.body.textContent ?? "").not.toMatch(/before_cat|after_cat|_cat\b|axle_numbered/);
  });

  it("the type list shows how many types there are and searches them", async () => {
    wrap(<Step3Harness initial={draft([partRow()])} />);
    expect(await screen.findByText("2 types")).toBeTruthy();
    const search = screen.getByLabelText("Search part types");
    fireEvent.change(search, { target: { value: "oxygen" } });
    expect(screen.getByText("Oxygen sensor")).toBeTruthy();
    fireEvent.change(search, { target: { value: "zzz" } });
    expect(screen.getByText("No type matches that word. Ask for it below.")).toBeTruthy();
  });

  it("draws cards, not a table, with a full-width part number field", async () => {
    wrap(<Step3Harness initial={draft([partRow()])} />);
    await screen.findByText("Part 1");
    expect(document.querySelector("table")).toBeNull();
    const input = screen.getByLabelText("Part 1 part number") as HTMLInputElement;
    expect(input.className).toContain("w-full");
  });
});

describe("Step 4 — check and save", () => {
  const draft = (over: Partial<CatalogPageDraft> = {}): CatalogPageDraft => ({
    ...emptyCatalogDraft(),
    evidenceUrl: PAGE_URL,
    catalogCarMaker: "Toyota",
    brandDefault: "Toyota",
    partKind: "oem",
    vehicleListings: [listing(), listing({ vehicleId: "v2" }), listing({ vehicleId: "v3" })],
    partRows: [
      partRow({ partTypeId: "t-o2", partNumber: "89467-B1040", position: "before_cat", brand: "Toyota" }),
      partRow({ partTypeId: "t-o2", partNumber: "89465-B1120", position: "after_cat", brand: "Toyota" }),
    ],
    ...over,
  });

  it("has one save button, the count line, and disables while saving", () => {
    wrap(<CatalogStep4Save draft={draft()} types={TYPES} saving={false} onSave={vi.fn()} onBack={vi.fn()} />);
    const saves = screen.getAllByRole("button", { name: /^Save 2 parts to 3 cars$/ });
    expect(saves).toHaveLength(1);
    expect(screen.getByText("2 parts × 3 cars = 6 fits")).toBeTruthy();
    expect(screen.getByText("All parts go into the shared parts catalogue.")).toBeTruthy();
  });

  it("shows Saving… and cannot be pressed twice while in flight", () => {
    wrap(<CatalogStep4Save draft={draft()} types={TYPES} saving onSave={vi.fn()} onBack={vi.fn()} />);
    const save = screen.getByRole("button", { name: /Saving…/ }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
  });

  it("never labels another brand with the car maker's name", () => {
    wrap(<CatalogStep4Save
      draft={draft({
        partKind: "aftermarket",
        brandDefault: "",
        catalogCarMaker: "Toyota",
        partRows: [
          partRow({ partTypeId: "t-o2", partNumber: "89467-B1040", position: "before_cat", brand: "" }),
          partRow({ partTypeId: "t-o2", partNumber: "89465-B1120", position: "after_cat", brand: "" }),
        ],
      })}
      types={TYPES}
      saving={false}
      onSave={vi.fn()}
      onBack={vi.fn()}
    />);
    expect(screen.getAllByText(/Another brand/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Genuine Toyota/)).toBeNull();
  });

  it("shows plain place words, never a raw code", () => {
    wrap(<CatalogStep4Save draft={draft()} types={TYPES} saving={false} onSave={vi.fn()} onBack={vi.fn()} />);
    // The card carries the plain name + place the save writes (F-07, F-06).
    expect(screen.getAllByText("Front oxygen sensor").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Rear oxygen sensor").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Front (before converter)").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Rear (after converter)").length).toBeGreaterThan(0);
    expect(screen.queryByText(/before_cat|after_cat/)).toBeNull();
  });
});

describe("Saved", () => {
  it("shows the names the database wrote, not a guess", () => {
    wrap(<CatalogSaved
      saveResult={{ partCount: 2, carCount: 2, fitCount: 4, savedNames: ["Front oxygen sensor", "Rear oxygen sensor"] }}
      draft={{
        ...emptyCatalogDraft(),
        vehicleListings: [listing()],
        partRows: [
          partRow({ partTypeId: "t-cable", partNumber: "46410-B1011" }),
          partRow({ partTypeId: "t-cable", partNumber: "46420-B1090" }),
        ],
      }}
      types={TYPES}
      onAddMoreFromPage={vi.fn()}
      onSameCarsNewPage={vi.fn()}
      onFindParts={vi.fn()}
      onHome={vi.fn()}
      onUndo={vi.fn()}
    />);
    expect(screen.getByText("2 parts saved to 2 cars")).toBeTruthy();
    expect(screen.getByText("Front oxygen sensor")).toBeTruthy();
    expect(screen.getByText("Rear oxygen sensor")).toBeTruthy();
  });
});

describe("Step 4 — trust", () => {
  it("won't continue while a Needs-checking car has no reason (#19)", () => {
    const onNext = vi.fn();
    const initial: CatalogPageDraft = {
      ...emptyCatalogDraft(),
      evidenceUrl: PAGE_URL,
      catalogCarMaker: "Toyota",
      brandDefault: "Toyota",
      partKind: "oem",
      linkHints: { ok: true, trustedSite: true, catalogMaker: "Toyota" },
      vehicleListings: [listing({ trust: "needs_checking", reason: undefined })],
      partRows: [partRow({ partTypeId: "t-o2", partNumber: "89467-B1040", position: "before_cat", brand: "Toyota" })],
    };
    function TrustHarness() {
      const [d, setD] = useState<CatalogPageDraft>(initial);
      return (
        <CatalogStep4Trust
          draft={d}
          types={TYPES}
          onNext={onNext}
          onBack={vi.fn()}
          onTrustChange={(vehicleId, trust, reason) =>
            setD((prev) => ({
              ...prev,
              vehicleListings: prev.vehicleListings.map((l) =>
                l.vehicleId === vehicleId ? { ...l, trust, reason } : l),
            }))
          }
          onYearsChange={vi.fn()}
        />
      );
    }
    wrap(<TrustHarness />);
    const next = screen.getByRole("button", { name: /Next: check and save/ }) as HTMLButtonElement;
    expect(next.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Years differ" } });
    expect((screen.getByRole("button", { name: /Next: check and save/ }) as HTMLButtonElement).disabled).toBe(false);
    expect(onNext).not.toHaveBeenCalled();
    // The parts panel shows the same plain name the save will write (F-07).
    expect(screen.getByText(/Saves as "Front oxygen sensor"/)).toBeTruthy();
  });

  it("never puts a hard-coded maker in the part number line (F-02)", () => {
    const initial: CatalogPageDraft = {
      ...emptyCatalogDraft(),
      evidenceUrl: PAGE_URL,
      catalogCarMaker: "",
      brandDefault: "",
      partKind: "aftermarket",
      linkHints: { ok: true, trustedSite: false },
      vehicleListings: [listing({ trust: "confirmed" })],
      partRows: [partRow({ partTypeId: "t-o2", partNumber: "89467-B1040", position: "before_cat", brand: "" })],
    };
    wrap(
      <CatalogStep4Trust
        draft={initial}
        types={TYPES}
        onNext={vi.fn()}
        onBack={vi.fn()}
        onTrustChange={vi.fn()}
        onYearsChange={vi.fn()}
      />,
    );
    expect(screen.getByText("89467-B1040")).toBeTruthy();
    expect(screen.queryByText(/Toyota/)).toBeNull();
  });
});

describe("Step 1 — preselect a car", () => {
  it("loads that car's real details, not a hard-coded Toyota", async () => {
    const daihatsu = {
      id: "v-daihatsu",
      make: "Daihatsu",
      model: "Move",
      chassis_code: "LA150S",
      engine_code: "KF-VE",
      production_start_year: 2011,
      production_end_year: 2016,
      version_name: "X SA",
      platform_id: "p-la150",
      drivetrain: "2WD",
    };
    api.fetchAddPartVehicle.mockResolvedValue(daihatsu);
    window.history.replaceState({}, "", `/?vehiclesPreselectVehicleId=${daihatsu.id}`);
    wrap(<CatalogAddPartsFlow owner onHome={vi.fn()} onFindParts={vi.fn()} />);
    expect(await screen.findByText("Daihatsu Move")).toBeTruthy();
    expect(api.fetchAddPartVehicle).toHaveBeenCalledWith(daihatsu.id);
    expect((screen.getByLabelText("Daihatsu Move year from") as HTMLInputElement).value).toBe("2011");
    expect((screen.getByLabelText("Daihatsu Move year to") as HTMLInputElement).value).toBe("2016");
    expect(screen.queryByText(/Toyota Roomy/)).toBeNull();
    expect(screen.getByText(/LA150S/)).toBeTruthy();
  });

  it("shows a plain error on Step 2 and adds nothing when the car can't be loaded", async () => {
    api.fetchAddPartVehicle.mockResolvedValue(null);
    window.history.replaceState({}, "", "/?vehiclesPreselectVehicleId=v-missing");
    wrap(<CatalogAddPartsFlow owner onHome={vi.fn()} onFindParts={vi.fn()} />);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent ?? "").toContain("We couldn't load that car");
    expect(screen.getByText("Tick at least one car.")).toBeTruthy();
    expect((screen.getByRole("button", { name: /Next: the parts/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByText(/Selected · 1 cars/)).toBeNull();
  });
});

describe("The part-number guide (#14)", () => {
  it("opens from step 1", async () => {
    wrap(<Step1Harness />);
    fireEvent.click(screen.getByRole("button", { name: /How to find the part number/ }));
    expect(await screen.findByText("Where to find the part number")).toBeTruthy();
    expect(screen.getByText("Open the diagram or parts list on the catalogue page.")).toBeTruthy();
    expect(screen.getByText("Front and rear are different parts. Add both, one row each.")).toBeTruthy();
  });

  it("is on step 3, open first time, and can be closed", async () => {
    const initial: CatalogPageDraft = {
      ...emptyCatalogDraft(),
      evidenceUrl: PAGE_URL,
      catalogCarMaker: "Toyota",
      brandDefault: "Toyota",
      partKind: "oem",
      vehicleListings: [listing()],
      partRows: [partRow({ partTypeId: "t-o2", partNumber: "89467-B1040", position: "before_cat" })],
    };
    wrap(
      <CatalogStep3Parts
        draft={initial}
        setDraft={vi.fn()}
        onNext={vi.fn()}
        onBack={vi.fn()}
        onEditCars={vi.fn()}
      />,
    );
    expect(await screen.findByText("Where to find the part number")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByText("Where to find the part number")).toBeNull();
  });
});

describe("QA probes", () => {
  const INVENTED = [
    "100% MATCH", "SKU ID", "READY FOR COMMIT", "MANIFEST", "Global Central Registry",
    "Ledger status", "microfiche", "OEM specification", "Connector ID", "Heated 4-wire",
    "Publishing Policy", "CATALOG INGESTION", "DETECTED CHASSIS", "Catalog Category",
    "Japan Spec", "Needs Placement", "INGESTION v", "CATALOG INGESTION WORKFLOW",
  ];

  it("shows none of the invented catalogue-intake words on any screen", () => {
    api.fetchSelfServeLinkHints.mockResolvedValue({
      ok: true, host: "partsouq.com", trustedSite: true, catalogMaker: "Toyota", sourceTrust: "confirmed",
    });
    const screens = [
      <Step1Harness />,
      <CatalogStep4Save
        draft={{
          ...emptyCatalogDraft(),
          evidenceUrl: PAGE_URL,
          catalogCarMaker: "Toyota",
          brandDefault: "Toyota",
          partKind: "oem",
          vehicleListings: [listing()],
          partRows: [partRow({ partTypeId: "t-o2", partNumber: "89467-B1040", position: "before_cat" })],
        }}
        types={TYPES}
        saving={false}
        onSave={vi.fn()}
        onBack={vi.fn()}
      />,
      <CatalogSaved
        saveResult={{ partCount: 1, carCount: 1, fitCount: 1, savedNames: ["Front oxygen sensor"] }}
        draft={{
          ...emptyCatalogDraft(),
          vehicleListings: [listing()],
          partRows: [partRow({ partTypeId: "t-o2", partNumber: "89467-B1040" })],
        }}
        types={TYPES}
        onAddMoreFromPage={vi.fn()}
        onSameCarsNewPage={vi.fn()}
        onFindParts={vi.fn()}
        onHome={vi.fn()}
        onUndo={vi.fn()}
      />,
    ];
    for (const screen of screens) {
      const { unmount } = wrap(screen);
      const text = document.body.textContent ?? "";
      for (const word of INVENTED) {
        expect(text, `screen must not show "${word}"`).not.toContain(word);
      }
      unmount();
    }
  });

  it("closes the part-number guide with Escape", async () => {
    wrap(<Step1Harness />);
    fireEvent.click(screen.getByRole("button", { name: /How to find the part number/ }));
    expect(await screen.findByText("Where to find the part number")).toBeTruthy();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape", code: "Escape" });
    await waitFor(() => expect(screen.queryByText("Where to find the part number")).toBeNull());
  });

  it("keeps the person's Another brand choice when the link is read again", async () => {
    api.fetchSelfServeLinkHints.mockResolvedValue({
      ok: true, host: "partsouq.com", trustedSite: true, catalogMaker: "Toyota", sourceTrust: "confirmed",
    });
    wrap(<Step1Harness />);
    fireEvent.change(screen.getByLabelText("Catalogue page link"), { target: { value: PAGE_URL } });
    fireEvent.click(await screen.findByRole("button", { name: /Another brand/ }));
    expect(screen.getByLabelText("Brand")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Catalogue page link"), { target: { value: `${PAGE_URL}?page=2` } });
    await waitFor(() => expect(api.fetchSelfServeLinkHints).toHaveBeenCalledTimes(2));
    // F-09: re-reading a trusted link must not type the car maker in as the brand of an "another brand" part.
    expect((screen.getByLabelText("Brand") as HTMLInputElement).value).toBe("");
    const genuineCard = screen.getByRole("button", { name: /The car maker \(genuine\)/ });
    expect(genuineCard.textContent ?? "").not.toContain("check_circle");
  });

  it("keeps the newest link when two link reads finish out of order", async () => {
    const deferred: Array<(v: unknown) => void> = [];
    api.fetchSelfServeLinkHints.mockImplementation(
      () => new Promise((resolve) => { deferred.push(resolve as (v: unknown) => void); }),
    );
    wrap(<Step1Harness />);
    const input = screen.getByLabelText("Catalogue page link");
    fireEvent.change(input, { target: { value: "https://partsouq.com/one" } });
    fireEvent.change(input, { target: { value: "https://partsouq.com/two" } });
    await waitFor(() => expect(deferred).toHaveLength(2));
    expect(api.fetchSelfServeLinkHints.mock.calls[0][0]).toBe("https://partsouq.com/one");
    expect(api.fetchSelfServeLinkHints.mock.calls[1][0]).toBe("https://partsouq.com/two");
    deferred[1]({ ok: true, host: "partsouq.com", trustedSite: false, catalogMaker: "Toyota", sourceTrust: "needs_checking" });
    await screen.findByText(/This site is not on the trusted list/);
    deferred[0]({ ok: true, host: "partsouq.com", trustedSite: true, catalogMaker: "Toyota", sourceTrust: "confirmed" });
    // CR-01: let the late answer settle fully, then check it was dropped.
    await act(async () => {});
    await act(async () => {});
    expect((screen.getByLabelText("Catalogue page link") as HTMLInputElement).value).toBe("https://partsouq.com/two");
    expect(screen.getByText(/This site is not on the trusted list/)).toBeTruthy();
    expect(screen.queryByText(/Trusted site/)).toBeNull();
  });
});

describe("Code review fixes", () => {
  it("CR-02: an untrusted link that names the maker still asks who made the parts", async () => {
    api.fetchSelfServeLinkHints.mockResolvedValue({
      ok: true, host: "partsouq.com", trustedSite: false, catalogMaker: "Toyota", sourceTrust: "needs_checking",
    });
    wrap(<Step1Harness />);
    fireEvent.change(screen.getByLabelText("Catalogue page link"), { target: { value: PAGE_URL } });
    await screen.findByText(/own catalogue/);
    const next = () => screen.getByRole("button", { name: /Next: the cars/ }) as HTMLButtonElement;
    expect(next().disabled).toBe(true);
    expect(screen.getByText("Choose who made these parts.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Another brand/ }));
    expect(next().disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Brand"), { target: { value: "Brembo" } });
    expect(next().disabled).toBe(false);
  });

  it("CR-03: re-reading the link keeps the maker the person picked, and re-checks trust for it", async () => {
    api.fetchSelfServeLinkHints.mockResolvedValue({
      ok: true, host: "partsouq.com", trustedSite: true, catalogMaker: "Toyota", sourceTrust: "confirmed",
    });
    wrap(<Step1Harness />);
    fireEvent.change(screen.getByLabelText("Catalogue page link"), { target: { value: PAGE_URL } });
    await screen.findByText(/own catalogue/);
    fireEvent.click(screen.getAllByRole("button", { name: "Change" })[1]);
    fireEvent.click(await screen.findByRole("button", { name: "Daihatsu" }));
    await waitFor(() => expect(api.fetchSelfServeLinkHints).toHaveBeenLastCalledWith(PAGE_URL, "Daihatsu"));
    fireEvent.change(screen.getByLabelText("Catalogue page link"), { target: { value: `${PAGE_URL}?page=2` } });
    await waitFor(() => expect(api.fetchSelfServeLinkHints).toHaveBeenLastCalledWith(`${PAGE_URL}?page=2`, "Daihatsu"));
    await act(async () => {});
    expect(screen.getByText(/Daihatsu's own catalogue|Daihatsu’s own catalogue/)).toBeTruthy();
    expect(screen.queryByText(/Toyota's own catalogue|Toyota’s own catalogue/)).toBeNull();
  });

  it("CR-04: page years that end before they start block Next", async () => {
    api.searchAddPartVehicles.mockResolvedValue([]);
    const initial: CatalogPageDraft = {
      ...emptyCatalogDraft(),
      evidenceUrl: PAGE_URL,
      catalogCarMaker: "Toyota",
      linkHints: { ok: true, trustedSite: true, catalogMaker: "Toyota" },
      vehicleListings: [listing({ yearFrom: undefined, yearTo: undefined })],
    };
    wrap(<Step2Harness initial={initial} />);
    const next = () => screen.getByRole("button", { name: /Next: the parts/ }) as HTMLButtonElement;
    fireEvent.change(screen.getByLabelText("Page year from"), { target: { value: "2020" } });
    fireEvent.change(screen.getByLabelText("Page year to"), { target: { value: "2016" } });
    expect(next().disabled).toBe(true);
    expect(screen.getAllByText("The page years end before they start (2020 to 2016).").length).toBeGreaterThan(0);
    fireEvent.change(screen.getByLabelText("Page year from"), { target: { value: "2016" } });
    fireEvent.change(screen.getByLabelText("Page year to"), { target: { value: "2020" } });
    expect(next().disabled).toBe(false);
  });

  it("CR-06: typing the page years key by key still ticks the right versions", async () => {
    api.searchAddPartVehicles.mockResolvedValue([
      vehicle({ id: "v-2016" }),
      vehicle({ id: "v-tank", model: "Tank" }),
      vehicle({ id: "v-2021", production_start_year: 2021, production_end_year: 2022 }),
    ]);
    const initial: CatalogPageDraft = {
      ...emptyCatalogDraft(),
      evidenceUrl: PAGE_URL,
      catalogCarMaker: "Toyota",
      linkHints: { ok: true, trustedSite: true, frameCodes: ["M900A"], catalogMaker: "Toyota" },
    };
    wrap(<Step2Harness initial={initial} />);
    await screen.findByLabelText("Tick Toyota Roomy M900A 2016");
    const from = screen.getByLabelText("Page year from");
    const to = screen.getByLabelText("Page year to");
    // To first, then From — each a keystroke at a time.
    for (const v of ["2", "20", "202", "2020"]) fireEvent.change(to, { target: { value: v } });
    for (const v of ["2", "20", "201", "2016"]) fireEvent.change(from, { target: { value: v } });
    await waitFor(() =>
      expect((screen.getByLabelText("Tick Toyota Roomy M900A 2016") as HTMLInputElement).checked).toBe(true),
    );
    expect((screen.getByLabelText("Tick Toyota Tank M900A 2016") as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText("Tick Toyota Roomy M900A 2021") as HTMLInputElement).checked).toBe(false);
  });

  it("CR-07: text that isn't a web link blocks Next and shows no trust", async () => {
    api.fetchSelfServeLinkHints.mockResolvedValue({
      ok: true, host: "partsouq.com", trustedSite: true, catalogMaker: "Toyota", sourceTrust: "confirmed",
    });
    wrap(<Step1Harness />);
    const input = screen.getByLabelText("Catalogue page link");
    const next = () => screen.getByRole("button", { name: /Next: the cars/ }) as HTMLButtonElement;
    fireEvent.change(input, { target: { value: PAGE_URL } });
    await screen.findByText(/Trusted site/);
    expect(next().disabled).toBe(false);
    fireEvent.change(input, { target: { value: "not a link" } });
    expect(next().disabled).toBe(true);
    expect(screen.getByText("Paste a working web link first.")).toBeTruthy();
    expect(screen.queryByText(/Trusted site/)).toBeNull();
    expect(screen.queryByText(/is trusted for/)).toBeNull();
    fireEvent.change(input, { target: { value: PAGE_URL } });
    await screen.findByText(/Trusted site/);
    await waitFor(() => expect(next().disabled).toBe(false));
  });

  const trustedFor = (maker: string) => ({
    ok: true, host: "partsouq.com", trustedSite: true, catalogMaker: maker, sourceTrust: "confirmed",
  });
  const DAIHATSU_URL = "https://partsouq.com/en/catalog/genuine/vehicle?c=Daihatsu&ssd=x";

  it("CR-08: Site Change then a new maker's page carries nothing from the old page", async () => {
    api.fetchSelfServeLinkHints.mockImplementation(async (url: string) =>
      trustedFor(url === DAIHATSU_URL ? "Daihatsu" : "Toyota"),
    );
    wrap(<Step1Harness />);
    const input = () => screen.getByLabelText("Catalogue page link");
    fireEvent.change(input(), { target: { value: PAGE_URL } });
    await screen.findByText(/Toyota's own catalogue|Toyota’s own catalogue/);
    fireEvent.click(screen.getAllByRole("button", { name: "Change" })[0]);
    expect((input() as HTMLInputElement).value).toBe("");
    fireEvent.change(input(), { target: { value: DAIHATSU_URL } });
    await screen.findByText(/Daihatsu's own catalogue|Daihatsu’s own catalogue/);
    expect(api.fetchSelfServeLinkHints).toHaveBeenLastCalledWith(DAIHATSU_URL);
    fireEvent.click(screen.getByRole("button", { name: /Another brand/ }));
    expect((screen.getByLabelText("Brand") as HTMLInputElement).value).toBe("");
    expect(screen.queryByText(/Toyota/)).toBeNull();
  });

  it("CR-08: clearing the link text then pasting a new page uses the new page's maker", async () => {
    api.fetchSelfServeLinkHints.mockImplementation(async (url: string) =>
      trustedFor(url === DAIHATSU_URL ? "Daihatsu" : "Toyota"),
    );
    wrap(<Step1Harness />);
    const input = () => screen.getByLabelText("Catalogue page link");
    fireEvent.change(input(), { target: { value: PAGE_URL } });
    await screen.findByText(/Toyota's own catalogue|Toyota’s own catalogue/);
    fireEvent.change(input(), { target: { value: "" } });
    fireEvent.change(input(), { target: { value: DAIHATSU_URL } });
    await screen.findByText(/Daihatsu's own catalogue|Daihatsu’s own catalogue/);
    // Trust is checked for the page's own maker, not a leftover "picked" Toyota.
    expect(api.fetchSelfServeLinkHints).toHaveBeenLastCalledWith(DAIHATSU_URL);
    expect(screen.getByText(/is trusted for Daihatsu/)).toBeTruthy();
  });

  it("CR-04: a car's own years must be real years in the right order", async () => {
    api.searchAddPartVehicles.mockResolvedValue([]);
    const initial: CatalogPageDraft = {
      ...emptyCatalogDraft(),
      evidenceUrl: PAGE_URL,
      catalogCarMaker: "Toyota",
      linkHints: { ok: true, trustedSite: true, catalogMaker: "Toyota" },
      vehicleListings: [listing()],
    };
    wrap(<Step2Harness initial={initial} />);
    const next = () => screen.getByRole("button", { name: /Next: the parts/ }) as HTMLButtonElement;
    expect(next().disabled).toBe(false);
    fireEvent.change(screen.getByLabelText("Toyota Roomy year to"), { target: { value: "2012" } });
    expect(next().disabled).toBe(true);
    expect(screen.getByText("The years for Toyota Roomy end before they start (2016 to 2012).")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Toyota Roomy year to"), { target: { value: "20201" } });
    expect(screen.getByText("Type the years for Toyota Roomy as 4-digit years, like 2016.")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Toyota Roomy year to"), { target: { value: "2020" } });
    expect(next().disabled).toBe(false);
  });
});

describe("Step 1 — who made these parts (QA-01 regression)", () => {
  const trustedToyota = {
    ok: true, host: "partsouq.com", trustedSite: true, catalogMaker: "Toyota", sourceTrust: "confirmed",
  };

  async function pasteLink() {
    fireEvent.change(screen.getByLabelText("Catalogue page link"), { target: { value: PAGE_URL } });
    await screen.findByText(/own catalogue/);
  }

  it("a trusted link still selects the genuine path on the first read", async () => {
    api.fetchSelfServeLinkHints.mockResolvedValue(trustedToyota);
    wrap(<Step1Harness />);
    await pasteLink();
    const genuine = screen.getByRole("button", { name: /The car maker \(genuine\)/ });
    expect(genuine.textContent ?? "").toContain("check_circle");
    expect(screen.queryByLabelText("Brand")).toBeNull();
  });

  it("keeps the typed another-brand name when the link is read again", async () => {
    api.fetchSelfServeLinkHints.mockResolvedValue(trustedToyota);
    wrap(<Step1Harness />);
    await pasteLink();
    fireEvent.click(screen.getByRole("button", { name: /Another brand/ }));
    fireEvent.change(screen.getByLabelText("Brand"), { target: { value: "Brembo" } });
    fireEvent.change(screen.getByLabelText("Catalogue page link"), { target: { value: `${PAGE_URL}?page=2` } });
    await waitFor(() => expect(api.fetchSelfServeLinkHints).toHaveBeenCalledTimes(2));
    expect((screen.getByLabelText("Brand") as HTMLInputElement).value).toBe("Brembo");
    const aftermarket = screen.getByRole("button", { name: /Another brand/ });
    expect(aftermarket.textContent ?? "").toContain("check_circle");
    expect(screen.getByRole("button", { name: /The car maker \(genuine\)/ }).textContent ?? "").not.toContain("check_circle");
  });

  it("fills the brand from the maker for genuine parts when the maker changes", async () => {
    api.fetchSelfServeLinkHints.mockResolvedValue(trustedToyota);
    wrap(<Step1Harness />);
    await pasteLink();
    // The trusted link chose the genuine path; change the maker on screen.
    fireEvent.click(screen.getAllByRole("button", { name: "Change" })[1]);
    fireEvent.click(await screen.findByRole("button", { name: "Daihatsu" }));
    await screen.findByText(/Daihatsu's own catalogue|Daihatsu’s own catalogue/);
    // Genuine must have carried the new maker in as the brand: switching to Another brand starts empty.
    fireEvent.click(screen.getByRole("button", { name: /Another brand/ }));
    expect((screen.getByLabelText("Brand") as HTMLInputElement).value).toBe("");
    expect(screen.getByText("Type or pick the brand.")).toBeTruthy();
    // ... and going back to genuine fills the new maker in again, with no brand field.
    fireEvent.click(screen.getByRole("button", { name: /The car maker \(genuine\)/ }));
    expect(screen.queryByLabelText("Brand")).toBeNull();
    expect(screen.queryByText("Type or pick the brand.")).toBeNull();
  });
});

describe("The whole flow", () => {
  function renderFlow() {
    return wrap(<CatalogAddPartsFlow owner onHome={vi.fn()} onFindParts={vi.fn()} />);
  }

  it("saves with each car's page years, then shows the names the server returned", async () => {
    window.history.replaceState({}, "", "/?addPartsCapture=step_4_review_and_save");
    api.saveCatalogPage.mockResolvedValueOnce({
      batchId: "batch-1", partCount: 3, carCount: 2, fitCount: 6,
      savedNames: ["Front oxygen sensor", "Rear oxygen sensor", "Handbrake cable"],
    });
    renderFlow();
    const save = await screen.findByRole("button", { name: /^Save \d+ parts? to \d+ cars?$/ });
    expect(screen.getAllByRole("button", { name: /^Save \d+ parts? to \d+ cars?$/ })).toHaveLength(1);
    expect(api.fetchSelfServePartTypes).toHaveBeenCalled();
    fireEvent.click(save);
    await waitFor(() => expect(api.saveCatalogPage).toHaveBeenCalledTimes(1));
    const sent = api.saveCatalogPage.mock.calls[0][0];
    expect(sent.vehicleListings).toHaveLength(2);
    expect(sent.vehicleListings[0]).toEqual(expect.objectContaining({ yearFrom: 2016, yearTo: 2020 }));
    expect(sent.parts).toHaveLength(3);
    expect(await screen.findByText("3 parts saved to 2 cars")).toBeTruthy();
  });

  it("a save failure keeps every row and offers Try again", async () => {
    window.history.replaceState({}, "", "/?addPartsCapture=step_4_review_and_save");
    api.saveCatalogPage.mockRejectedValueOnce(new Error("Part 2 has the same number as part 1 (46420-B1090)."));
    renderFlow();
    fireEvent.click(await screen.findByRole("button", { name: /^Save \d+ parts? to \d+ cars?$/ }));
    expect(await screen.findByText(/Nothing was saved/)).toBeTruthy();
    expect(screen.getAllByText("46410-B1011").length).toBeGreaterThan(0);
    expect(screen.getByText(/same number as part 1/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(api.saveCatalogPage).toHaveBeenCalledTimes(2));
  });

  it("Add more from this page keeps the page and cars and clears the rows", async () => {
    window.history.replaceState({}, "", "/?addPartsCapture=step_4_review_and_save");
    renderFlow();
    fireEvent.click(await screen.findByRole("button", { name: /^Save \d+ parts? to \d+ cars?$/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Add more from this page/ }));
    expect(await screen.findByText("Add each part on the page")).toBeTruthy();
    expect((screen.getByLabelText("Part 1 part number") as HTMLInputElement).value).toBe("");
  });

  it("undo asks the server and goes home", async () => {
    window.history.replaceState({}, "", "/?addPartsCapture=step_4_review_and_save");
    const onHome = vi.fn();
    wrap(<CatalogAddPartsFlow owner onHome={onHome} onFindParts={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: /^Save \d+ parts? to \d+ cars?$/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Undo save/ }));
    await waitFor(() => expect(api.undoSelfServePart).toHaveBeenCalledWith("batch-1"));
    await waitFor(() => expect(onHome).toHaveBeenCalled());
  });
});





