import { useEffect, useRef } from 'react';
import { onPlugClick } from '../../shell/actions';
import { bindScreen } from '../../shell/bind';


export function SavedScreen() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (ref.current) bindScreen("27-saved.html", ref.current); }, []);
  return (
    <div ref={ref} data-plug-screen={"27-saved.html"} className={"bg-surface font-body-md text-on-surface flex flex-col min-h-screen pt-safe pb-safe"}>
      <main className={"flex-1 flex flex-col relative w-full bg-surface"}>
        <div className={"flex flex-col w-full px-margin pb-space-xl"}>
          <div className={"flex flex-col items-center text-center pt-space-md pb-space-sm"}>
            <div className={"inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface-container-high shadow-sm mb-space-md"}>
              <span className={"material-symbols-outlined text-[16px] text-tertiary"} style={{ fontVariationSettings: "'FILL' 1" }}>
                check_circle
              </span>
              <span className={"font-label-md text-label-md text-on-surface"}>
                Saved • Logged to your garage
              </span>
            </div>
            <div className={"relative flex items-center justify-center my-space-xs"}>
              <div className={"absolute -top-3 -left-4 w-3 h-3 rounded-full bg-secondary-container opacity-80 animate-ping"} />
              <div className={"absolute -bottom-2 -right-3 w-2.5 h-2.5 rounded-full bg-tertiary-fixed-dim"} />
              <div className={"absolute top-1 -right-5 w-2 h-4 rounded-full bg-primary rotate-45 opacity-70"} />
              <div className={"absolute bottom-3 -left-5 w-3.5 h-1.5 rounded-full bg-tertiary -rotate-12"} />
              <div className={"relative w-20 h-20 rounded-full bg-gradient-to-tr from-primary via-secondary-container to-tertiary-fixed-dim flex items-center justify-center shadow-lg"}>
                <div className={"w-16 h-16 rounded-full bg-surface-container-lowest flex items-center justify-center shadow-inner"}>
                  <span className={"material-symbols-outlined text-primary text-[36px]"} style={{ fontVariationSettings: "'FILL' 1, 'wght' 700" }}>
                    task_alt
                  </span>
                </div>
              </div>
            </div>
            <h1 className={"font-headline-lg text-headline-lg text-on-surface mt-space-sm"}>
              Fuel Logged!
            </h1>
            <p className={"font-body-md text-body-md text-on-surface-variant mt-0.5"} data-slot={"saved-subtitle"}>
              Odometer saved
            </p>
          </div>
          <div className={"grid grid-cols-2 gap-gutter-sm mt-space-md"}>
            <div className={"col-span-2 rounded-xl bg-surface-container-lowest p-space-md shadow-sm"}>
              <div className={"flex items-start justify-between"}>
                <div className={"flex items-center gap-2.5"}>
                  <div className={"w-10 h-10 rounded-xl bg-primary-fixed flex items-center justify-center text-primary font-headline-sm"}>
                    <span className={"material-symbols-outlined text-[20px]"} style={{ fontVariationSettings: "'FILL' 1" }}>
                      local_gas_station
                    </span>
                  </div>
                  <div>
                    <div className={"font-headline-sm text-headline-sm text-on-surface"} data-slot={"receipt-amount"}>
                      —
                    </div>
                    <div className={"font-body-sm text-body-sm text-on-surface-variant"} data-slot={"receipt-station"}>
                      —
                    </div>
                  </div>
                </div>
                <span className={"px-2.5 py-1 rounded bg-surface-container-high text-on-surface font-label-sm text-label-sm"} data-slot={"receipt-grade-badge"}>
                  —
                </span>
              </div>
              <div className={"mt-space-sm pt-space-xs flex items-center justify-between text-on-surface-variant"}>
                <div className={"flex items-center gap-1.5"}>
                  <span className={"material-symbols-outlined text-[16px]"}>
                    water_drop
                  </span>
                  <span className={"font-label-md text-label-md"} data-slot={"receipt-litres"}>
                    —
                  </span>
                </div>
                <span className={"font-body-sm text-body-sm text-outline-variant"}>
                  •
                </span>
                <div className={"flex items-center gap-1.5"}>
                  <span className={"material-symbols-outlined text-[16px]"}>
                    receipt_long
                  </span>
                  <span className={"font-label-md text-label-md"} data-slot={"receipt-rate"}>
                    —
                  </span>
                </div>
              </div>
              <p className={"hidden font-body-sm text-body-sm text-on-surface-variant mt-1"} data-slot={"fill-time"} data-slot-row={"fill-time"} style={{ display: "none" }} />
              <p className={"hidden"} data-slot={"price-status"} data-slot-row={"price-status"} />
              <p className={"hidden"} data-slot={"receipt-grade"} />
            </div>
          </div>
          <div className={"mt-space-lg"}>
            <div className={"flex items-center justify-between mb-space-sm"}>
              <div>
                <h2 className={"font-headline-sm text-headline-sm text-on-surface"}>
                  Community Consensus
                </h2>
                <p className={"font-body-sm text-body-sm text-on-surface-variant"}>
                  Crowdsourced verification across Jamaican drivers
                </p>
              </div>
              <span className={"material-symbols-outlined text-primary text-[20px]"}>
                groups
              </span>
            </div>
            <div className={"rounded-xl p-space-md bg-gradient-to-br from-primary via-secondary-container to-tertiary-fixed-dim text-on-primary shadow-md relative overflow-hidden"} id={"state-card-checking"} data-price-card={"checking"}>
              <div className={"flex items-center justify-between mb-space-xs"}>
                <div className={"inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-on-primary/20 backdrop-blur-sm text-on-primary font-label-sm text-label-sm uppercase tracking-wider"}>
                  <span className={"w-1.5 h-1.5 rounded-full bg-surface-container-lowest animate-pulse"} />
                  Live Peer Validation
                </div>
              </div>
              <div className={"flex items-start gap-3 mt-space-sm"}>
                <div className={"w-9 h-9 rounded-full bg-on-primary/20 flex-shrink-0 flex items-center justify-center mt-0.5"}>
                  <span className={"material-symbols-outlined text-[20px] text-on-primary animate-spin"}>
                    refresh
                  </span>
                </div>
                <div className={"flex-1"}>
                  <div className={"font-headline-sm text-headline-sm text-on-primary"}>
                    Checking your reported rate
                  </div>
                  <p className={"font-body-sm text-body-sm text-on-primary/90 mt-1 leading-relaxed"} data-slot={"consensus-checking-body"}>
                    Thanks! We are cross-referencing your price — it will help nearby drivers shortly.
                  </p>
                </div>
              </div>
              <div className={"mt-space-md pt-space-xs bg-on-primary/10 rounded-lg p-2.5 flex items-center gap-2 text-on-primary"}>
                <span className={"material-symbols-outlined text-[18px]"}>
                  schedule
                </span>
                <span className={"font-body-sm text-body-sm leading-tight"}>
                  Typically verified within 15–30 mins via multi-driver consensus.
                </span>
              </div>
            </div>
            <div className={"hidden rounded-xl p-space-md bg-surface-container-lowest shadow-md relative overflow-hidden"} id={"state-card-published"} data-price-card={"published"}>
              <div className={"flex items-center justify-between mb-space-xs"}>
                <div className={"inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-surface-container-high text-tertiary font-label-sm text-label-sm font-bold"}>
                  <span className={"material-symbols-outlined text-[14px]"} style={{ fontVariationSettings: "'FILL' 1" }}>
                    check_circle
                  </span>
                  Consensus Confirmed
                </div>
              </div>
              <div className={"mt-space-sm"}>
                <div className={"font-headline-sm text-headline-sm text-on-surface"}>
                  Your price is live for all drivers
                </div>
                <p className={"font-body-sm text-body-sm text-on-surface-variant mt-1"} data-slot={"consensus-published-body"}>
                  Station price board updated.
                </p>
              </div>
              <div className={"mt-space-md p-3 rounded-lg bg-surface-container-low flex items-center justify-between"}>
                <div className={"flex items-center gap-2"}>
                  <span className={"material-symbols-outlined text-primary text-[20px]"} style={{ fontVariationSettings: "'FILL' 1" }}>
                    radar
                  </span>
                  <div>
                    <div className={"font-label-md text-label-md text-on-surface"}>
                      Live Station Benchmark
                    </div>
                    <div className={"font-body-sm text-body-sm text-on-surface-variant"} data-slot={"consensus-published-grade"}>
                      Grade verified active
                    </div>
                  </div>
                </div>
                <div className={"text-right"}>
                  <div className={"font-price-display text-price-display text-primary"} data-slot={"consensus-published-price"}>
                    —
                  </div>
                </div>
              </div>
            </div>
            <div className={"hidden rounded-xl p-space-md bg-surface-container shadow-md relative overflow-hidden"} id={"state-card-review"} data-price-card={"review"}>
              <div className={"flex items-center justify-between mb-space-xs"}>
                <div className={"inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-surface-container-highest text-on-surface-variant font-label-sm text-label-sm font-semibold"}>
                  <span className={"material-symbols-outlined text-[14px]"}>
                    tune
                  </span>
                  Routine Check
                </div>
                <span className={"font-label-sm text-label-sm text-on-surface-variant"}>
                  Expense safe
                </span>
              </div>
              <div className={"flex items-start gap-3 mt-space-sm"}>
                <div className={"w-9 h-9 rounded-full bg-surface-container-highest flex-shrink-0 flex items-center justify-center mt-0.5"}>
                  <span className={"material-symbols-outlined text-[18px] text-on-surface"}>
                    manage_search
                  </span>
                </div>
                <div className={"flex-1"}>
                  <div className={"font-headline-sm text-headline-sm text-on-surface"}>
                    Price queued for quick review
                  </div>
                  <p className={"font-body-sm text-body-sm text-on-surface-variant mt-1 leading-relaxed"} data-slot={"consensus-review-body"}>
                    Your price looks slightly different from this week&apos;s baseline — the Roam Plug team will take a friendly peek. We&apos;ve logged your fuel economy and expenses perfectly.
                  </p>
                </div>
              </div>
              <div className={"mt-space-md p-2.5 rounded-lg bg-surface-container-lowest flex items-center gap-2 text-on-surface-variant"}>
                <span className={"material-symbols-outlined text-[18px] text-tertiary"} style={{ fontVariationSettings: "'FILL' 1" }}>
                  verified_user
                </span>
                <span className={"font-body-sm text-body-sm"}>
                  Your vehicle mileage &amp; budget remain 100% unaffected.
                </span>
              </div>
            </div>
          </div>
          <div className={"mt-space-md rounded-xl bg-surface-container-low p-space-md flex items-center gap-3"}>
            <div className={"w-10 h-10 rounded-full bg-surface-container flex items-center justify-center flex-shrink-0"}>
              <span className={"material-symbols-outlined text-secondary text-[20px]"}>
                lightbulb
              </span>
            </div>
            <div className={"flex-1 min-w-0"}>
              <div className={"font-label-md text-label-md text-on-surface"}>
                Pro Driver Tip
              </div>
              <p className={"font-body-sm text-body-sm text-on-surface-variant truncate"}>
                Logging full tanks improves consumption accuracy.
              </p>
            </div>
          </div>
          <div className={"mt-space-lg flex flex-col gap-space-sm"}>
            <button onClick={onPlugClick} className={"w-full h-[52px] rounded-full bg-primary text-on-primary font-label-lg text-label-lg flex items-center justify-center gap-2 shadow-md active:scale-[0.98] transition"} type={"button"} data-act={"done"} data-way-out={"primary"}>
              <span className={"material-symbols-outlined text-[20px]"} style={{ fontVariationSettings: "'FILL' 1" }}>
                check
              </span>
              <span>
                Done
              </span>
            </button>
            <button onClick={onPlugClick} className={"w-full h-12 rounded-full bg-surface-container-lowest text-on-surface font-label-lg text-label-lg flex items-center justify-center gap-1.5 shadow-sm active:bg-surface-container transition"} type={"button"} data-act={"view-in-fuel-history"}>
              <span className={"material-symbols-outlined text-[18px]"}>
                history
              </span>
              <span>
                View in Fuel History
              </span>
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
