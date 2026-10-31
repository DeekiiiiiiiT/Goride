const STEPS = [
  { n: 1, label: "Car", icon: "check_circle" },
  { n: 2, label: "Version", icon: "" },
  { n: 3, label: "Part", icon: "arrow_forward" },
  { n: 4, label: "Side", icon: "" },
  { n: 5, label: "Results", icon: "checklist" },
] as const;

export function StepBar({
  active,
  versionAnswer,
  sideAnswer,
  carLabel,
  kind = "boxes",
  partLabel,
  onOpen,
  resultsOnFile,
}: {
  active: number;
  versionAnswer?: string;
  sideAnswer?: string;
  carLabel?: string;
  kind?: "boxes" | "pills" | "route" | "axle" | "progress";
  partLabel?: string;
  resultsOnFile?: number | null;
  onOpen?: (step: number) => void;
}) {
  if (kind === "pills") {
    const pills = [
      { n: 1, label: "Car", extra: carLabel || "" },
      { n: 2, label: "Version", extra: active === 2 ? "Required" : (versionAnswer || "") },
      { n: 3, label: "Part", extra: "" },
      { n: 4, label: "Side (conditional)", extra: sideAnswer || "" },
      { n: 5, label: "Results", extra: "" },
    ];
    return (
      <div className="w-full bg-surface-container-lowest shadow-sm mb-space-xl">
        <div className="flex flex-wrap items-center justify-between gap-space-md py-space-md">
          <div className="flex flex-wrap items-center gap-space-xs">
            {pills.map((step, index) => {
              const on = step.n === active;
              const done = step.n < active;
              return (
                <div key={step.n} className="flex items-center gap-space-xs">
                  <button
                    type="button"
                    className={on
                      ? "flex items-center gap-1.5 px-space-md py-1.5 rounded bg-primary-container text-on-primary shadow-sm"
                      : done
                        ? "flex items-center gap-1.5 px-space-md py-1.5 rounded bg-surface-container text-on-surface"
                        : "flex items-center gap-1.5 px-space-md py-1.5 rounded bg-surface-container-low text-secondary"}
                    onClick={() => onOpen?.(step.n)}
                  >
                    <span className={on
                      ? "w-4 h-4 rounded-full bg-surface-container-lowest text-primary font-mono-sm text-[10px] flex items-center justify-center font-bold"
                      : done
                        ? "w-4 h-4 rounded-full bg-primary text-on-primary font-mono-sm text-[10px] flex items-center justify-center font-bold"
                        : "w-4 h-4 rounded-full bg-surface-container text-secondary font-mono-sm text-[10px] flex items-center justify-center"}>
                      {done ? "✓" : step.n}
                    </span>
                    <span className="font-label-md text-label-md font-medium">{step.n} {step.label}</span>
                    {step.extra ? <span className={"font-mono-sm text-mono-sm " + (on ? "px-1 rounded bg-primary/40" : "")}>{step.extra}</span> : null}
                  </button>
                  {index < pills.length - 1 ? <span className="material-symbols-outlined text-outline text-[16px]">chevron_right</span> : null}
                </div>
              );
            })}
          </div>
          {carLabel ? (
            <div className="flex items-center gap-space-xs">
              <span className="font-label-xs text-label-xs uppercase tracking-wider text-secondary">Active anchor</span>
              <button type="button" className="flex items-center gap-1.5 px-space-md py-1 rounded bg-surface-container text-on-surface font-body-sm text-body-sm font-medium" onClick={() => onOpen?.(1)}>
                <span className="material-symbols-outlined text-primary text-[16px]">directions_car</span>
                <span>{carLabel}</span>
                <span className="material-symbols-outlined text-secondary text-[14px]">edit</span>
              </button>
            </div>
          ) : null}
        </div>
      </div>
    );
  }
  if (kind === "route") {
    const pills = [
      { n: 1, label: "Car", done: true, extra: "" },
      { n: 2, label: "Version", done: true, extra: versionAnswer || "" },
      { n: 3, label: "Part", done: false, extra: "" },
      { n: 4, label: "Side (conditional)", done: false, extra: "" },
      { n: 5, label: "Results", done: false, extra: "" },
    ];
    return (
      <section className="bg-surface-container-low py-space-md mb-space-xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-space-md">
          <div className="flex items-center gap-space-xs flex-wrap">
            {pills.map((step, index) => (
              <div key={step.n} className="flex items-center gap-space-xs">
                <button
                  type="button"
                  className={step.n === active
                    ? "flex items-center gap-1.5 px-space-md py-1.5 rounded-xl bg-primary-container text-on-primary font-label-md text-label-md shadow-sm"
                    : step.done
                      ? "flex items-center gap-1 px-space-md py-1.5 rounded-xl bg-surface-container-lowest text-on-surface font-label-md text-label-md"
                      : "flex items-center gap-1.5 px-space-md py-1.5 rounded-xl bg-surface text-secondary font-label-md text-label-md"}
                  onClick={() => onOpen?.(step.n)}
                >
                  <span className={step.n === active
                    ? "w-4 h-4 rounded-full bg-on-primary text-primary font-mono-sm text-[10px] flex items-center justify-center font-bold"
                    : "w-4 h-4 rounded-full bg-surface-container flex items-center justify-center font-mono-sm text-[10px] font-bold text-primary"}>
                    {step.n}
                  </span>
                  <span className={step.n === active ? "font-semibold" : ""}>{step.label}</span>
                  {step.done ? <span className="material-symbols-outlined text-[14px] text-primary">check</span> : null}
                  {step.extra ? <span className="font-mono-sm text-mono-sm text-secondary bg-surface-container px-1 rounded">{step.extra}</span> : null}
                </button>
                {index < pills.length - 1 ? <span className="text-outline font-mono-sm text-mono-sm">›</span> : null}
              </div>
            ))}
          </div>
          {carLabel ? (
            <div className="flex items-center gap-space-xs font-mono-sm text-mono-sm flex-wrap">
              <span className="text-secondary">Vehicle lock:</span>
              <button type="button" className="inline-flex items-center gap-1 px-space-sm py-1 rounded-xl bg-surface-container-lowest text-on-surface" onClick={() => onOpen?.(1)}>
                <span className="font-semibold text-primary">{carLabel}</span>
                <span className="material-symbols-outlined text-[13px]">edit</span>
              </button>
              {versionAnswer ? (
                <>
                  <span>›</span>
                  <button type="button" className="inline-flex items-center gap-1 px-space-sm py-1 rounded-xl bg-surface-container-lowest text-on-surface" onClick={() => onOpen?.(2)}>
                    <span className="font-semibold text-secondary">{versionAnswer}</span>
                    <span className="material-symbols-outlined text-[13px]">edit</span>
                  </button>
                </>
              ) : null}
            </div>
          ) : null}
        </div>
      </section>
    );
  }
  if (kind === "axle") {
    const pills = [
      { n: 1, label: "1 Car", mark: "✓" },
      { n: 2, label: "2 Version", mark: "✓" },
      { n: 3, label: "3 Part", mark: "✓", note: partLabel },
      { n: 4, label: "4 Side", mark: "4" },
      { n: 5, label: "5 Results", mark: "5" },
    ];
    return (
      <div className="mb-space-xl flex flex-col gap-space-sm">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-space-xs bg-surface-container-low p-1.5 rounded-xl">
          {pills.map((step) => (
            <button
              key={step.n}
              type="button"
              className={step.n === active
                ? "flex items-center gap-2 px-space-md py-2 rounded-lg bg-primary-container text-on-primary shadow-sm text-left"
                : step.n < active
                  ? "flex items-center gap-2 px-space-md py-2 rounded-lg bg-surface-container-lowest text-on-surface text-left"
                  : "flex items-center gap-2 px-space-md py-2 rounded-lg text-secondary text-left"}
              onClick={() => onOpen?.(step.n)}
            >
              <span className={step.n === active
                ? "w-5 h-5 rounded-full bg-on-primary text-primary font-mono-sm text-[10px] flex items-center justify-center font-bold"
                : "w-5 h-5 rounded-full bg-surface-container text-primary font-mono-sm text-[10px] flex items-center justify-center font-bold"}>
                {step.n < active ? "✓" : step.n}
              </span>
              <span className="font-label-md text-label-md">
                {step.label}
                {step.note ? <span className="block font-mono-sm text-mono-sm text-primary leading-none">{step.note}</span> : null}
              </span>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-space-sm bg-surface-container-lowest px-space-lg py-2.5 rounded-xl shadow-sm">
          <span className="font-label-xs text-label-xs uppercase tracking-wider text-secondary">Locked selection trail:</span>
          <button type="button" className="px-space-sm py-1 rounded bg-surface-container text-on-surface font-body-sm text-body-sm" onClick={() => onOpen?.(1)}>{carLabel || "Car"}</button>
          {versionAnswer ? <button type="button" className="px-space-sm py-1 rounded bg-surface-container text-on-surface font-body-sm text-body-sm" onClick={() => onOpen?.(2)}>{versionAnswer}</button> : null}
          {partLabel ? <button type="button" className="px-space-sm py-1 rounded bg-surface-container text-on-surface font-body-sm text-body-sm" onClick={() => onOpen?.(3)}>{partLabel}</button> : null}
          <span className="ml-auto font-mono-sm text-mono-sm text-secondary">Axle disambiguation required</span>
        </div>
      </div>
    );
  }
  if (kind === "progress") {
    const steps = [
      { n: 1, tag: "1 Car", label: carLabel || "Car" },
      { n: 2, tag: "2 Version", label: versionAnswer || "Version" },
      { n: 3, tag: "3 Part", label: partLabel || "Part" },
      { n: 4, tag: "4 Side", label: sideAnswer || "Side" },
      { n: 5, tag: "5 Results", label: resultsOnFile === 0 ? "0 results on file" : "Results" },
    ];
    return (
      <div className="bg-surface-container-lowest rounded-xl p-space-md shadow-sm mb-space-xl">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-space-sm">
          {steps.map((step) => {
            const done = step.n < active;
            const on = step.n === active;
            const zeroResults = step.n === 5 && resultsOnFile === 0 && on;
            return (
              <button
                key={step.n}
                type="button"
                className={"flex items-center gap-space-sm p-space-sm rounded-lg text-left " + (zeroResults ? "bg-surface-container-high/60" : on ? "bg-primary-container text-on-primary shadow-sm" : done ? "bg-surface-container-low/70" : "bg-surface-container-low/40 opacity-70")}
                onClick={() => onOpen?.(step.n)}
              >
                <span className={"w-6 h-6 rounded-full flex items-center justify-center font-mono-sm text-mono-sm shrink-0 " + (zeroResults ? "bg-secondary text-surface-container-lowest font-semibold" : done ? "bg-primary-container text-on-primary" : on ? "bg-on-primary text-primary-container font-bold" : "bg-surface-container text-secondary")}>
                  {done ? <span className="material-symbols-outlined text-[14px]">check</span> : zeroResults ? "0" : step.n}
                </span>
                <span className="flex flex-col min-w-0">
                  <span className={"font-label-xs text-label-xs uppercase truncate " + (zeroResults ? "text-secondary font-semibold" : on ? "text-on-primary-container" : "text-outline")}>{step.tag}</span>
                  <span className={"font-body-sm text-body-sm font-medium truncate " + (on && !zeroResults ? "text-on-primary" : "text-on-surface")}>{step.label}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }
  return (
    <div className="w-full bg-surface-container-low rounded-xl p-space-sm mb-space-xl shadow-sm">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-space-sm">
        {STEPS.map((step) => {
          const on = step.n === active;
          const answer = step.n === 2 ? versionAnswer : step.n === 4 ? sideAnswer : "";
          return (
            <div
              key={step.n}
              className={on
                ? "flex items-center justify-between px-space-md py-2.5 rounded-lg bg-primary-container text-on-primary shadow-sm"
                : "flex items-center justify-between px-space-md py-2.5 rounded-lg bg-surface-container-lowest text-secondary shadow-sm" + (step.n === 5 ? " col-span-2 md:col-span-1" : "")}
            >
              <div className="flex items-center gap-2">
                <span className={on
                  ? "font-mono-sm text-mono-sm w-5 h-5 rounded-md bg-on-primary/20 flex items-center justify-center font-bold"
                  : "font-mono-sm text-mono-sm w-5 h-5 rounded-md bg-surface-container flex items-center justify-center font-medium text-secondary"}>
                  {step.n}
                </span>
                <span className={on
                  ? "font-label-md text-label-md font-bold"
                  : "font-label-md text-label-md font-medium text-on-surface"}>
                  {answer || step.label}
                </span>
              </div>
              {answer ? (
                <span className="material-symbols-outlined text-[16px]" style={{ fontVariationSettings: '"FILL" 1' }}>check_circle</span>
              ) : step.n === 2 || step.n === 4 ? (
                <span className="font-mono-sm text-mono-sm px-1.5 py-0.5 rounded bg-surface-container-high text-secondary shrink-0">conditional</span>
              ) : (
                <span className={"material-symbols-outlined text-[16px] " + (on ? "text-on-primary" : "text-outline-variant")}>{step.icon}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
