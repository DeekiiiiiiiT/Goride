import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { useQuery } from "@tanstack/react-query";
import { PartsButton } from "../../PartsButton";
import { MaterialIcon } from "../../import/MaterialIcon";
import type { CatalogPageDraft, CatalogVehicleListing } from "../addPartsTypes";
import { fetchSisterVehicles, searchAddPartVehicles, type AddPartVehicleRow } from "../addPartsApi";
import { parseFrameCodesFromUrl } from "./linkFrameCodes";
import { vehicleDiffLabel, vehicleYearsLabel } from "./vehicleDiffLabel";
import { MakerLogo } from "../../../vehicle-catalog/MakerLogo";
import { fetchCatalogMakers } from "../../../vehicle-catalog/vehiclesCatalogApi";
import { D_MUTED, D_TINT, D_TXT, DCode, DFooter, DPill, DQuestion } from "./dominionKit";

function catalogListingFromVehicle(
  v: AddPartVehicleRow,
  trust?: CatalogVehicleListing["trust"],
): CatalogVehicleListing {
  return {
    vehicleId: v.id,
    label: `${v.make} ${v.model}`,
    make: v.make,
    model: v.model,
    chassisCode: v.chassis_code,
    yearFrom: v.production_start_year ?? undefined,
    yearTo: v.production_end_year ?? undefined,
    diffLabel: vehicleDiffLabel(v),
    trust,
  };
}

function makerInitial(make: string) {
  return (make.trim()[0] ?? "?").toUpperCase();
}

function useMakerLogos() {
  const q = useQuery({ queryKey: ["catalog-makers"], queryFn: fetchCatalogMakers });
  const map = new Map<string, string | null | undefined>();
  for (const m of q.data?.items ?? []) map.set(m.make.toLowerCase(), m.logo_storage_path);
  return map;
}

const FRAME_TOOLTIP = "Frame code from the car's ID plate — used to tell versions apart.";

export function CatalogStep2Cars({
  draft,
  setDraft,
  onNext,
  onBack,
  framePreTickDone,
  setFramePreTickDone,
}: {
  draft: CatalogPageDraft;
  setDraft: Dispatch<SetStateAction<CatalogPageDraft>>;
  onNext: () => void;
  onBack: () => void;
  framePreTickDone: boolean;
  setFramePreTickDone: (v: boolean) => void;
}) {
  const [q, setQ] = useState("");
  const [carError, setCarError] = useState("");

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

  const sisters = useQuery({
    queryKey: ["catalog-sisters", [...selectedIds].sort().join(",")],
    queryFn: () => fetchSisterVehicles([...selectedIds]),
    enabled: selectedIds.size > 0,
  });

  useEffect(() => {
    if (framePreTickDone || !codes.length || !search.data?.length) return;
    const toAdd: CatalogVehicleListing[] = [];
    const have = new Set(draft.vehicleListings.map((l) => l.vehicleId));
    for (const v of search.data) {
      const code = (v.chassis_code ?? "").toUpperCase().split(/[-\s]/)[0] ?? "";
      if (codes.some((c) => code.startsWith(c) || code.includes(c))) {
        if (!have.has(v.id)) {
          have.add(v.id);
          toAdd.push(
            catalogListingFromVehicle(v, draft.linkHints?.trustedSite ? "confirmed" : "needs_checking"),
          );
        }
      }
    }
    setFramePreTickDone(true);
    if (toAdd.length) {
      setDraft((prev) => ({ ...prev, vehicleListings: [...prev.vehicleListings, ...toAdd] }));
    }
  }, [codes, search.data, framePreTickDone, draft.linkHints?.trustedSite, draft.vehicleListings, setDraft, setFramePreTickDone]);

  function toggle(v: AddPartVehicleRow) {
    if (draft.vehicleListings.some((l) => l.vehicleId === v.id && l.locked)) return;
    if (selectedIds.has(v.id)) {
      setDraft({ ...draft, vehicleListings: draft.vehicleListings.filter((l) => l.vehicleId !== v.id) });
    } else {
      setDraft({
        ...draft,
        vehicleListings: [
          ...draft.vehicleListings,
          catalogListingFromVehicle(v, draft.linkHints?.trustedSite ? "confirmed" : undefined),
        ],
      });
    }
  }

  function addSisters() {
    const sibs = sisters.data ?? [];
    const next = [...draft.vehicleListings];
    const have = new Set(next.map((l) => l.vehicleId));
    for (const v of sibs) {
      if (!have.has(v.id)) {
        have.add(v.id);
        next.push(catalogListingFromVehicle(v, draft.linkHints?.trustedSite ? "confirmed" : undefined));
      }
    }
    setDraft({ ...draft, vehicleListings: next });
  }

  function tryNext() {
    if (!draft.vehicleListings.length) {
      setCarError("Pick at least one car this page is for.");
      return;
    }
    setCarError("");
    onNext();
  }

  function updateListingYears(vehicleId: string, yearFrom?: number, yearTo?: number) {
    setDraft({
      ...draft,
      vehicleListings: draft.vehicleListings.map((l) =>
        l.vehicleId === vehicleId ? { ...l, yearFrom, yearTo } : l),
    });
  }

  function toggleGroup(rows: AddPartVehicleRow[], selectAll: boolean) {
    if (selectAll) {
      const next = [...draft.vehicleListings];
      const have = new Set(next.map((l) => l.vehicleId));
      for (const v of rows) {
        if (have.has(v.id)) continue;
        if (draft.vehicleListings.some((l) => l.vehicleId === v.id && l.locked)) continue;
        have.add(v.id);
        next.push(catalogListingFromVehicle(v, draft.linkHints?.trustedSite ? "confirmed" : undefined));
      }
      setDraft({ ...draft, vehicleListings: next });
    } else {
      const ids = new Set(rows.map((r) => r.id));
      setDraft({
        ...draft,
        vehicleListings: draft.vehicleListings.filter((l) => l.locked || !ids.has(l.vehicleId)),
      });
    }
  }

  const grouped = useMemo(() => {
    const m = new Map<string, AddPartVehicleRow[]>();
    for (const v of search.data ?? []) {
      const key = `${v.make}\0${v.model}`;
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(v);
    }
    return m;
  }, [search.data]);

  const vehicleById = useMemo(() => {
    const m = new Map<string, AddPartVehicleRow>();
    for (const v of [...(search.data ?? []), ...(sisters.data ?? [])]) m.set(v.id, v);
    return m;
  }, [search.data, sisters.data]);

  const makerLogos = useMakerLogos();

  function resolveDiffLabel(l: CatalogVehicleListing): string {
    if (l.diffLabel) return l.diffLabel;
    const v = vehicleById.get(l.vehicleId);
    return v ? vehicleDiffLabel(v) : "—";
  }

  const nextLabel = draft.extendMode ? "Next: review" : "Next: the parts";
  const nextBtn = (
    <PartsButton variant="primary" onClick={tryNext}>
      {nextLabel} <MaterialIcon name="arrow_forward" className="text-[18px]" />
    </PartsButton>
  );
  const foundCount = codes.length && search.data
    ? search.data.filter((v) => codes.some((c) => (v.chassis_code ?? "").toUpperCase().includes(c))).length
    : 0;

  return (
    <div className="flex flex-col">
      <DQuestion
        title="Which cars does this page cover?"
        hint={
          <>
            Type a model or paste the frame / chassis codes from the page — several at once is fine, e.g.{" "}
            <DCode>M900A</DCode> , <DCode>M910A</DCode>.
          </>
        }
        actions={<span className="hidden sm:inline-flex">{nextBtn}</span>}
      />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <div className={`${D_TINT} p-2`}>
            <div className="relative">
              <MaterialIcon name="manage_search" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[22px] text-[#5d5f68]" />
              <input
                className={`h-12 w-full rounded-lg border bg-white pl-11 pr-4 text-[15px] dark:bg-[#111a2e] ${carError ? "border-error ring-2 ring-error/20" : "border-[#e6e7ee] dark:border-[#1e293b]"}`}
                placeholder="Search a model, or paste codes — e.g. M900A, M910A"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            {carError ? <p className="mt-2 px-1 text-error font-body-sm">{carError}</p> : null}
            {foundCount ? (
              <p className="mt-2 flex items-center gap-2 px-1 text-[14px] text-[#006e31] dark:text-[#4ade80]">
                <MaterialIcon name="check_circle" className="text-[18px]" />
                Found {foundCount} version{foundCount === 1 ? "" : "s"} for {codes.join(" and ")}
              </p>
            ) : null}
          </div>

          {(sisters.data?.length ?? 0) > 0 ? (
            <div className="flex flex-col justify-between gap-4 rounded-xl border border-[#dbe1ff] bg-[#f3f6ff] p-5 dark:border-[#1e3a8a]/50 dark:bg-[#1e3a8a]/20 sm:flex-row sm:items-center">
              <div className="flex flex-col gap-2">
                <p className={`text-[18px] font-semibold ${D_TXT}`}>Same car, other badges</p>
                <p className={`text-[14px] ${D_MUTED}`}>These are built on the same car. Add the matching versions?</p>
                <div className="flex flex-wrap gap-2">
                  {[...new Set((sisters.data ?? []).map((v) => `${v.make} ${v.model}`))].map((name) => (
                    <span key={name} className={`inline-flex items-center gap-1.5 rounded-full border border-[#e6e7ee] bg-white px-2.5 py-1 text-[13px] dark:border-[#1e293b] dark:bg-[#111a2e] ${D_TXT}`}>
                      <MakerLogo make={name.split(" ")[0]!} logoStoragePath={makerLogos.get(name.split(" ")[0]!.toLowerCase())} size={18} />
                      {name}
                    </span>
                  ))}
                </div>
              </div>
              <PartsButton variant="secondary" className="shrink-0" onClick={addSisters}>
                <MaterialIcon name="add_circle" className="text-[18px]" />
                Add {sisters.data!.length} sister car{sisters.data!.length === 1 ? "" : "s"}
              </PartsButton>
            </div>
          ) : null}

          <div className="flex flex-col gap-4">
            {[...grouped.entries()].map(([key, rows]) => {
              const [make, model] = key.split("\0");
              const allOn = rows.length > 0 && rows.every((v) => selectedIds.has(v.id) || draft.vehicleListings.some((l) => l.vehicleId === v.id && l.locked));
              return (
                <div key={key} className="overflow-hidden rounded-xl border border-[#e6e7ee] dark:border-[#1e293b]">
                  <div className="flex flex-wrap items-center justify-between gap-3 bg-[#f3f4fb] px-4 py-3 dark:bg-[#0b1220]">
                    <div className="flex items-center gap-3">
                      <MakerLogo make={make!} logoStoragePath={makerLogos.get(make!.toLowerCase())} size={36} />
                      <p className={`text-[18px] font-semibold ${D_TXT}`}>{make} {model}</p>
                    </div>
                    <label className={`flex cursor-pointer items-center gap-2 rounded-lg border border-[#c5c6d0] bg-white px-3 py-1.5 text-[14px] dark:border-[#1e293b] dark:bg-[#111a2e] ${D_TXT}`}>
                      <input type="checkbox" className="h-4 w-4 accent-[#0153dc]" checked={allOn} onChange={(e) => toggleGroup(rows, e.target.checked)} />
                      Tick all {model} ({rows.length} version{rows.length === 1 ? "" : "s"})
                    </label>
                  </div>
                  <div className="divide-y divide-[#e6e7ee] dark:divide-[#1e293b]">
                    {rows.map((v) => {
                      const locked = draft.vehicleListings.some((l) => l.vehicleId === v.id && l.locked);
                      return (
                        <label
                          key={v.id}
                          className={`flex items-center gap-3 px-4 py-3 ${locked ? "opacity-70" : "cursor-pointer hover:bg-[#f9f9fd] dark:hover:bg-[#0b1220]"}`}
                        >
                          <input
                            type="checkbox"
                            className="h-4 w-4 accent-[#0153dc]"
                            checked={selectedIds.has(v.id)}
                            disabled={locked}
                            onChange={() => toggle(v)}
                          />
                          <span className={`text-[15px] ${D_TXT}`}>
                            {model} · {vehicleYearsLabel(v)} · {vehicleDiffLabel(v)}
                          </span>
                          {v.chassis_code ? <span title={FRAME_TOOLTIP}><DCode>{v.chassis_code}</DCode></span> : null}
                          {locked ? <DPill tone="grey">Already on file</DPill> : null}
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <aside className="h-fit rounded-xl border border-[#e6e7ee] bg-white p-5 dark:border-[#1e293b] dark:bg-[#111a2e] lg:sticky lg:top-24">
          {draft.extendMode ? (
            <div className="mb-4 grid grid-cols-3 gap-2 border-b border-[#e6e7ee] pb-4 text-center dark:border-[#1e293b]">
              <div><p className={`text-[20px] font-semibold ${D_TXT}`}>{draft.vehicleListings.filter((l) => l.locked).length}</p><p className={`text-[12px] ${D_MUTED}`}>Fits now</p></div>
              <div><p className="text-[20px] font-semibold text-[#0153dc]">+{draft.vehicleListings.filter((l) => !l.locked).length}</p><p className={`text-[12px] ${D_MUTED}`}>Adding</p></div>
              <div><p className={`text-[20px] font-semibold ${D_TXT}`}>{draft.vehicleListings.length}</p><p className={`text-[12px] ${D_MUTED}`}>After save</p></div>
            </div>
          ) : null}
          <div className="mb-3 flex items-center gap-2">
            <p className={`text-[20px] font-semibold ${D_TXT}`}>Selected</p>
            <span className="rounded-full bg-[#0153dc] px-2.5 py-0.5 text-[13px] font-semibold text-white">
              {draft.vehicleListings.length} car{draft.vehicleListings.length === 1 ? "" : "s"}
            </span>
          </div>
          {draft.vehicleListings.length ? (
            <ul className="flex max-h-[460px] flex-col gap-2 overflow-y-auto">
              {draft.vehicleListings.map((l) => {
                const make = l.make ?? l.label?.split(" ")[0] ?? "?";
                return (
                  <li key={l.vehicleId} className={`${D_TINT} flex flex-col gap-2 p-3`}>
                    <div className="flex items-start gap-2.5">
                      <MakerLogo make={make} logoStoragePath={makerLogos.get(make.toLowerCase())} size={28} />
                      <div className="min-w-0 flex-1">
                        <p className={`text-[14px] font-semibold ${D_TXT}`}>{l.make ?? ""} {l.model ?? l.label ?? ""}</p>
                        <p className={`text-[13px] ${D_MUTED}`}>{resolveDiffLabel(l)}</p>
                        {l.chassisCode ? <DCode>{l.chassisCode}</DCode> : null}
                      </div>
                      {l.locked ? null : (
                        <PartsButton
                          variant="danger"
                          className="!h-8 !w-8 !p-0 shrink-0"
                          aria-label={`Remove ${l.make ?? ""} ${l.model ?? ""}`}
                          onClick={() => setDraft({ ...draft, vehicleListings: draft.vehicleListings.filter((x) => x.vehicleId !== l.vehicleId) })}
                        >
                          <MaterialIcon name="close" className="text-[16px]" />
                        </PartsButton>
                      )}
                    </div>
                    <div className="flex items-center gap-2 pl-[38px]">
                      <span className={`text-[12px] ${D_MUTED}`}>Years</span>
                      <input
                        type="number"
                        aria-label="From year"
                        className="h-8 w-[72px] rounded-lg border border-[#c5c6d0] bg-white px-2 text-[13px] dark:border-[#1e293b] dark:bg-[#111a2e]"
                        value={l.yearFrom ?? ""}
                        disabled={l.locked}
                        onChange={(e) => updateListingYears(l.vehicleId, e.target.value ? Number(e.target.value) : undefined, l.yearTo)}
                      />
                      <span className={D_MUTED}>–</span>
                      <input
                        type="number"
                        aria-label="To year"
                        placeholder="on"
                        className="h-8 w-[72px] rounded-lg border border-[#c5c6d0] bg-white px-2 text-[13px] dark:border-[#1e293b] dark:bg-[#111a2e]"
                        value={l.yearTo && l.yearTo < 9999 ? l.yearTo : ""}
                        disabled={l.locked}
                        onChange={(e) => updateListingYears(l.vehicleId, l.yearFrom, e.target.value ? Number(e.target.value) : undefined)}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className={`${D_TINT} p-4 text-[14px] ${D_MUTED}`}>Tick the cars this page is for.</p>
          )}
          {draft.vehicleListings.length > 0 ? (
            <PartsButton variant="danger" className="mt-3 w-full" onClick={() => setDraft({ ...draft, vehicleListings: [] })}>
              <MaterialIcon name="delete_sweep" className="text-[18px]" /> Clear all
            </PartsButton>
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
