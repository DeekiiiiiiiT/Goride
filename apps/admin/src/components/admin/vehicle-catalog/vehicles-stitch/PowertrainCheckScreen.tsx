/**
 * "Powertrain to check" — ported exactly from Stitch docs/stitch/powertrain-job-fit-dominion/html/05,
 * with the loading / empty / couldn't-save states from 10. Content: docs/powertrain-job-fit-audit.md
 * section 4. Dropped (audit 9): eyebrow line, confidence %, pipeline text, VIN lines, filter / sort bar,
 * paging footer, CSV export, "Resolved by", "Undo" / "Inspect raw feed" links.
 */
import { useCallback, useEffect, useState } from "react";
import { versionYearsLabel } from "@roam/vehicle-catalog-core";
import type { VehicleCatalogRecord } from "../../../../types/vehicleCatalog";
import {
  confirmPowertrain,
  listPowertrainCheck,
  type PowertrainCheckItem,
} from "../../../../services/vehicleCatalogService";
import {
  FUELS,
  FUEL_LABEL,
  POWERTRAINS,
  POWERTRAIN_LABEL,
  disagreementText,
  fuelName,
  powertrainName,
} from "../../powertrain/powertrainModel";
import { BTN_WHITE, DIcon, PT_ICON, S, SaveFailed, T } from "../../powertrain/ptStitch";

type Props = {
  token: string;
  onBack: () => void;
  onConfirmed: (patch: Partial<VehicleCatalogRecord> & { id: string }) => void;
};

type RowState = { pt: string; fu: string; busy: boolean; failed: boolean; done: boolean };

/** Stitch 05 tints a select once something is picked: the powertrain by its family, the fuel blue for Electric. */
const PT_PICKED: Record<string, string> = {
  ice: "bg-[#f1f2f6] text-[#30323b] dark:bg-[#1e293b] dark:text-[#e2e8f0]",
  mhev: "bg-[#e0f2fe] text-[#0369a1] dark:bg-[#0c4a6e]/60 dark:text-[#7dd3fc]",
  hev: "bg-[#e0f2fe] text-[#0369a1] dark:bg-[#0c4a6e]/60 dark:text-[#7dd3fc]",
  phev: "bg-[#ccfbf1] text-[#0f766e] dark:bg-[#134e4a] dark:text-[#5eead4]",
  erev: "bg-[#ccfbf1] text-[#0f766e] dark:bg-[#134e4a] dark:text-[#5eead4]",
  bev: "bg-[#dbe1ff] text-[#0153dc] dark:bg-[#1e3a8a]/50 dark:text-[#93b4ff]",
  fcev: "bg-[#dbe1ff] text-[#0153dc] dark:bg-[#1e3a8a]/50 dark:text-[#93b4ff]",
};
const FUEL_PICKED = (code: string) =>
  code === "electric" ? PT_PICKED.bev : "bg-[#f1f2f6] text-[#30323b] dark:bg-[#1e293b] dark:text-[#e2e8f0]";
const SELECT_EMPTY = `${S.low} ${S.text} ${T.bodyMd}`;
const AMBER_CHIP = "bg-[#fef3e2] text-[#8a5a00] dark:bg-[#451a03] dark:text-[#fbbf24]";

export function PowertrainCheckScreen({ token, onBack, onConfirmed }: Props) {
  const [items, setItems] = useState<PowertrainCheckItem[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [rows, setRows] = useState<Record<string, RowState>>({});

  const load = useCallback(async () => {
    setLoadFailed(false);
    setItems(null);
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
    <div className="vehicles-database-stitch flex flex-col">
      <div className="mx-auto flex w-full max-w-[1160px] flex-col gap-6 px-8 py-8 max-[390px]:px-4 max-[390px]:py-5">
        <div className="flex items-center justify-between">
          <button type="button" className={BTN_WHITE} onClick={onBack}>
            <DIcon name="arrow_back" className="text-[18px]" /> Back to Vehicles
          </button>
        </div>

        <div className="flex flex-col justify-between gap-4 pb-1 md:flex-row md:items-end">
          <div className="flex flex-col gap-1">
            <h1 className={`${T.headlineLg} tracking-tight ${S.text}`}>Powertrain to check</h1>
            <p className={`${T.bodyMd} ${S.muted}`}>
              {items && left > 0 ? `${left} car model${left === 1 ? "" : "s"}` : "Car models"} Roam couldn&apos;t work out. Pick what powers each one.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {items && left > 0 ? (
              <span data-testid="pt-left" className={`inline-flex items-center gap-1 rounded-full px-4 py-1.5 shadow-sm ${T.labelMd} font-semibold ${AMBER_CHIP}`}>
                <DIcon name="help" className="text-[18px]" /> {left} left
              </span>
            ) : null}
            <button
              type="button"
              title="Reload the list"
              aria-label="Reload the list"
              onClick={() => void load()}
              className={`inline-flex items-center justify-center rounded-lg p-2 ${S.mid} ${S.muted} hover:bg-[#e7e7f2] dark:hover:bg-[#273449]`}
            >
              <DIcon name="refresh" className="text-[20px]" />
            </button>
          </div>
        </div>

        {loadFailed ? (
          <div className={`${S.card} p-7`}>
            <SaveFailed onRetry={() => void load()} title="Couldn't load the list. Try again." detail="Nothing was changed." />
          </div>
        ) : null}

        {!items && !loadFailed ? <LoadingList /> : null}

        {items && items.length === 0 ? <EmptyList onBack={onBack} /> : null}

        {items && items.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {items.map((r) => (
              <CheckRow
                key={r.id}
                r={r}
                st={rows[r.id] ?? { pt: "", fu: "", busy: false, failed: false, done: false }}
                onPt={(v) => patchRow(r.id, { pt: v })}
                onFu={(v) => patchRow(r.id, { fu: v })}
                onConfirm={() => void confirm(r)}
              />
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}

function CheckRow({
  r,
  st,
  onPt,
  onFu,
  onConfirm,
}: {
  r: PowertrainCheckItem;
  st: RowState;
  onPt: (v: string) => void;
  onFu: (v: string) => void;
  onConfirm: () => void;
}) {
  const name = `${r.make} ${r.model} (${versionYearsLabel(r.production_start_year ?? 0, r.production_end_year ?? null)})`;

  /* Confirmed: green, struck through, fading out. */
  if (st.done) {
    return (
      <li
        data-testid="powertrain-check-row"
        data-done="true"
        className="relative flex flex-col justify-between gap-6 overflow-hidden rounded-2xl bg-[#e8f5ed]/40 p-6 opacity-60 transition-all duration-700 dark:bg-[#14532d]/30 lg:flex-row lg:items-center"
      >
        <div className="flex min-w-0 flex-1 items-start gap-4">
          <div className={`relative flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${S.greenChip}`}>
            <DIcon name="commute" className="text-[24px]" />
            <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-[#006e31] text-white shadow-sm">
              <DIcon name="done" className="text-[12px]" />
            </span>
          </div>
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`${T.headlineSm} tracking-tight line-through opacity-70 ${S.text}`}>{name}</span>
              <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 ${T.labelSm} ${S.greenChip}`}>
                <DIcon name="check_circle" className="text-[14px]" /> Confirmed: {powertrainName(st.pt)} · {fuelName(st.fu)}
              </span>
            </div>
            <p className={`flex items-center gap-1 ${T.bodySm} font-medium text-[#006e31] dark:text-[#4ade80]`}>
              <span className="h-1.5 w-1.5 animate-ping rounded-full bg-[#006e31] dark:bg-[#4ade80]" />
              Confirmed just now · Removing it from the list…
            </p>
          </div>
        </div>
      </li>
    );
  }

  const disagree = disagreementText(r.fuel_type, r.fuel_category);
  const ready = Boolean(st.pt && st.fu);
  const noData = !r.fuel_type && !r.engine_type && !r.fuel_category;
  const raw = [
    r.fuel_type ? `Fuel: ${r.fuel_type}` : null,
    r.engine_type ? `Engine: ${r.engine_type}` : null,
    r.fuel_category ? `Category: ${r.fuel_category}` : null,
  ].filter((x): x is string => Boolean(x));

  return (
    <li
      data-testid="powertrain-check-row"
      className={`group flex flex-col gap-4 rounded-2xl bg-white p-6 shadow-sm transition-all hover:shadow-md dark:bg-[#111a2e] ${
        ready ? "ring-1 ring-[#003ea9]/20 dark:ring-[#93b4ff]/30" : "dark:ring-1 dark:ring-[#1e293b]"
      }`}
    >
      <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-center">
        <div className="flex min-w-0 flex-1 items-start gap-4">
          <div
            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl transition-colors ${
              ready ? PT_PICKED[st.pt] : `${S.mid} ${noData ? S.outline : S.primary} group-hover:bg-[#dbe1ff] dark:group-hover:bg-[#1e3a8a]/40`
            }`}
          >
            <DIcon
              name={ready ? PT_ICON[st.pt] : noData ? "question_mark" : disagree ? "electric_car" : "directions_car"}
              className="text-[24px]"
            />
          </div>
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`${T.headlineSm} tracking-tight ${S.text}`}>{name}</span>
              {ready ? (
                <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 ${T.labelSm} ${PT_PICKED.phev}`}>
                  <DIcon name="bolt" className="text-[14px]" /> Ready to confirm
                </span>
              ) : disagree ? (
                <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 ${T.labelSm} ${AMBER_CHIP}`}>
                  <DIcon name="warning" className="text-[14px]" /> Data disagrees
                </span>
              ) : (
                <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 ${T.labelSm} ${AMBER_CHIP}`}>
                  <DIcon name="help" className="text-[14px]" /> Needs checking
                </span>
              )}
            </div>
            <div className={`flex flex-wrap items-center gap-1 ${T.bodySm} ${S.muted}`}>
              <span className={`rounded px-2 py-0.5 ${S.mid} ${S.mono} text-[11px] ${S.secondary}`}>RAW DATA</span>
              {noData ? (
                <span className="font-medium text-[#ba1a1a] dark:text-[#f87171]">No fuel or engine data on the car&apos;s record</span>
              ) : (
                raw.map((t, i) => (
                  <span key={t} className="flex items-center gap-1">
                    {i > 0 ? <span className="text-[#c3c6d7] dark:text-[#475569]">•</span> : null}
                    <span>{t}</span>
                  </span>
                ))
              )}
            </div>
            {r.powertrain_note ? <p className={`${T.bodySm} italic ${S.secondary}`}>{r.powertrain_note}</p> : null}
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-stretch gap-4 sm:flex-row sm:items-center">
          <RowSelect
            label="Powertrain"
            aria={`Powertrain for ${r.make} ${r.model}`}
            value={st.pt}
            disabled={st.busy}
            onChange={onPt}
            minW="min-w-[190px]"
            picked={st.pt ? PT_PICKED[st.pt] : ""}
            options={POWERTRAINS.map((c) => [c, POWERTRAIN_LABEL[c]] as const)}
          />
          <RowSelect
            label="Fuel"
            aria={`Fuel for ${r.make} ${r.model}`}
            value={st.fu}
            disabled={st.busy}
            onChange={onFu}
            minW="min-w-[160px]"
            picked={st.fu ? FUEL_PICKED(st.fu) : ""}
            options={FUELS.map((c) => [c, FUEL_LABEL[c]] as const)}
          />
          <div className="flex flex-col justify-end pt-5">
            <button
              type="button"
              disabled={st.busy || !ready}
              onClick={onConfirm}
              className={
                ready
                  ? `flex h-10 items-center justify-center gap-1.5 rounded-lg bg-[#0153dc] px-8 text-white shadow-sm ${T.labelMd} hover:brightness-110 disabled:opacity-60 dark:bg-[#2563eb]`
                  : `h-10 cursor-not-allowed rounded-lg px-6 opacity-70 ${S.mid} ${S.outline} ${T.labelMd}`
              }
            >
              <span>{st.busy ? "Saving…" : "Confirm"}</span>
              {ready ? <DIcon name="check" className="text-[16px]" /> : null}
            </button>
          </div>
        </div>
      </div>

      {disagree ? (
        <div className={`flex items-center gap-2 rounded-xl p-2 pl-4 ${T.bodySm} ${AMBER_CHIP}`} data-testid="pt-disagree">
          <DIcon name="info" className="shrink-0 text-[18px]" />
          <span>
            <strong>The data disagrees:</strong> {disagree.replace(/^The data disagrees:\s*/, "")}
          </span>
        </div>
      ) : null}

      {st.failed ? <SaveFailed busy={st.busy} onRetry={onConfirm} /> : null}
    </li>
  );
}

function RowSelect({
  label,
  aria,
  value,
  disabled,
  onChange,
  options,
  picked,
  minW,
}: {
  label: string;
  aria: string;
  value: string;
  disabled?: boolean;
  onChange: (v: string) => void;
  options: ReadonlyArray<readonly [string, string]>;
  picked: string;
  minW: string;
}) {
  return (
    <label className={`flex flex-col gap-1 ${minW}`}>
      <span className={`${T.labelSm} font-medium ${S.muted}`}>{label}</span>
      <span className="relative">
        <select
          className={`h-10 w-full cursor-pointer appearance-none rounded-lg pl-3 pr-8 transition-all focus:outline-none focus:ring-2 focus:ring-[#003ea9]/20 disabled:cursor-not-allowed ${
            value ? `${picked} ${T.labelMd} font-semibold` : SELECT_EMPTY
          }`}
          value={value}
          disabled={disabled}
          aria-label={aria}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="" disabled>
            Choose…
          </option>
          {options.map(([c, l]) => (
            <option key={c} value={c}>
              {l}
            </option>
          ))}
        </select>
        <DIcon name="expand_more" className={`pointer-events-none absolute right-2.5 top-2.5 text-[18px] ${value ? "" : S.muted}`} />
      </span>
    </label>
  );
}

/** Stitch 10 state 01: tinted panel with shimmering row skeletons. */
function LoadingList() {
  const bar = `rounded-md ${S.high}`;
  return (
    <div className={`${S.card} p-7`} aria-busy="true" aria-label="Loading" data-testid="pt-loading">
      <div className="mb-4 flex justify-end">
        <span className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 ${T.labelSm} ${S.high} ${S.muted}`}>
          <DIcon name="progress_activity" className={`animate-spin text-[14px] ${S.primary}`} /> Loading
        </span>
      </div>
      <div className={`space-y-4 rounded-xl p-4 ${S.low}`}>
        <div className="flex items-center justify-between pb-2">
          <div className="flex items-center gap-2">
            <div className={`h-5 w-40 ${bar}`} />
            <div className={`h-5 w-8 rounded-full ${S.high}`} />
          </div>
          <div className={`h-4 w-24 ${bar}`} />
        </div>
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className={`space-y-2 rounded-xl bg-white p-4 shadow-sm dark:bg-[#111a2e] ${i === 2 ? "opacity-75" : ""}`}>
              <div className="flex items-center justify-between">
                <div className={`h-4 w-44 ${bar}`} />
                <div className={`h-6 w-16 rounded-full ${S.high}`} />
              </div>
              <div className="flex gap-2">
                <div className={`h-3 w-28 ${bar}`} />
                {i === 0 ? <div className={`h-3 w-20 ${bar}`} /> : null}
              </div>
              <div className="flex items-center justify-between gap-3 pt-2">
                <div className={`h-8 flex-1 rounded-lg ${S.high}`} />
                <div className={`h-8 w-20 rounded-lg ${S.high}`} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Stitch 10 state 02: green tick, "Every car model is confirmed", back button. */
function EmptyList({ onBack }: { onBack: () => void }) {
  return (
    <div className={`${S.card} p-7`} data-testid="pt-empty">
      <div className={`flex min-h-[300px] flex-col items-center justify-center rounded-xl p-8 text-center ${S.low}`}>
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[#d1fae5] text-[#047857] shadow-sm dark:bg-[#14532d] dark:text-[#4ade80]">
          <DIcon name="check_circle" filled className="text-[36px]" />
        </div>
        <h3 className={`${T.headlineLg} tracking-tight ${S.text}`}>Every car model is confirmed</h3>
        <p className={`mt-1 max-w-sm ${T.bodyMd} ${S.muted}`}>
          New car models that Roam can&apos;t work out will appear here.
        </p>
        <div className="mt-6">
          <button type="button" className={BTN_WHITE} onClick={onBack}>
            <DIcon name="directions_car" className={`text-[18px] ${S.primary}`} /> Back to Vehicles
          </button>
        </div>
      </div>
    </div>
  );
}
