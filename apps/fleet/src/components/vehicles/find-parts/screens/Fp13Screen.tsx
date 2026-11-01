import type { ReactNode } from "react";
import type { Fp13RequestCard, Fp13RequestFilter, Fp13TimelineStep, Fp13ViewModel } from "../findPartsViewModels";

export type Fp13Actions = {
  onBack: () => void;
  onFilter: (filter: Fp13RequestFilter) => void;
  onSeePart: (cardId: string) => void;
  onAddNote: (cardId: string) => void;
  children?: ReactNode;
};

function filterPillClass(active: boolean) {
  return active
    ? "filter-pill bg-primary text-on-primary font-headline-sm text-body-sm px-space-md py-space-xs rounded-full transition-all shadow-sm"
    : "filter-pill bg-surface-container-high text-on-surface-variant hover:text-on-surface font-body-sm text-body-sm px-space-md py-space-xs rounded-full transition-all";
}

function accentBarClass(accent: Fp13RequestCard["accent"]) {
  if (accent === "primary") return "bg-primary";
  if (accent === "error") return "bg-error";
  if (accent === "tint") return "bg-surface-tint";
  return "bg-surface-container-highest";
}

function TimelineRow({ steps }: { steps: Fp13TimelineStep[] }) {
  const activeIdx = steps.findIndex((s) => s.state === "active");
  const doneThrough = activeIdx >= 0 ? activeIdx : steps.filter((s) => s.state === "done").length - 1;
  return (
    <div className="w-full bg-surface-container-low p-space-md rounded-xl">
      <div className="relative flex items-center justify-between">
        <div
          className="absolute left-3 top-3 h-0.5 bg-primary -z-0"
          style={{ width: doneThrough >= 0 ? `${Math.min(100, (doneThrough / 3) * 100)}%` : "0%" }}
        />
        <div className="absolute left-3 right-3 top-3 h-0.5 bg-surface-container-highest -z-0" />
        {steps.map((step, index) => (
          <div
            key={step.key}
            className={`relative z-10 flex flex-col ${index === 0 ? "items-start" : index === steps.length - 1 ? "items-end" : "items-center"}`}
          >
            <div
              className={`w-6 h-6 rounded-full flex items-center justify-center ${
                step.state === "done"
                  ? "bg-primary text-on-primary"
                  : step.state === "active"
                    ? "bg-surface-container-lowest shadow-sm"
                    : "bg-surface-container-highest text-secondary"
              }`}
            >
              {step.state === "done" ? (
                <span className="material-symbols-outlined text-[14px]">check</span>
              ) : step.state === "active" ? (
                <div className="w-3.5 h-3.5 rounded-full bg-primary animate-ping" />
              ) : (
                <span className="w-2 h-2 rounded-full bg-surface-variant" />
              )}
            </div>
            <div className={`font-headline-sm text-caption mt-1.5 ${step.state === "pending" ? "text-secondary" : "text-on-surface"} ${index === 1 || index === 2 ? "text-center" : ""}`}>
              {step.label}
            </div>
            <div className={`font-label-code text-caption ${step.state === "pending" ? "text-outline" : "text-on-surface-variant"}`}>
              {step.timeLabel}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function RequestCard({ card, actions }: { card: Fp13RequestCard; actions: Fp13Actions }) {
  return (
    <div className="request-card w-full bg-surface-container-lowest rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">
      <div className="flex flex-col md:flex-row">
        <div className={`w-full h-1.5 md:w-1.5 md:h-auto shrink-0 ${accentBarClass(card.accent)}`} />
        <div className="p-space-lg flex-1 flex flex-col gap-space-lg">
          <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-space-md">
            <div className="flex flex-col gap-space-xs min-w-0">
              <div className="flex items-center gap-space-sm flex-wrap">
                <span className="font-headline-sm text-headline-sm text-on-surface">{card.title}</span>
                {card.plate !== "—" ? (
                  <span className="font-label-plate text-label-plate bg-surface-container-highest px-space-sm py-0.5 rounded text-on-surface tracking-wider">
                    {card.plate}
                  </span>
                ) : null}
                <span className="font-label-code text-caption text-secondary">{card.shortId}</span>
              </div>
              {card.vehicleLine !== "None yet" ? (
                <div className="font-body-sm text-body-sm text-on-surface-variant">{card.vehicleLine}</div>
              ) : null}
              <div className="font-label-code text-caption text-secondary mt-1">{card.askedLabel}</div>
              {card.checkedDomainsLabel ? (
                <div className="font-label-code text-caption text-on-surface-variant">{card.checkedDomainsLabel}</div>
              ) : null}
            </div>
            <div className="self-start">
              <div className="inline-flex items-center gap-space-xs bg-surface-container px-space-md py-1 rounded-full text-on-surface">
                {card.statusLabel === "Roam is looking" ? (
                  <span className="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>
                ) : (
                  <span className={`w-2 h-2 rounded-full ${card.filterCategory === "added" ? "bg-primary" : card.filterCategory === "failed" ? "bg-error" : "bg-secondary"}`} />
                )}
                <span className="font-headline-sm text-body-sm">{card.statusLabel}</span>
              </div>
            </div>
          </div>

          <TimelineRow steps={card.timeline} />

          {card.footerNote ? (
            <div className="p-space-md rounded-xl bg-surface-container-low flex flex-col sm:flex-row sm:items-center justify-between gap-space-md text-on-surface-variant">
              <div className="flex items-start gap-space-sm">
                <span className="material-symbols-outlined text-secondary text-[18px]">schedule</span>
                <span className="font-body-sm text-body-sm">{card.footerNote}</span>
              </div>
              {card.showSeePart ? (
                <button
                  type="button"
                  className="shrink-0 bg-primary text-on-primary hover:bg-inverse-surface font-headline-sm text-body-sm px-space-lg py-2.5 rounded-lg transition-transform active:scale-95 flex items-center justify-center gap-space-xs"
                  onClick={() => actions.onSeePart(card.id)}
                >
                  <span>See the part</span>
                  <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                </button>
              ) : null}
            </div>
          ) : null}

          {card.filterCategory === "failed" ? (
            <div className="flex flex-col gap-space-sm">
              {card.retryLabel ? <p className="font-body-sm text-body-sm text-on-surface-variant">{card.retryLabel}</p> : null}
              <button type="button" className="font-body-sm text-body-sm text-primary font-medium hover:underline self-start" onClick={() => actions.onAddNote(card.id)}>
                Add a note or photo
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function Fp13Screen({ actions, data }: { actions: Fp13Actions; data: Fp13ViewModel }) {
  return (
    <div className="find-parts-screen-root">
      <div className="fp-screen-root flex flex-col w-full">
        <div className="w-full flex flex-col md:flex-row md:items-center justify-between gap-space-md py-space-sm mb-space-lg">
          <div className="flex items-center gap-space-md flex-wrap">
            <button type="button" className="flex items-center gap-space-xs text-on-surface-variant hover:text-on-surface font-body-sm" onClick={actions.onBack}>
              <span className="material-symbols-outlined text-[16px]">arrow_back</span>
              Back to Find parts
            </button>
            <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight">Your requests</h1>
            <div className="hidden sm:flex items-center gap-space-xs bg-surface-container px-space-sm py-1 rounded-full text-surface-tint">
              <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
              <span className="font-label-code text-caption text-on-surface">{data.autoUpdateLabel}</span>
            </div>
          </div>
          <div className="flex items-center gap-space-xs font-label-code text-caption text-secondary">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>{data.queueAheadLabel}</span>
          </div>
        </div>

        <div className="flex items-center flex-wrap gap-space-xs mb-space-xl" id="filter-group">
          <button type="button" className={filterPillClass(data.filter === "all")} onClick={() => actions.onFilter("all")}>
            All ({data.filterCounts.all})
          </button>
          <button type="button" className={filterPillClass(data.filter === "waiting")} onClick={() => actions.onFilter("waiting")}>
            Waiting ({data.filterCounts.waiting})
          </button>
          <button type="button" className={filterPillClass(data.filter === "added")} onClick={() => actions.onFilter("added")}>
            Added ({data.filterCounts.added})
          </button>
          <button type="button" className={filterPillClass(data.filter === "failed")} onClick={() => actions.onFilter("failed")}>
            Couldn&apos;t find ({data.filterCounts.failed})
          </button>
        </div>

        <div className="w-full bg-surface-container-lowest p-space-md rounded-xl mb-space-xl flex flex-col sm:flex-row sm:items-center justify-between gap-space-sm">
          <div className="flex items-start sm:items-center gap-space-sm">
            <span className="material-symbols-outlined text-surface-tint text-[20px]">manage_search</span>
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              Roam researches each request automatically across verified parts catalogues. Status updates without needing to refresh.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-space-lg w-full" id="requests-stack">
          {data.cards.length ? data.cards.map((card) => (
            <RequestCard key={card.id} card={card} actions={actions} />
          )) : (
            <div className="w-full bg-surface-container-lowest rounded-xl p-space-xl text-center flex flex-col items-center justify-center gap-space-md">
              <div className="w-12 h-12 rounded-full bg-surface-container-high flex items-center justify-center text-secondary">
                <span className="material-symbols-outlined text-[24px]">inbox</span>
              </div>
              <div className="flex flex-col gap-1 max-w-md">
                <div className="font-headline-sm text-headline-sm text-on-surface">{data.emptyTitle}</div>
                <div className="font-body-sm text-body-sm text-on-surface-variant">{data.emptyBody}</div>
              </div>
            </div>
          )}
        </div>

        {data.medianTurnaroundLabel ? (
          <div className="w-full bg-surface-container-low rounded-xl p-space-lg mt-space-xl flex flex-col md:flex-row items-center justify-between gap-space-md">
            <div className="flex items-center gap-space-md">
              <div className="w-10 h-10 rounded-lg bg-surface-container-lowest flex items-center justify-center text-primary shrink-0 shadow-sm">
                <span className="material-symbols-outlined text-[20px]">lightbulb</span>
              </div>
              <div className="flex flex-col">
                <span className="font-headline-sm text-body-sm text-on-surface">Can&apos;t find a component in the standard parts catalog?</span>
                <span className="font-body-sm text-body-sm text-on-surface-variant">Ask Roam from the main Find parts search using the vehicle plate or chassis prefix.</span>
              </div>
            </div>
            <div className="font-label-code text-caption text-secondary shrink-0 uppercase">{data.medianTurnaroundLabel}</div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
