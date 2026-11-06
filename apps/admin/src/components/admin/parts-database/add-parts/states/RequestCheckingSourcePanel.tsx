// AP11 frames 04–05 — lower provenance / needs checking
import { MaterialIcon } from "../../import/MaterialIcon";

export function RequestCheckingSourcePanel({
  evidenceUrl,
  onChange,
  galleryMode,
}: {
  evidenceUrl: string;
  onChange: (url: string) => void;
  galleryMode?: "missing" | "needsChecking";
}) {
  const missing = galleryMode === "missing" || (!galleryMode && !evidenceUrl.trim());
  const showError = missing && galleryMode === "missing";

  if (galleryMode === "missing") {
    return (
      <div className="rounded-xl bg-surface-container-lowest p-space-lg shadow-sm flex flex-col gap-space-md h-full">
        <div className="flex items-center gap-2">
          <span className="p-1.5 rounded-lg bg-error-container text-on-error-container flex items-center justify-center">
            <MaterialIcon name="link_off" className="text-[20px]" />
          </span>
          <span className="font-mono-sm font-semibold uppercase tracking-wider text-error">Missing source</span>
        </div>
        <h2 className="font-headline-md text-on-surface">Source link required</h2>
        <label className="flex flex-col gap-1.5 font-body-sm">
          <span className="font-label-md font-semibold text-on-surface">Source page link</span>
          <div className="relative flex items-center">
            <input
              className="w-full h-10 px-3 pr-10 rounded-lg bg-surface-container-lowest font-body-sm shadow-sm focus:outline-none ring-2 ring-error"
              value={evidenceUrl}
              onChange={(e) => onChange(e.target.value)}
              placeholder="https://catalog.maker.co.jp/oem/..."
            />
            <MaterialIcon name="error" className="absolute right-3 text-error text-[18px]" />
          </div>
          <p className="font-mono-sm text-error flex items-center gap-1 pt-0.5">
            <MaterialIcon name="priority_high" className="text-[14px]" />
            Source URL cannot be empty before proceeding to Step 2.
          </p>
        </label>
        <div className="p-2.5 rounded-lg bg-surface-container-low font-body-sm text-on-surface-variant mt-auto">
          <span className="font-medium text-on-surface">Rule AP-REF:</span> Add the page where you saw this part, so other catalog engineers can cross-audit.
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-surface-container-lowest p-space-lg shadow-sm flex flex-col gap-space-md h-full">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="p-1.5 rounded-lg bg-[#fff8e6] text-[#b45309] flex items-center justify-center">
            <MaterialIcon name="policy" className="text-[20px]" />
          </span>
          <span className="font-mono-sm font-semibold uppercase tracking-wider text-[#b45309]">Needs checking</span>
        </div>
        <span className="px-2 py-0.5 rounded font-mono-sm font-semibold bg-[#faeed1] text-[#b45309] flex items-center gap-1">
          <MaterialIcon name="schedule" className="text-[13px]" />
          <span>Other source</span>
        </span>
      </div>
      <div>
        <h2 className="font-headline-md text-on-surface">{galleryMode === "needsChecking" ? "Indirect reference detected" : "Lower proof source"}</h2>
        {galleryMode === "needsChecking" ? (
          <div className="p-3 rounded-lg bg-surface-container-low font-body-sm text-on-surface mt-2">
            <strong className="font-semibold">Akebono AN-754WK</strong> is a front brake pad set. It fits 4 cars.
          </div>
        ) : (
          <p className="font-body-sm text-on-surface-variant mt-1">
            This part will show as <strong className="text-on-surface">Needs checking</strong> until a catalogue owner confirms it. Add the page where you saw it.
          </p>
        )}
      </div>
      {!galleryMode ? (
        <label className="flex flex-col gap-1.5 font-body-sm">
          <span className="font-label-md font-semibold text-on-surface">Source link (required)</span>
          <input
            className={`h-10 px-3 rounded-lg bg-surface-container-lowest font-body-sm shadow-sm focus:outline-none ${showError ? "ring-2 ring-error" : "focus:ring-1 focus:ring-primary"}`}
            value={evidenceUrl}
            onChange={(e) => onChange(e.target.value)}
            placeholder="https://…"
          />
        </label>
      ) : null}
      <div className="flex items-center gap-2 p-2 rounded-lg bg-surface-container font-mono-sm text-on-surface-variant">
        <MaterialIcon name="verified" className="text-[16px] text-outline" />
        <span>Requires catalog editor check before fleet sync.</span>
      </div>
      <div className="flex flex-col sm:flex-row gap-space-sm pt-1 mt-auto">
        <button type="button" className="flex-1 px-3 py-2 rounded-lg bg-surface-container text-[#b45309] hover:bg-[#fff8e6] font-body-sm font-medium flex items-center justify-center gap-1">
          <MaterialIcon name="schedule_send" className="text-[16px]" />
          Submit for checking
        </button>
        <button type="button" className="px-3 py-2 rounded-lg bg-primary-container text-on-primary font-body-sm font-medium flex items-center justify-center gap-1">
          <MaterialIcon name="add_link" className="text-[16px]" />
          Add verified URL
        </button>
      </div>
    </div>
  );
}
