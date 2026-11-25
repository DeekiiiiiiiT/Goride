import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { useQuery } from "@tanstack/react-query";
import { PartsButton } from "../../PartsButton";
import { MaterialIcon } from "../../import/MaterialIcon";
import type { CatalogPageDraft, CatalogVehicleListing } from "../addPartsTypes";
import { fetchSisterVehicles, searchAddPartVehicles, type AddPartVehicleRow } from "../addPartsApi";
import { parseFrameCodesFromUrl } from "./linkFrameCodes";
import { vehicleDiffLabel } from "./vehicleDiffLabel";
import { D_MUTED, D_TINT, D_TXT, DFooter, DQuestion } from "./dominionKit";

function catalogListingFromVehicle(
  v: AddPartVehicleRow,
  trust: CatalogVehicleListing["trust"],
  years: { from?: number; to?: number },
): CatalogVehicleListing {
  return {
    vehicleId: v.id,
    label: `${v.make} ${v.model}`,
    make: v.make,
    model: v.model,
    chassisCode: v.chassis_code,
    yearFrom: years.from,
    yearTo: years.to,
    diffLabel: vehicleDiffLabel(v),
    trust,
  };
}

const YEAR_MIN = 1900;

function badYear(y: number | null | undefined): boolean {
  if (y == null) return false;
  return !Number.isInteger(y) || y < YEAR_MIN || y > new Date().getFullYear() + 2;
}

/** Years the person typed must be real 4-digit years, and never end before they start (CR-04). */
export function catalogPageYearsProblem(draft: CatalogPageDraft): string {
  const from = draft.pageYearsFrom ?? null;
  const to = draft.pageYearsStillMade ? null : (draft.pageYearsTo ?? null);
  if (badYear(from) || badYear(to)) return "Type the page years as 4-digit years, like 2016.";
  if (from != null && to != null && from > to) return `The page years end before they start (${from} to ${to}).`;
  return "";
}

export function catalogCarYearsProblem(draft: CatalogPageDraft): string {
  for (const l of draft.vehicleListings) {
    if (badYear(l.yearFrom) || badYear(l.yearTo)) return `Type the years for ${l.label} as 4-digit years, like 2016.`;
    if (l.yearFrom != null && l.yearTo != null && l.yearFrom > l.yearTo) {
      return `The years for ${l.label} end before they start (${l.yearFrom} to ${l.yearTo}).`;
    }
  }
  return "";
}

function makerInitial(make: string) {
  return (make.trim()[0] ?? "?").toUpperCase();
}

/** Does this car's build range touch the years the page lists? */
function overlapsPageYears(
  v: AddPartVehicleRow,
  from: number | null,
  to: number | null,
  stillMade: boolean,
): boolean {
  if (from == null) return true;
  const lo = v.production_start_year ?? 0;
  const hi = v.production_end_year ?? 9999;
  const pageHi = stillMade || to == null ? 9999 : to;
  return hi >= from && lo <= pageHi;
}

function outsidePageNote(
  v: AddPartVehicleRow,
  from: number | null,
  to: number | null,
  stillMade: boolean,
): string {
  if (from == null) return "";
  const pageHi = stillMade || to == null ? null : to;
  if (pageHi != null && (v.production_start_year ?? 0) > pageHi) return `After ${pageHi} — not on this page`;
  if ((v.production_end_year ?? 9999) < from) return `Before ${from} — not on this page`;
  return "";
}

export function CatalogStep2Cars({
  draft,
  setDraft,
  onNext,
  onBack,
  framePreTickDone,
  setFramePreTickDone,
  preselectLoading,
  preselectError,
}: {
  draft: CatalogPageDraft;
  setDraft: Dispatch<SetStateAction<CatalogPageDraft>>;
  onNext: () => void;
  onBack: () => void;
  framePreTickDone: boolean;
  setFramePreTickDone: (v: boolean) => void;
  /** "Add parts to this car" is still loading that car's details. */
  preselectLoading?: boolean;
  /** That car could not be loaded, so nothing was added. */
  preselectError?: string;
}) {
  const [q, setQ] = useState("");
  const [onlyPageYears, setOnlyPageYears] = useState(false);
  const [carError, setCarError] = useState("");

  const from = draft.pageYearsFrom ?? null;
  const to = draft.pageYearsTo ?? null;
  const stillMade = draft.pageYearsStillMade === true;

  const codes = useMemo(
    () => draft.linkHints?.frameCodes?.length
      ? draft.linkHints.frameCodes
      : parseFrameCodesFromUrl(draft.evidenceUrl),
    [draft.evidenceUrl, draft.linkHints?.frameCodes],
  );

  const search = useQuery({
    queryKey: ["catalog-cars", q, codes.join(",")],
    queryFn: async () => {
      const queries = q.trim() ? [q.trim()] : codes;
      const all: AddPartVehicleRow[] = [];
      const seen = new Set<string>();
      for (const term of queries) {
        const rows = await searchAddPartVehicles({ q: term, chassis: term.match(/^[A-Z0-9]+$/i) ? term : undefined });
        for (const r of rows) {
          if (!seen.has(r.id)) {
            seen.add(r.id);
            all.push(r);
          }
        }
      }
      return all;
    },
    enabled: q.trim().length > 0 || codes.length > 0,
  });

  const selectedIds = useMemo(() => new Set(draft.vehicleListings.map((l) => l.vehicleId)), [draft.vehicleListings]);

  function trustFor(): CatalogVehicleListing["trust"] {
    return draft.linkHints?.trustedSite === true ? "confirmed" : "needs_checking";
  }

  function yearsFor(): { from?: number; to?: number } {
    return { from: from ?? undefined, to: stillMade ? undefined : (to ?? undefined) };
  }

  // Pre-tick: exactly the versions the page covers, and only after the years are entered (plan §4 Step 2).
  useEffect(() => {
    if (framePreTickDone || !codes.length || !search.data?.length) return;
    // Wait for the whole page range: ticking after "From" alone would tick versions the page does not cover.
    if (from == null || (to == null && !stillMade)) return;
    // CR-06: a half-typed year ("2", "202") is not a range yet: no tick, and the done flag stays off.
    if (catalogPageYearsProblem(draft) !== "") return;
    const toAdd: CatalogVehicleListing[] = [];
    const have = new Set(draft.vehicleListings.map((l) => l.vehicleId));
    for (const v of search.data) {
      const code = (v.chassis_code ?? "").toUpperCase();
      if (!codes.some((c) => code.includes(c.toUpperCase()))) continue;
      if (have.has(v.id)) continue;
      if (!overlapsPageYears(v, from, to, stillMade)) continue;
      have.add(v.id);
      toAdd.push(catalogListingFromVehicle(v, trustFor(), yearsFor()));
    }
    if (toAdd.length) {
      setDraft({ ...draft, vehicleListings: [...draft.vehicleListings, ...toAdd] });
    }
    setFramePreTickDone(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [framePreTickDone, codes, search.data, from, to, stillMade]);

  const sisters = useQuery({
    queryKey: ["catalog-sisters", [...selectedIds].sort().join(",")],
    queryFn: () => fetchSisterVehicles([...selectedIds]),
    enabled: selectedIds.size > 0,
  });

  const visibleRows = useMemo(() => {
    const rows = (search.data ?? []).filter((v) => !onlyPageYears || overlapsPageYears(v, from, to, stillMade));
    return rows;
  }, [search.data, onlyPageYears, from, to, stillMade]);

  const groups = useMemo(() => {
    const m = new Map<string, AddPartVehicleRow[]>();
    for (const v of visibleRows) {
      const key = `${v.make} ${v.model}`;
      const list = m.get(key) ?? [];
      list.push(v);
      m.set(key, list);
    }
    return [...m.entries()]
      .map(([label, rows]) => ({
        label,
        rows: rows.slice().sort((a, b) => (a.production_start_year ?? 0) - (b.production_start_year ?? 0)),
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [visibleRows]);

  function addListing(v: AddPartVehicleRow) {
    if (selectedIds.has(v.id)) return;
    setDraft({ ...draft, vehicleListings: [...draft.vehicleListings, catalogListingFromVehicle(v, trustFor(), yearsFor())] });
    setCarError("");
  }

  function removeListing(id: string) {
    setDraft({ ...draft, vehicleListings: draft.vehicleListings.filter((l) => l.vehicleId !== id) });
  }

  function toggleGroup(rows: AddPartVehicleRow[]) {
    const allIn = rows.every((v) => selectedIds.has(v.id));
    if (allIn) {
      setDraft({ ...draft, vehicleListings: draft.vehicleListings.filter((l) => !rows.some((v) => v.id === l.vehicleId)) });
      return;
    }
    const toAdd = rows
      .filter((v) => !selectedIds.has(v.id))
      .map((v) => catalogListingFromVehicle(v, trustFor(), yearsFor()));
    setDraft({ ...draft, vehicleListings: [...draft.vehicleListings, ...toAdd] });
    setCarError("");
  }

  function patchListing(id: string, patch: Partial<CatalogVehicleListing>) {
    setDraft({
      ...draft,
      vehicleListings: draft.vehicleListings.map((l) => (l.vehicleId === id ? { ...l, ...patch } : l)),
    });
  }

  const pageYearsError = catalogPageYearsProblem(draft);
  const nextBlocker = draft.vehicleListings.length === 0
    ? "Tick at least one car."
    : pageYearsError || catalogCarYearsProblem(draft);

  const nextBtn = (
    <div className="flex flex-col items-end gap-1">
      <PartsButton variant="primary" onClick={onNext} disabled={Boolean(nextBlocker)}>
        Next: the parts <MaterialIcon name="arrow_forward" className="text-[18px]" />
      </PartsButton>
      {nextBlocker ? <p className="text-[13px] text-error">{nextBlocker}</p> : null}
    </div>
  );

  const pageYearsLabel = from == null
    ? "No years yet"
    : stillMade || to == null
      ? `${from} to now`
      : `${from}–${to}`;

  return (
    <div className="flex flex-col gap-space-md max-w-[1120px]">
      <p className="catalog-step-mobile-label font-body-sm text-on-surface-variant sm:hidden">Step 2 of 4 · Cars</p>
      {preselectLoading ? (
        <p className={`${D_TINT} p-4 text-[14px] ${D_MUTED}`}>Loading that car…</p>
      ) : null}
      {preselectError ? (
        <p role="alert" className="rounded-xl border border-[#f3c0bf] bg-[#fdecec] p-4 text-[14px] text-[#a83836] dark:border-[#7f1d1d] dark:bg-[#450a0a]">
          {preselectError}
        </p>
      ) : null}
      <DQuestion
        title="Which cars is this page for?"
        hint="The page you pasted carries a frame code. We found the versions with that code — tick the ones the page lists."
      />
      <div className="grid grid-cols-1 gap-space-md lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex flex-col gap-space-md">
          <section className="rounded-xl border border-[#e6e7ee] bg-white p-4 dark:border-[#1e293b] dark:bg-[#111a2e]">
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <p className={`mb-2 text-[14px] font-semibold ${D_TXT}`}>Years on the page</p>
                <div className="flex items-center gap-2">
                  <label className="flex flex-col gap-1 text-[12px] text-[#5d5f68] dark:text-[#94a3b8]">
                    From
                    <input
                      aria-label="Page year from"
                      inputMode="numeric"
                      className="h-10 w-[92px] rounded-lg border border-[#c5c6d0] bg-white px-2 text-[14px] dark:bg-[#0b1220] dark:border-[#1e293b]"
                      placeholder="e.g. 2016"
                      value={from ?? ""}
                      onChange={(e) => {
                        const n = Number.parseInt(e.target.value, 10);
                        setDraft({ ...draft, pageYearsFrom: Number.isFinite(n) ? n : null });
                      }}
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-[12px] text-[#5d5f68] dark:text-[#94a3b8]">
                    To
                    <input
                      aria-label="Page year to"
                      inputMode="numeric"
                      disabled={stillMade}
                      className="h-10 w-[92px] rounded-lg border border-[#c5c6d0] bg-white px-2 text-[14px] disabled:opacity-50 dark:bg-[#0b1220] dark:border-[#1e293b]"
                      placeholder={stillMade ? "now" : "e.g. 2020"}
                      value={stillMade ? "" : (to ?? "")}
                      onChange={(e) => {
                        const n = Number.parseInt(e.target.value, 10);
                        setDraft({ ...draft, pageYearsTo: Number.isFinite(n) ? n : null });
                      }}
                    />
                  </label>
                  <label className="flex min-h-[40px] items-center gap-2 text-[13px] text-[#30323b] dark:text-[#e2e8f0]">
                    <input
                      type="checkbox"
                      checked={stillMade}
                      onChange={(e) => setDraft({ ...draft, pageYearsStillMade: e.target.checked })}
                    />
                    Still made
                  </label>
                </div>
              </div>
              <p className={`ml-auto text-[13px] ${D_MUTED}`}>This page covers {pageYearsLabel}.</p>
            </div>
            {pageYearsError ? <p className="mt-2 text-[13px] text-error">{pageYearsError}</p> : null}
            {codes.length ? (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className={`text-[13px] ${D_MUTED}`}>Frame codes:</span>
                {codes.map((c) => (
                  <span key={c} className="rounded-md bg-[#f3f4fb] px-2 py-1 font-mono text-[12px] text-[#30323b] dark:bg-[#0b1220] dark:text-[#e2e8f0]">
                    {c}
                  </span>
                ))}
                <span className={`text-[12px] ${D_MUTED}`}>These came from the link.</span>
              </div>
            ) : null}
          </section>

          <div className="flex flex-wrap items-center gap-2">
            <label className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-lg border border-[#e6e7ee] bg-white px-3 dark:border-[#1e293b] dark:bg-[#111a2e]">
              <MaterialIcon name="search" className="text-[20px] text-[#5d5f68]" />
              <input
                aria-label="Search for a car"
                className="min-w-0 flex-1 bg-transparent text-[14px] outline-none"
                placeholder="Or search a car by name, model or frame code"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </label>
            {q ? (
              <PartsButton variant="secondary" onClick={() => setQ("")}>
                Clear
              </PartsButton>
            ) : null}
          </div>

          <label className={`flex min-h-[44px] items-center gap-2 text-[14px] ${D_TXT}`}>
            <input type="checkbox" checked={onlyPageYears} onChange={(e) => setOnlyPageYears(e.target.checked)} />
            Show only the versions in these years
          </label>

          {search.isLoading ? (
            <p className={`${D_TINT} p-4 text-[14px] ${D_MUTED}`}>Looking for the versions on this page…</p>
          ) : search.isError ? (
            <p className="rounded-xl border border-[#f3c0bf] bg-[#fdecec] p-4 text-[14px] text-[#a83836]">
              Could not read the car list. Check the link, or search for the car by name.
            </p>
          ) : groups.length === 0 ? (
            <p className={`${D_TINT} p-4 text-[14px] ${D_MUTED}`}>
              No versions came from this page yet. Paste the link again on the first step, or search for the car by name or frame code.
            </p>
          ) : (
            <div className="flex flex-col gap-space-md">
              <p className={`text-[14px] ${D_MUTED}`}>{groups.reduce((n, g) => n + g.rows.length, 0)} versions found.</p>
              {groups.map((g) => {
                const allIn = g.rows.every((v) => selectedIds.has(v.id));
                return (
                  <section key={g.label} className="overflow-hidden rounded-xl border border-[#e6e7ee] bg-white dark:border-[#1e293b] dark:bg-[#111a2e]">
                    <div className="flex flex-wrap items-center gap-2 border-b border-[#e6e7ee] px-4 py-3 dark:border-[#1e293b]">
                      <p className={`text-[15px] font-semibold ${D_TXT}`}>{g.label}</p>
                      <span className={`text-[13px] ${D_MUTED}`}>{g.rows.length} versions</span>
                      <div className="ml-auto flex items-center gap-2">
                        <label className="flex min-h-[36px] items-center gap-2 text-[13px] text-[#30323b] dark:text-[#e2e8f0]">
                          <input type="checkbox" checked={allIn} onChange={() => toggleGroup(g.rows)} />
                          Tick all {g.label.split(" ").pop()}
                        </label>
                      </div>
                    </div>
                    <ul className="divide-y divide-[#e6e7ee] dark:divide-[#1e293b]">
                      {g.rows.map((v) => {
                        const on = selectedIds.has(v.id);
                        const note = outsidePageNote(v, from, to, stillMade);
                        const years = v.production_start_year && v.production_end_year
                          ? `${v.production_start_year}–${v.production_end_year}`
                          : v.production_start_year
                            ? `${v.production_start_year}–now`
                            : "Years not on file";
                        return (
                          <li key={v.id} className="flex items-start gap-3 px-4 py-3">
                            <input
                              type="checkbox"
                              className="mt-1"
                              aria-label={`Tick ${v.make} ${v.model} ${v.chassis_code ?? ""} ${v.production_start_year ?? ""}`}
                              checked={on}
                              onChange={() => (on ? removeListing(v.id) : addListing(v))}
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className={`text-[14px] font-medium ${D_TXT}`}>{years}</span>
                                <span className="rounded-md bg-[#f3f4fb] px-2 py-0.5 font-mono text-[12px] text-[#30323b] dark:bg-[#0b1220] dark:text-[#e2e8f0]">
                                  {v.chassis_code ?? "—"}
                                </span>
                                <span className={`text-[13px] ${D_MUTED}`}>{vehicleDiffLabel(v)}</span>
                              </div>
                              {note ? (
                                <p className="mt-1 inline-flex rounded-full bg-[#fff4dc] px-2 py-0.5 text-[12px] text-[#8a5a00] dark:bg-[#451a03] dark:text-[#fbbf24]">
                                  {note}
                                </p>
                              ) : null}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                );
              })}
            </div>
          )}
        </div>

        <aside className="flex h-fit flex-col gap-3 rounded-xl border border-[#e6e7ee] bg-white p-4 dark:border-[#1e293b] dark:bg-[#111a2e]">
          <p className={`text-[15px] font-semibold ${D_TXT}`}>Selected · {draft.vehicleListings.length} cars</p>
          {draft.vehicleListings.length > 0 ? (
            <ul className="flex flex-col gap-3">
              {draft.vehicleListings.map((l) => (
                <li key={l.vehicleId} className="rounded-xl bg-[#f3f4fb] p-3 dark:bg-[#0b1220]">
                  <div className="flex items-start gap-2">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#dbe1ff] text-[12px] font-semibold text-[#0153dc]">
                      {makerInitial(l.make ?? l.label ?? "")}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={`text-[14px] font-medium ${D_TXT}`}>{l.label}</p>
                      <p className={`text-[12px] ${D_MUTED}`}>
                        {l.chassisCode ?? ""}
                        {l.diffLabel ? ` · ${l.diffLabel}` : ""}
                      </p>
                    </div>
                    <button
                      type="button"
                      aria-label={`Remove ${l.label}`}
                      className="flex h-8 w-8 items-center justify-center rounded-full text-[#5d5f68] hover:bg-white dark:hover:bg-[#111a2e]"
                      onClick={() => removeListing(l.vehicleId)}
                    >
                      <MaterialIcon name="close" className="text-[18px]" />
                    </button>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      aria-label={`${l.label} year from`}
                      inputMode="numeric"
                      className="h-9 w-[76px] rounded-md border border-[#c5c6d0] bg-white px-2 text-[13px] dark:bg-[#111a2e] dark:border-[#1e293b]"
                      value={l.yearFrom ?? ""}
                      onChange={(e) => {
                        const n = Number.parseInt(e.target.value, 10);
                        patchListing(l.vehicleId, { yearFrom: Number.isFinite(n) ? n : undefined });
                      }}
                    />
                    <span className={D_MUTED}>to</span>
                    <input
                      aria-label={`${l.label} year to`}
                      inputMode="numeric"
                      className="h-9 w-[76px] rounded-md border border-[#c5c6d0] bg-white px-2 text-[13px] dark:bg-[#111a2e] dark:border-[#1e293b]"
                      value={l.yearTo ?? ""}
                      onChange={(e) => {
                        const n = Number.parseInt(e.target.value, 10);
                        patchListing(l.vehicleId, { yearTo: Number.isFinite(n) ? n : undefined });
                      }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className={`${D_TINT} p-3 text-[14px] ${D_MUTED}`}>Tick the cars this page is for.</p>
          )}
          {draft.vehicleListings.length > 0 ? (
            <PartsButton variant="danger" className="w-full" onClick={() => setDraft({ ...draft, vehicleListings: [] })}>
              <MaterialIcon name="delete_sweep" className="text-[18px]" /> Clear all
            </PartsButton>
          ) : null}
          {carError ? <p className="text-[13px] text-error">{carError}</p> : null}
          {sisters.data?.length ? (
            <div className="rounded-xl border border-[#e6e7ee] p-3 dark:border-[#1e293b]">
              <p className={`text-[14px] font-semibold ${D_TXT}`}>{sisters.data.length} sister cars</p>
              <p className={`mt-1 text-[13px] ${D_MUTED}`}>
                These are built on the same car. Add the matching versions?
              </p>
              <PartsButton
                variant="secondary"
                className="mt-2 w-full"
                onClick={() => {
                  const toAdd = sisters.data
                    .filter((v) => !selectedIds.has(v.id))
                    .map((v) => catalogListingFromVehicle(v, trustFor(), yearsFor()));
                  if (toAdd.length) setDraft({ ...draft, vehicleListings: [...draft.vehicleListings, ...toAdd] });
                }}
              >
                Add these cars
              </PartsButton>
            </div>
          ) : null}
        </aside>
      </div>
      <DFooter
        left={
          <PartsButton variant="secondary" onClick={onBack}>
            <MaterialIcon name="arrow_back" className="text-[18px]" /> Back: the page
          </PartsButton>
        }
        right={nextBtn}
      />
    </div>
  );
}
