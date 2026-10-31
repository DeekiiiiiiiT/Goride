// Stitch: dominion-redesign/S42h · find_parts_everything_for_this_car
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { PART_MATCH_TIERS } from "../../../../../../../packages/types/src/partsResolution";
import type { FindPartsResult, FoundPartRow } from "../partsDatabaseApi";
import type { BrowseArea } from "./PartStep";
import { PartsMatchTypesOff } from "../PartsDatabaseStates";
import { sectionsFrom } from "./ResultsView";

const TIER_COLORS: Record<number, string> = {
  1: "#0153dc",
  2: "#0e7490",
  3: "#b45309",
  4: "#7c3aed",
  5: "#006e31",
};

function tierChip(tier: number) {
  const row = PART_MATCH_TIERS.find((item) => item.tier === tier);
  const color = TIER_COLORS[tier] ?? TIER_COLORS[1];
  return {
    label: row ? `${row.plainLabel} (Tier ${tier})` : `Tier ${tier}`,
    color,
  };
}

function partSpecLine(part: FoundPartRow) {
  const bits = [part.reason].filter(Boolean);
  if (part.status === "needs_checking") bits.push("Needs verification");
  return bits.join(" · ") || "Catalog fitment on file";
}

function componentLabel(componentId: string | null | undefined, areas: BrowseArea[]) {
  if (!componentId) return "Part";
  for (const area of areas) {
    const match = area.components.find((row) => row.id === componentId);
    if (match) return match.plainName;
  }
  return "Part";
}

function areaPartCount(area: BrowseArea) {
  return area.components.reduce((sum, row) => sum + row.count, 0);
}

function PartsTable({
  parts,
  areas,
  onOpen,
}: {
  parts: FoundPartRow[];
  areas: BrowseArea[];
  onOpen: (part: FoundPartRow) => void;
}) {
  if (!parts.length) return null;
  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full text-left">
        <thead>
          <tr className="bg-surface-container-low text-outline font-label-xs text-label-xs uppercase tracking-wider">
            <th className="py-2.5 px-space-lg">Component &amp; specification</th>
            <th className="py-2.5 px-space-md">OEM / reference mono</th>
            <th className="py-2.5 px-space-md">Classification tier</th>
            <th className="py-2.5 px-space-md">Validation status</th>
            <th className="py-2.5 px-space-lg text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-transparent font-body-md text-body-md">
          {parts.map((part) => {
            const tier = tierChip(part.tier);
            const verified = part.status === "verified";
            const title = componentLabel(part.componentId, areas);
            const ref = [part.brand, part.number].filter(Boolean).join(" ") || part.name;
            return (
              <tr key={`${part.partId}-${part.number}-${part.tier}`} className="hover:bg-surface-container-low/60 transition-colors">
                <td className="py-3 px-space-lg">
                  <div className="flex items-center gap-space-md">
                    <div className="w-9 h-9 rounded-lg bg-surface-container flex items-center justify-center shrink-0">
                      <span className="material-symbols-outlined text-secondary text-[20px]">inventory_2</span>
                    </div>
                    <div>
                      <div className="font-medium text-on-surface">{title}</div>
                      <div className="font-mono-sm text-mono-sm text-outline">{partSpecLine(part)}</div>
                    </div>
                  </div>
                </td>
                <td className="py-3 px-space-md">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono-md text-mono-md font-semibold text-on-surface bg-surface-container-low px-2 py-0.5 rounded">{ref}</span>
                  </div>
                  {part.alsoKnownAs?.[0] ? (
                    <span className="font-label-xs text-label-xs text-outline">Alt ref: {part.alsoKnownAs[0]}</span>
                  ) : part.name && part.name !== title ? (
                    <span className="font-label-xs text-label-xs text-outline">{part.name}</span>
                  ) : null}
                </td>
                <td className="py-3 px-space-md">
                  <div
                    className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-mono-sm text-mono-sm font-semibold"
                    style={{ color: tier.color, backgroundColor: `${tier.color}18` }}
                  >
                    <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: tier.color }} />
                    <span>{tier.label}</span>
                  </div>
                </td>
                <td className="py-3 px-space-md">
                  <div className={`flex items-center gap-1.5 font-body-sm text-body-sm font-medium ${verified ? "text-[#047857]" : "text-[#b45309]"}`}>
                    <span className={`w-2 h-2 rounded-full ${verified ? "bg-[#10b981]" : "bg-[#f59e0b]"}`} />
                    <span>{verified ? "Verified" : "Needs checking"}</span>
                  </div>
                  <span className="font-mono-sm text-mono-sm text-outline">{verified ? "Catalog decision on file" : "Confirm in part drawer"}</span>
                </td>
                <td className="py-3 px-space-lg text-right">
                  <button
                    type="button"
                    className="px-2.5 py-1 rounded-lg text-primary hover:bg-surface-container font-label-md text-label-md font-semibold transition-colors inline-flex items-center gap-1"
                    onClick={() => onOpen(part)}
                  >
                    <span>View details</span>
                    <span className="material-symbols-outlined text-[14px]">north_east</span>
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function AllPartsView({
  carLabel,
  versionLabel,
  chassisCode,
  engineCode,
  areas,
  result,
  owner,
  onAdd,
  onOpen,
  onBack,
  onOpenStep,
  onOpenDatabase,
}: {
  carLabel: string;
  versionLabel: string;
  chassisCode: string;
  engineCode: string;
  areas: BrowseArea[];
  result: FindPartsResult;
  owner: boolean;
  onAdd: () => void;
  onOpen: (part: FoundPartRow) => void;
  onBack: () => void;
  onOpenStep: (step: "car" | "version" | "part") => void;
  onOpenDatabase: () => void;
}) {
  const [navFilter, setNavFilter] = useState("");
  const [activeAreaId, setActiveAreaId] = useState<string | null>(null);

  const items = useMemo(() => sectionsFrom(result).flatMap((section) => section.items), [result]);
  const verifiedComponents = useMemo(() => {
    const ids = new Set<string>();
    for (const area of areas) {
      for (const row of area.components) {
        if (row.count > 0) ids.add(row.id);
      }
    }
    return ids.size;
  }, [areas]);

  const partsByComponent = useMemo(() => {
    const map = new Map<string, FoundPartRow[]>();
    for (const part of items) {
      const key = part.componentId ?? "";
      if (!key) continue;
      const list = map.get(key) ?? [];
      list.push(part);
      map.set(key, list);
    }
    return map;
  }, [items]);

  const unassigned = useMemo(() => items.filter((part) => !part.componentId), [items]);

  const tierStats = useMemo(() => {
    const counts = new Map<number, number>();
    for (const part of items) counts.set(part.tier, (counts.get(part.tier) ?? 0) + 1);
    return counts;
  }, [items]);

  const healthPct = items.length
    ? Math.round((items.filter((part) => part.status === "verified").length / items.length) * 1000) / 10
    : 0;

  const ownerTitle = owner ? undefined : "Only the owner can change parts.";

  const navAreas = areas.filter((area) => {
    const q = navFilter.trim().toLowerCase();
    if (!q) return true;
    return area.plainName.toLowerCase().includes(q)
      || area.components.some((row) => row.plainName.toLowerCase().includes(q));
  });

  function partsForArea(area: BrowseArea) {
    const rows: FoundPartRow[] = [];
    for (const component of area.components) {
      const list = partsByComponent.get(component.id);
      if (list?.length) rows.push(...list);
    }
    return rows;
  }

  const mainAreas = useMemo(() => {
    if (activeAreaId) return areas.filter((area) => area.id === activeAreaId);
    return areas.filter((area) => areaPartCount(area) > 0 || partsForArea(area).length > 0);
  }, [activeAreaId, areas, partsByComponent]);

  return (
    <div className="w-full flex flex-col gap-0 -mx-space-md md:-mx-0">
      <div className="px-space-md md:px-space-xl pt-space-md pb-space-md bg-surface-container-lowest shadow-sm rounded-xl mb-space-lg">
        <div className="flex flex-wrap items-center gap-space-sm mb-space-md">
          <button type="button" className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface-container-low text-on-surface text-body-sm hover:bg-surface-container shadow-sm" onClick={() => onOpenStep("car")}>
            <span className="material-symbols-outlined text-primary text-[15px]">directions_car</span>
            <span className="font-medium">{carLabel || "Vehicle"}</span>
            <span className="material-symbols-outlined text-outline text-[13px]">edit</span>
          </button>
          {versionLabel ? (
            <>
              <span className="material-symbols-outlined text-outline text-[16px]">chevron_right</span>
              <button type="button" className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface-container-low text-on-surface text-body-sm hover:bg-surface-container shadow-sm" onClick={() => onOpenStep("version")}>
                <span className="material-symbols-outlined text-primary text-[15px]">bolt</span>
                <span className="font-mono-md text-mono-md font-medium">{versionLabel}</span>
                <span className="material-symbols-outlined text-outline text-[13px]">edit</span>
              </button>
            </>
          ) : null}
          <span className="material-symbols-outlined text-outline text-[16px]">chevron_right</span>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary-container text-on-primary text-body-sm shadow-sm">
            <span className="material-symbols-outlined text-[15px]">dataset</span>
            <span className="font-semibold">All parts</span>
            <span className="px-1.5 py-0.5 rounded-full bg-surface-container-lowest text-primary font-mono-sm text-mono-sm font-semibold">Catalog view</span>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-space-md">
          <div>
            <div className="flex flex-wrap items-center gap-space-sm">
              <h1 className="font-headline-xl text-headline-xl text-on-surface tracking-tight">
                Everything on file for the {carLabel}{versionLabel ? ` ${versionLabel}` : ""}
              </h1>
              <span className="px-2 py-0.5 rounded-full bg-[#10b981]/15 text-[#047857] font-mono-sm text-mono-sm font-semibold uppercase tracking-wide">Registry live</span>
            </div>
            <div className="flex flex-wrap items-center gap-3 mt-1.5 text-secondary font-body-sm">
              {chassisCode ? (
                <div className="flex items-center gap-1">
                  <span className="font-label-xs uppercase text-outline">Chassis:</span>
                  <span className="font-mono-md font-semibold text-on-surface bg-surface-container-low px-1.5 py-0.5 rounded-lg">{chassisCode}</span>
                </div>
              ) : null}
              {engineCode ? (
                <>
                  <span className="text-outline-variant">•</span>
                  <div className="flex items-center gap-1">
                    <span className="font-label-xs uppercase text-outline">Engine:</span>
                    <span className="font-mono-md font-semibold text-on-surface bg-surface-container-low px-1.5 py-0.5 rounded-lg">{engineCode}</span>
                  </div>
                </>
              ) : null}
              <span className="text-outline-variant">•</span>
              <div className="flex items-center gap-1">
                <span className="font-label-xs uppercase text-outline">Coverage:</span>
                <span className="font-mono-md text-primary font-bold">{verifiedComponents} components with parts</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-space-sm shrink-0">
            <button
              type="button"
              className="h-9 px-3.5 rounded-xl bg-surface-container-low hover:bg-surface-container text-on-surface font-body-sm font-medium flex items-center gap-2 shadow-sm"
              onClick={() => toast.message("Export catalogue manifest — coming soon.")}
            >
              <span className="material-symbols-outlined text-[18px] text-secondary">file_download</span>
              Export catalogue manifest
            </button>
            <button
              type="button"
              className="h-9 px-4 rounded-xl bg-primary-container hover:bg-primary text-on-primary font-body-sm font-semibold flex items-center gap-1.5 shadow-sm disabled:opacity-40"
              disabled={!owner}
              title={ownerTitle}
              onClick={onAdd}
            >
              <span className="material-symbols-outlined text-[18px]">add</span>
              Add a part to this car
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-space-lg mt-space-md pt-space-xs border-t border-surface-container-high">
          <button type="button" className="font-body-md font-semibold text-primary pb-2 shadow-[0_2px_0_0_#0153dc] flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[18px]">folder_special</span>
            <span>Vehicle parts</span>
            <span className="px-1.5 py-0.5 rounded-full bg-secondary-container text-on-secondary-fixed font-mono-sm font-bold">{items.length}</span>
          </button>
          <button type="button" className="font-body-md font-medium text-secondary hover:text-on-surface pb-2 flex items-center gap-1.5" onClick={() => onOpenStep("part")}>
            <span className="material-symbols-outlined text-[18px]">search_insights</span>
            Find &amp; cross-match
          </button>
          <button type="button" className="font-body-md font-medium text-secondary hover:text-on-surface pb-2 flex items-center gap-1.5" onClick={onOpenDatabase}>
            <span className="material-symbols-outlined text-[18px]">rule</span>
            Validation rules
          </button>
          <button type="button" className="font-body-md font-medium text-secondary hover:text-on-surface pb-2 flex items-center gap-1.5" onClick={onBack}>
            <span className="material-symbols-outlined text-[18px]">arrow_back</span>
            Back to part picker
          </button>
        </div>
      </div>

      {result.mode === "legacy" ? (
        <PartsMatchTypesOff
          tierOneCount={items.filter((part) => part.tier === 1).length}
          offlineTiers={result.emptyTiers ?? [2, 3, 4, 5]}
        />
      ) : null}

      <div className="grid grid-cols-12 gap-space-lg min-w-0">
        <aside className="col-span-12 lg:col-span-3 space-y-space-md">
          <div className="bg-surface-container-lowest rounded-xl p-space-md shadow-sm">
            <div className="relative w-full mb-space-md">
              <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-outline text-[16px]">filter_list</span>
              <input
                className="w-full h-8 pl-8 pr-2.5 rounded-lg bg-surface-container-low text-body-sm text-on-surface placeholder:text-outline focus:outline-none focus:bg-surface-container"
                placeholder="Filter vehicle assemblies…"
                value={navFilter}
                onChange={(event) => setNavFilter(event.target.value)}
              />
            </div>
            <div className="flex items-center justify-between px-2 pb-1.5">
              <span className="font-label-xs uppercase tracking-wider text-outline font-semibold">Subsystem group</span>
              <span className="font-mono-sm text-outline">Coverage</span>
            </div>
            <nav className="space-y-1 max-h-[420px] overflow-y-auto">
              <button
                type="button"
                className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg transition-colors ${activeAreaId === null ? "bg-primary-fixed text-primary font-semibold shadow-sm" : "text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface"}`}
                onClick={() => setActiveAreaId(null)}
              >
                <span className="font-body-md">All subsystems</span>
                <span className="font-mono-sm px-2 py-0.5 rounded-full bg-surface-container font-semibold">{items.length}</span>
              </button>
              {navAreas.map((area) => {
                const count = areaPartCount(area);
                const active = activeAreaId === area.id;
                return (
                  <button
                    key={area.id}
                    type="button"
                    className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg transition-colors ${active ? "bg-primary-fixed text-primary font-semibold shadow-sm" : "text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface"}`}
                    onClick={() => setActiveAreaId(area.id)}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`material-symbols-outlined text-[18px] ${active ? "text-primary" : "text-secondary"}`}>{area.icon || "category"}</span>
                      <span className="font-body-md truncate text-left">{area.plainName}</span>
                    </div>
                    <span className={`font-mono-sm px-2 py-0.5 rounded-full font-semibold shrink-0 ${count === 0 ? "bg-error-container text-on-error-container" : active ? "bg-primary-container text-on-primary" : "bg-surface-container text-secondary"}`}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </nav>
          </div>

          <div className="bg-surface-container-lowest rounded-xl p-space-md shadow-sm">
            <div className="flex items-center justify-between mb-space-sm">
              <span className="font-label-xs uppercase font-semibold text-secondary tracking-wider">Catalogue health</span>
              <span className="font-mono-sm text-primary font-bold">{healthPct}%</span>
            </div>
            <div className="w-full bg-surface-container-low h-2 rounded-full overflow-hidden flex gap-0.5 mb-3">
              {[1, 2, 3, 4, 5].map((tier) => {
                const count = tierStats.get(tier) ?? 0;
                if (!count || !items.length) return null;
                const width = `${Math.max(8, (count / items.length) * 100)}%`;
                return <div key={tier} className="h-full" style={{ width, backgroundColor: TIER_COLORS[tier] }} title={`Tier ${tier}: ${count}`} />;
              })}
            </div>
            <div className="grid grid-cols-2 gap-2 text-label-xs text-secondary">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-primary-container" />
                <span>Tier 1 OEM: {tierStats.get(1) ?? 0}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#7c3aed]" />
                <span>Aftermarket: {tierStats.get(4) ?? 0}</span>
              </div>
            </div>
          </div>
        </aside>

        <main className="col-span-12 lg:col-span-9 space-y-space-lg">
          {mainAreas.map((area) => {
            const areaParts = partsForArea(area);
            const count = areaPartCount(area);
            if (activeAreaId && area.id !== activeAreaId) return null;

            if (count === 0 || areaParts.length === 0) {
              return (
                <div key={area.id} className="bg-surface-container-lowest rounded-xl shadow-sm p-space-xl">
                  <div className="flex items-center gap-space-sm pb-space-md">
                    <div className="w-8 h-8 rounded-lg bg-surface-container-high flex items-center justify-center text-secondary">
                      <span className="material-symbols-outlined text-[20px]">{area.icon || "disc_full"}</span>
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-headline-md text-on-surface">{area.plainName}</h3>
                        <span className="font-label-xs px-2 py-0.5 rounded-full bg-error-container text-on-error-container font-semibold">0 parts</span>
                      </div>
                    </div>
                  </div>
                  <div className="rounded-xl bg-surface-container-low p-space-xl flex flex-col items-center justify-center text-center">
                    <div className="w-12 h-12 rounded-full bg-surface-container-high flex items-center justify-center text-outline mb-space-sm">
                      <span className="material-symbols-outlined text-[26px]">inventory_2</span>
                    </div>
                    <h4 className="font-headline-md text-on-surface font-semibold mb-1">Nothing yet for {area.plainName}</h4>
                    <p className="font-body-md text-secondary max-w-md mb-space-lg">
                      No parts are cataloged for this subsystem{chassisCode ? (
                        <> on chassis <span className="font-mono-sm font-semibold text-on-surface">{chassisCode}</span></>
                      ) : null}.
                    </p>
                    <button
                      type="button"
                      className="h-9 px-4 rounded-xl bg-primary-container hover:bg-primary text-on-primary font-body-sm font-semibold flex items-center gap-1.5 shadow-sm disabled:opacity-40"
                      disabled={!owner}
                      title={ownerTitle}
                      onClick={onAdd}
                    >
                      <span className="material-symbols-outlined text-[18px]">add</span>
                      Add a part to {area.plainName}
                    </button>
                  </div>
                </div>
              );
            }

            return (
              <div key={area.id} className="bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden">
                <div className="px-space-lg py-space-md bg-surface-bright flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-space-sm">
                    <div className="w-8 h-8 rounded-lg bg-primary-fixed flex items-center justify-center text-primary">
                      <span className="material-symbols-outlined text-[20px]">{area.icon || "category"}</span>
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h2 className="font-headline-md text-on-surface">{area.plainName}</h2>
                        <span className="font-label-xs px-2 py-0.5 rounded-full bg-surface-container-high text-secondary font-semibold">
                          {areaParts.length} part{areaParts.length === 1 ? "" : "s"} on file
                        </span>
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="h-8 px-3 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface font-body-sm font-medium flex items-center gap-1 disabled:opacity-40"
                    disabled={!owner}
                    title={ownerTitle}
                    onClick={onAdd}
                  >
                    <span className="material-symbols-outlined text-[16px]">add</span>
                    Add part
                  </button>
                </div>
                <PartsTable parts={areaParts} areas={areas} onOpen={onOpen} />
              </div>
            );
          })}

          {unassigned.length ? (
            <div className="bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden">
              <div className="px-space-lg py-space-md bg-surface-bright">
                <h2 className="font-headline-md text-on-surface">Other catalogued parts</h2>
                <p className="font-body-sm text-secondary">Parts not linked to a maintenance component yet.</p>
              </div>
              <PartsTable parts={unassigned} areas={areas} onOpen={onOpen} />
            </div>
          ) : null}

          {!mainAreas.length && items.length ? (
            <div className="bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden">
              <div className="px-space-lg py-space-md bg-surface-bright">
                <h2 className="font-headline-md text-on-surface">All catalogued parts</h2>
                <p className="font-body-sm text-secondary">Full list for this vehicle.</p>
              </div>
              <PartsTable parts={items} areas={areas} onOpen={onOpen} />
            </div>
          ) : null}

          {!mainAreas.length && !items.length ? (
            <div className="bg-surface-container-lowest rounded-xl shadow-sm p-space-xl text-center">
              <p className="font-body-md text-secondary">No parts on file for this car yet.</p>
              <button type="button" className="mt-space-md h-9 px-4 rounded-xl bg-primary-container text-on-primary font-body-sm font-semibold disabled:opacity-40" disabled={!owner} onClick={onAdd}>Add a part to this car</button>
            </div>
          ) : null}
        </main>
      </div>
    </div>
  );
}
