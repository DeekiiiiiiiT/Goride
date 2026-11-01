import type { Fp13Actions, Fp13ViewModel } from "./Fp13Screen";
import type { Fp13RequestCard, Fp13RequestFilter, Fp13TimelineStep } from "../findPartsViewModels";
import { FpNowOnFileNotice } from "./FpNowOnFileNotice";

function MobileTimeline({ steps }: { steps: Fp13TimelineStep[] }) {
  return (
    <div className="bg-surface-container-low/70 rounded-lg p-2.5">
      <div className="grid grid-cols-4 gap-1 relative">
        <div className="absolute top-[9px] left-[12%] right-[12%] h-[2px] bg-emerald-200 z-0" />
        {steps.map((step) => (
          <div key={step.key} className="flex flex-col items-center relative z-10 text-center">
            <div
              className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] ${
                step.state === "done" ? "bg-emerald-600 text-white" : step.state === "active" ? "bg-primary" : "bg-surface-container-highest"
              }`}
            >
              {step.state === "done" ? (
                <span className="material-symbols-outlined text-[11px]">check</span>
              ) : step.state === "active" ? (
                <span className="w-2 h-2 rounded-full bg-white animate-ping" />
              ) : null}
            </div>
            <span className="font-caption text-caption text-on-surface mt-1 font-medium leading-tight">{step.label}</span>
            <span className="font-label-code text-caption text-secondary mt-0.5">{step.timeLabel}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function MobileCard({ card, actions }: { card: Fp13RequestCard; actions: Fp13Actions }) {
  return (
    <div className="bg-surface-container-lowest rounded-xl p-3.5 shadow-sm space-y-3 relative overflow-hidden">
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-body-lg text-body-lg font-semibold text-on-surface">{card.title}</h3>
            {card.vehicleLine !== "None yet" ? (
              <span className="text-secondary font-body-sm text-body-sm">· {card.vehicleLine}</span>
            ) : null}
          </div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-surface-container text-on-surface">
            <span className={`w-1.5 h-1.5 rounded-full ${card.filterCategory === "added" ? "bg-emerald-600" : card.filterCategory === "failed" ? "bg-error" : "bg-amber-500"}`} />
            <span className="font-caption text-caption font-semibold">{card.statusLabel}</span>
          </div>
        </div>
        {card.plate !== "—" ? (
          <span className="bg-surface-container px-2 py-0.5 rounded font-label-plate text-caption text-on-surface uppercase tracking-wider font-bold">{card.plate}</span>
        ) : null}
      </div>
      <p className="font-label-code text-caption text-secondary">{card.shortId}</p>
      {card.checkedDomainsLabel ? (
        <p className="font-label-code text-caption text-on-surface-variant">{card.checkedDomainsLabel}</p>
      ) : null}
      <MobileTimeline steps={card.timeline} />
      {card.footerNote ? (
        <p className="font-body-sm text-body-sm text-on-surface-variant">{card.footerNote}</p>
      ) : null}
      {card.showSeePart ? (
        <button type="button" className="w-full h-10 rounded-lg bg-primary text-on-primary font-body-sm font-semibold" onClick={() => actions.onSeePart(card.id)}>
          See the part
        </button>
      ) : null}
    </div>
  );
}

/** FP16 — phone requests list + optional catalog notice (no bottom tab bar). */
export function Fp16Screen({
  actions,
  data,
  catalogNotice,
  onDismissNotice,
}: {
  actions: Fp13Actions;
  data: Fp13ViewModel;
  catalogNotice?: string;
  onDismissNotice?: () => void;
}) {
  const filters: Array<{ key: Fp13RequestFilter; label: string }> = [
    { key: "all", label: "All" },
    { key: "waiting", label: "Waiting" },
    { key: "added", label: "Added" },
    { key: "failed", label: "Couldn't find" },
  ];

  return (
    <div className="find-parts-screen-root max-w-[390px] mx-auto w-full pb-6">
      <div className="h-14 px-4 bg-surface-container-lowest flex items-center justify-between sticky top-0 z-20 shadow-sm">
        <div className="flex items-center gap-3">
          <button type="button" aria-label="Go back" className="w-10 h-10 -ml-2 rounded-full flex items-center justify-center text-on-surface hover:bg-surface-container" onClick={actions.onBack}>
            <span className="material-symbols-outlined text-[20px]">arrow_back</span>
          </button>
          <h2 className="font-headline-sm text-headline-sm text-on-surface tracking-tight">Your requests</h2>
        </div>
        <span className="bg-surface-container px-2.5 py-1 rounded-full font-label-code text-caption font-semibold text-on-surface">
          All ({data.filterCounts.all})
        </span>
      </div>

      <div className="bg-surface-container-low px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-600" />
          </span>
          <span className="font-caption text-caption text-secondary">{data.autoUpdateLabel}</span>
        </div>
        <span className="font-label-code text-caption text-secondary">{data.queueAheadLabel}</span>
      </div>

      <div className="px-4 py-2 flex flex-wrap gap-2 border-b border-surface-container-high">
        {filters.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            className={`px-3 py-1 rounded-full font-body-sm text-body-sm ${
              data.filter === key ? "bg-primary text-on-primary" : "bg-surface-container-high text-on-surface-variant"
            }`}
            onClick={() => actions.onFilter(key)}
          >
            {label} ({data.filterCounts[key]})
          </button>
        ))}
      </div>

      <div className="px-4 py-2 flex flex-col gap-1 bg-surface-container-low/50">
        <p className="font-caption text-caption text-on-surface-variant">Have an OEM code or photo?</p>
        <button type="button" className="self-start font-body-sm text-body-sm text-primary font-medium" onClick={() => actions.onAddNote("")}>
          Add note or photo
        </button>
      </div>

      {catalogNotice ? (
        <div className="px-3 pt-3">
          <FpNowOnFileNotice message={catalogNotice} onDismiss={onDismissNotice} />
        </div>
      ) : null}

      <div className="p-3.5 space-y-3.5 flex flex-col">
        {data.cards.length ? data.cards.map((card) => (
          <MobileCard key={card.id} card={card} actions={actions} />
        )) : (
          <div className="rounded-xl bg-surface-container-low p-space-lg text-center font-body-sm text-body-sm text-on-surface-variant">
            {data.emptyBody}
          </div>
        )}
      </div>
    </div>
  );
}
