import { describe, expect, it } from "vitest";
import type { MaintenanceServiceCategory } from "../../../../types/maintenance";
import { fitOf, groupFitCounts, isNotUsual, jobFitFromResponse, powertrainPill, splitByFit } from "./jobFit";

const job = (id: string, parent: string) => ({ id, parent_id: parent }) as MaintenanceServiceCategory;

describe("jobFitFromResponse", () => {
  it("no jobFit in the answer = flag off (done-test 11: today's screen)", () => {
    expect(jobFitFromResponse({ items: [{ id: "a" }] })).toEqual({ status: "off" });
  });

  it("error status = show every job + Couldn't check", () => {
    expect(jobFitFromResponse({ items: [], jobFit: { status: "error" } })).toEqual({ status: "error" });
  });

  it("reads each job's answer", () => {
    const s = jobFitFromResponse({
      items: [{ id: "oil", fits: "yes" }, { id: "port", fits: "no" }, { id: "x", fits: "maybe" }],
      jobFit: { status: "known", powertrain: "ice", fuel: "petrol" },
    });
    expect(fitOf(s, "oil")).toBe("yes");
    expect(fitOf(s, "port")).toBe("no");
    expect(fitOf(s, "x")).toBe("unknown");
    expect(fitOf(s, "missing")).toBe("unknown");
  });
});

describe("hiding (PT-1 / PT-7)", () => {
  const known = jobFitFromResponse({
    items: [{ id: "oil", fits: "yes" }, { id: "port", fits: "no" }, { id: "cable", fits: "no" }],
    jobFit: { status: "known", powertrain: "ice", fuel: "petrol" },
  });
  const unknown = jobFitFromResponse({
    items: [{ id: "oil", fits: "unknown" }, { id: "port", fits: "unknown" }],
    jobFit: { status: "unknown" },
  });

  it("hides only 'no' answers on a known car", () => {
    expect(isNotUsual(known, "port")).toBe(true);
    expect(isNotUsual(known, "oil")).toBe(false);
  });

  it("never hides on an unknown car, an error or with the flag off (done-tests 6, 13)", () => {
    expect(isNotUsual(unknown, "port")).toBe(false);
    expect(isNotUsual({ status: "error" }, "port")).toBe(false);
    expect(isNotUsual({ status: "off" }, "port")).toBe(false);
  });

  it("counts hidden JOBS per group (Show all jobs (N hidden))", () => {
    const jobs = [job("oil", "engine"), job("port", "hybrid"), job("cable", "hybrid")];
    expect(groupFitCounts(known, "hybrid", jobs)).toEqual({ fit: 0, hidden: 2 });
    expect(groupFitCounts(known, "engine", jobs)).toEqual({ fit: 1, hidden: 0 });
    expect(groupFitCounts(unknown, "hybrid", jobs)).toEqual({ fit: 2, hidden: 0 });
  });

  it("splits a list", () => {
    const { usual, notUsual } = splitByFit(known, [{ id: "oil" }, { id: "port" }]);
    expect(usual.map((x) => x.id)).toEqual(["oil"]);
    expect(notUsual.map((x) => x.id)).toEqual(["port"]);
  });
});

describe("powertrain pill", () => {
  const pill = (powertrain: string | null, fuel: string | null, status: "known" | "unknown" = "known") =>
    powertrainPill({ status, powertrain, fuel, fits: new Map() });

  it("plain names", () => {
    expect(pill("ice", "petrol")).toBe("Petrol");
    expect(pill("ice", "diesel")).toBe("Diesel");
    expect(pill("hev", "petrol")).toBe("Hybrid");
    expect(pill("bev", "electric")).toBe("Electric");
    expect(pill(null, null, "unknown")).toBe("Engine type unknown");
  });

  it("no pill while off, loading or after an error", () => {
    expect(powertrainPill({ status: "off" })).toBeNull();
    expect(powertrainPill({ status: "loading" })).toBeNull();
    expect(powertrainPill({ status: "error" })).toBeNull();
  });
});
