/**
 * S1 of docs/part-type-learning-audit.md (§4 S1, round 2 in §4c, Stitch docs/stitch/part-type-learning/dominion/):
 * the saved-page result's "Parts Roam doesn't know yet" group. One card per suggestion: Add part type /
 * Not a part we track (owner only), the fixings line, and the rows that stay unknown. Every name, group, reason and
 * state comes from the server; the screen only shows it and sends the owner's name and group.
 */
import { useState, type ReactNode } from "react";
import type { SavedPage, SavedPageRow, SavedPageSuggestion } from "../../../services/researchEngineService";
import { D_MONO, D_MUTED, D_TXT, DIcon, PartsButton, RE_SOFT, RePill } from "./ReKit";

/** A part group for the picker: the 13 groups, and whether its picture template is on. */
export type PickerGroup = { id: string; name: string; pictures: boolean };

/** The group's icon (same plain lookup for every screen; unknown groups get a wrench). */
export function groupIcon(name: string): string {
  const n = name.toLowerCase();
  if (/brake/.test(n)) return "album";
  if (/belt|hose/.test(n)) return "polyline";
  if (/filter/.test(n)) return "air";
  if (/suspension|steering/.test(n)) return "height";
  if (/light|visib/.test(n)) return "lightbulb";
  if (/hvac|air con|climate/.test(n)) return "ac_unit";
  if (/battery|electric(al)?$|electrical/.test(n)) return "battery_charging_full";
  if (/hybrid/.test(n)) return "electric_car";
  if (/transmission/.test(n)) return "settings";
  if (/exhaust/.test(n)) return "mode_heat";
  if (/fluid/.test(n)) return "water_drop";
  if (/tire|tyre|wheel/.test(n)) return "trip_origin";
  if (/engine/.test(n)) return "engineering";
  return "build";
}

const OWNER_ONLY = "Only the owner can add a part type";

/**
 * docs/part-type-auto-sort-audit.md §5 S1: an upload Roam sorted by itself has no card the owner must judge — every
 * suggestion is added, skipped or waiting. Older uploads (open cards) keep the cards above.
 */
export function sortedByRoam(page: SavedPage): boolean {
  const suggestions = page.result?.suggestions ?? [];
  if (!suggestions.length || suggestions.some((s) => s.kind !== "fixings" && s.status === "open")) return false;
  // Only Roam writes "skipped" / "waiting" or a sort time; a page the owner finished by hand keeps its cards.
  return Boolean(page.result?.sortAt) || suggestions.some((s) => s.status === "skipped" || s.status === "waiting");
}

/** The suggestion keys whose part type Roam made on this upload (their Saved rows get a "New part type" pill). */
export function newTypeKeys(page: SavedPage): Set<string> {
  return new Set((page.result?.suggestions ?? []).filter((s) => s.kind === "new" && s.status === "added").map((s) => s.key));
}

/** The one quiet line under the result groups: only the result's own counts, and Review. */
export function SortSummary({ page, onReview }: { page: SavedPage; onReview: () => void }) {
  const suggestions = page.result?.suggestions ?? [];
  const sorted = suggestions.filter((s) => s.status === "added" || s.status === "skipped" || s.status === "dismissed" || s.kind === "fixings");
  const waiting = suggestions.filter((s) => s.kind !== "fixings" && s.status === "waiting");
  const rowsSorted = sorted.reduce((n, s) => n + s.rowCount, 0);
  const newTypes = suggestions.filter((s) => s.kind === "new" && s.status === "added").length;
  const fixings = suggestions.filter((s) => s.kind === "fixings").length;
  const notTracked = suggestions.filter((s) => s.kind !== "fixings" && (s.status === "skipped" || s.status === "dismissed")).length;
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const parts = [
    rowsSorted ? `Roam sorted ${plural(rowsSorted, "row", "rows")}` : null,
    newTypes ? plural(newTypes, "new part type", "new part types") : null,
    fixings ? plural(fixings, "fixing", "fixings") : null,
    notTracked ? plural(notTracked, "name not tracked", "names not tracked") : null,
  ].filter(Boolean);

  return (
    <div className="flex flex-col gap-3" data-testid="sort-summary">
      {parts.length ? (
        <div className={`flex flex-col gap-3 rounded-xl p-4 sm:flex-row sm:items-center ${RE_SOFT}`}>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#dbe1ff] text-[#0153dc] dark:bg-[#1e3a8a]/50 dark:text-[#93b4ff]">
            <DIcon name="category" className="text-[20px]" />
          </span>
          <p className={`min-w-0 flex-1 text-[14px] ${D_TXT}`} data-testid="sort-summary-line">
            {parts.join(" · ")}
          </p>
          <PartsButton variant="secondary" className="!min-h-[44px] w-full sm:w-auto" onClick={onReview} data-testid="sort-summary-review">
            Review
          </PartsButton>
        </div>
      ) : null}
      {waiting.length ? (
        <div className={`flex items-center gap-3 rounded-xl p-4 ${RE_SOFT}`} data-testid="sort-summary-waiting">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-[#5d5f68] dark:bg-[#0b1220] dark:text-[#94a3b8]">
            <DIcon name="schedule" className="text-[20px]" />
          </span>
          <p className={`text-[14px] ${D_TXT}`}>
            Roam will sort {plural(waiting.length, "name", "names")} shortly. Nothing is lost — the parts are kept.
          </p>
        </div>
      ) : null}
    </div>
  );
}

type Props = {
  page: SavedPage;
  owner: boolean;
  groups: PickerGroup[];
  /** Pictures switched on (the AI part pictures switch). */
  aiOn: boolean;
  /** Sends Add / Dismiss; resolves when the page has been redrawn from the server's answer. */
  onAct: (body: { key: string; action: "add" | "dismiss"; name?: string; groupId?: string }) => Promise<void>;
  /** A held row, drawn exactly as the "Needs you" group draws it (with Check this part). */
  renderHeldRow: (row: SavedPageRow, i: number) => ReactNode;
};

export function SavedPageSuggestions({ page, owner, groups, aiOn, onAct, renderHeldRow }: Props) {
  const [open, setOpen] = useState(true);
  const rows = page.result?.rows ?? [];
  const suggestions = page.result?.suggestions ?? [];
  const cards = suggestions.filter((s) => s.kind !== "fixings" && s.status !== "dismissed");
  const fixings = suggestions.filter((s) => s.kind === "fixings");
  const unknown = rows.filter((r) => r.group === "not_roam_type");
  const fixingKeys = new Set(fixings.map((s) => s.key));
  const cardKeys = new Set(cards.filter((s) => s.status === "open").map((s) => s.key));
  // Rows Roam doesn't know that no open card or fixings line covers: dismissed ones, and rows with no suggestion.
  const leftOver = unknown.filter((r) => !(r.suggestion && (cardKeys.has(r.suggestion) || fixingKeys.has(r.suggestion))));
  const more = page.result?.moreUnknownRows ?? 0;

  if (!unknown.length && !cards.length) return null;

  const fixingsRows = fixings.reduce((n, s) => n + s.rowCount, 0);
  const fixingsLine = fixings.length
    ? `${fixings.length} ${fixings.length === 1 ? "fixing" : "fixings"} (${fixings.map((s) => s.name.toLowerCase()).join(", ")}) — Roam doesn't track these`
    : null;
  const names = cards.filter((s) => s.status === "open").map((s) => s.name);

  return (
    <section className="flex flex-col gap-3" data-testid="group-unknown">
      <button
        type="button"
        className={`flex min-h-[44px] w-full items-start justify-between gap-3 text-left ${D_TXT}`}
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        data-testid="saved-page-unknown-toggle"
      >
        <span className="flex flex-col gap-1">
          <span className="flex items-center gap-2">
            <span className="text-[18px] font-semibold">Parts Roam doesn&apos;t know yet</span>
            <span className={`rounded-full px-2 text-[12px] font-semibold ${RE_SOFT}`}>{unknown.length}</span>
          </span>
          <span className={`text-[13px] ${D_MUTED}`} data-testid="saved-page-unknown-line">
            {open
              ? "Add a part type and Roam saves these parts from this page and makes their pictures."
              : [names.join(", "), fixings.length ? `${fixings.length} ${fixings.length === 1 ? "fixing" : "fixings"}` : ""].filter(Boolean).join(" · ")}
          </span>
        </span>
        <DIcon name={open ? "expand_less" : "expand_more"} className={`mt-1 text-[20px] ${D_MUTED}`} />
      </button>

      {open ? (
        <>
          {cards.length ? (
            <div className="flex flex-col gap-4">
              {cards.map((s) => (
                <SuggestionCard
                  key={s.key}
                  suggestion={s}
                  rows={rows.filter((r) => r.suggestion === s.key)}
                  owner={owner}
                  groups={groups}
                  aiOn={aiOn}
                  onAct={onAct}
                  renderHeldRow={renderHeldRow}
                />
              ))}
            </div>
          ) : null}

          {fixingsLine ? (
            <div className={`flex items-center gap-2 rounded-xl p-4 text-[14px] ${RE_SOFT} ${D_MUTED}`} data-testid="saved-page-fixings" data-rows={fixingsRows}>
              <DIcon name="bolt" className="shrink-0 text-[20px]" />
              <span>{fixingsLine}</span>
            </div>
          ) : null}

          {more > 0 ? (
            <p className={`px-1 text-[13px] ${D_MUTED}`} data-testid="saved-page-more-unknown">
              {more} more {more === 1 ? "row" : "rows"} Roam doesn&apos;t know
            </p>
          ) : null}

          {leftOver.length ? (
            <ul className={`flex flex-col gap-1 rounded-xl px-4 py-3 ${RE_SOFT}`} data-testid="saved-page-other-list">
              {leftOver.map((r, i) => (
                <li key={`o${i}`} className={`flex flex-wrap items-center gap-2 text-[13px] ${D_TXT}`}>
                  <span>{r.partType}</span>
                  {r.number ? <span className={`${D_MONO} ${D_MUTED}`}>{r.number}</span> : null}
                </li>
              ))}
            </ul>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

function datesLine(rows: SavedPageRow[]): string {
  return [...new Set(rows.map((r) => r.dates).filter((d): d is string => Boolean(d)))].join(" and ");
}

function SuggestionCard({
  suggestion: s,
  rows,
  owner,
  groups,
  aiOn,
  onAct,
  renderHeldRow,
}: {
  suggestion: SavedPageSuggestion;
  rows: SavedPageRow[];
  owner: boolean;
  groups: PickerGroup[];
  aiOn: boolean;
  onAct: Props["onAct"];
  renderHeldRow: Props["renderHeldRow"];
}) {
  const [name, setName] = useState(s.name);
  const [groupId, setGroupId] = useState(s.groupId ?? "");
  const [busy, setBusy] = useState<"add" | "dismiss" | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);

  const existing = s.kind === "existing";
  const added = s.status === "added";
  const held = rows.filter((r) => r.group === "held");
  const savedCount = rows.filter((r) => r.group === "saved").length;
  // The groups the picker offers: the 13 groups, or at least the suggestion's own when the list couldn't load.
  const options = groups.length ? groups : s.groupId ? [{ id: s.groupId, name: s.groupName, pictures: true }] : [];
  const group = options.find((g) => g.id === (added ? s.groupId : groupId)) ?? null;
  const reason = sendError ?? s.reason;

  async function act(action: "add" | "dismiss") {
    setBusy(action);
    setSendError(null);
    try {
      await onAct(action === "add" ? { key: s.key, action, ...(existing ? {} : { name: name.trim(), groupId }) } : { key: s.key, action });
    } catch (e) {
      setSendError(e instanceof Error ? e.message : "That didn't work. Try again.");
    } finally {
      setBusy(null);
    }
  }

  const panel = (
    <div className={`flex flex-col gap-0.5 rounded-xl p-3 ${RE_SOFT}`} data-testid="suggestion-rows">
      <span className={`text-[13px] font-medium ${D_MONO} ${D_TXT}`}>
        {s.rowCount} {s.rowCount === 1 ? "row" : "rows"} · {s.numbers.join(", ")}
      </span>
      {datesLine(rows) ? <span className={`text-[12px] ${D_MONO} ${D_MUTED}`}>{datesLine(rows)}</span> : null}
    </div>
  );

  if (added) {
    const pictureWords = !aiOn
      ? null
      : group && !group.pictures
        ? "no picture for this group"
        : rows.some((r) => r.picture?.status === "being_made" || r.picture?.status === "waiting") || !rows.some((r) => r.picture)
          ? "pictures being made"
          : "pictures made";
    return (
      <div className="flex flex-col gap-3 rounded-2xl bg-white p-5 shadow-[0_0_0_1px_#e6e7ee] dark:bg-[#111a2e] dark:shadow-[0_0_0_1px_#1e293b]" data-testid="suggestion-card" data-state={held.length ? "added_held" : "added"}>
        <div className="flex flex-wrap items-center gap-2">
          {held.length ? (
            <RePill tone="amber" icon="priority_high">Added, needs you</RePill>
          ) : (
            <RePill tone="green" icon="check">Added</RePill>
          )}
          <span className={`text-[16px] font-semibold ${D_TXT}`}>{s.typeName ?? s.name}</span>
          {group ? (
            <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[12px] font-medium ${RE_SOFT} ${D_TXT}`}>
              <DIcon name={groupIcon(group.name)} className="text-[14px]" /> {group.name}
            </span>
          ) : null}
        </div>
        <span className={`text-[12px] ${D_MONO} ${D_MUTED}`}>{s.pagePhrase}</span>
        <p className={`text-[14px] ${D_TXT}`} data-testid="suggestion-added-line">
          {[`${savedCount} ${savedCount === 1 ? "part" : "parts"} saved`, pictureWords].filter(Boolean).join(" · ")}
        </p>
        {held.length ? (
          <div className="flex flex-col divide-y divide-[#e6e7ee] overflow-hidden rounded-xl border border-[#e6e7ee] dark:divide-[#1e293b] dark:border-[#1e293b]">
            {held.map((r, i) => renderHeldRow(r, i))}
          </div>
        ) : null}
      </div>
    );
  }

  const locked = !owner || busy !== null;
  const nameOk = name.trim().length >= 3 && name.trim().length <= 60;
  const canAdd = owner && busy === null && (existing || (nameOk && Boolean(groupId)));
  const addLabel = busy === "add" ? "Adding…" : reason ? "Try again" : existing ? `Save under ${s.name}` : "Add part type";

  return (
    <div className="flex flex-col gap-4 rounded-2xl bg-white p-5 shadow-[0_0_0_1px_#e6e7ee] dark:bg-[#111a2e] dark:shadow-[0_0_0_1px_#1e293b]" data-testid="suggestion-card" data-state={busy ? "adding" : reason ? "failed" : "ready"}>
      {existing ? (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-start gap-2 rounded-xl bg-[#dbe1ff] p-3 text-[14px] text-[#00174b] dark:bg-[#1e3a8a]/40 dark:text-[#dbe1ff]" data-testid="suggestion-existing">
            <DIcon name="info" className="text-[18px] text-[#0153dc] dark:text-[#93b4ff]" />
            <span>
              Roam already has this: <span className="font-semibold">{s.name}</span>
            </span>
          </div>
          <span className={`text-[12px] ${D_MONO} ${D_MUTED}`}>{s.pagePhrase}</span>
        </div>
      ) : (
        <>
          <label className="flex flex-col gap-1.5">
            <span className={`text-[13px] font-semibold ${D_TXT}`}>Name</span>
            <input
              type="text"
              value={name}
              maxLength={60}
              disabled={locked}
              onChange={(e) => setName(e.target.value)}
              data-testid="suggestion-name"
              className={`min-h-[44px] rounded-[10px] border border-[#c5c6d0] bg-white px-3.5 text-[15px] outline-none focus:border-[#0153dc] disabled:opacity-60 dark:border-[#334155] dark:bg-[#0b1220] ${D_TXT}`}
            />
            <span className={`text-[12px] ${D_MONO} ${D_MUTED}`}>{s.pagePhrase}</span>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className={`text-[13px] font-semibold ${D_TXT}`}>Part group</span>
            <span className="relative flex min-h-[44px] items-center rounded-[10px] border border-[#c5c6d0] bg-white dark:border-[#334155] dark:bg-[#0b1220]">
              <span className="pointer-events-none absolute left-2 flex h-7 w-7 items-center justify-center rounded-md bg-[#dbe1ff] text-[#0153dc] dark:bg-[#1e3a8a]/50 dark:text-[#93b4ff]">
                <DIcon name={groupIcon(group?.name ?? "")} className="text-[18px]" />
              </span>
              <select
                value={groupId}
                disabled={locked}
                onChange={(e) => setGroupId(e.target.value)}
                data-testid="suggestion-group"
                className={`min-h-[44px] w-full appearance-none bg-transparent pl-11 pr-9 text-[15px] font-medium outline-none disabled:opacity-60 ${D_TXT}`}
              >
                {!groupId ? <option value="">Choose a part group</option> : null}
                {options.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.pictures ? g.name : `${g.name} — no picture`}
                  </option>
                ))}
              </select>
              <DIcon name="expand_more" className={`pointer-events-none absolute right-2 text-[20px] ${D_MUTED}`} />
            </span>
          </label>
        </>
      )}

      {panel}

      {reason ? (
        <p className="flex items-start gap-1.5 text-[13px] font-medium text-[#a83836] dark:text-[#f87171]" data-testid="suggestion-reason">
          <DIcon name="error" className="text-[16px]" /> {reason}
        </p>
      ) : null}
      {!owner ? (
        <p className={`flex items-center gap-1.5 text-[13px] ${D_MUTED}`} data-testid="suggestion-owner-only">
          <DIcon name="lock" className="text-[16px]" /> {OWNER_ONLY}
        </p>
      ) : null}

      <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:items-center sm:justify-between">
        <PartsButton
          variant="secondary"
          className="!min-h-[44px] w-full sm:w-auto"
          disabled={locked}
          onClick={() => void act("dismiss")}
          data-testid="suggestion-dismiss"
        >
          Not a part we track
        </PartsButton>
        <PartsButton variant="primary" className="!min-h-[44px] w-full sm:w-auto" disabled={!canAdd} onClick={() => void act("add")} data-testid="suggestion-add">
          {busy === "add" ? <DIcon name="progress_activity" className="animate-spin text-[18px]" /> : null}
          {addLabel}
        </PartsButton>
      </div>
    </div>
  );
}
