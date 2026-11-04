// AP11 frame 05 — lower provenance / needs checking
import { MaterialIcon } from "../../import/MaterialIcon";

export function RequestCheckingSourcePanel({
  evidenceUrl,
  onChange,
}: {
  evidenceUrl: string;
  onChange: (url: string) => void;
}) {
  return (
    <div className="rounded-xl bg-surface-container-lowest p-space-lg shadow-sm flex flex-col gap-space-md">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="p-1.5 rounded-lg bg-[#fff8e6] text-[#b45309] flex items-center justify-center">
            <MaterialIcon name="policy" className="text-[20px]" />
          </span>
          <span className="font-mono-sm text-mono-sm font-semibold uppercase tracking-wider text-[#b45309]">Needs checking</span>
        </div>
        <span className="px-2 py-0.5 rounded font-mono-sm text-mono-sm font-semibold bg-[#faeed1] text-[#b45309] flex items-center gap-1">
          <MaterialIcon name="schedule" className="text-[13px]" />
          <span>Other source</span>
        </span>
      </div>
      <p className="font-body-sm text-body-sm text-on-surface-variant">
        This part will show as <strong className="text-on-surface">Needs checking</strong> until a catalogue owner confirms it. Add the page where you saw it.
      </p>
      <label className="flex flex-col gap-1.5 font-body-sm">
        <span className="font-label-md text-label-md font-semibold text-on-surface">Source link (required)</span>
        <input
          className="h-10 px-3 rounded-lg bg-surface-container-lowest font-body-sm text-body-sm text-on-surface shadow-sm focus:outline-none focus:ring-1 focus:ring-primary"
          value={evidenceUrl}
          onChange={(e) => onChange(e.target.value)}
          placeholder="https://…"
        />
      </label>
      <div className="flex items-center gap-2 p-2 rounded-lg bg-surface-container font-mono-sm text-mono-sm text-on-surface-variant">
        <MaterialIcon name="verified" className="text-[16px] text-outline" />
        <span>Requires catalog editor check before fleet sync.</span>
      </div>
      <div className="flex flex-col sm:flex-row gap-space-sm pt-1">
        <a
          href="https://partsouq.com"
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 px-3 py-2 rounded-lg bg-primary-container text-on-primary hover:bg-primary transition-colors font-body-sm text-body-sm font-medium flex items-center justify-center gap-1"
        >
          <MaterialIcon name="travel_explore" className="text-[16px]" />
          <span>Lookup EPC</span>
        </a>
      </div>
    </div>
  );
}
