import { describe, expect, it } from "vitest";
import type { Job, JobsPayload, MayNeedItem, Supply } from "./jobsApi";
import {
  inMayNeed,
  jobsUsingSupply,
  matchesQuery,
  parseQtyHint,
  partTypeSubLine,
  pickerBlockReason,
  qtyLabel,
  supplyCounts,
} from "./mayNeedModel";

const item = (extra: Partial<MayNeedItem>): MayNeedItem => ({
  linkId: "l1",
  kind: "supply",
  itemId: "s1",
  name: "Throttle body cleaner",
  need: "usually",
  qtyHint: 1,
  note: null,
  sortOrder: 10,
  itemRetired: false,
  unitLabelOne: "can",
  unitLabelMany: "cans",
  ...extra,
});

const job = (id: string, extra: Partial<Job> = {}): Job => ({
  id,
  code: id,
  opCode: null,
  name: id,
  description: "d",
  iconKey: "wrench",
  isPart: false,
  defaultAction: "clean",
  homeGroupId: "g1",
  status: "active",
  used: false,
  alsoDo: [],
  suggestedBy: [],
  items: [],
  ...extra,
});

const supply = (id: string, status: "active" | "retired"): Supply => ({
  id,
  code: "SUP-00001",
  name: id,
  description: "d",
  iconKey: "wrench",
  unitId: "u1",
  unitCode: "can",
  status,
  usedOnJobs: 0,
});

describe("pickerBlockReason", () => {
  const tbc = job("tbc", {
    items: [item({ kind: "supply", itemId: "cleaner" }), item({ kind: "part_type", itemId: "gasket", linkId: "l2" })],
    alsoDo: [{ relationId: "r1", jobId: "relearn", jobName: "Relearn", note: "n" }],
  });
  it("blocks an item already in May need", () => {
    expect(pickerBlockReason(tbc, "supply", "cleaner")).toBe("Already listed");
    expect(pickerBlockReason(tbc, "part_type", "gasket")).toBe("Already listed");
  });
  it("blocks a part type already in Also do", () => {
    expect(pickerBlockReason(tbc, "part_type", "relearn")).toBe("Already in Also do");
  });
  it("allows a new item, and a supply id never matches Also do", () => {
    expect(pickerBlockReason(tbc, "part_type", "manifold")).toBeNull();
    expect(pickerBlockReason(tbc, "supply", "relearn")).toBeNull();
  });
  it("inMayNeed sees part types only", () => {
    expect(inMayNeed(tbc, "gasket")).toBe(true);
    expect(inMayNeed(tbc, "cleaner")).toBe(false);
    expect(inMayNeed(null, "gasket")).toBe(false);
  });
});

describe("qtyLabel", () => {
  it("uses the unit's one / many label", () => {
    expect(qtyLabel(item({ qtyHint: 1 }))).toBe("1 can");
    expect(qtyLabel(item({ qtyHint: 2 }))).toBe("2 cans");
    expect(qtyLabel(item({ qtyHint: 0.5 }))).toBe("0.5 cans");
  });
  it("part types use piece / pieces; no hint → null", () => {
    expect(qtyLabel(item({ kind: "part_type", qtyHint: 1, unitLabelOne: undefined, unitLabelMany: undefined }))).toBe("1 piece");
    expect(qtyLabel(item({ kind: "part_type", qtyHint: 4, unitLabelOne: undefined, unitLabelMany: undefined }))).toBe("4 pieces");
    expect(qtyLabel(item({ qtyHint: null }))).toBeNull();
  });
});

describe("parseQtyHint", () => {
  it("blank is no hint", () => expect(parseQtyHint("  ")).toEqual({ ok: true, value: null }));
  it("accepts up to 3 decimals", () => expect(parseQtyHint("1.5")).toEqual({ ok: true, value: 1.5 }));
  it("refuses 4 decimals", () => expect(parseQtyHint("1.2345").ok).toBe(false));
  it("refuses zero and text", () => {
    expect(parseQtyHint("0").ok).toBe(false);
    expect(parseQtyHint("abc").ok).toBe(false);
  });
});

describe("supplies", () => {
  const data = {
    groups: [{ id: "g1", code: "engine", name: "Engine", iconKey: null }],
    sectionGroups: [
      {
        id: "sg1",
        groupId: "g1",
        code: "x",
        name: "Engine",
        sortOrder: 10,
        sections: [
          { id: "s1", sectionGroupId: "sg1", groupId: "g1", code: "air", name: "Air intake", description: "", iconKey: "wind", sortOrder: 10, jobIds: ["gasket"] },
        ],
      },
    ],
    jobs: [
      job("b", { name: "B job", items: [item({ itemId: "cleaner" })] }),
      job("a", { name: "A job", items: [item({ itemId: "cleaner" })] }),
      job("c", { name: "C job" }),
      job("gasket", { name: "Gasket", isPart: true }),
    ],
    supplies: [supply("x", "active"), supply("y", "retired"), supply("z", "active")],
    units: [],
  } as JobsPayload;

  it("jobsUsingSupply lists jobs by name", () => {
    expect(jobsUsingSupply(data, "cleaner").map((j) => j.name)).toEqual(["A job", "B job"]);
  });
  it("partTypeSubLine is home group · section", () => {
    expect(partTypeSubLine(data, data.jobs[3])).toBe("Engine · Air intake");
    expect(partTypeSubLine(data, data.jobs[2])).toBe("Engine");
  });
  it("supplyCounts splits active / retired", () => {
    expect(supplyCounts(data.supplies)).toEqual({ active: 2, retired: 1 });
  });
  it("matchesQuery ignores case and checks every field", () => {
    expect(matchesQuery("SUP-0", "Brake cleaner", "SUP-00004")).toBe(true);
    expect(matchesQuery("zzz", "Brake cleaner", "SUP-00004")).toBe(false);
    expect(matchesQuery("", "anything")).toBe(true);
  });
});
