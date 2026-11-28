import { describe, expect, it } from "vitest";
import { checkProblem, reportPayload, reportProblem, reportSummary, safetyFails, stoppedAtText, telHref, type CheckState } from "./carServiceModel";

describe("Report a problem (maintenance step 13)", () => {
  it("needs what's wrong and how soon; sends the type, priority, words and photo", () => {
    expect(reportProblem({ category: "", urgency: "Soon", text: "", photoUrl: null })).toBe("Pick what's wrong.");
    const d = { category: "Brakes", urgency: "Soon", text: " Squeak from the front when braking ", photoUrl: "https://x/p.jpg" };
    expect(reportProblem(d)).toBeNull();
    expect(reportPayload(d, "5179KZ", 200932)).toEqual({
      vehicleId: "5179KZ", type: "Brakes", category: "Brakes", priority: "Medium",
      description: "Squeak from the front when braking", photoUrl: "https://x/p.jpg", odometer: 200932,
    });
    expect(reportPayload({ ...d, urgency: "Can't drive it" }, null, null).priority).toBe("Urgent");
    expect(reportSummary(d)).toBe("Brakes · Soon · 'Squeak from the front when braking'");
  });

  it("phone and time words", () => {
    expect(telHref("(876) 555-0100")).toBe("tel:8765550100");
    expect(telHref("")).toBeNull();
    expect(stoppedAtText(null)).toBeNull();
  });
});

describe("Pre-shift check (maintenance step 13, MER-17)", () => {
  const items = [
    { key: "a", label: "Brakes", safety: true },
    { key: "b", label: "Horn", safety: false },
  ];
  const ok = (answer: CheckState["answer"], photoUrl: string | null = null): CheckState => ({ answer, notes: "", photoUrl });

  it("every item must be answered; nothing is pre-ticked", () => {
    expect(checkProblem("200964", items, {}, 200932)).toBe("Answer all 2 items to send");
    expect(checkProblem("", items, { a: ok("pass"), b: ok("pass") }, null)).toBe("Type the odometer.");
    expect(checkProblem("100", items, { a: ok("pass"), b: ok("pass") }, 200932)).toMatch(/can't be less than the last reading/);
    expect(checkProblem("200,964", items, { a: ok("pass"), b: ok("pass") }, 200932)).toBeNull();
  });

  it("a failed item needs a photo; a failed safety item stops the car", () => {
    const state = { a: ok("fail"), b: ok("pass") };
    expect(checkProblem("200964", items, state, null)).toBe("Add a photo for Brakes.");
    expect(safetyFails(items, { a: ok("fail", "p"), b: ok("fail", "p") }).map((i) => i.label)).toEqual(["Brakes"]);
  });
});
