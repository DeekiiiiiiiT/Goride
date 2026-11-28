/**
 * S2 of docs/part-type-auto-sort-audit.md (§5 S2, round 2 in §5b, Stitch docs/stitch/part-type-auto-sort/dominion/):
 * "Sorted by Roam" — every part name Roam (or the owner) answered, in two tabs, with one button per row to flip the
 * answer. Staff can read it; only the owner can press. Every word on a row comes from the server.
 */
import { useCallback, useEffect, useState } from "react";
import { researchApi, type PartNameItem, type PartNamesTab } from "../../../services/researchEngineService";
import { D_MONO, D_MUTED, D_TXT, DIcon, PartsButton, RE_SOFT, RePill } from "./ReKit";
import { groupIcon } from "./SavedPageSuggestions";

function shortDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

const uploadsWord = (n: number) => `on ${n} ${n === 1 ? "upload" : "uploads"}`;

type TabState = { status: "loading" } | { status: "error" } | { status: "ready"; items: PartNameItem[]; next: string | null; more: boolean };
type RowState = { busy: boolean; error: string | null; tracked?: { pages: number; remaining: number } };

export function SortedByRoam({ token, owner }: { token: string; owner: boolean }) {
  const [tab, setTab] = useState<PartNamesTab>("added");
  const [tabs, setTabs] = useState<Record<PartNamesTab, TabState>>({ added: { status: "loading" }, not_tracked: { status: "loading" } });
  const [rows, setRows] = useState<Record<string, RowState>>({});

  const load = useCallback(
    async (which: PartNamesTab, cursor?: string | null) => {
      if (!cursor) setTabs((t) => ({ ...t, [which]: { status: "loading" } }));
      try {
        const reply = await researchApi.partNames(token, which, cursor);
        setTabs((t) => {
          const before = cursor && t[which].status === "ready" ? (t[which] as { items: PartNameItem[] }).items : [];
          return { ...t, [which]: { status: "ready", items: [...before, ...reply.items], next: reply.nextCursor, more: false } };
        });
      } catch {
        if (cursor) setTabs((t) => (t[which].status === "ready" ? { ...t, [which]: { ...(t[which] as object), more: false } as TabState } : t));
        else setTabs((t) => ({ ...t, [which]: { status: "error" } }));
      }
    },
    [token],
  );

  useEffect(() => {
    void load("added");
    void load("not_tracked");
  }, [load]);

  async function press(item: PartNameItem) {
    setRows((r) => ({ ...r, [item.key]: { ...r[item.key], busy: true, error: null } }));
    try {
      if (tab === "added") {
        await researchApi.skipPartName(token, item.key);
        setRows((r) => ({ ...r, [item.key]: { busy: false, error: null } }));
        void load("added");
        void load("not_tracked");
      } else {
        const reply = await researchApi.trackPartName(token, item.key);
        const before = rows[item.key]?.tracked?.pages ?? 0;
        setRows((r) => ({ ...r, [item.key]: { busy: false, error: null, tracked: { pages: before + reply.pages, remaining: reply.remaining } } }));
        if (reply.remaining === 0) void load("added");
      }
    } catch (e) {
      setRows((r) => ({ ...r, [item.key]: { ...r[item.key], busy: false, error: e instanceof Error ? e.message : "That didn't work. Try again." } }));
    }
  }

  const current = tabs[tab];
  const count = (which: PartNamesTab) => {
    const t = tabs[which];
    if (t.status !== "ready") return null;
    return `${t.items.length}${t.next ? "+" : ""}`;
  };

  return (
    <section className="flex flex-col gap-4 rounded-2xl bg-white p-6 shadow-[0_0_0_1px_#e6e7ee] dark:bg-[#111a2e] dark:shadow-[0_0_0_1px_#1e293b]" data-testid="sorted-by-roam">
      <div className="flex flex-col gap-1">
        <h3 className={`text-[18px] font-semibold ${D_TXT}`}>Sorted by Roam</h3>
        <p className={`text-[14px] ${D_MUTED}`}>Roam decides which parts on a saved page are worth keeping. Change any answer here — it applies to every car.</p>
      </div>

      <div className={`flex gap-1 rounded-xl px-2 ${RE_SOFT}`} role="tablist">
        {(["added", "not_tracked"] as const).map((which) => (
          <button
            key={which}
            type="button"
            role="tab"
            aria-selected={tab === which}
            onClick={() => setTab(which)}
            data-testid={`sorted-tab-${which}`}
            className={`flex min-h-[44px] items-center gap-2 border-b-2 px-3 text-[14px] font-medium ${
              tab === which ? "border-[#0153dc] text-[#0153dc] dark:border-[#93b4ff] dark:text-[#93b4ff]" : `border-transparent ${D_MUTED}`
            }`}
          >
            {which === "added" ? "Added" : "Not tracked"}
            {count(which) !== null ? <span className="rounded-full bg-white px-2 text-[12px] font-semibold dark:bg-[#0b1220]">{count(which)}</span> : null}
          </button>
        ))}
      </div>

      {!owner ? (
        <p className={`flex items-center gap-2 rounded-xl p-3 text-[14px] ${RE_SOFT} ${D_TXT}`} data-testid="sorted-owner-only">
          <DIcon name="lock" className="text-[18px]" /> Only the owner can change this
        </p>
      ) : null}

      {current.status === "loading" ? (
        <div className="flex flex-col gap-2" aria-busy data-testid="sorted-loading">
          <div className="h-16 animate-pulse rounded-xl bg-[#e1e1ed] dark:bg-[#1e293b]" />
          <div className="h-16 animate-pulse rounded-xl bg-[#e1e1ed] opacity-60 dark:bg-[#1e293b]" />
        </div>
      ) : current.status === "error" ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#fdecec] p-4 text-[#a83836] dark:bg-[#450a0a] dark:text-[#f87171]" data-testid="sorted-error">
          <span className="flex items-center gap-2 text-[14px] font-medium">
            <DIcon name="error" className="text-[18px]" /> Couldn&apos;t load Roam&apos;s answers.
          </span>
          <PartsButton variant="secondary" className="!min-h-[44px]" onClick={() => void load(tab)}>
            <DIcon name="refresh" className="text-[18px]" /> Try again
          </PartsButton>
        </div>
      ) : current.items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-8 text-center" data-testid="sorted-empty">
          <span className={`flex h-12 w-12 items-center justify-center rounded-xl ${RE_SOFT}`}>
            <DIcon name="category" className="text-[24px] text-[#0153dc] dark:text-[#93b4ff]" />
          </span>
          <p className={`text-[15px] font-semibold ${D_TXT}`}>Nothing sorted yet.</p>
          <p className={`text-[14px] ${D_MUTED}`}>When you upload a saved page, Roam&apos;s answers show here.</p>
        </div>
      ) : (
        <>
          <ul className="flex flex-col divide-y divide-[#e6e7ee] dark:divide-[#1e293b]">
            {current.items.map((item) => {
              const state = rows[item.key];
              const showPhrase = tab === "not_tracked" || item.phrase.trim().toLowerCase() !== String(item.name ?? "").trim().toLowerCase();
              const tracked = tab === "not_tracked" ? state?.tracked : undefined;
              return (
                <li key={item.key} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between" data-testid="sorted-row">
                  <div className="flex min-w-0 flex-col gap-1">
                    {tab === "added" ? (
                      <span className={`flex flex-wrap items-center gap-2 text-[15px] font-medium ${D_TXT}`}>
                        <span className="break-words">{item.name ?? item.typeName}</span>
                        {item.groupName ? (
                          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[12px] font-medium ${RE_SOFT}`}>
                            <DIcon name={groupIcon(item.groupName)} className="text-[14px]" /> {item.groupName}
                          </span>
                        ) : null}
                      </span>
                    ) : null}
                    {showPhrase ? (
                      <span className={`break-words ${tab === "not_tracked" ? `text-[14px] font-medium ${D_TXT}` : `text-[12px] ${D_MUTED}`} ${D_MONO}`}>
                        {tab === "not_tracked" ? item.phrase : item.phrase.toUpperCase()}
                      </span>
                    ) : null}
                    <span className={`text-[13px] ${D_MUTED}`} data-testid="sorted-row-line">
                      {item.setBy === "owner"
                        ? ["You set this", shortDate(item.at)].filter(Boolean).join(" · ")
                        : [item.reason, uploadsWord(item.uploads), shortDate(item.at)].filter(Boolean).join(" · ")}
                    </span>
                    {state?.error ? <span className="text-[13px] font-medium text-[#a83836] dark:text-[#f87171]">{state.error}</span> : null}
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
                    {tracked ? (
                      <RePill tone="green" icon="check" testId="sorted-tracked">
                        Tracked on {tracked.pages} {tracked.pages === 1 ? "upload" : "uploads"}
                      </RePill>
                    ) : null}
                    {tracked && tracked.remaining === 0 ? null : (
                      <PartsButton
                        variant="secondary"
                        className="!min-h-[44px]"
                        disabled={!owner || state?.busy}
                        onClick={() => void press(item)}
                        data-testid="sorted-row-button"
                      >
                        {state?.busy
                          ? tab === "added"
                            ? "Saving…"
                            : "Tracking…"
                          : tab === "added"
                            ? "Don't track"
                            : tracked
                              ? `Track on ${tracked.remaining} more ${tracked.remaining === 1 ? "upload" : "uploads"}`
                              : "Track it"}
                      </PartsButton>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          {current.next ? (
            <div className="flex justify-center">
              <PartsButton
                variant="secondary"
                className="!min-h-[44px]"
                disabled={current.more}
                onClick={() => {
                  setTabs((t) => ({ ...t, [tab]: { ...current, more: true } }));
                  void load(tab, current.next);
                }}
                data-testid="sorted-show-more"
              >
                {current.more ? "Loading…" : "Show more"}
              </PartsButton>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
