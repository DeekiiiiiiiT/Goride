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
    expect(screen.getByTestId("found-log-it-now").className).toContain("w-full");
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
