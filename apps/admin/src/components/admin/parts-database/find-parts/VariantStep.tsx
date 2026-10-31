// Stitch: dominion-redesign/S42b
import type { FindPartsCandidate } from "../partsDatabaseApi";
import { MatchTypeStrip } from "./MatchTypeStrip";

const ICONS = ["electric_bolt", "speed", "eco", "settings"];

export function VariantStep({
  carLabel,
  candidates,
  pickedId,
  onPick,
  onNotSure,
  onBack,
  onContinue,
}: {
  carLabel: string;
  candidates: FindPartsCandidate[];
  pickedId: string;
  onPick: (id: string) => void;
  onNotSure: () => void;
  onBack: () => void;
  onContinue: () => void;
}) {
  const codes = candidates.flatMap((row) => (row.codeLine || "").split("·").map((part) => part.trim()).filter(Boolean));
  const sample = codes[0] || "the model code";
  return (
    <div className="w-full flex flex-col gap-space-xl">
      <div className="w-full bg-surface-container-lowest rounded-xl shadow-sm p-space-xl flex flex-col gap-space-lg">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-space-md">
          <div>
            <div className="flex items-center gap-space-xs flex-wrap">
              <span className="px-1.5 py-0.5 rounded bg-surface-container font-mono-sm text-mono-sm text-primary font-semibold tracking-wide">Stage 2 // Disambiguation</span>
              <span className="font-mono-sm text-mono-sm text-secondary">JDM / Caribbean market matrix</span>
            </div>
            <h2 className="font-headline-lg text-headline-lg text-on-surface font-semibold tracking-tight mt-1">Which {carLabel} is it?</h2>
            <p className="font-body-md text-body-md text-secondary mt-0.5">These versions take different parts. Pick the one on your papers, or choose Not sure.</p>
          </div>
          <div className="flex items-center gap-space-xs self-start">
            <span className="material-symbols-outlined text-secondary text-[18px]">verified</span>
            <span className="font-label-xs text-label-xs text-secondary font-medium">OEM cross-reference engine active</span>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-space-md">
          {candidates.map((row, index) => {
            const on = row.id === pickedId;
            const bits = (row.codeLine || "").split("·").map((part) => part.trim()).filter(Boolean);
            return (
              <button
                key={row.id}
                type="button"
                className={"text-left relative rounded-xl p-space-lg flex flex-col justify-between transition-all " + (on ? "bg-[#dbe1ff]/40 ring-2 ring-primary-container" : "bg-surface-container-lowest hover:bg-surface-container-low ring-1 ring-outline-variant/60")}
                onClick={() => onPick(row.id)}
              >
                <div className="flex items-start justify-between mb-space-md">
                  <div className={"w-10 h-10 rounded flex items-center justify-center " + (on ? "bg-surface-container text-primary" : "bg-surface-container text-secondary")}>
                    <span className="material-symbols-outlined text-[22px]">{ICONS[index % ICONS.length]}</span>
                  </div>
                  <div className={"w-5 h-5 rounded-full flex items-center justify-center " + (on ? "bg-primary-container text-on-primary" : "bg-surface-container text-transparent")}>
                    <span className="material-symbols-outlined text-[14px]">check</span>
                  </div>
                </div>
                <div className="flex flex-col">
                  <span className={"font-label-xs text-label-xs uppercase tracking-wider font-semibold " + (on ? "text-primary" : "text-secondary")}>Chassis matrix {String.fromCharCode(65 + index)}</span>
                  <span className="font-headline-lg text-headline-lg font-bold text-on-surface mt-0.5">{row.plainLabel || "Version"}</span>
                  {bits.length > 0 ? (
                    <div className="mt-1 flex flex-wrap items-center gap-1 font-mono-md text-mono-md text-on-surface-variant font-medium">
                      {bits.map((bit, bitIndex) => (
                        <span key={`${row.id}-${bit}`}>
                          {bitIndex > 0 ? <span className="px-1">·</span> : null}
                          <span className={bitIndex === 0 ? "px-1.5 py-0.5 rounded bg-surface-container-lowest font-semibold text-primary" : ""}>{bit}</span>
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              </button>
            );
          })}
          <button
            type="button"
            className={"text-left relative rounded-xl p-space-lg flex flex-col justify-between ring-1 " + (pickedId === "any" ? "bg-[#dbe1ff]/40 ring-2 ring-primary-container" : "bg-surface-container/30 ring-outline-variant/40")}
            onClick={onNotSure}
          >
            <div className="flex items-start justify-between mb-space-md">
              <div className="w-10 h-10 rounded bg-surface-container flex items-center justify-center text-secondary">
                <span className="material-symbols-outlined text-[22px]">help_outline</span>
              </div>
              <div className={"w-5 h-5 rounded-full flex items-center justify-center " + (pickedId === "any" ? "bg-primary-container text-on-primary" : "bg-surface-container text-transparent")}>
                <span className="material-symbols-outlined text-[14px]">check</span>
              </div>
            </div>
            <div className="flex flex-col">
              <span className="font-label-xs text-label-xs uppercase tracking-wider text-secondary font-semibold">Broad match mode</span>
              <span className="font-headline-lg text-headline-lg font-bold text-on-surface mt-0.5">Not sure</span>
              <span className="font-body-sm text-body-sm text-secondary mt-1">We'll show what fits each one</span>
            </div>
            <div className="mt-space-lg pt-space-md">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-surface-container text-secondary font-mono-sm text-mono-sm font-semibold">
                <span className="material-symbols-outlined text-[13px]">call_split</span>
                Merged view with version badges
              </span>
            </div>
          </button>
        </div>
        <div className="w-full bg-surface-container-low rounded-xl p-space-lg flex flex-col lg:flex-row lg:items-center justify-between gap-space-lg">
          <div className="flex items-start gap-space-md">
            <div className="w-9 h-9 rounded bg-surface-container flex items-center justify-center text-primary shrink-0">
              <span className="material-symbols-outlined text-[20px]">badge</span>
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-label-md text-label-md font-bold text-on-surface uppercase tracking-wide">Where do I find this?</h3>
                <span className="font-mono-sm text-mono-sm px-1.5 rounded bg-surface-container text-on-surface-variant">VIN / model identification</span>
              </div>
              <p className="font-body-sm text-body-sm text-secondary mt-0.5">It's the model code on your vehicle registration certificate or the manufacturer identification plate on the lower driver-side door frame.</p>
            </div>
          </div>
          <div className="flex items-center gap-space-sm shrink-0">
            <div className="px-space-md py-1.5 rounded bg-surface-container-lowest flex items-center gap-2">
              <span className="material-symbols-outlined text-secondary text-[16px]">description</span>
              <div className="flex flex-col text-left">
                <span className="font-label-xs text-label-xs text-secondary font-semibold">Japanese export cert</span>
                <span className="font-mono-sm text-mono-sm text-on-surface font-semibold">型式: {sample}</span>
              </div>
            </div>
            <div className="px-space-md py-1.5 rounded bg-surface-container-lowest flex items-center gap-2">
              <span className="material-symbols-outlined text-secondary text-[16px]">directions_car</span>
              <div className="flex flex-col text-left">
                <span className="font-label-xs text-label-xs text-secondary font-semibold">Jamaican tax title</span>
                <span className="font-mono-sm text-mono-sm text-on-surface font-semibold">Chassis: {sample}</span>
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-between pt-space-sm gap-space-md">
          <button type="button" className="h-9 px-space-lg rounded bg-surface-container-lowest hover:bg-surface-container text-on-surface font-label-md text-label-md font-semibold flex items-center gap-1.5 shadow-sm" onClick={onBack}>
            <span className="material-symbols-outlined text-[18px]">arrow_back</span>
            Back to car selection
          </button>
          <div className="flex items-center gap-space-md">
            <div className="text-right hidden sm:block">
              <div className="font-label-xs text-label-xs text-secondary">Step 2 of 5</div>
              <div className="font-mono-sm text-mono-sm text-on-surface">{pickedId ? "Selected" : "Pick a version"}</div>
            </div>
            <button type="button" className="inline-flex items-center gap-2 px-6 h-12 rounded-xl bg-primary-container text-on-primary font-headline-md text-headline-md font-semibold disabled:opacity-40" disabled={!pickedId} onClick={onContinue}>
              Continue to part selection
              <span className="material-symbols-outlined text-[20px]">arrow_forward</span>
            </button>
          </div>
        </div>
      </div>
      <MatchTypeStrip />
    </div>
  );
}
