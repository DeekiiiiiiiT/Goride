/**
 * Answers teach Roam (docs/answers-teach-roam-audit.md §5.1 / §5.2, Stitch docs/stitch/answers-teach-roam-dominion/
 * screens 1, 2, 4, 5, 6, 8, 9). One card per question: it shows exactly what Roam read on the page (the heading, the row,
 * the number and the dates), then asks one thing. Used by the saved-page result and the browser check drawer.
 * Every word about the part comes from the server; the card only adds the question line and the button words.
 */
import { useState } from "react";
import type { QuestionAnswer, SavedPageQuestion } from "../../../services/researchEngineService";
import { D_MONO, D_MUTED, D_TXT, DIcon, PartsButton } from "./ReKit";

export type QuestionRow = {
  partType: string;
  place: string | null;
  groupLine?: string | null;
  lineText?: string;
  number: string | null;
  dates: string | null;
  question: SavedPageQuestion;
};

type Choice = { key: string; label: string; answer: QuestionAnswer; primary?: boolean };

/** The question line and its buttons, per kind (AT-05). */
export function questionChoices(q: SavedPageQuestion): { ask: string; choices: Choice[] } {
  const type = q.typeNames[0] ?? "part";
  if (q.kind === "wording") {
    return {
      ask: `Is this the ${type}?`,
      choices: [
        { key: "yes", label: `Yes, it's the ${type}`, answer: { yes: true }, primary: true },
        { key: "no", label: "No, it's something else", answer: { yes: false } },
      ],
    };
  }
  if (q.kind === "types") {
    return {
      ask: "Which part is this?",
      choices: [
        ...q.typeIds.map((id, i) => ({ key: id, label: q.typeNames[i] || "This part", answer: { typeId: id } })),
        { key: "else", label: "Something else", answer: { typeId: null, yes: false } },
      ],
    };
  }
  if (q.kind === "axle") {
    return {
      ask: "Where is it on the car?",
      choices: [
        { key: "front", label: "Front", answer: { axle: "front" } },
        { key: "rear", label: "Rear", answer: { axle: "rear" } },
      ],
    };
  }
  return {
    ask: "Which side is it on?",
    choices: [
      { key: "left", label: "Left", answer: { side: "left" } },
      { key: "right", label: "Right", answer: { side: "right" } },
      { key: "both", label: "Both sides", answer: { side: "both" } },
    ],
  };
}

/** The card's title: the part (never a guessed one for "Which part is this?") and the place Roam already knows. */
function cardTitle(row: QuestionRow, others: QuestionRow[] = []): string {
  const name = row.question.kind === "types" ? "Part" : row.question.typeNames[0] || row.partType;
  // One card for the right and left rows of a heading: the title keeps only the place they share (e.g. "Front").
  const place = placeWords(others.length ? sharedPlace([row, ...others].map((r) => r.place)) : row.place);
  return place ? `${name} · ${place}` : name;
}

/** The words every place shares, in order: ["front right", "front left"] → "front"; nothing shared → null. */
function sharedPlace(places: Array<string | null | undefined>): string | null {
  const lists = places.map((p) => String(p ?? "").toLowerCase().split(/\s+/).filter(Boolean));
  const shared = (lists[0] ?? []).filter((w) => lists.every((l) => l.includes(w)));
  return shared.length ? shared.join(" ") : null;
}

/** A heading without its side word ("48619 - BEARING, STRUT MOUNTING, RH" → "48619 - BEARING, STRUT MOUNTING"). */
export function withoutSide(heading: string): string {
  return heading.replace(/,?\s*\b(RH|LH|R\/H|L\/H|RIGHT|LEFT)\b/gi, "").replace(/\s+/g, " ").trim();
}

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "front both" → "Front, both sides"; "rear right" → "Rear right"; "front" → "Front". */
export function placeWords(place: string | null | undefined): string | null {
  const words = String(place ?? "").trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return null;
  const text = words.includes("both") ? `${words.filter((w) => w !== "both").join(" ")}, both sides` : words.join(" ");
  return capitalise(text.replace(/^, /, ""));
}

export function QuestionCard({
  row,
  others = [],
  canAnswer,
  onAnswer,
  testId = "question-card",
}: {
  row: QuestionRow;
  /** The heading's other rows (the other side, another date range): one card, and one answer saves them all. */
  others?: QuestionRow[];
  /** Owner login only (the answer route is owner-only). */
  canAnswer: boolean;
  onAnswer: (answer: QuestionAnswer) => Promise<void>;
  testId?: string;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const { ask, choices } = questionChoices(row.question);
  const press = async (c: Choice) => {
    setBusy(c.key);
    setFailed(false);
    try {
      await onAnswer(c.answer);
    } catch {
      setFailed(true);
    } finally {
      setBusy(null);
    }
  };
  // Three side buttons sit in a row; two buttons share the row; the phone stacks them (Stitch screen 6).
  const grid = choices.length >= 3 ? "sm:grid-cols-3" : "sm:grid-cols-2";
  return (
    <div
      className="relative flex flex-col gap-3 overflow-hidden rounded-2xl border border-[#f1d9a6] bg-white p-5 pl-6 dark:border-[#78350f] dark:bg-[#111a2e]"
      data-testid={testId}
      data-kind={row.question.kind}
    >
      <span className="absolute inset-y-0 left-0 w-1 bg-[#8a5a00] dark:bg-[#fbbf24]" aria-hidden />
      <h4 className={`text-[16px] font-semibold ${D_TXT}`} data-testid="question-title">
        {cardTitle(row, others)}
      </h4>
      {row.groupLine ? (
        <p className={`text-[13px] ${D_MONO} ${D_MUTED}`} data-testid="question-heading">
          {others.length ? withoutSide(row.groupLine) : row.groupLine}
        </p>
      ) : null}
      {/* Every row this answer covers, each as the page wrote it, then its number and dates. */}
      {[row, ...others].map((r, i) => (
        <div key={i} className="flex flex-col gap-2">
          {r.lineText ? (
            <p className={`break-words rounded-lg bg-[#f3f4fb] px-3 py-2.5 text-[13px] ${D_MONO} ${D_TXT} dark:bg-[#0b1220]`} data-testid="question-row-text">
              {r.lineText}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-3">
            {r.number ? (
              <span className={`rounded-md bg-[#f1f5f9] px-2 py-1 text-[14px] font-semibold ${D_MONO} ${D_TXT} dark:bg-[#1e293b]`} data-testid="question-number">
                {r.number}
              </span>
            ) : null}
            {r.dates ? <span className={`text-[13px] ${D_MONO} ${D_MUTED}`}>{r.dates}</span> : null}
            {others.length && placeWords(r.place) ? <span className={`text-[13px] ${D_MUTED}`}>{placeWords(r.place)}</span> : null}
          </div>
        </div>
      ))}
      <p className={`border-t border-[#e6e7ee] pt-3 text-[15px] font-semibold dark:border-[#1e293b] ${D_TXT}`} data-testid="question-ask">
        {ask}
      </p>
      <div className={`grid grid-cols-1 gap-2 ${grid}`}>
        {choices.map((c) => (
          <PartsButton
            key={c.key}
            variant={c.primary ? "primary" : "secondary"}
            className="!min-h-[44px] w-full"
            disabled={!canAnswer || busy !== null}
            onClick={() => void press(c)}
            data-testid={`question-answer-${c.key}`}
          >
            {busy === c.key ? <DIcon name="progress_activity" className="animate-spin text-[18px]" /> : null}
            {c.label}
          </PartsButton>
        ))}
      </div>
      {!canAnswer ? <p className={`text-[13px] ${D_MUTED}`}>Only the owner can answer this.</p> : null}
      {failed ? (
        <p className="flex items-center gap-2 rounded-lg bg-[#fdecec] px-3 py-2.5 text-[14px] text-[#a83836] dark:bg-[#450a0a] dark:text-[#f87171]" data-testid="question-error">
          <DIcon name="error" className="text-[18px]" /> That didn&apos;t save. Try again.
        </p>
      ) : null}
    </div>
  );
}

/** The answered card (Stitch screens 2 and 9): one green line, and the server's "Roam will remember …" line. */
export function AnsweredLine({ row, testId = "question-answered" }: { row: QuestionRow & { group?: string; reason?: string | null }; testId?: string }) {
  if (row.question.answer === "no") {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-[#e6e7ee] bg-white p-4 text-[14px] dark:border-[#1e293b] dark:bg-[#111a2e]" data-testid={testId} data-answer="no">
        <DIcon name="info" className={`text-[20px] ${D_MUTED}`} />
        <span className={D_MUTED}>Not saved. It&apos;s in Pending catalog as a browser check.</span>
      </div>
    );
  }
  const saved = row.group === "saved" || row.group === "already";
  if (!saved) {
    // Answered, but the page still can't prove the save (its dates don't cover the car): the server's own reason.
    return (
      <div className="flex items-start gap-3 rounded-2xl border border-[#f1d9a6] bg-white p-4 text-[14px] dark:border-[#78350f] dark:bg-[#111a2e]" data-testid={testId} data-answer="held">
        <DIcon name="warning" className="text-[20px] text-[#8a5a00] dark:text-[#fbbf24]" />
        <span className="flex flex-col gap-0.5">
          <span className={D_TXT}>{[row.number, placeWords(row.place)].filter(Boolean).join(" · ")}</span>
          {row.reason ? <span className="font-medium text-[#8a5a00] dark:text-[#fbbf24]">{row.reason}</span> : null}
          {row.question.note ? <span className={D_MUTED}>{row.question.note}</span> : null}
        </span>
      </div>
    );
  }
  return (
    <div className="relative flex items-start gap-3 overflow-hidden rounded-2xl border border-[#b7e1c4] bg-[#f3fbf5] p-4 pl-6 dark:border-[#14532d] dark:bg-[#052e16]/40" data-testid={testId} data-answer="yes">
      <span className="absolute inset-y-0 left-0 w-1 bg-[#006e31] dark:bg-[#4ade80]" aria-hidden />
      <DIcon name="check_circle" className="text-[20px] text-[#006e31] dark:text-[#4ade80]" />
      <span className="flex flex-col gap-0.5">
        <span className="text-[15px] font-semibold text-[#006e31] dark:text-[#4ade80]">
          Saved {[row.number, placeWords(row.place)].filter(Boolean).join(" · ")}
        </span>
        {row.question.note ? <span className={`text-[14px] ${D_TXT}`}>{row.question.note}</span> : null}
      </span>
    </div>
  );
}
