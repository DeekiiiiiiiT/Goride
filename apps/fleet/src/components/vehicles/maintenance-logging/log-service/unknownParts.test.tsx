/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { cleanPartNumberInput, isUnknownPart, RoamLooksItUpLine, SourcingLine, sourcingLine } from "./unknownParts";
import { itemsUsedText } from "../serviceHistoryItems";

describe("isUnknownPart (LS-10)", () => {
  it("Other items and part types with no part picked go to Roam; supplies and picked parts don't", () => {
    expect(isUnknownPart({ itemKind: "other", partId: null })).toBe(true);
    expect(isUnknownPart({ itemKind: "part_type", partId: null })).toBe(true);
    expect(isUnknownPart({ itemKind: "part_type", partId: "p1" })).toBe(false);
    expect(isUnknownPart({ itemKind: "supply", partId: null })).toBe(false);
  });
});

describe("cleanPartNumberInput (LS-09)", () => {
  it("keeps letters, numbers and dashes, 80 at most", () => {
    expect(cleanPartNumberInput(" 89467-B1040 ")).toBe("89467-B1040");
    expect(cleanPartNumberInput("89467 b1040!")).toBe("89467b1040");
    expect(cleanPartNumberInput("x".repeat(90))).toHaveLength(80);
  });
});

describe("sourcingLine (LS-16, every send line)", () => {
  const cases: Array<[Parameters<typeof sourcingLine>[0], Parameters<typeof sourcingLine>[1], string]> = [
    ["pending", null, "Sending to Roam…"],
    ["sent", null, "Sent to Roam to add to the parts list"],
    ["merged", null, "Sent to Roam to add to the parts list"],
    ["pending", "car_not_linked", "Not sent yet: this car isn't linked to a Roam car. It will send once it is."],
    ["not_sent", "car_not_linked", "Not sent: this car isn't linked to a Roam car"],
    ["pending", "daily_limit", "Will send tomorrow (daily limit reached)"],
    ["pending", "error", "Couldn't send yet. Roam will keep trying."],
    ["not_sent", "error", "Couldn't send this part to Roam."],
    ["cancelled", null, "Not sent: this service was deleted"],
  ];
  it.each(cases)("%s + %s → %s", (state, reason, text) => {
    expect(sourcingLine(state, reason)?.text).toBe(text);
  });
  it("no outbox row → no line", () => {
    expect(sourcingLine(null, null)).toBeNull();
  });
});

describe("lines on screen", () => {
  it("the before-finishing line reads exactly as the plan says", () => {
    render(<RoamLooksItUpLine />);
    expect(screen.getByTestId("roam-looks-it-up").textContent).toContain(
      "Roam will look this part up and add it to the parts list.",
    );
  });
  it("the history line shows the words for its state", () => {
    render(<SourcingLine item={{ sourcingState: "sent", sourcingReason: null }} />);
    expect(screen.getByTestId("sourcing-line").textContent).toContain("Sent to Roam to add to the parts list");
  });
});

describe("itemsUsedText (switch off = as today)", () => {
  it("keeps today's words; the number shows in the send block instead (Stitch F8)", () => {
    expect(
      itemsUsedText(
        [{ source: "other", itemKind: "other", itemName: "Front oxygen sensor", partNumber: "89467-TEST1", qty: 1, unitCost: 9500, amount: 9500, unitLabel: "piece" }],
        "JMD",
      ),
    ).toBe("Front oxygen sensor (1 piece, J$ 9,500)");
  });
});
