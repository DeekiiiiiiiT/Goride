import { useMemo, useState } from "react";
import { PartsButton } from "../../PartsButton";
import type { CatalogPageDraft, CatalogPartRow, PartTypeRow } from "../addPartsTypes";
import { defaultPartNamePreview, PartTypeIcon } from "../addPartsShared";
import { MaterialIcon } from "../../import/MaterialIcon";
import { MakerLogo } from "../../../vehicle-catalog/MakerLogo";
import { D_MONO, D_MUTED, D_TXT, DCode, DFooter, DPill, DQuestion } from "./dominionKit";

const TRUST_REASONS = [
  "Chassis code differs",
  "Years differ",
  "Engine differs",
  "Maker lists left-hand drive only",
  "Seen in a shop's list only",
] as const;

export function CatalogStep4Trust({
  draft,
  types,
  onNext,
  onBack,
  onTrustChange,
  onYearsChange,
}: {
  draft: CatalogPageDraft;
  types: PartTypeRow[];
  onNext: () => void;
  onBack: () => void;
  onTrustChange: (vehicleId: string, trust: "confirmed" | "needs_checking", reason?: string) => void;
  onYearsChange: (vehicleId: string, yearFrom?: number, yearTo?: number) => void;
}) {
  const [showTable, setShowTable] = useState(false);
  const [bulkTicked, setBulkTicked] = useState<Set<string>>(() => new Set());
  const [bulkTrust, setBulkTrust] = useState<"confirmed" | "needs_checking">("needs_checking");
  const [bulkReason, setBulkReason] = useState<string>(TRUST_REASONS[0]);

  const cars = draft.vehicleListings.length;
  const rows = draft.partRows.filter((r) => r.partNumber.trim());
  const allVerified = draft.vehicleListings.every((l) => l.trust !== "needs_checking");
  const maker = draft.catalogCarMaker || draft.linkHints?.catalogMaker || "the car maker";

  const partsPanel = useMemo(() => buildPartsPanel(rows, types, draft), [rows, types, draft]);

  function toggleBulk(id: string) {
    setBulkTicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function applyBulk() {
    bulkTicked.forEach((id) => {
      onTrustChange(id, bulkTrust, bulkTrust === "needs_checking" ? bulkReason : "");
    });
    setBulkTicked(new Set());
  }

  const canNext = draft.vehicleListings.every(
    (l) => l.trust !== "needs_checking" || String(l.reason ?? "").trim().length > 0,
  );

  const selectCls =
    "h-9 rounded-lg border border-[#c5c6d0] bg-white px-2 text-[14px] dark:border-[#1e293b] dark:bg-[#111a2e]";

  return (
    <div className="flex flex-col">
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
        <section className="flex flex-col gap-4 lg:col-span-7">
          <DQuestion
            title="Trust for each car"
            hint="Set Verified or Needs checking before you save."
            actions={
              allVerified && !showTable ? null : (
                <PartsButton variant="secondary" onClick={() => setShowTable((v) => !v)}>
                  <MaterialIcon name="tune" className="text-[18px]" /> {showTable ? "Hide list" : "Mark many"}
                </PartsButton>
              )
            }
          />

          {!showTable && allVerified ? (
            <div className="flex flex-col gap-3 rounded-xl border border-[#b7dfc4] bg-[#e6f4ea] p-5 dark:border-[#14532d] dark:bg-[#14532d]/30">
              <p className="flex items-start gap-2 text-[15px] text-[#006e31] dark:text-[#4ade80]">
                <MaterialIcon name="verified" className="text-[22px]" />
                All {cars} car{cars === 1 ? " is" : "s are"} Verified — {maker}&apos;s own catalogue lists {cars === 1 ? "it" : "them"}.
              </p>
              <PartsButton variant="secondary" className="self-start" onClick={() => setShowTable(true)}>
                Mark some as Needs checking
              </PartsButton>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-[#e6e7ee] dark:border-[#1e293b]">
              {bulkTicked.size > 0 ? (
                <div className="flex flex-wrap items-center gap-2 bg-[#f3f4fb] p-4 dark:bg-[#0b1220]">
                  <DPill tone="blue" icon="check_box">{bulkTicked.size} car{bulkTicked.size === 1 ? "" : "s"} ticked</DPill>
                  <select className={selectCls} value={bulkTrust} onChange={(e) => setBulkTrust(e.target.value as "confirmed" | "needs_checking")}>
                    <option value="confirmed">Verified</option>
                    <option value="needs_checking">Needs checking</option>
                  </select>
                  {bulkTrust === "needs_checking" ? (
                    <select className={selectCls} value={bulkReason} onChange={(e) => setBulkReason(e.target.value)} aria-label="Reason">
                      {TRUST_REASONS.map((r) => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                  ) : null}
                  <PartsButton variant="primary" onClick={applyBulk}>
                    Apply to {bulkTicked.size} car{bulkTicked.size === 1 ? "" : "s"}
                  </PartsButton>
                </div>
              ) : null}
              <table className="w-full text-[14px]">
                <thead>
                  <tr className={`bg-[#f3f4fb] text-left text-[13px] font-semibold dark:bg-[#0b1220] ${D_MUTED}`}>
                    <th className="w-10 p-3" />
                    <th className="p-3">Car</th>
                    <th className="p-3">Years</th>
                    <th className="p-3">Trust</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e6e7ee] dark:divide-[#1e293b]">
                  {draft.vehicleListings.map((l) => (
                    <tr key={l.vehicleId} className="align-top">
                      <td className="p-3">
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-[#0153dc]"
                          aria-label={`Tick ${l.make ?? ""} ${l.model ?? ""}`}
                          checked={bulkTicked.has(l.vehicleId)}
                          onChange={() => toggleBulk(l.vehicleId)}
                        />
                      </td>
                      <td className="p-3">
                        <div className="flex items-start gap-2.5">
                          <MakerLogo make={l.make ?? "?"} size={28} />
                          <div className="flex flex-col gap-1">
                            <span className={`font-semibold ${D_TXT}`}>
                              {[l.make, l.model].filter(Boolean).join(" ") || l.label}
                              {l.diffLabel ? <span className={`font-normal ${D_MUTED}`}> · {l.diffLabel}</span> : null}
                            </span>
                            {l.chassisCode ? <DCode>{l.chassisCode}</DCode> : null}
                          </div>
                        </div>
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-1">
                          <input
                            className="h-8 w-[60px] rounded-lg border border-[#c5c6d0] px-1.5 font-mono-sm dark:border-[#1e293b] dark:bg-[#111a2e]"
                            inputMode="numeric"
                            aria-label="From year"
                            value={l.yearFrom ?? ""}
                            onChange={(e) => onYearsChange(l.vehicleId, Number(e.target.value) || undefined, l.yearTo)}
                          />
                          <span className={D_MUTED}>–</span>
                          <input
                            className="h-8 w-[60px] rounded-lg border border-[#c5c6d0] px-1.5 font-mono-sm dark:border-[#1e293b] dark:bg-[#111a2e]"
                            inputMode="numeric"
                            aria-label="To year"
                            value={l.yearTo ?? ""}
                            onChange={(e) => onYearsChange(l.vehicleId, l.yearFrom, Number(e.target.value) || undefined)}
                          />
                        </div>
                      </td>
                      <td className="p-3">
                        <div className="flex flex-col items-start gap-1.5">
                          {l.trust === "needs_checking" ? (
                            <DPill tone="amber" icon="schedule">Needs checking</DPill>
                          ) : (
                            <DPill tone="green" icon="verified_user">Verified</DPill>
                          )}
                          <select
                            className={`${selectCls} !h-8 w-full max-w-[190px]`}
                            aria-label="Trust"
                            value={l.trust ?? "confirmed"}
                            onChange={(e) => onTrustChange(l.vehicleId, e.target.value as "confirmed" | "needs_checking", l.reason)}
                          >
                            <option value="confirmed">Verified</option>
                            <option value="needs_checking">Needs checking</option>
                          </select>
                          {l.trust === "needs_checking" ? (
                            <select
                              className={`${selectCls} !h-8 w-full max-w-[220px]`}
                              aria-label="Reason"
                              value={l.reason ?? TRUST_REASONS[0]}
                              onChange={(e) => onTrustChange(l.vehicleId, "needs_checking", e.target.value)}
                            >
                              {TRUST_REASONS.map((r) => (
                                <option key={r} value={r}>{r}</option>
                              ))}
                            </select>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p className={`flex items-center gap-2 text-[13px] ${D_MUTED}`}>
            <MaterialIcon name="info" className="text-[16px]" /> Changing years never changes trust.
          </p>
        </section>

        <aside className="flex flex-col gap-3 rounded-2xl bg-[#f3f4fb] p-5 dark:bg-[#0b1220] lg:col-span-5">
          <div className="flex items-center justify-between">
            <p className={`flex items-center gap-2 text-[20px] font-semibold ${D_TXT}`}>
              <MaterialIcon name="inventory_2" className="text-[22px]" /> Parts to be added
            </p>
            <DPill tone="blue">{partsPanel.length} part{partsPanel.length === 1 ? "" : "s"}</DPill>
          </div>
          {partsPanel.map((p) => (
            <div key={p.key} className="flex flex-col gap-1 rounded-xl bg-white p-4 dark:bg-[#111a2e]">
              <div className="flex items-center justify-between gap-2">
                <span className={`flex items-center gap-1.5 text-[13px] font-semibold ${D_MUTED}`}>
                  {p.iconKey ? <PartTypeIcon iconKey={p.iconKey} className="text-[18px] text-[#0153dc]" /> : null}
                  {p.typeName ?? "Part"}
                </span>
                <span className="text-[12px] font-semibold text-[#0153dc]">{p.fitLine}</span>
              </div>
              <p className={`${D_MONO} text-[17px] font-semibold ${D_TXT}`}>{p.numberLine}</p>
              <p className={`text-[13px] ${D_MUTED}`}>Saves as &quot;{p.name}&quot;</p>
            </div>
          ))}
        </aside>
      </div>

      <DFooter
        left={
          <PartsButton variant="secondary" onClick={onBack}>
            <MaterialIcon name="arrow_back" className="text-[18px]" /> Back to parts
          </PartsButton>
        }
        right={
          <PartsButton variant="primary" onClick={onNext} disabled={!canNext}>
            Next: check and save <MaterialIcon name="arrow_forward" className="text-[18px]" />
          </PartsButton>
        }
      />
    </div>
  );
}


function buildPartsPanel(rows: CatalogPartRow[], types: PartTypeRow[], draft: CatalogPageDraft) {
  const nCars = draft.vehicleListings.length;
  return rows.map((row) => {
    const type = row.partType ?? types.find((t) => t.id === row.partTypeId);
    const name = type
      ? defaultPartNamePreview(type.name, type.positionScheme, row.position, row.side, row.catalogueNumber)
      : row.partNumber;
    const numberLine = `${row.brand || draft.brandDefault || draft.catalogCarMaker || "Toyota"} ${row.partNumber}`;
    const fitLine = row.existingPartId
      ? `Already on file · adding ${nCars} car${nCars === 1 ? "" : "s"}`
      : `Fits ${nCars} car${nCars === 1 ? "" : "s"}`;
    return {
      key: row.clientId,
      name,
      typeName: type?.name ?? null,
      iconKey: type?.iconKey ?? null,
      numberLine,
      fitLine,
    };
  });
}
