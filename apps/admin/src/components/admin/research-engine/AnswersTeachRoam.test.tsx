/**
 * @vitest-environment jsdom
 *
 * Answers teach Roam (docs/answers-teach-roam-audit.md §5.1 / §5.3, Stitch docs/stitch/answers-teach-roam-dominion/):
 * the question cards on the saved-page result, the "Saved N rows using your earlier answers" line, and the
 * "Learned from you" list with Undo. Made-up numbers only (the repo is public).
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const research = vi.hoisted(() => ({
  savedPage: vi.fn(),
  savedPageWithPictures: vi.fn(),
  uploadSavedPage: vi.fn(),
  savedPages: vi.fn(),
  savedPagePartType: vi.fn(),
  partNames: vi.fn(),
  trackPartName: vi.fn(),
  skipPartName: vi.fn(),
  answerQuestion: vi.fn(),
  lessons: vi.fn(),
  forgetLesson: vi.fn(),
}));
vi.mock("../../../services/researchEngineService", () => ({ researchApi: research }));
const pictures = vi.hoisted(() => ({ listTemplates: vi.fn() }));
vi.mock("../part-pictures/partPicturesApi", () => pictures);

import { SavedPageOverlay } from "./SavedPageOverlay";
import { LearnedFromYou } from "./LearnedFromYou";
import { placeWords, questionChoices } from "./QuestionCard";

const HEADING = "48609A - SUPPORT SUB-ASSY, FRONT SUSPENSION";
const LINE = "Genuine Testmake 77777-S1001 - Support sub-assy, front suspension 77777-S1001 | M900,910 | 11.2016 - 09.2020 | 02";

const questionRow = (over: Record<string, unknown> = {}) => ({
  partType: "Strut mount",
  place: "front",
  number: "77777-S1001",
  dates: "11.2016 – 09.2020",
  group: "held",
  reason: "The page doesn't name this part type on that row",
  jobId: "job-1",
  lineNo: 12,
  groupLine: HEADING,
  lineText: LINE,
  question: { kind: "wording", typeIds: ["t-strut"], typeNames: ["Strut mount"], answer: null },
  ...over,
});

const page = (rows: unknown[], over: Record<string, unknown> = {}) => ({
  id: "sp-1",
  vehicle_catalog_id: "car-1",
  job_id: null,
  domain: "catalog.example",
  source_url: "https://catalog.example/p",
  file_name: "page.mhtml",
  status: "done",
  stop_reason: null,
  created_at: "2026-11-27T10:00:00Z",
  result: {
    counts: {
      saved: rows.filter((r) => (r as { group: string }).group === "saved").length,
      already: 0,
      held: rows.filter((r) => (r as { group: string }).group === "held").length,
      not_roam_type: 0,
    },
    rows,
    suggestions: [],
    ...over,
  },
});

function show(p: unknown, owner = true) {
  research.savedPage.mockResolvedValue(p);
  research.savedPageWithPictures.mockResolvedValue({ savedPage: p, picturesAiOn: false });
  return render(
    <SavedPageOverlay token="t" carId="car-1" carLabel="Testmake Testmodel" savedPageId="sp-1" owner={owner} onClose={() => {}} onChanged={() => {}} onCheckPart={() => {}} />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  pictures.listTemplates.mockResolvedValue([]);
});
afterEach(cleanup);

describe("question card (§5.1)", () => {
  it("shows what Roam read, then asks one thing (Stitch screen 1)", async () => {
    show(page([questionRow()]));
    const card = await screen.findByTestId("question-card");
    expect(within(card).getByTestId("question-title").textContent).toBe("Strut mount · Front");
    expect(within(card).getByTestId("question-heading").textContent).toBe(HEADING);
    expect(within(card).getByTestId("question-row-text").textContent).toBe(LINE);
    expect(within(card).getByTestId("question-number").textContent).toBe("77777-S1001");
    expect(within(card).getByTestId("question-ask").textContent).toBe("Is this the Strut mount?");
    expect(within(card).getByTestId("question-answer-yes").textContent).toMatch(/Yes, it's the Strut mount/);
    expect(within(card).getByTestId("question-answer-no").textContent).toMatch(/No, it's something else/);
  });

  it("Yes sends the answer, then redraws from the server: the answered line (Stitch screen 2)", async () => {
    const answered = page([
      questionRow({ group: "saved", reason: null, place: "front both", question: { kind: "wording", typeIds: ["t-strut"], typeNames: ["Strut mount"], answer: "yes", note: "Roam will remember 'SUPPORT SUB-ASSY, FRONT SUSPENSION' for Testmake." } }),
    ]);
    show(page([questionRow()]));
    research.answerQuestion.mockResolvedValue({ result: answered.result, message: null });
    const yes = await screen.findByTestId("question-answer-yes");
    // The overlay re-reads the page after the answer.
    research.savedPageWithPictures.mockResolvedValue({ savedPage: answered, picturesAiOn: false });
    fireEvent.click(yes);
    await waitFor(() => expect(research.answerQuestion).toHaveBeenCalledWith("t", "sp-1", 12, { yes: true }));
    await waitFor(() => expect(screen.getByTestId("question-answered").getAttribute("data-answer")).toBe("yes"));
    expect(screen.getByTestId("question-answered").textContent).toMatch(/Saved 77777-S1001 · Front, both sides/);
    expect(screen.getByTestId("question-answered").textContent).toMatch(/Roam will remember 'SUPPORT SUB-ASSY, FRONT SUSPENSION' for Testmake\./);
  });

  it("a failed save shows the red line and the buttons come back (Stitch screen 5)", async () => {
    show(page([questionRow({ question: { kind: "side", typeIds: ["t-strut"], typeNames: ["Strut mount"], answer: null } })]));
    research.answerQuestion.mockRejectedValue(new Error("down"));
    fireEvent.click(await screen.findByTestId("question-answer-both"));
    await waitFor(() => expect(screen.getByTestId("question-error").textContent).toMatch(/That didn't save\. Try again\./));
    expect((screen.getByTestId("question-answer-both") as HTMLButtonElement).disabled).toBe(false);
  });

  it("only the owner can answer", async () => {
    show(page([questionRow()]), false);
    const card = await screen.findByTestId("question-card");
    expect((within(card).getByTestId("question-answer-yes") as HTMLButtonElement).disabled).toBe(true);
    expect(card.textContent).toMatch(/Only the owner can answer this\./);
  });

  it("'Saved N rows using your earlier answers' and the Learned from you pill (Stitch screen 3)", async () => {
    show(page([questionRow({ group: "saved", reason: null, question: null, learned: true })], { learned: 1 }));
    expect((await screen.findByTestId("saved-page-learned")).textContent).toMatch(/Saved 1 row using your earlier answers\./);
    expect(screen.getByTestId("saved-page-learned-row").textContent).toMatch(/Learned from you/);
  });

  it("owner 27 Nov: one tab per kind of row; Needs you opens first; Skipped lists each row with its reason", async () => {
    const already = { ...questionRow({ group: "already", question: null, reason: null, number: "77777-A0001", lineNo: 3 }) };
    const skippedRow = { ...questionRow({ group: "left_for_later", question: null, reason: null, number: "77777-K0001", lineNo: 7, waitReason: "No dates shown on the page" }) };
    show(page([questionRow(), already, skippedRow], { counts: { saved: 0, already: 1, held: 1, not_roam_type: 0, left_for_later: 1 }, skipped: 1 }));
    const tabs = await screen.findByTestId("saved-page-tabs");
    expect(within(tabs).getAllByRole("tab").map((t) => t.textContent)).toEqual(["Needs you1", "Already on file1", "Skipped1"]);
    expect(screen.getByTestId("result-tab-held").getAttribute("aria-selected")).toBe("true");
    expect(screen.getByTestId("question-card")).toBeTruthy();
    expect(screen.queryByTestId("group-already")).toBeNull();
    fireEvent.click(screen.getByTestId("result-tab-already"));
    expect(screen.getByTestId("group-already").textContent).toMatch(/77777-A0001/);
    expect(screen.queryByTestId("question-card")).toBeNull();
    fireEvent.click(screen.getByTestId("result-tab-skipped"));
    expect(screen.getByTestId("saved-page-skipped").textContent).toMatch(/Roam skipped 1 row it couldn't prove from the page\./);
    expect(screen.getByTestId("group-skipped").textContent).toMatch(/77777-K0001.*No dates shown on the page/);
  });

  it("owner 27 Nov: the RH and LH rows of one heading share one card; one answer is sent for both", async () => {
    const q = { kind: "axle", typeIds: ["t-bearing"], typeNames: ["Strut mounting bearing"], answer: null };
    const rh = questionRow({ lineNo: 20, place: "right", groupLine: "48619 - BEARING, STRUT MOUNTING, RH", phraseKey: "BEARINGSTRUTMOUNTING", number: "77777-B0001", lineText: "Genuine Testmake 77777-B0001 - Bearing, strut mounting RH", question: q });
    const lh = questionRow({ lineNo: 22, place: "left", groupLine: "48619A - BEARING, STRUT MOUNTING, LH", phraseKey: "BEARINGSTRUTMOUNTING", number: "77777-B0001", lineText: "Genuine Testmake 77777-B0001 - Bearing, strut mounting LH", question: q });
    show(page([rh, lh], { counts: { saved: 0, already: 0, held: 2, not_roam_type: 0 } }));
    const cards = await screen.findAllByTestId("question-card");
    expect(cards).toHaveLength(1);
    expect(within(cards[0]).getByTestId("question-title").textContent).toBe("Strut mounting bearing");
    expect(within(cards[0]).getByTestId("question-heading").textContent).toBe("48619 - BEARING, STRUT MOUNTING");
    expect(within(cards[0]).getAllByTestId("question-row-text").map((p) => p.textContent)).toEqual([rh.lineText, lh.lineText]);
    research.answerQuestion.mockResolvedValue({ result: page([]).result, message: null });
    fireEvent.click(within(cards[0]).getByTestId("question-answer-front"));
    await waitFor(() => expect(research.answerQuestion).toHaveBeenCalledWith("t", "sp-1", 20, { axle: "front" }));
    expect(research.answerQuestion).toHaveBeenCalledTimes(1);
  });

  it("the four kinds ask their own question with their own buttons (AT-05)", () => {
    expect(questionChoices({ kind: "types", typeIds: ["t-shoes"], typeNames: ["Brake shoes"] }).choices.map((c) => c.label)).toEqual(["Brake shoes", "Something else"]);
    expect(questionChoices({ kind: "axle", typeIds: ["t"], typeNames: ["Parking brake shoe strut set"] }).ask).toBe("Where is it on the car?");
    expect(questionChoices({ kind: "side", typeIds: ["t"], typeNames: ["Strut mount"] }).choices.map((c) => c.label)).toEqual(["Left", "Right", "Both sides"]);
    expect(placeWords("front both")).toBe("Front, both sides");
    expect(placeWords("rear right")).toBe("Rear right");
  });
});

describe("Learned from you (§5.3)", () => {
  const lesson = {
    id: "l-1",
    heading: "SUPPORT SUB-ASSY, FRONT SUSPENSION",
    make: "Testmake",
    model: null,
    axle: null,
    side: null,
    typeId: "t-strut",
    typeName: "Strut mount",
    partsSaved: 2,
    answeredBy: "u-1",
    answeredAt: "2026-11-27T12:00:00Z",
  };

  it("lists each lesson; Undo asks first, then forgets it (Stitch screens 11–12)", async () => {
    research.lessons.mockResolvedValueOnce({ lessons: [lesson, { ...lesson, id: "l-2", heading: "STRUT SET, PARKING BRAKE SHOE", typeName: "Parking brake shoe strut set", model: "Testmodel", axle: "rear", partsSaved: 3 }], canUndo: true });
    render(<LearnedFromYou token="t" />);
    const rows = await screen.findAllByTestId("learned-row");
    expect(rows[0].textContent).toMatch(/SUPPORT SUB-ASSY, FRONT SUSPENSION.*Strut mount.*Testmake/);
    expect(within(rows[0]).getByTestId("learned-row-line").textContent).toMatch(/Saved 2 parts · You answered on 27 Nov 2026/);
    expect(rows[1].textContent).toMatch(/Testmodel · Rear/);
    research.forgetLesson.mockResolvedValue({ ok: true });
    research.lessons.mockResolvedValueOnce({ lessons: [], canUndo: true });
    fireEvent.click(within(rows[0]).getByTestId("learned-undo"));
    const dialog = screen.getByTestId("learned-forget-dialog");
    expect(dialog.textContent).toMatch(/Roam will ask again next time it sees SUPPORT SUB-ASSY, FRONT SUSPENSION on a Testmake page\. Parts already saved stay saved\./);
    fireEvent.click(within(dialog).getByTestId("learned-forget"));
    await waitFor(() => expect(research.forgetLesson).toHaveBeenCalledWith("t", "l-1"));
    expect(await screen.findByTestId("learned-empty")).toBeTruthy();
  });

  it("staff see the list with Undo off (owner only)", async () => {
    research.lessons.mockResolvedValue({ lessons: [lesson], canUndo: false });
    render(<LearnedFromYou token="t" />);
    expect((await screen.findByTestId("learned-undo") as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId("learned-owner-only").textContent).toMatch(/Only the owner can change this/);
  });

  it("empty and error states (Stitch screens 13–14)", async () => {
    research.lessons.mockResolvedValueOnce({ lessons: [], canUndo: true });
    const { unmount } = render(<LearnedFromYou token="t" />);
    expect((await screen.findByTestId("learned-empty")).textContent).toMatch(/Nothing learned yet\..*Answer a question on an upload and it shows here\./);
    unmount();
    research.lessons.mockRejectedValueOnce(new Error("down"));
    render(<LearnedFromYou token="t" />);
    expect((await screen.findByTestId("learned-error")).textContent).toMatch(/Couldn't load what Roam learned\./);
  });
});
