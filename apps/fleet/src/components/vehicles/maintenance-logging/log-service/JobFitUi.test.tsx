/**
 * @vitest-environment jsdom
 *
 * Screen tests for the powertrain job fit Stitch port (docs/powertrain-job-fit-audit.md section 9, Fleet 01–10;
 * owner's picks 15 Nov: screen 01 group tiles, screen 03 job rows).
 */
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LogServiceWhatWasDoneStep } from "./LogServiceWhatWasDoneStep";
import { LogServiceSystemPicker } from "./LogServiceSystemPicker";
import { LogServiceWizardChrome } from "./LogServiceWizardChrome";
import type { FitAnswer, JobFitState } from "./jobFit";

const groups = [
  { id: "eng", code: "engine", name: "Engine", icon_key: "engine", parent_id: null, description: "" },
  { id: "exh", code: "exhaust", name: "Exhaust & emissions", icon_key: "exhaust", parent_id: null, description: "" },
  { id: "hyb", code: "hybrid", name: "Hybrid & electric", icon_key: "bolt", parent_id: null, description: "" },
] as never[];
const job = (id: string, parent: string, name: string, hv = false) =>
  ({ id, code: id, name, parent_id: parent, icon_key: "wrench", default_action: "replace", description: `${name} desc`, is_high_voltage: hv }) as never;
const jobs = [
  job("e1", "eng", "Spark Plugs"),
  job("x1", "exh", "Muffler"),
  job("x2", "exh", "Glow Plugs"),
  job("h1", "hyb", "Charging Port", true),
];
const fits = new Map<string, FitAnswer>([
  ["e1", "yes"],
  ["x1", "yes"],
  ["x2", "no"],
  ["h1", "no"],
]);
const petrol: JobFitState = { status: "known", powertrain: "ice", fuel: "petrol", fits };

const step2 = (jobFit: JobFitState, extra: Partial<React.ComponentProps<typeof LogServiceWhatWasDoneStep>> = {}) =>
  render(
    <LogServiceWhatWasDoneStep
      packages={[]}
      quickJobs={groups}
      allJobs={jobs}
      allSystems={groups}
      quickJobsLoading={false}
      onPickPackage={vi.fn()}
      onPickSystem={vi.fn()}
      onOpenInspection={vi.fn()}
      jobFit={jobFit}
      onToggleShowAllJobs={vi.fn()}
      {...extra}
    />,
  );

describe("Fleet step 2 petrol (tabs, nothing picked)", () => {
  it("shows the job search, removes the empty group, shows the tabs and Pick a group, and offers Show all with N hidden jobs", () => {
    step2(petrol);
    expect(screen.getByTestId("log-service-job-search")).toBeTruthy();
    expect(screen.queryByTestId("banner-fit")).toBeNull();
    expect(screen.queryByTestId("group-tab-hybrid")).toBeNull();
    expect(screen.getByTestId("caption-groups-removed").textContent).toContain("Hybrid & electric");
    expect(screen.getByTestId("group-tab-exhaust")).toBeTruthy();
    expect(screen.getByTestId("group-jobs-panel").textContent).toContain("Pick a group");
    expect(screen.getByTestId("show-all-jobs").textContent).toBe("Show all jobs (2 hidden)");
  });

  it("flag off: no fit strip, every group, no Show all", () => {
    step2({ status: "off" });
    expect(screen.getByTestId("log-service-job-search")).toBeTruthy();
    expect(screen.queryByTestId("show-all-jobs")).toBeNull();
    expect(screen.getByTestId("group-tab-exhaust")).toBeTruthy();
    expect(screen.getByTestId("group-tab-hybrid")).toBeTruthy();
  });
});

describe("Fleet 05 / 09: unknown engine, couldn't check, loading", () => {
  it("unknown: banner with a Link this car button, every group shown, nothing hidden", () => {
    const onLinkCar = vi.fn();
    step2({ status: "unknown", powertrain: null, fuel: null, fits: new Map() }, { onLinkCar });
    fireEvent.click(screen.getByRole("button", { name: /Link this car/ }));
    expect(onLinkCar).toHaveBeenCalled();
    expect(screen.getByTestId("group-tab-hybrid")).toBeTruthy();
    expect(screen.queryByTestId("show-all-jobs")).toBeNull();
  });

  it("couldn't check: banner with Try again", () => {
    const onRetryJobFit = vi.fn();
    step2({ status: "error" }, { onRetryJobFit });
    fireEvent.click(screen.getByRole("button", { name: /Try again/ }));
    expect(onRetryJobFit).toHaveBeenCalled();
  });

  it("loading: shimmer tiles", () => {
    step2({ status: "loading" });
    expect(screen.getByTestId("group-grid-loading")).toBeTruthy();
  });
});

describe("Fleet 02 / 03: inside a group", () => {
  const picker = (showAll: boolean, selectedIds: string[] = []) =>
    render(
      <LogServiceSystemPicker
        system={groups[1]}
        components={[jobs[1], jobs[2]]}
        loading={false}
        selectedIds={selectedIds}
        isAdded={() => false}
        onToggleComponent={vi.fn()}
        onToggleRelated={vi.fn()}
        jobFit={petrol}
        showAll={showAll}
        onToggleShowAll={vi.fn()}
      />,
    );

  it("hides the job that doesn't fit and says how many", () => {
    picker(false);
    expect(screen.getByTestId("log-job-x1")).toBeTruthy();
    expect(screen.queryByTestId("log-job-x2")).toBeNull();
    expect(screen.getByTestId("show-all-jobs").textContent).toBe("Show all jobs in this group (1 hidden)");
    expect(screen.getByTestId("group-fit-pill").textContent).toContain("1 hidden");
  });

  it("Show all: grey strip + grey chip, still tickable, button reads Hide jobs that don't fit", () => {
    picker(true);
    expect(screen.getByTestId("log-job-x2")).toBeTruthy();
    expect(screen.getAllByTestId("chip-not-usual").length).toBeGreaterThan(0);
    expect(screen.getByTestId("show-all-jobs").textContent).toBe("Hide jobs that don't fit");
  });

  it("a ticked hidden job stays in the list with its chip", () => {
    picker(false, ["x2"]);
    expect(screen.getByTestId("log-job-x2").getAttribute("aria-pressed")).toBe("true");
  });
});

describe("Car strip pill", () => {
  it("shows the powertrain pill", () => {
    render(
      <LogServiceWizardChrome activeStep={2} vehicle={{ vehicleLabel: "Honda Fit", powertrainLabel: "Hybrid" }} onClose={vi.fn()}>
        <div />
      </LogServiceWizardChrome>,
    );
    expect(screen.getByTestId("powertrain-pill").textContent).toBe("Hybrid");
  });
});
