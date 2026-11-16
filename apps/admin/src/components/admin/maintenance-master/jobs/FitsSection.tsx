/**
 * "Fits" — ported exactly from Stitch docs/stitch/powertrain-job-fit-dominion/html/07 (job drawer, same
 * as group), 08 (job drawer, custom + high-voltage on) and 09 (group drawer, 2×2 preset cards); the
 * couldn't-count strip is screen 10. Content: docs/powertrain-job-fit-audit.md section 4.
 * Dropped (audit 9): "Inheritance active" banner text, ruleset ids, "Electrical specifications" /
 * "Safety isolation protocol" rows, "Reset to default", coverage-ratio bar, "Standard safe" chip,
 * "Template override" note. Presets only, never raw arrays. The fit rule stays in the database.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  fetchFitCount,
  fetchFitModels,
  type FitCount,
  type FitModel,
  type FitOverrides,
} from "./jobsApi";
import { Modal } from "./jobsUi";
import { RedSoftButton, T } from "./serviceItemsUi";
import { CountFailed } from "../../powertrain/ptStitch";
import {
  FUELS,
  FUEL_LABEL,
  FUEL_PRESETS,
  POWERTRAINS,
  POWERTRAIN_LABEL,
  POWERTRAIN_PRESETS,
  describeList,
  fuelName,
  ordered,
  powertrainName,
  presetFor,
  rowToSave,
  type FitRow,
  type Preset,
} from "../../powertrain/powertrainModel";

const fmt = (n: number) => n.toLocaleString("en-US");

type Common = {
  token: string;
  canWrite: boolean;
  pt: FitRow;
  fu: FitRow;
  onPt: (r: FitRow) => void;
  onFu: (r: FitRow) => void;
};

type JobProps = Common & {
  kind: "job";
  /** null while adding a new job: the count shows once it's saved. */
  jobId: string | null;
  groupPt: string[] | null;
  groupFu: string[] | null;
  groupName: string;
  hv: boolean;
  onHv: (v: boolean) => void;
};

type GroupProps = Common & {
  kind: "group";
  /** Any active job in the group, used only to count models for the group's lists (no per-job override). */
  sampleJobId: string | null;
  /** Models per powertrain (powertrain-summary), for the preset cards. */
  byPowertrain: Record<string, number> | null;
};

const TXT = "text-[#30323b]";
const MUTED = "text-[#5d5f68]";
const OUTLINE = "text-[#737686]";

export function FitsSection(props: JobProps | GroupProps) {
  const isGroup = props.kind === "group";
  const ptSave = rowToSave(props.pt, POWERTRAINS, isGroup);
  const fuSave = rowToSave(props.fu, FUELS, isGroup);
  const invalid = ptSave === undefined || fuSave === undefined;

  // What the count previews. A job sends its own unsaved choices (null = same as group);
  // a group is counted on a sample job with the group's lists ("any" = every code).
  const countJobId = isGroup ? props.sampleJobId : props.jobId;
  const overrides: FitOverrides | null = invalid
    ? null
    : isGroup
      ? { fits_powertrains: ptSave ?? [...POWERTRAINS], fits_fuels: fuSave ?? [...FUELS] }
      : { fits_powertrains: ptSave ?? null, fits_fuels: fuSave ?? null };
  const key = JSON.stringify(overrides);

  const custom = !isGroup && (!props.pt.inherit || !props.fu.inherit);

  return (
    <section
      className={`rounded-2xl border border-[#e8e9f2] bg-[#ffffff] p-6 shadow-[0_1px_4px_rgba(17,26,46,0.06),0_6px_18px_rgba(17,26,46,0.03)] ${
        isGroup ? "space-y-4" : "space-y-6"
      }`}
      data-testid="fits-section"
    >
      {isGroup ? (
        <div>
          <div className="flex items-center justify-between">
            <h3 className={`text-[18px] font-semibold leading-[26px] tracking-tight ${TXT}`}>Fits</h3>
            <span className="rounded bg-[#dbe1ff]/60 px-2 py-0.5 text-[11px] font-semibold uppercase leading-[14px] tracking-wider text-[#003ea9]">
              Group preset
            </span>
          </div>
          <p className={`mt-1 text-[14px] leading-5 ${MUTED}`}>Jobs in this group follow this unless they set their own.</p>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#dbe1ff] text-[#0153dc]">
                <span className="material-symbols-outlined" style={{ fontSize: 20 }}>tune</span>
              </div>
              <div>
                <h3 className={`text-[18px] font-semibold leading-6 tracking-[-0.01em] ${TXT}`}>Fits</h3>
                <p className={`text-[12px] leading-[18px] ${MUTED}`}>Which cars are offered this job.</p>
              </div>
            </div>
            <span
              data-testid="fits-mode-chip"
              className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold leading-[14px] ${
                custom ? "bg-[#d9e2fe] text-[#003ea9]" : "bg-[#ecedf8] text-[#434655]"
              }`}
            >
              {custom ? "Set for this job" : "Same as group"}
            </span>
          </div>
          <div className="h-px w-full bg-[#f0f1f7]" />
        </>
      )}

      {isGroup ? (
        <GroupPowertrainCards row={props.pt} onRow={props.onPt} canWrite={props.canWrite} byPowertrain={props.byPowertrain} />
      ) : (
        <FitRowEditor
          title="Powertrain"
          icon="engineering"
          row={props.pt}
          onRow={props.onPt}
          canWrite={props.canWrite}
          all={POWERTRAINS}
          presets={POWERTRAIN_PRESETS}
          labels={POWERTRAIN_LABEL}
          groupSaved={props.groupPt}
          groupName={props.groupName}
        />
      )}

      <FitRowEditor
        title="Fuel"
        icon="local_gas_station"
        row={props.fu}
        onRow={props.onFu}
        canWrite={props.canWrite}
        all={FUELS}
        presets={FUEL_PRESETS}
        labels={FUEL_LABEL}
        groupSaved={isGroup ? undefined : props.groupFu}
        groupName={isGroup ? "" : props.groupName}
      />

      <CountLine
        token={props.token}
        jobId={countJobId}
        overrides={overrides}
        overridesKey={key}
        invalid={invalid}
        isNew={!isGroup && !props.jobId}
        variant={isGroup ? "group" : "job"}
      />

      {!isGroup ? (
        <div className="border-t border-[#f0f1f7] pt-2">
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <span className={`text-[14px] font-medium ${TXT}`}>High-voltage work</span>
                {props.hv ? <HvChip /> : null}
              </div>
              <p className={`text-[13px] leading-[18px] ${MUTED}`}>
                Turn on if this job touches the high-voltage battery or cables. The lockout checklist will ask for it.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={props.hv}
              aria-label="High-voltage work"
              disabled={!props.canWrite}
              onClick={() => props.onHv(!props.hv)}
              className={`relative h-6 w-11 shrink-0 rounded-full p-0.5 transition-colors focus:outline-none focus:ring-2 focus:ring-[#0153dc]/30 disabled:cursor-not-allowed disabled:opacity-50 ${
                props.hv ? "bg-[#0153dc]" : "bg-[#d8d9e4]"
              }`}
            >
              <span
                className={`block h-5 w-5 rounded-full bg-white shadow-md transition-transform ${props.hv ? "translate-x-5" : "translate-x-0"}`}
              />
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

/** Amber "High-voltage" chip (Stitch 08 header chip). The only amber chip; "Not usual for this car" is grey. */
export function HvChip({ small = false }: { small?: boolean }) {
  return (
    <span
      data-testid="hv-chip"
      className={`inline-flex items-center gap-0.5 rounded-full bg-[#ffddb4] font-semibold text-[#633f00] ${
        small ? "px-1.5 py-px text-[11px]" : "px-2.5 py-0.5 text-[12px]"
      }`}
    >
      <span className="material-symbols-outlined" style={{ fontSize: 14, fontVariationSettings: "'FILL' 1" }}>
        bolt
      </span>
      High-voltage
    </span>
  );
}

/** Preset name plus what it covers, e.g. "Spark-ignition (Petrol, CNG (gas))". */
function presetOption(p: Preset, labels: Record<string, string>, onJob: boolean): string {
  if (p.id === "all") return onJob ? "All" : p.label;
  if (p.codes.length === 1) return p.label;
  return `${p.label} (${p.codes.map((c) => labels[c] ?? c).join(", ")})`;
}

function FitRowEditor({
  title,
  icon,
  row,
  onRow,
  canWrite,
  all,
  presets,
  labels,
  groupSaved,
  groupName,
}: {
  title: string;
  icon: string;
  row: FitRow;
  onRow: (r: FitRow) => void;
  canWrite: boolean;
  all: readonly string[];
  presets: Preset[];
  labels: Record<string, string>;
  /** Job drawer only: the group's saved list (undefined on a group drawer). */
  groupSaved?: string[] | null;
  groupName: string;
}) {
  const onJob = groupSaved !== undefined;
  const [showCustom, setShowCustom] = useState(() => !row.inherit && presetFor(row.codes, presets) === "custom");
  const preset = showCustom ? "custom" : presetFor(row.codes, presets);
  const presetObj = presets.find((p) => p.id === preset);

  const choosePreset = (id: string) => {
    if (id === "custom") {
      setShowCustom(true);
      return;
    }
    setShowCustom(false);
    const p = presets.find((x) => x.id === id);
    if (p) onRow({ inherit: false, codes: [...p.codes] });
  };

  const toggle = (code: string) => {
    const next = row.codes.includes(code) ? row.codes.filter((c) => c !== code) : [...row.codes, code];
    onRow({ inherit: false, codes: ordered(next, all) });
  };

  return (
    <div className="space-y-3" data-testid={`fits-row-${title.toLowerCase()}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className={`text-[14px] font-medium ${TXT}`}>{title}</span>
        {onJob ? (
          <div
            className="inline-flex rounded-xl border border-[#e2e4ef] bg-[#f2f3fe] p-1 shadow-inner"
            role="group"
            aria-label={`${title}: same as group or set for this job`}
          >
            {[
              { v: true, t: "Same as group", i: "lock_reset" },
              { v: false, t: "Set for this job", i: "edit" },
            ].map((o) => {
              const on = row.inherit === o.v;
              return (
                <button
                  key={o.t}
                  type="button"
                  aria-pressed={on}
                  disabled={!canWrite}
                  onClick={() => {
                    setShowCustom(false);
                    onRow(o.v ? { inherit: true, codes: row.codes } : { inherit: false, codes: groupSaved ? [...groupSaved] : [...all] });
                  }}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium leading-4 transition-all disabled:cursor-not-allowed ${
                    on ? "bg-[#0153dc] text-white shadow-sm" : "text-[#434655] hover:text-[#191b23]"
                  }`}
                >
                  {on ? <span className="material-symbols-outlined" style={{ fontSize: 15 }}>{o.i}</span> : null}
                  {o.t}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      {onJob && row.inherit ? (
        <div className="flex items-center justify-between rounded-xl border border-[#e4e7f1] bg-[#f0f2f8] p-3" data-testid="fits-inherited">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white text-[#555e75] shadow-sm">
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>{icon}</span>
            </div>
            <div className="flex flex-col">
              <span className={`text-[12px] font-semibold leading-4 ${TXT}`}>{describeList(groupSaved ?? null, presets, labels)}</span>
              <span className={`text-[12px] leading-[18px] ${OUTLINE}`}>
                Same as the <strong className="font-medium text-[#191b23]">{groupName || "group"}</strong> group
              </span>
            </div>
          </div>
          <span className="flex items-center gap-1 rounded-full bg-[#e8f5ed] px-2 py-0.5 text-[11px] font-semibold leading-[14px] text-[#006e31]">
            <span className="material-symbols-outlined" style={{ fontSize: 13 }}>check</span> Linked
          </span>
        </div>
      ) : (
        <>
          <div className="relative">
            <div className="pointer-events-none absolute left-3.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded bg-[#f1f2f6] text-[#555e75]">
              <span className="material-symbols-outlined" style={{ fontSize: 15 }}>{icon}</span>
            </div>
            <select
              aria-label={`${title} preset`}
              value={preset}
              disabled={!canWrite}
              onChange={(e) => choosePreset(e.target.value)}
              className={`h-11 w-full cursor-pointer appearance-none rounded-[10px] border border-[#d8d9e4] bg-white pl-12 pr-10 text-[14px] font-medium leading-5 ${TXT} shadow-sm transition-all hover:border-[#0153dc] focus:outline-none focus:ring-2 focus:ring-[#0153dc]/20 disabled:cursor-not-allowed`}
            >
              {presets.map((p) => (
                <option key={p.id} value={p.id}>
                  {presetOption(p, labels, onJob)}
                </option>
              ))}
              <option value="custom">Custom…</option>
            </select>
            <span className="material-symbols-outlined pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#737686]" style={{ fontSize: 20 }}>
              expand_more
            </span>
          </div>
          <p className={`-mt-1.5 text-[12px] leading-[18px] ${MUTED}`}>
            {preset === "custom" ? "Pick which ones below." : presetObj?.hint}
          </p>
          {preset === "custom" ? (
            <ChoiceChips title={title} all={all} labels={labels} codes={row.codes} canWrite={canWrite} onToggle={toggle} />
          ) : null}
          {row.codes.length === 0 ? (
            <p className="text-[12px] leading-[18px] text-[#ba1a1a]">Pick at least one. A job that fits no car should be retired instead.</p>
          ) : null}
        </>
      )}
    </div>
  );
}

/** Stitch 08 checkbox chips: grey with a dot when off, solid blue with a tick when on. */
function ChoiceChips({
  title,
  all,
  labels,
  codes,
  canWrite,
  onToggle,
}: {
  title: string;
  all: readonly string[];
  labels: Record<string, string>;
  codes: string[];
  canWrite: boolean;
  onToggle: (code: string) => void;
}) {
  return (
    <div className="rounded-xl bg-[#f2f3fe] p-4">
      <p className={`mb-2 text-[11px] font-semibold uppercase leading-[14px] tracking-wider ${OUTLINE}`}>Pick which ones</p>
      <div className="flex flex-wrap gap-2" role="group" aria-label={`${title} choices`}>
        {all.map((code) => {
          const on = codes.includes(code);
          return (
            <button
              key={code}
              type="button"
              aria-pressed={on}
              disabled={!canWrite}
              onClick={() => onToggle(code)}
              className={`inline-flex h-[30px] items-center gap-1.5 rounded-full px-3 text-[12px] leading-4 transition-colors disabled:cursor-not-allowed ${
                on ? "bg-[#003ea9] font-semibold text-white shadow-sm" : "bg-[#e7e7f2] font-medium text-[#434655] hover:bg-[#e1e2ec]"
              }`}
            >
              {on ? (
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>check_circle</span>
              ) : (
                <span className="h-1.5 w-1.5 rounded-full bg-[#a5a8b8]" />
              )}
              {labels[code] ?? code}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function GroupPowertrainCards({
  row,
  onRow,
  canWrite,
  byPowertrain,
}: {
  row: FitRow;
  onRow: (r: FitRow) => void;
  canWrite: boolean;
  byPowertrain: Record<string, number> | null;
}) {
  const [showCustom, setShowCustom] = useState(() => presetFor(row.codes, POWERTRAIN_PRESETS) === "custom");
  const current = showCustom ? "custom" : presetFor(row.codes, POWERTRAIN_PRESETS);
  const modelsFor = (codes: readonly string[]) =>
    byPowertrain ? codes.reduce((n, c) => n + (byPowertrain[c] ?? 0), 0) : null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {POWERTRAIN_PRESETS.map((p) => {
          const on = current === p.id;
          const n = modelsFor(p.codes);
          return (
            <button
              key={p.id}
              type="button"
              aria-pressed={on}
              disabled={!canWrite}
              onClick={() => {
                setShowCustom(false);
                onRow({ inherit: false, codes: [...p.codes] });
              }}
              className={`relative flex min-h-[96px] flex-col justify-between rounded-xl p-3.5 text-left transition-all focus:outline-none disabled:cursor-not-allowed ${
                on
                  ? "border border-transparent bg-[#f0f5ff] shadow-[0_2px_8px_rgba(1,83,220,0.12)] ring-2 ring-[#0153dc]"
                  : "border border-[#c3c6d7]/50 hover:border-[#003ea9]/50 hover:bg-[#f2f3fe] focus:ring-2 focus:ring-[#003ea9]/20"
              }`}
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className={`text-[14px] font-semibold leading-5 ${on ? "text-[#003ea9]" : "text-[#191b23]"}`}>{p.label}</span>
                  {on ? (
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#0153dc] text-white">
                      <span className="material-symbols-outlined font-bold" style={{ fontSize: 14 }}>check</span>
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 text-[12px] leading-snug text-[#434655]">{p.hint}</p>
              </div>
              {n != null ? (
                <span className={`mt-2 text-[11px] leading-[14px] tabular-nums ${on ? "font-semibold text-[#003ea9]" : `font-semibold ${OUTLINE}`}`}>
                  {fmt(n)} {on ? "models match" : "models"}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      <div className="pt-0.5">
        <button
          type="button"
          aria-pressed={current === "custom"}
          disabled={!canWrite}
          onClick={() => setShowCustom(true)}
          className={`inline-flex items-center gap-1.5 rounded-[10px] border px-3 py-1.5 text-[12px] font-medium leading-4 shadow-sm transition-colors disabled:cursor-not-allowed ${
            current === "custom" ? "border-[#0153dc] bg-[#dbe1ff] text-[#003ea9]" : "border-[#d8d9e4] bg-[#faf8ff] text-[#30323b] hover:bg-[#ecedf8]"
          }`}
        >
          <span className="material-symbols-outlined text-[#555e75]" style={{ fontSize: 16 }}>tune</span>
          <span>Custom…</span>
        </button>
      </div>
      {current === "custom" ? (
        <ChoiceChips
          title="Powertrain"
          all={POWERTRAINS}
          labels={POWERTRAIN_LABEL}
          codes={row.codes}
          canWrite={canWrite}
          onToggle={(code) =>
            onRow({
              inherit: false,
              codes: ordered(row.codes.includes(code) ? row.codes.filter((c) => c !== code) : [...row.codes, code], POWERTRAINS),
            })
          }
        />
      ) : null}
      {row.codes.length === 0 ? <p className="text-[12px] leading-[18px] text-[#ba1a1a]">Pick at least one powertrain.</p> : null}
    </div>
  );
}

/** "Fits N of T car models (U not known yet)" — debounced 250 ms; the last number stays, faded, while loading. */
function CountLine({
  token,
  jobId,
  overrides,
  overridesKey,
  invalid,
  isNew,
  variant,
}: {
  token: string;
  jobId: string | null;
  overrides: FitOverrides | null;
  overridesKey: string;
  invalid: boolean;
  isNew: boolean;
  variant: "job" | "group";
}) {
  const [count, setCount] = useState<FitCount | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [tick, setTick] = useState(0);
  const [seeWhich, setSeeWhich] = useState(false);
  const latest = useRef(overrides);
  latest.current = overrides;

  useEffect(() => {
    if (!jobId || invalid) return;
    const ctrl = new AbortController();
    setLoading(true);
    setFailed(false);
    const t = window.setTimeout(() => {
      fetchFitCount(token, jobId, latest.current, ctrl.signal)
        .then((c) => setCount(c))
        .catch((e: unknown) => {
          if ((e as { name?: string })?.name !== "AbortError") setFailed(true);
        })
        .finally(() => {
          if (!ctrl.signal.aborted) setLoading(false);
        });
    }, 250);
    return () => {
      window.clearTimeout(t);
      ctrl.abort();
    };
  }, [token, jobId, overridesKey, invalid, tick]);

  if (isNew) {
    return (
      <p className={`rounded-xl border border-[#d8d9e4] bg-white p-3.5 text-[12px] leading-[18px] ${MUTED}`}>
        The number of car models this fits shows once the job is saved.
      </p>
    );
  }
  if (!jobId) return null;
  if (failed) return <CountFailed onRetry={() => setTick((n) => n + 1)} />;

  const numbers = count ? (
    <>
      Fits <span className="tabular-nums text-[#0153dc]">{fmt(count.fits)}</span> of <span className="tabular-nums">{fmt(count.total)}</span> car models
    </>
  ) : (
    "Counting…"
  );
  const sub = invalid
    ? "Pick at least one powertrain and one fuel to see the count."
    : count?.unknown
      ? `${fmt(count.unknown)} not known yet (their powertrain needs checking)`
      : "Updates as you change the choices.";

  return (
    <>
      {variant === "job" ? (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-[#d8d9e4] bg-white p-3.5 shadow-sm" aria-live="polite" data-testid="fits-count">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#eef2ff] text-[#0153dc]">
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>directions_car</span>
            </div>
            <div className={`flex flex-col transition-opacity ${loading ? "opacity-50" : ""}`}>
              <div className={`text-[14px] font-semibold leading-5 ${TXT}`}>{invalid ? "—" : numbers}</div>
              <span className={`text-[12px] leading-[18px] ${MUTED}`}>{sub}</span>
            </div>
          </div>
          <button
            type="button"
            disabled={!count || invalid}
            onClick={() => setSeeWhich(true)}
            className={`flex h-8 shrink-0 items-center gap-1.5 rounded-[10px] border border-[#d8d9e4] bg-white px-3 text-[13px] font-medium ${TXT} transition-colors hover:bg-[#f2f3fe] disabled:cursor-not-allowed disabled:opacity-40`}
          >
            <span>See which</span>
            <span className="material-symbols-outlined" style={{ fontSize: 15 }}>arrow_forward</span>
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-[#c3c6d7]/20 bg-[#f2f3fe]/70 p-3" aria-live="polite" data-testid="fits-count">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="material-symbols-outlined shrink-0 text-[#003ea9]" style={{ fontSize: 20 }}>pie_chart</span>
            <div className={`text-[12px] leading-[18px] text-[#434655] transition-opacity ${loading ? "opacity-50" : ""}`}>
              {invalid ? (
                sub
              ) : count ? (
                <>
                  Fits <span className={`text-[12px] font-semibold tabular-nums ${TXT}`}>{fmt(count.fits)}</span> of{" "}
                  <span className={`text-[12px] font-semibold tabular-nums ${TXT}`}>{fmt(count.total)}</span> car models
                  {count.unknown ? ` (${fmt(count.unknown)} not known yet)` : ""}
                </>
              ) : (
                "Counting…"
              )}
            </div>
          </div>
          <button
            type="button"
            disabled={!count || invalid}
            onClick={() => setSeeWhich(true)}
            className="shrink-0 rounded-md border border-[#d8d9e4] bg-white px-2.5 py-1 text-[11px] font-medium leading-[14px] text-[#434655] transition-colors hover:bg-[#ecedf8] hover:text-[#191b23] disabled:cursor-not-allowed disabled:opacity-40"
          >
            See which
          </button>
        </div>
      )}
      {seeWhich && count ? (
        <SeeWhichModal token={token} jobId={jobId} overrides={overrides} total={count.fits} onClose={() => setSeeWhich(false)} />
      ) : null}
    </>
  );
}

function SeeWhichModal({
  token,
  jobId,
  overrides,
  total,
  onClose,
}: {
  token: string;
  jobId: string;
  overrides: FitOverrides | null;
  total: number;
  onClose: () => void;
}) {
  const [items, setItems] = useState<FitModel[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [q, setQ] = useState("");
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let live = true;
    setFailed(false);
    fetchFitModels(token, jobId, overrides, 200)
      .then((r) => live && setItems(r.items))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
    // overrides are fixed while the modal is open
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, jobId, tick]);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (items ?? []).filter((m) => !s || `${m.make} ${m.model}`.toLowerCase().includes(s));
  }, [items, q]);

  const years = (m: FitModel) =>
    m.yearFrom ? `${m.yearFrom}${m.yearTo && m.yearTo !== m.yearFrom ? `–${m.yearTo}` : m.yearTo ? "" : "–"}` : "";

  return (
    <Modal labelledBy="fits-see-which-title" onClose={onClose} width="max-w-lg">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="fits-see-which-title" className={`${T.headlineMd} text-[#161b27]`}>
            Car models this fits
          </h2>
          <p className={`${T.bodySm} text-[#565e74]`}>
            {fmt(total)} in all{items && items.length < total ? ` · showing the first ${fmt(items.length)}` : ""}
          </p>
        </div>
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-[#f1f3ff] text-[#565e74] hover:bg-[#e4e8f8]"
        >
          <span className="material-symbols-outlined" style={{ fontSize: 20 }}>close</span>
        </button>
      </div>
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search make or model"
        aria-label="Search make or model"
        className={`mt-4 h-10 w-full rounded-xl bg-[#f1f3ff] px-3.5 ${T.bodyMd} text-[#161b27] focus:outline-none focus:ring-2 focus:ring-[#0153dc]/30`}
      />
      <div className="mt-3 max-h-[360px] overflow-y-auto">
        {failed ? (
          <div className="flex items-center justify-between gap-3 rounded-xl bg-[#ffdad6]/40 p-3">
            <span className={`${T.bodySm} text-[#ba1a1a]`}>Couldn&apos;t load the list.</span>
            <RedSoftButton icon="refresh" onClick={() => setTick((n) => n + 1)}>
              Retry
            </RedSoftButton>
          </div>
        ) : !items ? (
          <p className={`${T.bodySm} p-3 text-[#565e74]`}>Loading…</p>
        ) : shown.length === 0 ? (
          <p className={`${T.bodySm} p-3 text-[#565e74]`}>No car model matches.</p>
        ) : (
          <ul className="divide-y divide-[#e9edfe]">
            {shown.map((m) => (
              <li key={m.vehicleCatalogId} className="flex items-center justify-between gap-3 py-2">
                <span className={`${T.bodyMd} text-[#161b27]`}>
                  {m.make} {m.model} <span className="text-[#565e74]">{years(m)}</span>
                </span>
                <span className={`shrink-0 ${T.labelSm} text-[#565e74]`}>
                  {powertrainName(m.powertrain)} · {fuelName(m.fuel)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}
