/**
 * F8 — every car the part fits, ported from
 * docs/stitch/fleet-find-parts-everyday/every_car_the_front_pads_fit_cross_maker_matrix_roam_fleet/code.html
 * Dropped: "Light Mode / Dark Preview", "ACTIVE FLEET QUERY", "Front Axle Disc System", "Cross-ref index",
 * "Platform Breakdown / Expanded View". Added: logos, "Where this comes from".
 */
import { useMemo, useState } from "react";
import { MakerLogo, TrustBadge, mapTrustLabel, useCopyToast } from "./EverydayShared";
import { CARD, Icon, IconBox, MONO, MUTED, SBtn, SChip, SIconBtn, SPlate, TILE, TXT } from "./stitchKit";

type FitRow = {
  make: string;
  model: string;
  years: string;
  version?: string;
  difference?: string;
  trust: string;
  isYourCar?: boolean;
};

export function EverydayAlsoFitsSheet({
  open,
  onClose,
  partName,
  partNumber,
  rows,
  sources,
  plate,
}: {
  open: boolean;
  onClose: () => void;
  partName: string;
  partNumber: string;
  rows: FitRow[];
  sources: Array<{ label: string; url: string }>;
  plate?: string;
}) {
  const { copy, toast } = useCopyToast();
  const [filter, setFilter] = useState<"all" | "verified" | "check">("all");
  const [expandedMake, setExpandedMake] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (filter === "verified") return rows.filter((r) => mapTrustLabel(r.trust) === "verified");
    if (filter === "check") return rows.filter((r) => mapTrustLabel(r.trust) === "check");
    return rows;
  }, [filter, rows]);

  const byMake = useMemo(() => {
    const map = new Map<string, FitRow[]>();
    for (const row of filtered) {
      const list = map.get(row.make) || [];
      list.push(row);
      map.set(row.make, list);
    }
    return [...map.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
  }, [filtered]);

  const verifiedCount = rows.filter((r) => mapTrustLabel(r.trust) === "verified").length;
  const checkCount = rows.length - verifiedCount;
  const makerCount = new Set(rows.map((r) => r.make)).size;
  const yourCar = rows.find((r) => r.isYourCar);
  const openMake = expandedMake ?? byMake[0]?.[0] ?? null;
  const openList = byMake.find(([m]) => m === openMake)?.[1] || [];

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-[#0b1c30]/30 backdrop-blur-[2px]" role="presentation" onClick={onClose}>
      <div
        className="flex h-full w-full max-w-[760px] flex-col bg-[#f8f9ff] shadow-2xl dark:bg-[#1c1c1e]"
        role="dialog"
        aria-label="Every car this part fits"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex-1 overflow-y-auto px-6 pb-6 pt-5 sm:px-8">
          <div className="mb-5 flex items-center justify-between gap-3">
            <SBtn kind="secondary" icon="arrow_back" onClick={onClose}>Back to the part</SBtn>
            <SIconBtn icon="close" label="Close" onClick={onClose} className="h-10 w-10 rounded-full" />
          </div>

          <div className={`${TILE} mb-6 flex flex-col gap-4 p-5 sm:flex-row sm:items-center`}>
            <IconBox name="layers" size="lg" className="!bg-white dark:!bg-[#2a2a2d]" />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className={`text-[22px] font-semibold ${TXT}`}>{partName}</p>
                <span className="inline-flex items-center gap-2 rounded-xl bg-white px-3 py-1.5 shadow-sm dark:bg-[#2a2a2d]">
                  <span className={`${MONO} text-[17px] ${TXT}`}>{partNumber}</span>
                  <SIconBtn icon="content_copy" label={`Copy ${partNumber}`} className="h-8 w-8" onClick={() => void copy(partNumber, partNumber)} />
                </span>
              </div>
              <p className={`text-[15px] ${MUTED}`}>
                Ask for any of these cars and you get the same part. Fits {rows.length} cars across {makerCount} makers.
              </p>
            </div>
          </div>

          <div className="mb-6 flex flex-wrap gap-2">
            <SChip selected={filter === "all"} onClick={() => setFilter("all")}>All ({rows.length})</SChip>
            <SChip selected={filter === "verified"} onClick={() => setFilter("verified")}>
              <span className="h-2 w-2 rounded-full bg-[#059669]" /> Verified only ({verifiedCount})
            </SChip>
            <SChip selected={filter === "check"} onClick={() => setFilter("check")}>
              <span className="h-2 w-2 rounded-full bg-[#f59e0b]" /> Check before buying ({checkCount})
            </SChip>
          </div>

          {yourCar ? (
            <div className={`${TILE} mb-6 flex items-center gap-4 p-5 ring-2 ring-[#030213] dark:ring-[#fafafa]`}>
              <MakerLogo make={yourCar.make} size={48} />
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <p className={`text-[18px] font-semibold ${TXT}`}>{yourCar.make} {yourCar.model} ({yourCar.years})</p>
                {plate ? <SPlate plate={plate} /> : null}
              </div>
              <span className={`inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 text-[13px] font-semibold shadow-sm dark:bg-[#2a2a2d] ${TXT}`}>
                <Icon name="directions_car" className="text-[15px]" /> Your car
              </span>
            </div>
          ) : null}

          <div className="mb-3 flex items-center justify-between">
            <p className={`text-[20px] font-semibold ${TXT}`}>By maker</p>
            <span className={`text-sm ${MUTED}`}>{byMake.length} makers</span>
          </div>
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {byMake.map(([make, list]) => {
              const on = make === openMake;
              const allVerified = list.every((r) => mapTrustLabel(r.trust) === "verified");
              return (
                <button
                  key={make}
                  type="button"
                  onClick={() => setExpandedMake(make)}
                  className={`flex flex-col gap-3 rounded-2xl p-4 text-left transition-all ${
                    on ? "bg-[#dce9ff] ring-2 ring-[#030213] dark:bg-[#3a3a3d] dark:ring-[#fafafa]" : "bg-white ring-1 ring-[#e5eeff] hover:ring-[#cbd5e1] dark:bg-[#2a2a2d] dark:ring-[#3a3a3d]"
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <MakerLogo make={make} size={36} />
                    <span className={`mt-1 h-2.5 w-2.5 rounded-full ${allVerified ? "bg-[#059669]" : "bg-[#f59e0b]"}`} />
                  </div>
                  <div>
                    <p className={`text-[16px] font-semibold ${TXT}`}>{make}</p>
                    <p className={`text-sm ${MUTED}`}>{list.length === 1 ? "1 car" : `${list.length} cars`}</p>
                  </div>
                </button>
              );
            })}
          </div>

          {openMake ? (
            <div className={`${CARD} mb-6 flex flex-col gap-3 p-5`}>
              <div className="flex items-center gap-3">
                <MakerLogo make={openMake} size={32} />
                <p className={`text-[18px] font-semibold ${TXT}`}>{openMake} · {openList.length === 1 ? "1 car" : `${openList.length} cars`}</p>
              </div>
              <ul className="flex flex-col gap-2">
                {openList.map((row, i) => (
                  <li key={i} className={`${TILE} flex items-center justify-between gap-3 px-4 py-3`}>
                    <div className="flex items-center gap-3">
                      <Icon name="directions_car" className={`text-[20px] ${MUTED}`} />
                      <div>
                        <p className={`text-[16px] font-semibold ${TXT}`}>{row.model}</p>
                        <p className={`text-sm ${MUTED}`}>
                          {row.years}
                          {row.difference || row.version ? ` · ${row.difference || row.version}` : ""}
                        </p>
                      </div>
                    </div>
                    <TrustBadge trust={mapTrustLabel(row.trust)} />
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {sources.length ? (
            <div className={`${CARD} flex flex-col gap-3 p-5`}>
              <p className={`text-[17px] font-semibold ${TXT}`}>Where this comes from</p>
              {sources.map((s) => (
                <div key={s.url} className="flex flex-wrap items-center justify-between gap-2">
                  <span className={`text-[15px] ${MUTED}`}>{s.label}</span>
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noreferrer"
                    className={`inline-flex items-center gap-1.5 rounded-xl border border-[#cbd5e1] bg-white px-4 py-2 text-sm font-semibold no-underline hover:bg-[#eff4ff] dark:border-[#3a3a3d] dark:bg-[#1c1c1e] ${TXT}`}
                  >
                    Open the maker&apos;s page <Icon name="open_in_new" className="text-[16px]" />
                  </a>
                </div>
              ))}
            </div>
          ) : null}
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-[#e5eeff] bg-white px-6 py-4 dark:border-[#3a3a3d] dark:bg-[#2a2a2d] sm:px-8">
          <span className={`text-[15px] ${MUTED}`}>{filtered.length} {filtered.length === 1 ? "car fits" : "cars fit"} this part</span>
          <SBtn kind="primary" size="lg" onClick={onClose}>Done</SBtn>
        </div>
        {toast}
      </div>
    </div>
  );
}
