/**
 * @vitest-environment jsdom
 */
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FoundWorkItem, MaintenanceLogLine } from "../../../types/maintenance";
import { MaintenanceSaveError } from "../../../services/maintenanceSaveError";

const apiMock = vi.hoisted(() => ({
  listFoundWork: vi.fn(),
  markFoundWorkNotNeeded: vi.fn(),
  findParts: vi.fn(),
  partsLookup: vi.fn(),
  requestFindPart: vi.fn(),
  getWorkOrder: vi.fn(),
  listQuickJobCategories: vi.fn(),
  listMaintenanceSystems: vi.fn(),
  listMaintenanceCategories: vi.fn(),
  getSystemSections: vi.fn(),
  addFoundJobToInspection: vi.fn(),
}));
vi.mock("../../../services/api", () => ({ api: apiMock }));
const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast: toastMock }));

import {
  FOUND_UI_COPY,
  FoundByInspectionKpiCard,
  FoundByInspectionSection,
  FoundHistorySection,
  FoundToDoChip,
  NotNeededDialog,
} from "./FoundByInspection";

const rotor: FoundWorkItem = {
  lineId: "line-rotor",
  workOrderId: "wo-1",
  vehicleId: "car-1",
  jobId: "rotor",
  jobName: "Brake rotor",
  systemName: "Brakes",
  note: "Front rotors worn, replace within 2 weeks",
  foundDate: "2026-11-17",
  daysWaiting: 1,
  garage: "Northside Auto",
  inspectionJobName: "Inspection / diagnostic fee",
};
const shock: FoundWorkItem = {
  ...rotor,
  lineId: "line-shock",
  jobId: "shock",
  jobName: "Shock absorber",
  note: "Rear left leaking",
  daysWaiting: 3,
  garage: null,
};

beforeEach(() => {
  apiMock.listFoundWork.mockReset();
  apiMock.markFoundWorkNotNeeded.mockReset();
  toastMock.success.mockReset();
  toastMock.error.mockReset();
});

describe("Found by inspection in the Due items drawer (Stitch screens 7, 8, 12, 13)", () => {
  it("loading, then cards with note, found line and both buttons", async () => {
    apiMock.listFoundWork.mockResolvedValue({ items: [rotor, shock] });
    const onLogItNow = vi.fn();
    render(<FoundByInspectionSection vehicleId="car-1" canEdit onLogItNow={onLogItNow} />);
    expect(screen.getByTestId("found-loading")).toBeInTheDocument();
    const cards = await screen.findAllByTestId("found-card");
    expect(apiMock.listFoundWork).toHaveBeenCalledWith("car-1");
    expect(cards).toHaveLength(2);
    expect(screen.getByTestId("found-by-inspection-count")).toHaveTextContent("2");
    expect(within(cards[0]).getByText("Brake rotor")).toBeInTheDocument();
    expect(within(cards[0]).getByText("Waiting")).toBeInTheDocument();
    expect(within(cards[0]).getByText("Front rotors worn, replace within 2 weeks")).toBeInTheDocument();
    expect(within(cards[0]).getByTestId("found-card-line")).toHaveTextContent(
      "Found 17 Nov 2026 · 1 day waiting · Inspection / diagnostic fee at Northside Auto",
    );
    expect(within(cards[1]).getByTestId("found-card-line")).toHaveTextContent(
      "Found 17 Nov 2026 · 3 days waiting · Inspection / diagnostic fee",
    );
    fireEvent.click(within(cards[0]).getByTestId("found-log-it-now"));
    expect(onLogItNow).toHaveBeenCalledWith(rotor);
    // Stitch invented these; they must not be built.
    expect(screen.queryByText(/UNSCHEDULED/i)).toBeNull();
    expect(screen.queryByText(/Esc to close/i)).toBeNull();
  });

  it("empty: Nothing waiting + All clear", async () => {
    apiMock.listFoundWork.mockResolvedValue({ items: [] });
    render(<FoundByInspectionSection vehicleId="car-1" canEdit />);
    const empty = await screen.findByTestId("found-empty");
    expect(empty).toHaveTextContent(FOUND_UI_COPY.empty);
    expect(empty).toHaveTextContent(FOUND_UI_COPY.allClear);
    expect(screen.getByTestId("found-by-inspection-count")).toHaveTextContent("0");
  });

  it("switch off (404): the section is not shown at all", async () => {
    apiMock.listFoundWork.mockRejectedValue(new MaintenanceSaveError(404, {}, "Not found"));
    const { container } = render(<FoundByInspectionSection vehicleId="car-1" canEdit />);
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it("load fails: error box, Try again loads again", async () => {
    apiMock.listFoundWork.mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce({ items: [rotor] });
    render(<FoundByInspectionSection vehicleId="car-1" canEdit />);
    const err = await screen.findByTestId("found-error");
    expect(err).toHaveTextContent(FOUND_UI_COPY.loadFailed);
    expect(err).not.toHaveTextContent("boom");
    fireEvent.click(within(err).getByRole("button", { name: /Try again/ }));
    expect(await screen.findAllByTestId("found-card")).toHaveLength(1);
    expect(apiMock.listFoundWork).toHaveBeenCalledTimes(2);
  });

  it("view only: no buttons", async () => {
    apiMock.listFoundWork.mockResolvedValue({ items: [rotor] });
    render(<FoundByInspectionSection vehicleId="car-1" canEdit={false} onLogItNow={vi.fn()} />);
    await screen.findByTestId("found-card");
    expect(screen.queryByTestId("found-log-it-now")).toBeNull();
    expect(screen.queryByTestId("found-not-needed")).toBeNull();
  });

  it("phone: buttons stack full width", async () => {
    apiMock.listFoundWork.mockResolvedValue({ items: [rotor] });
    render(<FoundByInspectionSection vehicleId="car-1" canEdit onLogItNow={vi.fn()} phone />);
    await screen.findByTestId("found-card");
    expect(screen.getByTestId("found-status").className).toContain("w-full");
    expect(screen.getByTestId("found-log-it-now").className).toContain("h-12");
    expect(screen.getByTestId("found-not-needed").className).toContain("w-full");
  });

  it("Not needed → overlay → Mark not needed → saved, list reloads, counts refresh", async () => {
    apiMock.listFoundWork.mockResolvedValueOnce({ items: [rotor, shock] }).mockResolvedValueOnce({ items: [rotor] });
    apiMock.markFoundWorkNotNeeded.mockResolvedValue({ ok: true });
    const onChanged = vi.fn();
    render(<FoundByInspectionSection vehicleId="car-1" canEdit onChanged={onChanged} />);
    const cards = await screen.findAllByTestId("found-card");
    fireEvent.click(within(cards[1]).getByTestId("found-not-needed"));
    const dialog = await screen.findByTestId("found-not-needed-dialog");
    expect(within(dialog).getByText("Mark Shock absorber as not needed?")).toBeInTheDocument();
    expect(within(dialog).getByText("Found 17 Nov 2026 · Rear left leaking")).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(within(dialog).getByTestId("found-not-needed-confirm"));
    });
    expect(apiMock.markFoundWorkNotNeeded).toHaveBeenCalledWith("line-shock");
    expect(toastMock.success).toHaveBeenCalledWith("Shock absorber marked not needed");
    expect(onChanged).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getAllByTestId("found-card")).toHaveLength(1));
    expect(screen.queryByTestId("found-not-needed-dialog")).toBeNull();
  });

  it("Cancel closes the overlay and saves nothing", async () => {
    apiMock.listFoundWork.mockResolvedValue({ items: [rotor] });
    render(<FoundByInspectionSection vehicleId="car-1" canEdit />);
    fireEvent.click(await screen.findByTestId("found-not-needed"));
    const dialog = await screen.findByTestId("found-not-needed-dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByTestId("found-not-needed-dialog")).toBeNull());
    expect(apiMock.markFoundWorkNotNeeded).not.toHaveBeenCalled();
  });

  it("someone else closed it first: conflict box, list reloads, OK hides the box", async () => {
    apiMock.listFoundWork.mockResolvedValueOnce({ items: [rotor] }).mockResolvedValueOnce({ items: [] });
    apiMock.markFoundWorkNotNeeded.mockRejectedValue(new MaintenanceSaveError(409, { code: "found_line_not_open" }, "x"));
    const onChanged = vi.fn();
    render(<FoundByInspectionSection vehicleId="car-1" canEdit onChanged={onChanged} />);
    fireEvent.click(await screen.findByTestId("found-not-needed"));
    await act(async () => {
      fireEvent.click(await screen.findByTestId("found-not-needed-confirm"));
    });
    const box = await screen.findByTestId("found-conflict");
    expect(box).toHaveTextContent(FOUND_UI_COPY.conflictTitle);
    expect(onChanged).toHaveBeenCalled();
    expect(await screen.findByTestId("found-empty")).toBeInTheDocument();
    expect(toastMock.error).not.toHaveBeenCalled();
    fireEvent.click(within(box).getByRole("button", { name: "OK" }));
    expect(screen.queryByTestId("found-conflict")).toBeNull();
  });

  it("other save error: toast, list kept", async () => {
    apiMock.listFoundWork.mockResolvedValue({ items: [rotor] });
    apiMock.markFoundWorkNotNeeded.mockRejectedValue(new Error("Network down"));
    render(<FoundByInspectionSection vehicleId="car-1" canEdit />);
    fireEvent.click(await screen.findByTestId("found-not-needed"));
    await act(async () => {
      fireEvent.click(await screen.findByTestId("found-not-needed-confirm"));
    });
    expect(toastMock.error).toHaveBeenCalledWith("Network down");
    expect(screen.getAllByTestId("found-card")).toHaveLength(1);
    expect(apiMock.listFoundWork).toHaveBeenCalledTimes(1);
  });
});

describe("Not needed overlay", () => {
  it("closed when there is no job; Saving… while busy", () => {
    const { rerender } = render(<NotNeededDialog item={null} busy={false} onCancel={vi.fn()} onConfirm={vi.fn()} />);
    expect(screen.queryByTestId("found-not-needed-dialog")).toBeNull();
    rerender(<NotNeededDialog item={rotor} busy onCancel={vi.fn()} onConfirm={vi.fn()} />);
    expect(screen.getByTestId("found-not-needed-confirm")).toHaveTextContent("Saving…");
    expect(screen.getByTestId("found-not-needed-confirm")).toBeDisabled();
  });
});

describe("Fleet page card and chip (Stitch screen 6)", () => {
  it("chip: N to do, hidden at 0", () => {
    const onClick = vi.fn();
    const { rerender } = render(<FoundToDoChip count={2} onClick={onClick} />);
    fireEvent.click(screen.getByTestId("found-to-do-chip"));
    expect(screen.getByTestId("found-to-do-chip")).toHaveTextContent("2 to do");
    expect(onClick).toHaveBeenCalled();
    rerender(<FoundToDoChip count={0} onClick={onClick} />);
    expect(screen.queryByTestId("found-to-do-chip")).toBeNull();
  });

  it("card: jobs waiting, cars, oldest; a button only when something waits", () => {
    const onOpen = vi.fn();
    const { rerender } = render(<FoundByInspectionKpiCard total={3} cars={2} oldestDays={5} onOpen={onOpen} />);
    const card = screen.getByTestId("found-kpi-card");
    expect(card.tagName).toBe("BUTTON");
    expect(card).toHaveTextContent("Found by inspection");
    expect(card).toHaveTextContent("3 jobs waiting");
    expect(card).toHaveTextContent("on 2 cars · oldest 5 days");
    fireEvent.click(card);
    expect(onOpen).toHaveBeenCalled();
    rerender(<FoundByInspectionKpiCard total={1} cars={1} oldestDays={1} onOpen={onOpen} />);
    expect(screen.getByTestId("found-kpi-card")).toHaveTextContent("1 job waiting");
    expect(screen.getByTestId("found-kpi-card")).toHaveTextContent("on 1 car · oldest 1 day");
    rerender(<FoundByInspectionKpiCard total={0} cars={0} oldestDays={null} onOpen={onOpen} />);
    expect(screen.getByTestId("found-kpi-card").tagName).toBe("DIV");
    expect(screen.getByTestId("found-kpi-card")).toHaveTextContent("0 jobs waiting");
  });
});

describe("What the inspection found in history (Stitch screen 11)", () => {
  const base = { categoryId: "x", categoryCode: "x" };
  const closed = { doneWorkOrderId: null, doneDate: null, doneSameDay: false, closedAt: null, closedByName: null };
  const lines: MaintenanceLogLine[] = [
    { ...base, id: "insp", categoryName: "Inspection / diagnostic fee", labor: 8000 },
    {
      ...base,
      id: "rotor",
      categoryName: "Brake rotor",
      recommended: true,
      notes: "Front rotors worn",
      found: { ...closed, status: "done", doneWorkOrderId: "wo-2", doneDate: "2026-11-20" },
    },
    {
      ...base,
      id: "shock",
      categoryName: "Shock absorber",
      recommended: true,
      found: { ...closed, status: "not_needed", closedAt: "2026-11-19T10:00:00Z", closedByName: "Dee" },
    },
    { ...base, id: "belt", categoryName: "Drive belt", recommended: true, found: { ...closed, status: "service_deleted" } },
    { ...base, id: "pads", categoryName: "Brake pads", recommended: true },
    { ...base, id: "gone", categoryName: "Voided job", recommended: true, voidedAt: "2026-11-18T00:00:00Z" },
    // Saved after the found jobs, but shown first (Stitch 11).
    { ...base, id: "wiper", categoryName: "Wiper Blades", labor: 3300, values: { found_today: true }, notes: "hidden" },
  ];

  it("rows for each found job with the right status; Open that service links", () => {
    const onOpenService = vi.fn();
    render(<FoundHistorySection lines={lines} onOpenService={onOpenService} />);
    const sec = screen.getByTestId("found-history");
    expect(within(sec).getByText("What the inspection found")).toBeInTheDocument();
    const rows = within(sec).getAllByTestId("found-history-row");
    expect(rows.map((r) => r.querySelector("span")?.textContent)).toEqual([
      "Wiper Blades",
      "Brake rotor",
      "Shock absorber",
      "Drive belt",
      "Brake pads",
    ]);
    expect(rows[0]).toHaveTextContent("Done");
    expect(rows[0]).toHaveTextContent("Done the same day");
    expect(rows[0]).not.toHaveTextContent("hidden");
    expect(rows[1]).toHaveTextContent("Front rotors worn");
    expect(rows[1]).toHaveTextContent("Done 20 Nov 2026");
    fireEvent.click(within(rows[1]).getByTestId("found-open-service"));
    expect(onOpenService).toHaveBeenCalledWith("wo-2");
    expect(rows[2]).toHaveTextContent("Marked not needed 19 Nov 2026 by Dee");
    expect(within(rows[2]).getByText("Shock absorber").className).toContain("line-through");
    expect(rows[3]).toHaveTextContent("Closed · service deleted");
    expect(rows[3]).toHaveTextContent("The inspection was deleted, so this job was closed.");
    expect(rows[4]).toHaveTextContent("Waiting");
    expect(screen.getAllByTestId("found-open-service")).toHaveLength(1);
  });

  it("done the same day on another service: no Open that service", () => {
    render(
      <FoundHistorySection
        lines={[
          {
            ...base,
            categoryName: "Brake rotor",
            recommended: true,
            found: { ...closed, status: "done", doneWorkOrderId: "wo-2", doneDate: "2026-11-17", doneSameDay: true },
          },
        ]}
        onOpenService={vi.fn()}
      />,
    );
    expect(screen.getByTestId("found-history-row")).toHaveTextContent("Done the same day");
    expect(screen.queryByTestId("found-open-service")).toBeNull();
  });

  it("nothing found: no section", () => {
    const { container } = render(<FoundHistorySection lines={[lines[0]]} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("Planned jobs on Not done yet (Slice C, Stitch screen 6)", () => {
  const planned: FoundWorkItem = {
    ...rotor,
    lineId: "line-o2",
    jobId: "o2",
    jobName: "Oxygen sensor",
    note: "buy at Northside Auto on Friday",
    foundDate: "2026-11-18",
    inspectionJobName: null,
    garage: null,
    positions: ["after_cat"],
    positionScheme: "catalyst",
    source: "planned",
    partId: "p1",
    partName: "Rear oxygen sensor",
    partBrand: "Toyota (genuine)",
    partNumber: "89465-B1120",
  };

  it("a planned card shows the place, Planned date, the part number and both buttons", async () => {
    apiMock.listFoundWork.mockResolvedValue({ items: [planned, rotor] });
    const onLogItNow = vi.fn();
    render(<FoundByInspectionSection vehicleId="car-1" canEdit onLogItNow={onLogItNow} />);
    const cards = await screen.findAllByTestId("found-card");
    expect(screen.getByRole("heading", { level: 3 })).toHaveTextContent(FOUND_UI_COPY.plannedTitle);
    const card = cards[0];
    expect(card).toHaveAttribute("data-source", "planned");
    expect(within(card).getByRole("heading", { level: 4 }).textContent).toMatch(/^Oxygen sensor · /);
    expect(within(card).getByTestId("found-card-line")).toHaveTextContent("Planned 18 Nov 2026");
    expect(within(card).getByTestId("planned-part")).toHaveTextContent("89465-B1120");
    expect(within(card).getByText("“buy at Northside Auto on Friday”")).toBeInTheDocument();
    // No prices, stock or invented Stitch text.
    expect(screen.queryByText(/OEM Direct Match|In stock|J\$ 28/i)).toBeNull();
    fireEvent.click(within(card).getByTestId("found-log-it-now"));
    expect(onLogItNow).toHaveBeenCalledWith(planned);
    fireEvent.click(within(card).getByTestId("found-not-needed"));
    expect(await screen.findByTestId("found-not-needed-dialog")).toHaveTextContent(FOUND_UI_COPY.confirmBodyPlanned);
  });

  it("no planned job: today's title stays", async () => {
    apiMock.listFoundWork.mockResolvedValue({ items: [rotor] });
    render(<FoundByInspectionSection vehicleId="car-1" canEdit />);
    await screen.findAllByTestId("found-card");
    expect(screen.getByText(FOUND_UI_COPY.title)).toBeInTheDocument();
    expect(screen.queryByText(FOUND_UI_COPY.plannedTitle)).toBeNull();
  });
});

describe("LC-10 Parts to buy on an inspection's not-done-yet job", () => {
  const o2: FoundWorkItem = {
    ...rotor,
    lineId: "line-o2",
    jobId: "o2",
    jobName: "Oxygen sensor",
    note: null,
    positions: ["before_cat"],
    positionScheme: "before_after_catalyst",
    jobCode: "oxygen_sensor",
  };
  const toyota = {
    linked: true,
    car: { make: "Toyota", model: "Roomy" },
    plainSections: [
      { items: [{ partId: "p1", name: "Front oxygen sensor", brand: "Toyota", number: "89467-B1040", fitLabel: "made_for_car", status: "verified" }] },
    ],
    ask: { state: "none", askedAt: null, byYou: false },
  };

  beforeEach(() => {
    apiMock.findParts.mockReset();
    apiMock.partsLookup.mockReset();
  });

  it("switch on: the title has the place and the parts to buy show, read-only, with Copy part info", async () => {
    apiMock.listFoundWork.mockResolvedValue({ items: [o2], partsGapsEnabled: true });
    apiMock.findParts.mockResolvedValue(toyota);
    apiMock.partsLookup.mockResolvedValue({});
    render(<FoundByInspectionSection vehicleId="car-1" canEdit onLogItNow={vi.fn()} />);
    await waitFor(() => expect(screen.getByTestId("parts-fit-card")).toBeTruthy());
    expect(screen.getByTestId("found-card-title").textContent).toBe("Oxygen sensor · Front (Air fuel ratio sensor)");
    expect(apiMock.findParts).toHaveBeenCalledWith({ vehicleId: "car-1", componentId: "o2", places: "before_cat" });
    expect(screen.getByTestId("parts-fit-title").textContent).toBe("Parts to buy for your Toyota Roomy");
    expect(screen.getByTestId("parts-fit-panel").getAttribute("data-mode")).toBe("to-buy");
    expect(screen.getByTestId("parts-fit-card").getAttribute("role")).toBeNull();
    expect(screen.getByTestId("parts-fit-copy").textContent).toContain("Copy part info");
    expect(screen.queryByTestId("parts-fit-skip")).toBeNull();
    expect(screen.queryByTestId("parts-fit-plan-it")).toBeNull();
    expect(screen.getByTestId("found-log-it-now")).toBeTruthy();
  });

  it("switch off: today's card, no parts lookup", async () => {
    apiMock.listFoundWork.mockResolvedValue({ items: [o2], partsGapsEnabled: false });
    render(<FoundByInspectionSection vehicleId="car-1" canEdit />);
    await waitFor(() => expect(screen.getByTestId("found-card-title")).toBeTruthy());
    expect(screen.getByTestId("found-card-title").textContent).toBe("Oxygen sensor");
    expect(screen.queryByTestId("parts-fit-panel")).toBeNull();
    expect(apiMock.findParts).not.toHaveBeenCalled();
  });
});

describe("LC-11 Not done yet tab (every car)", () => {
  it("no car: loads every car's jobs, names each card's car, own title and empty line", async () => {
    apiMock.listFoundWork.mockResolvedValue({ items: [rotor], partsGapsEnabled: false });
    render(<FoundByInspectionSection canEdit carLabel={(id) => (id === "car-1" ? "Toyota Roomy · 5179KZ" : null)} />);
    await waitFor(() => expect(screen.getByTestId("found-card")).toBeTruthy());
    expect(apiMock.listFoundWork).toHaveBeenCalledWith(undefined);
    expect(screen.getByText("Not done yet")).toBeTruthy();
    expect(screen.getByTestId("found-card-car").textContent).toContain("Toyota Roomy · 5179KZ");
  });

  it("one car (the drawer): no car line", async () => {
    apiMock.listFoundWork.mockResolvedValue({ items: [rotor] });
    render(<FoundByInspectionSection vehicleId="car-1" canEdit carLabel={() => "Toyota Roomy · 5179KZ"} />);
    await waitFor(() => expect(screen.getByTestId("found-card")).toBeTruthy());
    expect(screen.queryByTestId("found-card-car")).toBeNull();
  });

  it("every car, nothing waiting", async () => {
    apiMock.listFoundWork.mockResolvedValue({ items: [] });
    render(<FoundByInspectionSection canEdit />);
    await waitFor(() => expect(screen.getByTestId("found-empty")).toBeTruthy());
    expect(screen.getByTestId("found-empty").textContent).toContain("Nothing waiting on any car.");
  });
});

describe("LC-13 the inspection a found job came from", () => {
  it("From inspection box names it; View inspection opens that service", async () => {
    apiMock.listFoundWork.mockResolvedValue({ items: [rotor] });
    apiMock.getWorkOrder.mockResolvedValue({ item: { id: "wo-1", lines: [], performedAtDate: "2026-11-17" } });
    render(<FoundByInspectionSection canEdit carLabel={() => "Toyota Roomy · 5179KZ"} />);
    await waitFor(() => expect(screen.getByTestId("found-from-inspection")).toBeTruthy());
    const box = screen.getByTestId("found-from-inspection");
    expect(box.textContent).toContain("From inspection");
    expect(box.textContent).toContain("Inspection / diagnostic fee at Northside Auto");
    fireEvent.click(screen.getByTestId("found-view-inspection"));
    await waitFor(() => expect(apiMock.getWorkOrder).toHaveBeenCalledWith("wo-1"));
  });
});

describe("LC-14 Add a job on the inspection a found job came from", () => {
  it("the From inspection box has Add a job; it asks the host to open Log service for that inspection", async () => {
    apiMock.listFoundWork.mockResolvedValue({ items: [rotor] });
    const onAddToInspection = vi.fn();
    render(<FoundByInspectionSection canEdit carLabel={() => "Toyota Roomy · 5179KZ"} onAddToInspection={onAddToInspection} />);
    await waitFor(() => expect(screen.getByTestId("found-add-to-inspection")).toBeTruthy());
    fireEvent.click(screen.getByTestId("found-add-to-inspection"));
    expect(onAddToInspection).toHaveBeenCalledWith({
      vehicleId: "car-1",
      workOrderId: "wo-1",
      inspectionLine: "Inspection / diagnostic fee · 17 Nov 2026 · Northside Auto",
    });
  });

  it("view only, or no host for it: no Add a job", async () => {
    apiMock.listFoundWork.mockResolvedValue({ items: [rotor] });
    const { unmount } = render(<FoundByInspectionSection canEdit={false} onAddToInspection={vi.fn()} />);
    await waitFor(() => expect(screen.getByTestId("found-view-inspection")).toBeTruthy());
    expect(screen.queryByTestId("found-add-to-inspection")).toBeNull();
    unmount();
    render(<FoundByInspectionSection canEdit />);
    await waitFor(() => expect(screen.getByTestId("found-view-inspection")).toBeTruthy());
    expect(screen.queryByTestId("found-add-to-inspection")).toBeNull();
  });
});

describe("Parts to buy only for part jobs", () => {
  it("a found service (Throttle Body Cleaning) has no parts box", async () => {
    apiMock.findParts.mockReset();
    const tbc: FoundWorkItem = { ...rotor, lineId: "line-tbc", jobId: "tbc", jobName: "Throttle Body Cleaning", jobIsPart: false };
    apiMock.listFoundWork.mockResolvedValue({ items: [tbc], partsGapsEnabled: true });
    render(<FoundByInspectionSection vehicleId="car-1" canEdit />);
    await waitFor(() => expect(screen.getByTestId("found-card")).toBeTruthy());
    expect(screen.queryByTestId("parts-fit-panel")).toBeNull();
    expect(apiMock.findParts).not.toHaveBeenCalled();
  });
});

describe("LC-15 quote + Pending / Done", () => {
  it("shows the garage quote (not paid), the quoted total, and Pending selected; Done opens the log", async () => {
    const quoted: FoundWorkItem = { ...rotor, quoteAmount: 12000 };
    const shockQuoted: FoundWorkItem = { ...shock, quoteAmount: 26500.5 };
    apiMock.listFoundWork.mockResolvedValue({ items: [quoted, shockQuoted] });
    const onLogItNow = vi.fn();
    render(<FoundByInspectionSection canEdit onLogItNow={onLogItNow} />);
    await waitFor(() => expect(screen.getAllByTestId("found-card-quote")).toHaveLength(2));
    expect(screen.getAllByTestId("found-card-quote")[0].textContent).toContain("Garage quote J$ 12,000");
    expect(screen.getAllByTestId("found-card-quote")[0].textContent).toContain("not paid");
    expect(screen.getByTestId("found-quoted-total").textContent).toBe("J$ 38,500.5 quoted, waiting");
    expect(screen.getAllByTestId("found-status-pending")[0].getAttribute("aria-checked")).toBe("true");
    fireEvent.click(screen.getAllByTestId("found-log-it-now")[0]);
    expect(onLogItNow).toHaveBeenCalledWith(quoted);
  });

  it("no quote: no quote line and no total", async () => {
    apiMock.listFoundWork.mockResolvedValue({ items: [rotor] });
    render(<FoundByInspectionSection canEdit onLogItNow={vi.fn()} />);
    await waitFor(() => expect(screen.getByTestId("found-card")).toBeTruthy());
    expect(screen.queryByTestId("found-card-quote")).toBeNull();
    expect(screen.queryByTestId("found-quoted-total")).toBeNull();
  });
});

describe("LC-17 Add quote / Edit quote", () => {
  it("no quote yet: Add quote; with a quote: Edit quote — both open the job's quote form for that line", async () => {
    const quoted: FoundWorkItem = { ...shock, quoteAmount: 26500 };
    apiMock.listFoundWork.mockResolvedValue({ items: [rotor, quoted] });
    const onAddToInspection = vi.fn();
    render(<FoundByInspectionSection canEdit onAddToInspection={onAddToInspection} />);
    await waitFor(() => expect(screen.getAllByTestId("found-edit-quote")).toHaveLength(2));
    const [addBtn, editBtn] = screen.getAllByTestId("found-edit-quote");
    expect(addBtn.textContent).toContain("Add quote");
    expect(screen.getByText("No garage quote yet")).toBeTruthy();
    expect(editBtn.textContent).toContain("Edit quote");
    fireEvent.click(editBtn);
    expect(onAddToInspection).toHaveBeenCalledWith(expect.objectContaining({ workOrderId: "wo-1", editLine: quoted }));
  });

  it("view only: no quote buttons", async () => {
    apiMock.listFoundWork.mockResolvedValue({ items: [{ ...rotor, quoteAmount: 5000 }] });
    render(<FoundByInspectionSection canEdit={false} onAddToInspection={vi.fn()} />);
    await waitFor(() => expect(screen.getByTestId("found-card-quote")).toBeTruthy());
    expect(screen.queryByTestId("found-edit-quote")).toBeNull();
  });
});
