/**
 * "Fits" — Stitch powertrain-job-fit-dominion screens 7–9 (job drawer same-as-group / custom,
 * group drawer presets), content from docs/powertrain-job-fit-audit.md section 4.
 * Drop (audit 9): "Electrical specifications" / "Safety isolation protocol" rows, "Reset to default",
 * "Fleet coverage ratio" bar, ruleset ids. Presets only, never raw arrays.
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
import { RedSoftButton, T, WhiteButton } from "./serviceItemsUi";
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
    <section className="space-y-4 rounded-2xl bg-[#f1f3ff]/60 p-4" data-testid="fits-section">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#dae2fd] text-[#003ea9]">
            <span className="material-symbols-outlined text-[20px]">tune</span>
          </span>
          <div>
            <h3 className={`${T.headlineMd} text-[#161b27]`}>Fits</h3>
            <p className={`${T.bodySm} text-[#565e74]`}>
              {isGroup ? "Jobs in this group follow this unless they set their own." : "Which cars are offered this job."}
            </p>
          </div>
        </div>
        {!isGroup ? (
          <span className={`rounded-full px-2.5 py-0.5 ${T.labelSm} ${custom ? "bg-[#dae2fd] text-[#003ea9]" : "bg-[#e9edfe] text-[#434655]"}`}>
            {custom ? "Set for this job" : "Same as group"}
          </span>
        ) : (
          <span className={`rounded-full bg-[#dae2fd] px-2.5 py-0.5 ${T.labelSm} text-[#003ea9]`}>Group preset</span>
        )}
      </div>

      {isGroup ? (
        <GroupPowertrainCards row={props.pt} onRow={props.onPt} canWrite={props.canWrite} byPowertrain={props.byPowertrain} />
      ) : (
        <FitRowEditor
          title="Powertrain"
          row={props.pt}
          onRow={props.onPt}
          canWrite={props.canWrite}
          all={POWERTRAINS}
          presets={POWERTRAIN_PRESETS}
          labels={POWERTRAIN_LABEL}
          groupSaved={props.groupPt}
        />
      )}

      <FitRowEditor
        title="Fuel"
        row={props.fu}
        onRow={props.onFu}
        canWrite={props.canWrite}
        all={FUELS}
        presets={FUEL_PRESETS}
        labels={FUEL_LABEL}
        groupSaved={isGroup ? undefined : props.groupFu}
      />

      <CountLine token={props.token} jobId={countJobId} overrides={overrides} overridesKey={key} invalid={invalid} isNew={!isGroup && !props.jobId} />

      {!isGroup ? (
        <div className="space-y-1.5 rounded-xl bg-[#ffffff] p-3.5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className={`${T.labelMd} font-semibold text-[#161b27]`}>High-voltage work</span>
              {props.hv ? <HvChip /> : null}
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={props.hv}
              aria-label="High-voltage work"
              disabled={!props.canWrite}
              onClick={() => props.onHv(!props.hv)}
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                props.hv ? "bg-[#0153dc]" : "bg-[#c3c6d7]"
              }`}
            >
              <span
                className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${props.hv ? "translate-x-[22px]" : "translate-x-0.5"}`}
              />
            </button>
          </div>
          <p className={`${T.bodySm} text-[#565e74]`}>
            Turn on if this job touches the high-voltage battery or cables. The lockout checklist will ask for it.
          </p>
        </div>
      ) : null}
    </section>
  );
}

/** Amber "High-voltage" chip (the only amber chip; "Not usual for this car" is grey). */
export function HvChip({ small = false }: { small?: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded-full bg-[#fff4dc] font-semibold text-[#8a5a00] ${
        small ? "px-1.5 py-px text-[11px]" : "px-2 py-0.5 text-[12px]"
      }`}
    >
      <span className="material-symbols-outlined text-[13px]" style={{ fontVariationSettings: "'FILL' 1" }}>
        bolt
      </span>
      High-voltage
    </span>
  );
}

function FitRowEditor({
  title,
  row,
  onRow,
  canWrite,
  all,
  presets,
  labels,
  groupSaved,
}: {
  title: string;
  row: FitRow;
  onRow: (r: FitRow) => void;
  canWrite: boolean;
  all: readonly string[];
  presets: Preset[];
  labels: Record<string, string>;
  /** Job drawer only: the group's saved list (undefined on a group drawer). */
  groupSaved?: string[] | null;
}) {
  const onJob = groupSaved !== undefined;
  const [showCustom, setShowCustom] = useState(() => !row.inherit && presetFor(row.codes, presets) === "custom");
  const preset = showCustom ? "custom" : presetFor(row.codes, presets);

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
    <div className="space-y-3 rounded-xl bg-[#ffffff] p-3.5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className={`${T.labelMd} font-semibold text-[#161b27]`}>{title}</span>
        {onJob ? (
          <div className="inline-flex rounded-lg bg-[#e9edfe] p-0.5" role="group" aria-label={`${title}: same as group or set for this job`}>
            {[
              { v: true, t: "Same as group" },
              { v: false, t: "Set for this job" },
            ].map((o) => (
              <button
                key={o.t}
                type="button"
                aria-pressed={row.inherit === o.v}
                disabled={!canWrite}
                onClick={() => {
                  setShowCustom(false);
                  onRow(o.v ? { inherit: true, codes: row.codes } : { inherit: false, codes: groupSaved ? [...groupSaved] : [...all] });
                }}
                className={`rounded-md px-3 py-1 ${T.labelSm} transition-all disabled:cursor-not-allowed ${
                  row.inherit === o.v ? "bg-white font-semibold text-[#003ea9] shadow-sm" : "text-[#565e74] hover:text-[#161b27]"
                }`}
              >
                {o.t}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {onJob && row.inherit ? (
        <div className="flex items-center justify-between gap-2">
          <span className={`${T.bodySm} text-[#565e74]`}>From the group</span>
          <span className={`inline-flex items-center gap-1 rounded-full bg-[#e9edfe] px-3 py-1 ${T.labelSm} text-[#434655]`}>
            <span className="material-symbols-outlined text-[14px]">link</span>
            Same as group ({describeList(groupSaved ?? null, presets, labels)})
          </span>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between gap-3">
            <span className={`${T.bodySm} text-[#565e74]`}>Preset</span>
            <div className="relative w-48">
              <select
                aria-label={`${title} preset`}
                value={preset}
                disabled={!canWrite}
                onChange={(e) => choosePreset(e.target.value)}
                className={`h-9 w-full cursor-pointer appearance-none rounded-lg bg-[#f1f3ff] pl-3 pr-8 ${T.labelMd} font-semibold text-[#161b27] focus:outline-none focus:ring-2 focus:ring-[#0153dc]/30`}
              >
                {presets.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.id === "all" ? (onJob ? "All" : p.label) : p.label}
                  </option>
                ))}
                <option value="custom">Custom…</option>
              </select>
              <span className="material-symbols-outlined pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[18px] text-[#565e74]">
                expand_more
              </span>
            </div>
          </div>
          {preset === "custom" ? (
            <div className="flex flex-wrap gap-2 pt-1" role="group" aria-label={`${title} choices`}>
              {all.map((code) => {
                const on = row.codes.includes(code);
                return (
                  <button
                    key={code}
                    type="button"
                    aria-pressed={on}
                    disabled={!canWrite}
                    onClick={() => toggle(code)}
                    className={`inline-flex h-[30px] items-center gap-1.5 rounded-full px-3 ${T.labelMd} transition-colors disabled:cursor-not-allowed ${
                      on ? "bg-[#0153dc] font-semibold text-white shadow-sm" : "bg-[#e9edfe] text-[#434655] hover:bg-[#e4e8f8]"
                    }`}
                  >
                    {on ? (
                      <span className="material-symbols-outlined text-[16px]">check_circle</span>
                    ) : (
                      <span className="h-2 w-2 rounded-full bg-[#c3c6d7]" />
                    )}
                    {labels[code] ?? code}
                  </button>
                );
              })}
            </div>
          ) : null}
          {row.codes.length === 0 ? (
            <p className={`${T.bodySm} text-[#ba1a1a]`}>Pick at least one. A job that fits no car should be retired instead.</p>
          ) : null}
        </>
      )}
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
    <div className="space-y-3 rounded-xl bg-[#ffffff] p-3.5 shadow-sm">
      <span className={`${T.labelMd} font-semibold text-[#161b27]`}>Powertrain</span>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
              className={`relative flex flex-col items-start gap-1 rounded-xl p-4 text-left transition-all disabled:cursor-not-allowed ${
                on ? "bg-[#f1f3ff] ring-2 ring-[#0153dc]" : "bg-[#ffffff] ring-1 ring-[#c3c6d7] hover:ring-[#737686]"
              }`}
            >
              {on ? (
                <span className="material-symbols-outlined absolute right-3 top-3 text-[22px] text-[#0153dc]" style={{ fontVariationSettings: "'FILL' 1" }}>
                  check_circle
                </span>
              ) : null}
              <span className={`${T.bodyLg} ${on ? "text-[#003ea9]" : "text-[#161b27]"}`}>{p.label}</span>
              <span className={`${T.bodySm} text-[#565e74]`}>{p.hint}</span>
              {n != null ? (
                <span className={`mt-2 ${T.labelSm} ${on ? "text-[#003ea9]" : "text-[#565e74]"}`}>{fmt(n)} models</span>
              ) : null}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        aria-pressed={current === "custom"}
        disabled={!canWrite}
        onClick={() => setShowCustom(true)}
        className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 ${T.labelMd} shadow-sm ring-1 transition-colors disabled:cursor-not-allowed ${
          current === "custom" ? "bg-[#dae2fd] text-[#003ea9] ring-[#0153dc]" : "bg-white text-[#161b27] ring-[#c3c6d7] hover:bg-[#f1f3ff]"
        }`}
      >
        <span className="material-symbols-outlined text-[16px]">tune</span>
        Custom…
      </button>
      {current === "custom" ? (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Powertrain choices">
          {POWERTRAINS.map((code) => {
            const on = row.codes.includes(code);
            return (
              <button
                key={code}
                type="button"
                aria-pressed={on}
                disabled={!canWrite}
                onClick={() =>
                  onRow({
                    inherit: false,
                    codes: ordered(on ? row.codes.filter((c) => c !== code) : [...row.codes, code], POWERTRAINS),
                  })
                }
                className={`inline-flex h-[30px] items-center gap-1.5 rounded-full px-3 ${T.labelMd} transition-colors ${
                  on ? "bg-[#0153dc] font-semibold text-white shadow-sm" : "bg-[#e9edfe] text-[#434655] hover:bg-[#e4e8f8]"
                }`}
              >
                {on ? <span className="material-symbols-outlined text-[16px]">check_circle</span> : <span className="h-2 w-2 rounded-full bg-[#c3c6d7]" />}
                {POWERTRAIN_LABEL[code]}
              </button>
            );
          })}
        </div>
      ) : null}
      {row.codes.length === 0 ? <p className={`${T.bodySm} text-[#ba1a1a]`}>Pick at least one powertrain.</p> : null}
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
}: {
  token: string;
  jobId: string | null;
  overrides: FitOverrides | null;
  overridesKey: string;
  invalid: boolean;
  isNew: boolean;
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
      <p className={`rounded-xl bg-[#ffffff] px-3.5 py-3 ${T.bodySm} text-[#565e74] shadow-sm`}>
        The number of car models this fits shows once the job is saved.
      </p>
    );
  }
  if (!jobId) return null;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#dae2fd]/50 px-3.5 py-3" aria-live="polite">
        {failed ? (
          <span className={`flex items-center gap-1.5 ${T.bodySm} text-[#ba1a1a]`}>
            <span className="material-symbols-outlined text-[18px]">error</span>
            Couldn&apos;t count right now
          </span>
        ) : invalid ? (
          <span className={`${T.bodySm} text-[#565e74]`}>Pick at least one powertrain and one fuel to see the count.</span>
        ) : (
          <span className={`flex items-center gap-1.5 ${T.bodySm} text-[#161b27] transition-opacity ${loading ? "opacity-50" : ""}`}>
            <span className="material-symbols-outlined text-[20px] text-[#0153dc]">directions_car</span>
            {count ? (
              <>
                Fits <b className="tabular-nums text-[#003ea9]">{fmt(count.fits)}</b> of{" "}
                <span className="tabular-nums">{fmt(count.total)}</span> car models
                {count.unknown ? <span className="text-[#565e74]">({fmt(count.unknown)} not known yet)</span> : null}
              </>
            ) : (
              "Counting…"
            )}
          </span>
        )}
        {failed ? (
          <RedSoftButton icon="refresh" onClick={() => setTick((n) => n + 1)}>
            Retry
          </RedSoftButton>
        ) : (
          <WhiteButton icon="list" disabled={!count || invalid} onClick={() => setSeeWhich(true)}>
            See which
          </WhiteButton>
        )}
      </div>
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
          <span className="material-symbols-outlined text-[20px]">close</span>
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
