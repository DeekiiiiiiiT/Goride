/**
 * "Powertrain to check" — Stitch powertrain-job-fit-dominion screen 5 (+ states from screen 10).
 * Content: docs/powertrain-job-fit-audit.md section 4. Drop (audit 9): confidence %, pipeline text,
 * VIN lines, filter / sort / paging, CSV export, "Undo" / "Inspect raw feed" links.
 */
import { useCallback, useEffect, useState } from "react";
import { versionYearsLabel } from "@roam/vehicle-catalog-core";
import type { VehicleCatalogRecord } from "../../../../types/vehicleCatalog";
import {
  confirmPowertrain,
  listPowertrainCheck,
  type PowertrainCheckItem,
} from "../../../../services/vehicleCatalogService";
import { PartsButton } from "../../parts-database/PartsButton";
import { D_CARD, D_MUTED, D_TXT, DCode, DIcon, DIconTile, DPill } from "../../parts-database/add-parts/catalog/dominionKit";
import {
  FUELS,
  FUEL_LABEL,
  POWERTRAINS,
  POWERTRAIN_LABEL,
  disagreementText,
  fuelName,
  powertrainName,
} from "../../powertrain/powertrainModel";

type Props = {
  token: string;
  onBack: () => void;
  onConfirmed: (patch: Partial<VehicleCatalogRecord> & { id: string }) => void;
  onOpenCar: (id: string) => void;
};

type RowState = { pt: string; fu: string; busy: boolean; failed: boolean; done: boolean };

const SELECT =
  "h-10 w-full cursor-pointer appearance-none rounded-xl bg-[#f3f4fb] pl-3.5 pr-9 text-[15px] text-[#30323b] focus:outline-none focus:ring-2 focus:ring-[#0153dc]/30 disabled:cursor-not-allowed dark:bg-[#0b1220] dark:text-[#e2e8f0]";

export function PowertrainCheckScreen({ token, onBack, onConfirmed, onOpenCar }: Props) {
  const [items, setItems] = useState<PowertrainCheckItem[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [rows, setRows] = useState<Record<string, RowState>>({});

  const load = useCallback(async () => {
    setLoadFailed(false);
    try {
      const { items: list } = await listPowertrainCheck(token);
      setItems(list);
      setRows(
        Object.fromEntries(
          list.map((r) => [r.id, { pt: r.powertrain ?? "", fu: r.fuel ?? "", busy: false, failed: false, done: false }]),
        ),
      );
    } catch {
      setLoadFailed(true);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const patchRow = (id: string, p: Partial<RowState>) => setRows((prev) => ({ ...prev, [id]: { ...prev[id], ...p } }));

  const confirm = async (r: PowertrainCheckItem) => {
    const st = rows[r.id];
    if (!st?.pt || !st.fu) return;
    patchRow(r.id, { busy: true, failed: false });
    try {
      const item = await confirmPowertrain(token, r.id, st.pt, st.fu);
      onConfirmed(item);
      patchRow(r.id, { busy: false, done: true });
      // The confirmed row shows its result, then fades out of the list.
      window.setTimeout(() => setItems((prev) => (prev ? prev.filter((x) => x.id !== r.id) : prev)), 1600);
    } catch {
      patchRow(r.id, { busy: false, failed: true });
    }
  };

  const left = (items ?? []).filter((r) => !rows[r.id]?.done).length;

  return (
    <div className="vehicles-database-stitch parts-database-stitch flex flex-col">
      <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-6 px-6 py-8 max-[390px]:px-4 max-[390px]:py-5">
        <div>
          <PartsButton variant="secondary" onClick={onBack}>
            <DIcon name="arrow_back" className="text-[18px]" /> Back to Vehicles
          </PartsButton>
        </div>

        <div className="flex items-start justify-between gap-3 max-[390px]:flex-col">
          <div>
            <h1 className={`text-[26px] font-semibold tracking-tight ${D_TXT}`}>Powertrain to check</h1>
            <p className={`text-[15px] ${D_MUTED}`}>Car models Roam couldn&apos;t work out. Pick what powers each one.</p>
          </div>
          {items && left > 0 ? (
            <DPill tone="amber" icon="help">
              {left} left
            </DPill>
          ) : null}
        </div>

        {loadFailed ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#f2c9c8] bg-[#fdecec] px-4 py-3 dark:border-[#7f1d1d] dark:bg-[#450a0a]">
            <p className="flex items-center gap-2 text-[14px] font-medium text-[#a83836] dark:text-[#f87171]">
              <DIcon name="error" className="text-[20px]" /> Couldn&apos;t load the list. Nothing was changed.
            </p>
            <PartsButton variant="danger" onClick={() => void load()}>
              Try again
            </PartsButton>
          </div>
        ) : null}

        {!items && !loadFailed ? (
          <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading">
            {[0, 1, 2].map((i) => (
              <div key={i} className={`${D_CARD} h-[104px] animate-pulse`} />
            ))}
          </div>
        ) : null}

        {items && items.length === 0 ? (
          <div className={`${D_CARD} flex flex-col items-center gap-3 p-10 text-center`}>
            <DIconTile name="verified" />
            <p className={`text-[18px] font-semibold ${D_TXT}`}>Every car model is confirmed</p>
            <p className={`text-[14px] ${D_MUTED}`}>New car models land here when Roam can&apos;t work out what powers them.</p>
          </div>
        ) : null}

        {items && items.length > 0 ? (
          <ul className="flex flex-col gap-3">
            {items.map((r) => {
              const st = rows[r.id] ?? { pt: "", fu: "", busy: false, failed: false, done: false };
              const disagree = disagreementText(r.fuel_type, r.fuel_category);
              const raw = [
                r.fuel_type ? `Fuel type: ${r.fuel_type}` : "Fuel type: blank",
                r.engine_type ? `Engine: ${r.engine_type}` : null,
                r.fuel_category ? `Category: ${r.fuel_category}` : null,
              ].filter(Boolean);
              return (
                <li
                  key={r.id}
                  className={`${D_CARD} p-5 transition-opacity duration-700 ${st.done ? "opacity-50" : ""}`}
                  data-testid="powertrain-check-row"
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                      <DIconTile name={disagree ? "rule" : "help"} tone="grey" size="sm" />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className={`text-[16px] font-semibold ${D_TXT} ${st.done ? "line-through" : ""}`}>
                            {r.make} {r.model}{" "}
                            <span className={`font-normal ${D_MUTED}`}>
                              ({versionYearsLabel(r.production_start_year ?? 0, r.production_end_year ?? null)})
                            </span>
                          </p>
                          {st.done ? (
                            <DPill tone="green" icon="check_circle">
                              Confirmed: {powertrainName(st.pt)} · {fuelName(st.fu)}
                            </DPill>
                          ) : disagree ? (
                            <DPill tone="amber" icon="warning">Data disagrees</DPill>
                          ) : (
                            <DPill tone="amber" icon="help">Needs checking</DPill>
                          )}
                        </div>
                        <p className={`mt-1 flex flex-wrap items-center gap-1.5 text-[13px] ${D_MUTED}`}>
                          <DCode>Raw data</DCode>
                          {raw.join(" · ")}
                        </p>
                        {r.powertrain_note ? (
                          <p className="mt-1 text-[13px] text-[#8a5a00] dark:text-[#fbbf24]">{r.powertrain_note}</p>
                        ) : null}
                      </div>
                    </div>

                    {!st.done ? (
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end lg:w-[560px]">
                        <label className="block">
                          <span className={`mb-1 block text-[12px] font-medium ${D_MUTED}`}>Powertrain</span>
                          <span className="relative block">
                            <select
                              className={SELECT}
                              value={st.pt}
                              disabled={st.busy}
                              aria-label={`Powertrain for ${r.make} ${r.model}`}
                              onChange={(e) => patchRow(r.id, { pt: e.target.value })}
                            >
                              <option value="">Choose…</option>
                              {POWERTRAINS.map((c) => (
                                <option key={c} value={c}>
                                  {POWERTRAIN_LABEL[c]}
                                </option>
                              ))}
                            </select>
                            <DIcon name="expand_more" className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[20px] text-[#5d5f68]" />
                          </span>
                        </label>
                        <label className="block">
                          <span className={`mb-1 block text-[12px] font-medium ${D_MUTED}`}>Fuel</span>
                          <span className="relative block">
                            <select
                              className={SELECT}
                              value={st.fu}
                              disabled={st.busy}
                              aria-label={`Fuel for ${r.make} ${r.model}`}
                              onChange={(e) => patchRow(r.id, { fu: e.target.value })}
                            >
                              <option value="">Choose…</option>
                              {FUELS.map((c) => (
                                <option key={c} value={c}>
                                  {FUEL_LABEL[c]}
                                </option>
                              ))}
                            </select>
                            <DIcon name="expand_more" className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[20px] text-[#5d5f68]" />
                          </span>
                        </label>
                        <PartsButton variant="primary" disabled={st.busy || !st.pt || !st.fu} onClick={() => void confirm(r)}>
                          <DIcon name="check" className="text-[18px]" /> {st.busy ? "Saving…" : "Confirm"}
                        </PartsButton>
                      </div>
                    ) : null}
                  </div>

                  {disagree && !st.done ? (
                    <div className="mt-4 flex items-start gap-2 rounded-xl bg-[#fff4dc] px-4 py-3 text-[14px] text-[#8a5a00] dark:bg-[#451a03] dark:text-[#fbbf24]">
                      <DIcon name="info" className="mt-0.5 text-[18px]" />
                      <span>{disagree}</span>
                    </div>
                  ) : null}

                  {st.failed ? (
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#f2c9c8] bg-[#fdecec] px-4 py-3 dark:border-[#7f1d1d] dark:bg-[#450a0a]">
                      <span className="flex items-center gap-2 text-[14px] font-medium text-[#a83836] dark:text-[#f87171]">
                        <DIcon name="error" className="text-[18px]" /> Couldn&apos;t save this. Try again.
                      </span>
                      <PartsButton variant="danger" onClick={() => void confirm(r)}>
                        Try again
                      </PartsButton>
                    </div>
                  ) : null}

                  {!st.done ? (
                    <div className="mt-3 flex justify-end">
                      <PartsButton variant="secondary" onClick={() => onOpenCar(r.id)}>
                        <DIcon name="open_in_new" className="text-[16px]" /> Open car
                      </PartsButton>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
