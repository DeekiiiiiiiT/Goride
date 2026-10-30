import { MatchTypeStrip } from "./MatchTypeStrip";

export type RecentSearch = { make: string; model: string; year: string };

export function CarStep({
  makes,
  models,
  years,
  make,
  model,
  year,
  quick,
  codes,
  yearSpan,
  partCount,
  ready,
  owner,
  recent,
  onMake,
  onModel,
  onYear,
  onQuick,
  onClearQuick,
  onContinue,
  onRecent,
  onClearRecent,
}: {
  makes: string[];
  models: string[];
  years: number[];
  make: string;
  model: string;
  year: string;
  quick: string;
  codes: string[];
  yearSpan: string;
  partCount: number | null;
  ready: boolean;
  owner: boolean;
  recent: RecentSearch[];
  onMake: (value: string) => void;
  onModel: (value: string) => void;
  onYear: (value: string) => void;
  onQuick: (value: string) => void;
  onClearQuick: () => void;
  onContinue: () => void;
  onRecent: (row: RecentSearch) => void;
  onClearRecent: () => void;
}) {
  const carName = [make, model, year].filter(Boolean).join(" ");
  return (
    <div className="w-full max-w-4xl mx-auto flex flex-col gap-space-lg">
      <div className="bg-surface-container-lowest rounded-2xl shadow-md p-space-xl md:p-8 flex flex-col gap-space-xl">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-space-md">
          <div>
            <h2 className="font-headline-xl text-headline-xl text-on-surface font-bold tracking-tight">Which car is it?</h2>
            <p className="font-body-md text-body-md text-secondary mt-1">Pick the make, model, and year from official registration or export inspection documents.</p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-space-lg">
          <Field label="Make" count="01/03" stitch="Make 01/03" icon="directions_car" value={make} options={makes} onChange={onMake} hint={yearSpan ? "" : ""} />
          <Field label="Model" count="02/03" stitch="Model 02/03" icon="category" value={model} options={models} onChange={onModel} disabled={!make} />
          <Field label="Model Year" count="03/03" stitch="Model Year 03/03" icon="calendar_today" value={year} options={years.map(String)} onChange={onYear} mono disabled={!model} hint={yearSpan} />
        </div>
        <div className="relative py-2 flex items-center justify-center">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full h-px bg-surface-container-high" />
          </div>
          <span className="relative px-4 bg-surface-container-lowest font-mono-sm text-mono-sm uppercase tracking-wider text-secondary">or type it</span>
        </div>
        <div className="flex flex-col gap-1.5">
          <div className="relative flex items-center bg-surface-container-low rounded-xl shadow-inner focus-within:bg-surface-container-lowest focus-within:shadow transition-all">
            <span className="material-symbols-outlined absolute left-3.5 text-primary text-[22px]">search</span>
            <input
              className="w-full h-12 pl-11 pr-24 rounded-xl bg-transparent font-mono-md text-mono-md text-on-surface placeholder:text-outline focus:outline-none"
              placeholder="e.g. 2018 Honda Fit"
              type="text"
              value={quick}
              onChange={(event) => onQuick(event.target.value)}
            />
            <button className="absolute right-2.5 px-2 py-1 rounded-lg bg-surface-container text-secondary hover:text-on-surface text-label-xs font-label-xs font-semibold uppercase transition-colors flex items-center gap-1" type="button" onClick={onClearQuick} aria-label="Clear close">
              <span>Clear</span>
              <span className="material-symbols-outlined text-[14px]">close</span>
            </button>
          </div>
          <div className="flex items-center justify-between text-secondary px-1 font-body-sm text-body-sm">
            <span>Type make, model and year, e.g. 2018 Honda Fit</span>
            {codes.length > 0 ? <span className="font-mono-sm text-mono-sm text-primary">Resolved: [{codes.join(" / ")}]</span> : null}
          </div>
        </div>
        {carName ? (
          <div className="bg-surface-container-low rounded-xl p-space-md flex flex-col sm:flex-row items-center justify-between gap-space-md">
            <div className="flex items-center gap-space-md">
              <div className="w-12 h-12 rounded-xl bg-primary-container text-on-primary flex items-center justify-center shrink-0 shadow-sm">
                <span className="material-symbols-outlined text-[28px]">directions_car</span>
              </div>
              <div className="flex flex-col">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-headline-md text-headline-md font-bold text-on-surface">{carName}</span>
                  {codes.slice(0, 4).map((code) => (
                    <span key={code} className="px-2 py-0.5 rounded-full font-mono-sm text-mono-sm font-semibold bg-surface-container-highest text-primary">{code}</span>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex sm:flex-col items-end gap-1 shrink-0">
              <span className="font-mono-sm text-mono-sm text-secondary uppercase">Known components</span>
              {partCount != null ? <span className="font-mono-md text-mono-md font-bold text-primary">{partCount.toLocaleString()} parts</span> : null}
            </div>
          </div>
        ) : null}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-md pt-space-md">
          <div className="flex items-center gap-2 text-primary font-body-sm text-body-sm">
            {ready ? (
              <>
                <div className="w-5 h-5 rounded-full bg-primary-container text-on-primary flex items-center justify-center text-xs">
                  <span className="material-symbols-outlined text-[14px]">done</span>
                </div>
                <span className="font-medium text-on-surface">Vehicle parameters complete. Ready for variant breakdown.</span>
              </>
            ) : null}
          </div>
          <button
            className="inline-flex items-center justify-center gap-2 px-6 h-12 rounded-xl bg-primary-container text-on-primary font-headline-md text-headline-md font-semibold hover:bg-primary transition-all shadow-md active:scale-[0.99] disabled:opacity-40"
            type="button"
            aria-label="Continue to version arrow_forward"
            onClick={onContinue}
          >
            <span>Continue to Version</span>
            <span className="material-symbols-outlined text-[20px]">arrow_forward</span>
          </button>
        </div>
      </div>
      <div className="flex flex-col gap-space-sm px-1">
        <div className="flex items-center justify-between">
          <span className="font-label-xs text-label-xs uppercase tracking-wider text-secondary font-bold">Recent searches</span>
          {recent.length > 0 ? (
            <button className="font-mono-sm text-mono-sm text-primary hover:underline" type="button" onClick={onClearRecent}>Clear history</button>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-space-sm">
          {recent.map((row) => {
            const on = row.make === make && row.model === model && row.year === year;
            return (
              <button key={`${row.make}-${row.model}-${row.year}`} className="group flex items-center gap-2 px-3 py-2 rounded-xl bg-surface-container-lowest text-on-surface shadow-sm hover:shadow transition-all" type="button" onClick={() => onRecent(row)}>
                <span className={"material-symbols-outlined text-[16px] " + (on ? "text-primary" : "text-secondary")}>history</span>
                <span className="font-body-sm text-body-sm font-semibold">{row.make} {row.model}</span>
                <span className="font-mono-sm text-mono-sm px-1.5 py-0.5 rounded bg-surface-container-high text-primary font-bold">{row.year}</span>
              </button>
            );
          })}
        </div>
      </div>
      <MatchTypeStrip />
      <div className="p-space-md rounded-xl bg-surface-container-lowest shadow-sm flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-surface-container-high flex items-center justify-center shrink-0 text-secondary">
          <span className="material-symbols-outlined text-[18px]">verified_user</span>
        </div>
        <div className="font-body-sm text-body-sm text-on-surface">
          <span className="font-semibold text-on-surface">Staff note:</span>{" "}
          {owner
            ? "Any missing part can be added here with Add it now."
            : "You can search everything here. Only the owner can change parts."}
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  count,
  stitch,
  icon,
  value,
  options,
  onChange,
  hint,
  mono,
  disabled,
}: {
  label: string;
  count: string;
  stitch?: string;
  icon: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  hint?: string;
  mono?: boolean;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="font-label-md text-label-md text-on-surface font-semibold flex items-center justify-between" aria-label={stitch}>
        <span>{label}</span>
        <span className="font-mono-sm text-mono-sm text-primary">{count}</span>
      </label>
      <div className="relative bg-surface-container-lowest rounded-xl shadow-sm hover:shadow transition-shadow">
        <div className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center pointer-events-none text-primary">
          <span className="material-symbols-outlined text-[20px]">{icon}</span>
        </div>
        <select
          className={"w-full h-12 pl-10 pr-9 bg-surface-container-lowest rounded-xl text-on-surface appearance-none focus:outline-none focus:bg-surface-container-low cursor-pointer " + (mono ? "font-mono-md text-mono-md font-semibold" : "font-body-md text-body-md font-medium")}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="">Choose</option>
          {options.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center pointer-events-none text-secondary">
          <span className="material-symbols-outlined text-[20px]">expand_more</span>
        </div>
      </div>
      {hint ? (
        <div className="flex items-center gap-1 px-1">
          <span className="font-mono-sm text-mono-sm text-secondary">{hint}</span>
        </div>
      ) : null}
    </div>
  );
}
