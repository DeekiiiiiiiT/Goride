/**
 * F8 — every car the part fits, ported from
 * docs/stitch/fleet-find-parts-everyday/every_car_the_front_pads_fit_cross_maker_matrix_roam_fleet/code.html
 * Dropped: "Light Mode / Dark Preview", "ACTIVE FLEET QUERY", "Front Axle Disc System", "Cross-ref index",
 * "Platform Breakdown / Expanded View". Added: logos. "Where this comes from" (maker page links) removed 9 Nov: owner does not show source links to users.
 */
import { useMemo, useState } from "react";
import { MakerLogo, TrustBadge, mapTrustLabel, useCopyToast } from "./EverydayShared";
import { buildStoreCopyText, carDetailsLine, type StoreBrandNumber } from "./storeCopyText";
import { CARD, Icon, MUTED, SBtn, SChip, SIconBtn, SPlate, TILE, TXT } from "./stitchKit";

type FitRow = {
  make: string;
  model: string;
  years: string;
  version?: string;
  difference?: string;
  trust: string;
  isYourCar?: boolean;
  chassis?: string;
  engine?: string;
};

export function EverydayAlsoFitsSheet({
  open,
  onClose,
  partName,
  partNumber,
  rows,
  plate,
  numberBrand,
  brandNumbers,
}: {
  /** Maker the part number belongs to, so a store for another maker knows it is a cross-reference. */
  numberBrand?: string;
  brandNumbers?: StoreBrandNumber[];
  open: boolean;
  onClose: () => void;
  partName: string;
  partNumber: string;
  rows: FitRow[];
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
  const yourCar = rows.find((r) => r.isYourCar);
  const openMake = expandedMake ?? byMake[0]?.[0] ?? null;
  const openList = byMake.find(([m]) => m === openMake)?.[1] || [];

  /** What the store needs for this row's car: make, model, years, version, part name and number. */
  function rowStoreText(row: FitRow) {
    return buildStoreCopyText({
      carLine: `${row.make} ${row.model} ${row.years}`,
      carDetails: carDetailsLine({ chassis: row.chassis, engine: row.engine }),
      version: row.difference || row.version || "",
      partName,
      number: partNumber,
      numberBrand,
      brandNumbers,
    });
  }

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
                    <div className="flex shrink-0 items-center gap-2">
                      <TrustBadge trust={mapTrustLabel(row.trust)} />
                      <SIconBtn
                        icon="content_copy"
                        label={`Copy ${row.make} ${row.model} with part number`}
                        className="h-8 w-8"
                        onClick={() => void copy(rowStoreText(row), `${row.make} ${row.model}`)}
                      />
                    </div>
                  </li>
                ))}
              </ul>
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
