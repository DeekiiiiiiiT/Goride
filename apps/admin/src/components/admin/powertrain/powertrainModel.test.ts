import { describe, expect, it } from "vitest";
import {
  FUELS,
  FUEL_LABEL,
  FUEL_PRESETS,
  POWERTRAINS,
  POWERTRAIN_LABEL,
  POWERTRAIN_PRESETS,
  describeList,
  disagreementText,
  presetFor,
  rowFromSaved,
  rowToSave,
  workedOutFrom,
} from "./powertrainModel";

describe("powertrain presets", () => {
  it("names saved lists by preset, in any order", () => {
    expect(presetFor(null, POWERTRAIN_PRESETS)).toBe("all");
    expect(presetFor(["erev", "ice", "mhev", "hev", "phev"], POWERTRAIN_PRESETS)).toBe("combustion");
    expect(presetFor(["hev", "phev", "erev", "bev", "fcev"], POWERTRAIN_PRESETS)).toBe("electrified");
    expect(presetFor(["phev", "erev", "bev"], POWERTRAIN_PRESETS)).toBe("plugin");
    expect(presetFor(["hev", "phev"], POWERTRAIN_PRESETS)).toBe("custom");
    expect(presetFor(["petrol", "cng"], FUEL_PRESETS)).toBe("spark");
  });

  it("describes lists in plain words", () => {
    expect(describeList(null, POWERTRAIN_PRESETS, POWERTRAIN_LABEL)).toBe("All cars");
    expect(describeList(["ice"], POWERTRAIN_PRESETS, POWERTRAIN_LABEL)).toBe("Petrol / diesel engine");
    expect(describeList(["diesel"], FUEL_PRESETS, FUEL_LABEL)).toBe("Diesel");
  });
});

describe("job vs group rows (audit 4: 'All' on a job is the full list)", () => {
  it("a job's NULL reads as Same as group and saves NULL", () => {
    const row = rowFromSaved(null, POWERTRAINS, false);
    expect(row.inherit).toBe(true);
    expect(rowToSave(row, POWERTRAINS, false)).toBeNull();
  });

  it("All on a job saves the full code list, never NULL", () => {
    const row = { inherit: false, codes: [...POWERTRAINS] };
    expect(rowToSave(row, POWERTRAINS, false)).toEqual([...POWERTRAINS]);
    // and reads back as the "all" preset
    expect(presetFor(rowToSave(row, POWERTRAINS, false), POWERTRAIN_PRESETS)).toBe("all");
  });

  it("All on a group saves NULL (= any car)", () => {
    expect(rowToSave({ inherit: false, codes: [...FUELS] }, FUELS, true)).toBeNull();
    expect(rowFromSaved(null, FUELS, true)).toEqual({ inherit: false, codes: [...FUELS] });
  });

  it("nothing ticked can't be saved; codes are kept in canonical order", () => {
    expect(rowToSave({ inherit: false, codes: [] }, POWERTRAINS, false)).toBeUndefined();
    expect(rowToSave({ inherit: false, codes: ["bev", "ice"] }, POWERTRAINS, false)).toEqual(["ice", "bev"]);
  });
});

describe("powertrain-to-check text", () => {
  it("names the disagreement only for the Gas hybrids (3a rule 2)", () => {
    expect(disagreementText("Hybrid(petrol)", "Gas")).toBe(
      "The data disagrees: fuel type says Hybrid(petrol), category says Gas.",
    );
    expect(disagreementText("Hybrid(petrol)", "Hybrid")).toBeNull();
    expect(disagreementText(null, null)).toBeNull();
  });

  it("says what the rule read", () => {
    expect(workedOutFrom("Hybrid(petrol)", "PHEV")).toBe("Worked out from 'Hybrid(petrol) / PHEV'");
    expect(workedOutFrom("Petrol", null)).toBe("Worked out from 'Petrol'");
    expect(workedOutFrom(null, "")).toBe("Worked out from the car's record");
  });
});
