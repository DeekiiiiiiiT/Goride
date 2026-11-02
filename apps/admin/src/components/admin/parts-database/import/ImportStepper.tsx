// Stitch: dominion-redesign PI2 step rail (single layout for all import steps)
import { MaterialIcon } from "./MaterialIcon";

const STEPS = [
  { n: 1 as const, title: "Area", defaultDetail: "Select domain" },
  { n: 2 as const, title: "Upload", defaultDetail: "Source file" },
  { n: 3 as const, title: "Check", defaultDetail: "Check & Reconcile" },
  { n: 4 as const, title: "Done", defaultDetail: "Done & Ingest" },
];

function railKicker(step: 1 | 2 | 3 | 4, itemN: number, done: boolean, active: boolean) {
  if (active) return "Active Phase";
  if (done) return `Step 0${itemN}`;
  if (itemN === 3) return "Validation";
  if (itemN === 4) return "Commit";
  return `Step 0${itemN}`;
}

function railDetail(
  step: 1 | 2 | 3 | 4,
  itemN: number,
  defaultDetail: string,
  areaName?: string,
  fileName?: string,
) {
  if (itemN === 1 && step > 1 && areaName) return `Area Selected: ${areaName}`;
  if (itemN === 2 && step === 2) return "Upload · SELECT FILE";
  if (itemN === 2 && step > 2 && fileName) return fileName;
  return defaultDetail;
}

export function ImportStepper({
  step,
  areaName,
  fileName,
}: {
  step: 1 | 2 | 3 | 4;
  areaName?: string;
  fileName?: string;
}) {
  return (
    <section className="w-full bg-surface-container-lowest p-space-lg rounded-xl shadow-sm">
      <div className="hidden min-[900px]:flex items-stretch gap-0">
        {STEPS.map((item, idx) => {
          const active = step === item.n;
          const done = step > item.n;
          const detail = railDetail(step, item.n, item.defaultDetail, areaName, fileName);
          const stepTitle =
            item.n === 4 ? "Done & Sync" : item.n === 3 ? "In Review / Check FITMENT MATRIX" : item.title;
          return (
            <div key={item.n} className="flex flex-1 items-center min-w-0">
              <div
                className={`flex flex-1 items-center gap-space-md p-space-sm rounded-lg min-w-0 ${
                  active
                    ? "bg-primary text-on-primary shadow-sm"
                    : done
                      ? "bg-surface-container-low"
                      : "bg-surface-container-lowest"
                }`}
              >
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 font-mono-md text-mono-md font-bold border-2 ${
                    active
                      ? "bg-on-primary text-primary border-on-primary"
                      : done
                        ? "bg-surface-container-highest text-on-surface border-secondary"
                        : "bg-surface-container text-outline border-outline-variant"
                  }`}
                >
                  {done ? <MaterialIcon name="check" className="text-[18px] font-bold" /> : `0${item.n}`.slice(-2)}
                </div>
                <div className="flex flex-col min-w-0">
                  <span
                    className={`font-label-xs text-label-xs uppercase tracking-wider font-semibold truncate ${
                      active ? "text-on-primary/80" : done ? "text-secondary" : "text-outline"
                    }`}
                  >
                    {railKicker(step, item.n, done, active)}
                  </span>
                  <span
                    className={`font-label-md text-label-md font-semibold truncate ${
                      active ? "text-on-primary" : done ? "text-on-surface" : "text-outline"
                    }`}
                  >
                    {stepTitle}
                  </span>
                  <span className={`font-body-sm text-body-sm truncate ${active ? "text-on-primary/90" : "text-on-surface-variant"}`}>
                    {detail}
                  </span>
                </div>
              </div>
              {idx < STEPS.length - 1 ? (
                <div className="w-6 h-0.5 bg-outline-variant shrink-0 mx-1" aria-hidden />
              ) : null}
            </div>
          );
        })}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 min-[900px]:hidden gap-space-md">
        {STEPS.map((item) => {
          const active = step === item.n;
          const done = step > item.n;
          const detail = railDetail(step, item.n, item.defaultDetail, areaName, fileName);
          const stepTitle =
            item.n === 1
              ? item.title
              : item.n === 2
                ? "Upload Source"
                : item.n === 3
                  ? step >= 3
                    ? "In Review / Check FITMENT MATRIX"
                    : "Check"
                  : "Done & Sync";
          const stepLabel =
            item.n === 1 && step > 1
              ? `Step 1 Area & Domain ✓`
              : item.n === 2 && step > 2
                ? `Step 2 Upload Source ✓`
                : item.n === 3 && step > 3
                  ? `Step 3 ✓`
                  : stepTitle;

          return (
            <div
              key={item.n}
              className={`flex items-center gap-space-md p-space-sm rounded-lg min-w-0 ${
                active
                  ? "bg-primary text-on-primary shadow-sm"
                  : done
                    ? "bg-surface-container-low"
                    : "bg-surface-container-lowest"
              }`}
            >
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 font-mono-md text-mono-md font-bold ${
                  active
                    ? "bg-on-primary text-primary"
                    : done
                      ? "bg-surface-container-highest text-on-surface"
                      : "bg-surface-container text-outline"
                }`}
              >
                {done ? <MaterialIcon name="check" className="text-[18px] font-bold" /> : `0${item.n}`.slice(-2)}
              </div>
              <div className="flex flex-col min-w-0">
                <span
                  className={`font-label-xs text-label-xs uppercase tracking-wider font-semibold truncate ${
                    active ? "text-on-primary/80" : done ? "text-secondary" : "text-outline"
                  }`}
                >
                  {railKicker(step, item.n, done, active)}
                </span>
                <span
                  className={`font-label-md text-label-md font-semibold truncate ${
                    active ? "text-on-primary" : done ? "text-on-surface" : "text-outline"
                  }`}
                >
                  {stepLabel}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
