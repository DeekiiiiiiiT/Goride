/**
 * LC-21 "I used a different battery" (docs/log-service-parts-gaps-audit.md 0c3). One box: what's on the label.
 * Close matches from Roam (this job only, ≥4 letters, ≤5) — tap one; else "Add … as the battery I used".
 * Never says Roam is looking anything up: an added part just goes to Dominion with the service.
 */
import React, { useEffect, useState } from "react";
import { api } from "../../../../services/api";
import { LS, LT } from "./logServiceStitch";
import { FitBadge, MakerTile } from "./PartsThatFitPanel";
import { carSizeLine, type FitPart, type PartsForJob } from "./partsThatFit";
import { notListedText, type PartPick } from "./partPick";

export type PartMatch = {
  key: string;
  partId: string | null;
  kind: "part" | "size";
  name: string;
  brand: string;
  number: string;
  size: string | null;
  type: string | null;
};

export const OTHER_PART_COPY = {
  usedDifferent: (part: string) => `I used a different ${part}`,
  title: (part: string) => `Which ${part} did you use?`,
  searchLabel: "Search by what's on the label",
  searchHint: "e.g. Interstate NS60",
  add: (text: string, part: string) => `Add "${text}" as the ${part} I used`,
  cancel: "Cancel",
  using: (name: string) => `Using ${name}`,
  addedByYou: "Added by you",
  change: "Change",
} as const;

const C = OTHER_PART_COPY;
const BTN_SOFT = `${LS.lowest} ${LS.text} ${LS.hoverMid} shadow-sm border border-[#e2e8f0] dark:border-[#32333e] transition-colors`;

function Sym({ name, size, className = "" }: { name: string; size: number; className?: string }) {
  return (
    <span className={`material-symbols-outlined ${className}`} style={{ fontSize: size }} aria-hidden>
      {name}
    </span>
  );
}

/** Same rule as the server: 4 letters / digits in all before asking. */
export function canSearch(q: string): boolean {
  return q.replace(/[^A-Za-z0-9]/g, "").length >= 4;
}

/** The car's list holds this match (a card above): its FitPart, else null. */
export function listedPart(m: PartMatch, parts: FitPart[]): FitPart | null {
  return parts.find((p) => (m.partId && p.partId === m.partId) || m.key === `size:${p.partId}`) ?? null;
}

/** "Battery size: M-42 · EFB" from the panel's car sizes, or null. */
export function listedSizeText(data: PartsForJob | null): string | null {
  const size = data?.carSizes?.[0];
  return size ? carSizeLine(size) : null;
}

function matchesFromBody(raw: unknown): PartMatch[] {
  const list = (raw as { matches?: unknown } | null)?.matches;
  return Array.isArray(list) ? (list as PartMatch[]).filter((m) => m && m.key && m.name) : [];
}

type Props = {
  vehicleId: string;
  jobId: string;
  /** "battery" */
  jobName: string;
  /** The panel's load (null when it failed or the car isn't linked). */
  data: PartsForJob | null;
  pick: PartPick | null;
  onPickOther: (pick: PartPick | null) => void;
  /** A match that is one of the cards: pick it like tapping the card. */
  onPickListed: (part: FitPart) => void;
};

export function OtherPartSearch({ vehicleId, jobId, jobName, data, pick, onPickOther, onPickListed }: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(-1);
  const [state, setState] = useState<{ kind: "idle" | "loading" | "error" } | { kind: "ok"; matches: PartMatch[] }>({ kind: "idle" });

  useEffect(() => {
    if (!open || !canSearch(q)) {
      setState({ kind: "idle" });
      return;
    }
    let live = true;
    setState({ kind: "loading" });
    const t = window.setTimeout(() => {
      api
        .partsMatch(vehicleId, jobId, q.trim())
        .then((body: unknown) => live && setState({ kind: "ok", matches: matchesFromBody(body) }))
        .catch(() => live && setState({ kind: "error" }));
    }, 300);
    return () => {
      live = false;
      window.clearTimeout(t);
    };
  }, [open, q, vehicleId, jobId]);

  const notListed = notListedText(data?.carMake ?? null, listedSizeText(data));

  if (pick) {
    return (
      <div className="space-y-1.5" data-testid="parts-fit-other-chosen">
        <div className="p-3 px-4 rounded-xl bg-[#ecfdf5] dark:bg-[#064e3b]/60 flex items-center justify-between gap-3 shadow-sm">
          <div className="flex items-center gap-2.5 min-w-0 flex-wrap">
            <div className="w-6 h-6 rounded-full bg-[#059669] text-white flex items-center justify-center shrink-0">
              <Sym name="check" size={16} />
            </div>
            <span className={`${LT.labelMd} font-semibold text-[#059669] dark:text-[#34d399]`} data-testid="parts-fit-other-label">
              {C.using(pick.name)}
            </span>
            {pick.source === "added" ? (
              <span className={`${LT.labelSm} px-2 py-0.5 rounded-full ${LS.lowest} ${LS.muted}`}>{C.addedByYou}</span>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => {
              setQ(pick.source === "added" ? pick.name : "");
              setOpen(true);
              onPickOther(null);
            }}
            data-testid="parts-fit-other-change"
            className={`px-3 py-1 text-xs font-semibold rounded-lg shrink-0 ${BTN_SOFT}`}
          >
            {C.change}
          </button>
        </div>
        {pick.notListedFor ? (
          <p className={`flex items-center gap-1.5 ${LT.bodySm} ${LS.muted} pl-1`} data-testid="parts-fit-not-listed">
            <Sym name="info" size={16} />
            {pick.notListedFor}
          </p>
        ) : null}
      </div>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-testid="parts-fit-used-different"
        className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg ${LT.labelMd} ${BTN_SOFT}`}
      >
        <Sym name="edit_note" size={18} className={LS.muted} />
        {C.usedDifferent(jobName)}
      </button>
    );
  }

  const text = q.trim().replace(/\s+/g, " ");
  const pickMatch = (m: PartMatch) => {
    const listed = listedPart(m, data?.parts ?? []);
    if (listed) {
      onPickListed(listed);
    } else {
      onPickOther({
        source: m.kind === "size" ? "size" : "found",
        name: [m.brand && !m.name.toLowerCase().startsWith(m.brand.toLowerCase()) ? m.brand : "", m.name].filter(Boolean).join(" "),
        brand: m.brand,
        number: m.number,
        key: m.key,
        notListedFor: notListed,
      });
    }
    setOpen(false);
    setQ("");
  };
  const add = () => {
    onPickOther({ source: "added", name: text.slice(0, 120), brand: "", number: "", key: null, notListedFor: notListed });
    setOpen(false);
    setQ("");
  };
  const matches = state.kind === "ok" ? state.matches : [];
  /** Dropdown rows: the matches, then "Add …" (once the search has answered). */
  const showAdd = canSearch(q) && (state.kind === "ok" || state.kind === "error");
  const rowCount = matches.length + (showAdd ? 1 : 0);
  const dropdownOpen = canSearch(q) && rowCount > 0;
  const choose = (i: number) => {
    if (i < matches.length) pickMatch(matches[i]);
    else if (showAdd) add();
  };
  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" && rowCount) {
      e.preventDefault();
      setActive((a) => (a + 1) % rowCount);
    } else if (e.key === "ArrowUp" && rowCount) {
      e.preventDefault();
      setActive((a) => (a - 1 + rowCount) % rowCount);
    } else if (e.key === "Enter" && rowCount && active >= 0) {
      e.preventDefault();
      choose(active);
    } else if (e.key === "Escape") {
      setQ("");
    }
  };
  const rowCls = (i: number) =>
    `w-full text-left px-3 py-2.5 flex items-center justify-between gap-3 transition-colors ${
      i === active ? LS.mid : ""
    } ${LS.hoverMid}`;

  return (
    <div className={`rounded-2xl p-4 space-y-3 ${LS.low}`} data-testid="parts-fit-other">
      <h4 className={`${LT.titleSm} text-[15px] ${LS.text}`}>{C.title(jobName)}</h4>
      <div className="flex flex-col gap-1">
        <label htmlFor={`other-part-${jobId}`} className={`${LT.labelMd} ${LS.muted}`}>{C.searchLabel}</label>
        <div className="relative">
          <span
            className={`flex items-center gap-2 h-11 px-3 ${LS.lowest} border border-[#e2e8f0] dark:border-[#32333e] focus-within:ring-2 focus-within:ring-[#4b41e1] ${
              dropdownOpen ? "rounded-t-lg" : "rounded-lg"
            }`}
          >
            <Sym name="search" size={18} className={LS.muted} />
            <input
              id={`other-part-${jobId}`}
              role="combobox"
              aria-expanded={dropdownOpen}
              aria-controls={`other-part-list-${jobId}`}
              aria-autocomplete="list"
              className={`w-full bg-transparent text-sm ${LS.text} focus:outline-none`}
              value={q}
              maxLength={80}
              placeholder={C.searchHint}
              onChange={(e) => {
                setQ(e.target.value);
                setActive(-1);
              }}
              onKeyDown={onKeyDown}
              data-testid="parts-fit-other-search"
              autoComplete="off"
              autoFocus
            />
            {state.kind === "loading" ? (
              <Sym name="progress_activity" size={18} className={`${LS.outline} animate-spin shrink-0`} />
            ) : null}
          </span>
          {dropdownOpen ? (
            <div
              id={`other-part-list-${jobId}`}
              role="listbox"
              className={`absolute left-0 right-0 top-full z-20 max-h-80 overflow-y-auto rounded-b-lg ${LS.lowest} border border-t-0 border-[#e2e8f0] dark:border-[#32333e] shadow-lg divide-y divide-[#eef1f7] dark:divide-[#2a2b35]`}
              data-testid="parts-fit-other-dropdown"
            >
              {matches.map((m, i) => {
                const listed = listedPart(m, data?.parts ?? []);
                return (
                  <button
                    key={m.key}
                    type="button"
                    role="option"
                    aria-selected={i === active}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => pickMatch(m)}
                    data-testid="parts-fit-other-match"
                    className={rowCls(i)}
                  >
                    <span className="flex items-center gap-3 min-w-0">
                      <MakerTile brand={m.brand} size="sm" />
                      <span className="min-w-0">
                        <span className={`${LT.titleSm} ${LS.text} block truncate`}>{m.name}</span>
                        <span className={`${LT.bodySm} ${LS.muted} block truncate`}>
                          {[m.brand, m.number, m.size, m.type].filter(Boolean).join(" · ")}
                        </span>
                      </span>
                    </span>
                    {listed ? (
                      <FitBadge label={listed.fitLabel} />
                    ) : null}
                  </button>
                );
              })}
              {showAdd ? (
                <button
                  type="button"
                  role="option"
                  aria-selected={active === matches.length}
                  onMouseEnter={() => setActive(matches.length)}
                  onClick={add}
                  data-testid="parts-fit-other-add"
                  className={rowCls(matches.length)}
                >
                  <span className="flex items-center gap-3 min-w-0">
                    <span className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${LS.mid}`}>
                      <Sym name="add" size={16} className={LS.text} />
                    </span>
                    <span className="min-w-0">
                      <span className={`${LT.titleSm} ${LS.text} block truncate`}>{C.add(text, jobName)}</span>
                    </span>
                  </span>
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setQ("");
          }}
          className={`px-3.5 py-2 rounded-lg ${LT.labelMd} ${BTN_SOFT}`}
        >
          {C.cancel}
        </button>
      </div>
    </div>
  );
}
