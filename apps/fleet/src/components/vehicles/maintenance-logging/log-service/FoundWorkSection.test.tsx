/**
 * @vitest-environment jsdom
 */
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { MaintenanceLogLine, MaintenanceServiceCategory } from "../../../../types/maintenance";
import {
  AddFoundJobDialog,
  FoundCollapsedInspectionRow,
  FoundFromInspectionBanner,
  FoundWorkSection,
  ReviewFoundGroup,
} from "./FoundWorkSection";
import { LogServiceReviewStep } from "./LogServiceReviewStep";
import type { FoundDraft, FoundPickerHit } from "./foundWork";

const drafts: FoundDraft[] = [
  { jobId: "wiper", name: "Wiper Blades", mode: "today", note: "" },
  { jobId: "rotor", name: "Brake rotor", mode: "later", note: "Front rotors worn, replace within 2 weeks" },
  { jobId: "shock", name: "Shock absorber", mode: "later", note: "Rear left leaking" },
];

function section(over: Partial<Parameters<typeof FoundWorkSection>[0]> = {}) {
  const props = {
    drafts,
    currency: "JMD",
    onAdd: vi.fn(),
    onModeChange: vi.fn(),
    onNoteChange: vi.fn(),
    onRemove: vi.fn(),
    ...over,
  };
  render(<FoundWorkSection {...props} />);
  return props;
}

describe("What the inspection found (Stitch screens 1 and 3)", () => {
  it("empty: one line and the Add job button", () => {
    const p = section({ drafts: [] });
    expect(screen.getByText("What the inspection found")).toBeInTheDocument();
    expect(screen.getByTestId("found-work-empty")).toHaveTextContent("Nothing added yet.");
    fireEvent.click(screen.getByTestId("found-add-job"));
    expect(p.onAdd).toHaveBeenCalledTimes(1);
  });

  it("three jobs: Done today has the helper, Not done yet has the note and J$ 0", () => {
    section();
    const rows = screen.getAllByTestId("found-work-row");
    expect(rows).toHaveLength(3);
    expect(within(rows[0]).getByText("Will be added as its own job below, with its cost and parts")).toBeInTheDocument();
    expect(within(rows[0]).queryByTestId("found-note")).toBeNull();
    expect(within(rows[0]).queryByText(/not charged/)).toBeNull();
    expect(within(rows[1]).getByTestId("found-note")).toHaveValue("Front rotors worn, replace within 2 weeks");
    expect(within(rows[1]).getByText("J$ 0 · not charged")).toBeInTheDocument();
    expect(within(rows[0]).getByTestId("found-mode-today")).toHaveAttribute("aria-checked", "true");
    expect(within(rows[1]).getByTestId("found-mode-later")).toHaveAttribute("aria-checked", "true");
    expect(screen.getByTestId("found-work-summary")).toHaveTextContent(
      "1 done today · 2 not done yet (kept on the car's list)",
    );
  });

  it("switch, note and remove call back with the job", () => {
    const p = section();
    const rows = screen.getAllByTestId("found-work-row");
    fireEvent.click(within(rows[1]).getByTestId("found-mode-today"));
    expect(p.onModeChange).toHaveBeenCalledWith("rotor", "today");
    fireEvent.change(within(rows[2]).getByTestId("found-note"), { target: { value: "Leaking badly" } });
    expect(p.onNoteChange).toHaveBeenCalledWith("shock", "Leaking badly");
    fireEvent.click(within(rows[2]).getByTestId("found-remove"));
    expect(p.onRemove).toHaveBeenCalledWith("shock");
  });
});

describe("Add a job the inspection found (Stitch screen 2)", () => {
  const job = (id: string, name: string) =>
    ({ id, name, code: id, icon_key: "brakes", parent_id: "brakes" }) as MaintenanceServiceCategory;
  const hits: FoundPickerHit[] = [
    { job: job("rotor", "Brake rotor"), groupName: "Brakes" },
    { job: job("caliper", "Brake caliper"), groupName: "Brakes" },
  ];

  it("searches, counts jobs, shows Added for jobs already in the list, and adds", () => {
    const onAdd = vi.fn();
    const search = vi.fn((q: string) => (q.trim() ? hits : []));
    render(<AddFoundJobDialog open onOpenChange={vi.fn()} search={search} addedIds={new Set(["caliper"])} onAdd={onAdd} />);
    expect(screen.getByText("Type a job name to search all jobs.")).toBeInTheDocument();
    fireEvent.change(screen.getByTestId("found-picker-search"), { target: { value: "brake" } });
    // Group heading + each row's group line (descriptions Stitch invented are not shown).
    expect(screen.getAllByText("Brakes")).toHaveLength(3);
    expect(screen.getByText("2 jobs")).toBeInTheDocument();
    const rows = screen.getAllByTestId("found-picker-row");
    expect(within(rows[1]).getByTestId("found-picker-added")).toHaveTextContent("Added");
    fireEvent.click(within(rows[0]).getByTestId("found-picker-add"));
    expect(onAdd).toHaveBeenCalledWith(hits[0].job);
    // Stitch invented these; they must not be built (audit section 8, screen 2 Drop list).
    expect(screen.queryByText(/OEM Standard Freight Rates/)).toBeNull();
    expect(screen.queryByText(/PRIORITY/i)).toBeNull();
    expect(screen.getByText("Can't find it? Use + Other item on the job instead.")).toBeInTheDocument();
  });

  it("says so when nothing matches", () => {
    render(<AddFoundJobDialog open onOpenChange={vi.fn()} search={() => []} addedIds={new Set()} onAdd={vi.fn()} />);
    fireEvent.change(screen.getByTestId("found-picker-search"), { target: { value: "zzz" } });
    expect(screen.getByText("No jobs match that search.")).toBeInTheDocument();
  });
});

describe("Collapsed inspection row and Log it now banner (Stitch screens 4 and 10)", () => {
  it("collapsed row: name, amount, amber found chip, Edit", () => {
    const onEdit = vi.fn();
    render(<FoundCollapsedInspectionRow name="Inspection / diagnostic fee" amountLabel="J$ 8,000" foundCount={2} onEdit={onEdit} />);
    expect(screen.getByTestId("found-collapsed-row")).toHaveTextContent("Inspection / diagnostic fee· J$ 8,0002 found, not done yet");
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(onEdit).toHaveBeenCalled();
  });

  it("no chip when nothing was found", () => {
    render(<FoundCollapsedInspectionRow name="Inspection / diagnostic fee" amountLabel="J$ 8,000" foundCount={0} onEdit={vi.fn()} />);
    expect(screen.queryByTestId("found-collapsed-chip")).toBeNull();
  });

  it("banner shows the note without Stitch's invented prefix", () => {
    render(
      <FoundFromInspectionBanner
        text="From inspection on 17 Nov 2026 · Inspection / diagnostic fee at Northside Auto"
        note="Front rotors worn, replace within 2 weeks"
      />,
    );
    expect(screen.getByTestId("found-banner")).toHaveTextContent("Front rotors worn, replace within 2 weeks");
    expect(screen.queryByText(/Garage discovery note/)).toBeNull();
  });
});

describe("Review: Found, not done yet (Stitch screen 5)", () => {
  const reviewLines: MaintenanceLogLine[] = [
    { categoryId: "insp", categoryCode: "insp", categoryName: "Inspection / diagnostic fee", labor: 8000 },
    { categoryId: "wiper", categoryCode: "wiper", categoryName: "Wiper Blades", labor: 3300, values: { found_today: true } },
    { categoryId: "rotor", categoryCode: "rotor", categoryName: "Brake rotor", recommended: true, notes: "Front rotors worn" },
    { categoryId: "shock", categoryCode: "shock", categoryName: "Shock absorber", recommended: true, notes: "Rear left leaking" },
  ];

  it("found jobs leave the job list for the amber group, J$ 0, removable; Wiper Blades has the chip", () => {
    const onRemove = vi.fn();
    render(
      <LogServiceReviewStep
        baySessionLabel="X"
        date="2026-11-17"
        odometer={198807}
        provider="Northside Auto"
        currency="JMD"
        notes=""
        invoiceUrl=""
        scanLoading={false}
        onDateChange={vi.fn()}
        onOdometerChange={vi.fn()}
        onProviderChange={vi.fn()}
        onCurrencyChange={vi.fn()}
        onNotesChange={vi.fn()}
        onScanFile={vi.fn()}
        lines={reviewLines}
        lineTotalPreview={(l) => (l.recommended ? 0 : Number(l.labor ?? 0))}
        subtotal={11300}
        netTotal={11300}
        onEditLine={vi.fn()}
        showMarkPackageComplete={false}
        markPackageComplete={false}
        onMarkPackageCompleteChange={vi.fn()}
        onRemoveFoundLine={onRemove}
      />,
    );
    expect(screen.getAllByTestId("log-service-review-job")).toHaveLength(2);
    expect(screen.getByTestId("log-service-review-summary")).toHaveTextContent("2 jobs");
    expect(screen.getByTestId("log-service-review-summary")).toHaveTextContent("J$ 11,300");
    expect(screen.getByTestId("review-found-not-charged")).toHaveTextContent("2 found jobs not charged (J$ 0)");
    const group = screen.getByTestId("review-found-group");
    expect(within(group).getByText("Found, not done yet")).toBeInTheDocument();
    const rows = within(group).getAllByTestId("review-found-row");
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText("Front rotors worn")).toBeInTheDocument();
    expect(within(rows[0]).getByText("J$ 0 · not charged")).toBeInTheDocument();
    fireEvent.click(within(rows[1]).getByTestId("review-found-remove"));
    expect(onRemove).toHaveBeenCalledWith(reviewLines[3]);
    expect(screen.getAllByTestId("from-inspection-chip")).toHaveLength(1);
  });

  it("nothing found → no amber group", () => {
    render(<ReviewFoundGroup lines={[]} currency="JMD" onRemove={vi.fn()} />);
    expect(screen.queryByTestId("review-found-group")).toBeNull();
  });
});
