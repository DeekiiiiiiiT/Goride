import { useEffect, useRef } from 'react';
import { onPlugClick } from '../../shell/actions';
import { bindScreen } from '../../shell/bind';


export function SubmittedScreen() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (ref.current) bindScreen("45-submitted.html", ref.current); }, []);
  return (
    <div ref={ref} data-plug-screen={"45-submitted.html"} className={"bg-surface font-sans text-on-surface flex flex-col min-h-screen pt-safe pb-safe selection:bg-primary-fixed selection:text-primary"}>
      <header className={"sticky top-0 z-30 flex items-center justify-between px-4 py-3 bg-surface border-b border-surface-container-highest/60 backdrop-blur-sm bg-surface/95"}>
        <button onClick={onPlugClick} aria-label={"Go back or close"} className={"flex items-center justify-center w-10 h-10 rounded-full hover:bg-surface-container active:bg-surface-container-high text-on-surface transition-colors"} type={"button"} data-act={"close"} data-way-out={"back"}>
          <span className={"material-symbols-outlined text-[24px]"}>
            close
          </span>
        </button>
        <div className={"flex items-center gap-1.5 font-bold text-sm tracking-wide text-on-surface"}>
          <span>
            Map It
          </span>
          <span className={"text-secondary font-black"}>
            •
          </span>
          <span className={"text-on-surface-variant font-medium"}>
            Status
          </span>
        </div>
        <div className={"w-10 h-10 flex items-center justify-center"}>
          <button onClick={onPlugClick} aria-label={"Help & Info"} className={"flex items-center justify-center w-9 h-9 rounded-full hover:bg-surface-container text-on-surface-variant"} type={"button"} data-act={"help-outline"}>
            <span className={"material-symbols-outlined text-[20px]"}>
              help_outline
            </span>
          </button>
        </div>
      </header>
      <main className={"flex-1 w-full max-w-md mx-auto p-4 space-y-4"}>
        <div className={"flex flex-col items-center justify-center pt-2 pb-1 text-center"}>
          <div className={"relative flex items-center justify-center w-28 h-28 mb-3"}>
            <div className={"absolute inset-0 rounded-full bg-secondary-container/20 blur-xl"} />
            <svg className={"absolute inset-0 w-full h-full -rotate-45"} viewBox={"0 0 112 112"}>
              <circle className={"opacity-80"} cx={"56"} cy={"56"} fill={"none"} r={"50"} stroke={"#fd761a"} strokeDasharray={"6 5"} strokeLinecap={"round"} strokeWidth={"2.5"} />
            </svg>
            <div className={"relative flex items-center justify-center w-20 h-20 rounded-full bg-surface-container-lowest shadow-md"}>
              <div className={"flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-tr from-primary to-secondary-container text-on-primary shadow-inner"}>
                <span className={"material-symbols-outlined text-[34px]"} style={{ fontVariationSettings: "'FILL' 1" }}>
                  add_location_alt
                </span>
              </div>
              <div className={"absolute -bottom-1 -right-1 flex items-center justify-center w-8 h-8 rounded-full bg-tertiary-fixed-dim text-on-tertiary-fixed shadow-md border-2 border-surface-container-lowest"}>
                <span className={"material-symbols-outlined text-[18px]"} style={{ fontVariationSettings: "'FILL' 1" }}>
                  schedule
                </span>
              </div>
            </div>
          </div>
          <div className={"inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-tertiary-fixed/60 text-on-tertiary-fixed mb-2 shadow-xs"}>
            <span className={"material-symbols-outlined text-[15px]"} style={{ fontVariationSettings: "'FILL' 1" }}>
              hourglass_top
            </span>
            <span className={"text-xs font-bold uppercase tracking-wider"}>
              Pending Verification
            </span>
          </div>
          <h1 className={"text-2xl font-extrabold tracking-tight text-on-surface text-center"}>
            Thanks! Your pin is awaiting approval
          </h1>
          <p className={"text-sm text-on-surface-variant max-w-xs text-center mt-1.5 leading-relaxed"}>
            The Roam team checks every pin before it goes on the map. We'll notify you once verified.
          </p>
        </div>
        <div className={"w-full bg-surface-container-lowest rounded-2xl shadow-sm border border-surface-container-highest/60 p-4"}>
          <div className={"flex items-start justify-between gap-3 pb-3 border-b border-surface-container"}>
            <div className={"flex items-start gap-3 min-w-0"}>
              <div className={"flex items-center justify-center w-11 h-11 rounded-xl bg-surface-container text-primary shrink-0 text-xl font-bold shadow-xs"}>
                ⛽
              </div>
              <div className={"min-w-0"}>
                <h2 className={"text-base font-bold text-on-surface truncate"}>
                  TotalEnergies Half-Way-Tree
                </h2>
                <p className={"text-xs text-on-surface-variant truncate mt-0.5"}>
                  , Kingston 10
                </p>
              </div>
            </div>
          </div>
          <div className={"flex items-center justify-between pt-3 gap-2"}>
            <span className={"text-xs font-semibold text-on-surface-variant flex items-center gap-1.5"}>
              <span className={"material-symbols-outlined text-[16px] text-primary"}>
                local_gas_station
              </span>
              Gas Station
            </span>
            <span className={"inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface-container-low text-secondary border border-secondary-container/30 text-xs font-bold"}>
              <span className={"w-2 h-2 rounded-full bg-secondary-container animate-pulse"} />
              Pending Review • 2-4 hours est.
            </span>
          </div>
        </div>
        <div className={"relative w-full rounded-2xl overflow-hidden p-4 bg-gradient-to-br from-primary-container via-secondary-container to-tertiary-fixed text-on-primary shadow-md"}>
          <div className={"absolute -right-5 -bottom-6 opacity-15 pointer-events-none select-none"}>
            <span className={"material-symbols-outlined text-[140px]"}>
              emoji_events
            </span>
          </div>
          <div className={"relative z-10 flex flex-col gap-2.5"}>
            <div className={"flex items-center justify-between"}>
              <div className={"flex items-center gap-2"}>
                <div className={"flex items-center justify-center w-8 h-8 rounded-full bg-white/20 backdrop-blur-sm text-white"}>
                  <span className={"material-symbols-outlined text-[20px]"} style={{ fontVariationSettings: "'FILL' 1" }}>
                    emoji_events
                  </span>
                </div>
                <span className={"text-xs font-bold tracking-wider uppercase text-white/95"}>
                  Scout Network
                </span>
              </div>
              <span className={"text-xs font-semibold px-2.5 py-1 rounded-full bg-black/15 backdrop-blur-sm text-white"}>
                Rank: Parish Scout Level 2
              </span>
            </div>
            <div className={"flex items-baseline justify-between mt-1"}>
              <div>
                <div className={"text-2xl font-black tracking-tight text-white"}>
                  12 Places Mapped
                </div>
              </div>
              <div className={"inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-surface-container-lowest text-primary font-bold text-sm shadow-xs"}>
                +25 Pending Scout Points
              </div>
            </div>
            <div className={"mt-1 bg-black/10 rounded-xl p-2.5 backdrop-blur-xs"}>
              <p className={"text-xs text-white/95 flex items-start gap-1.5 leading-snug"}>
                <span className={"material-symbols-outlined text-[15px] shrink-0 mt-0.5 text-tertiary-fixed"} style={{ fontVariationSettings: "'FILL' 1" }}>
                  thumb_up
                </span>
                <span>
                  Your pins help over
                  <strong>
                    3,400 Jamaican motorists
                  </strong>
                  find fuel, air, and repairs.
                </span>
              </p>
            </div>
          </div>
        </div>
        <div className={"w-full bg-surface-container-lowest rounded-2xl shadow-sm border border-surface-container-highest/60 p-4"}>
          <h3 className={"text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-3"}>
            Verification Process
          </h3>
          <div className={"space-y-3"}>
            <div className={"flex items-center justify-between"}>
              <div className={"flex items-center gap-2.5 min-w-0"}>
                <div className={"flex items-center justify-center w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 shrink-0"}>
                  <span className={"material-symbols-outlined text-[16px]"}>
                    check
                  </span>
                </div>
                <span className={"text-sm font-medium text-on-surface"}>
                  1. GPS corridor match
                </span>
              </div>
              <span className={"text-xs font-bold text-emerald-700"}>
                Verified
              </span>
            </div>
            <div className={"flex items-center justify-between"}>
              <div className={"flex items-center gap-2.5 min-w-0"}>
                <div className={"flex items-center justify-center w-6 h-6 rounded-full bg-amber-100 text-amber-800 shrink-0"}>
                  <span className={"material-symbols-outlined text-[15px]"} style={{ fontVariationSettings: "'FILL' 1" }}>
                    schedule
                  </span>
                </div>
                <span className={"text-sm font-medium text-on-surface"}>
                  2. Community moderator check
                </span>
              </div>
              <span className={"text-xs font-bold text-amber-700"}>
                In queue
              </span>
            </div>
            <div className={"flex items-center justify-between opacity-60"}>
              <div className={"flex items-center gap-2.5 min-w-0"}>
                <div className={"flex items-center justify-center w-6 h-6 rounded-full bg-surface-container text-on-surface-variant shrink-0"}>
                  <span className={"material-symbols-outlined text-[15px]"}>
                    sensors
                  </span>
                </div>
                <span className={"text-sm font-medium text-on-surface"}>
                  3. Published to Jamaican Radar
                </span>
              </div>
              <span className={"text-xs font-medium text-on-surface-variant"}>
                Pending
              </span>
            </div>
          </div>
        </div>
        <div className={"space-y-2.5 pt-2"}>
          <button onClick={onPlugClick} className={"w-full bg-primary text-white py-3.5 rounded-xl font-bold flex items-center justify-center gap-2 shadow-sm active:opacity-90 transition-opacity text-sm"} type={"button"} data-act={"map-another-place"} data-way-out={"primary"}>
            <span className={"material-symbols-outlined text-[19px]"}>
              add_location
            </span>
            <span>
              Map Another Place
            </span>
          </button>
          <button onClick={onPlugClick} className={"w-full border border-outline py-3 rounded-xl font-semibold w-full text-center text-on-surface flex items-center justify-center gap-2 hover:bg-surface-container/50 active:bg-surface-container transition-colors text-sm"} type={"button"} data-act={"back-to-map"}>
            <span className={"material-symbols-outlined text-[19px] text-primary"}>
              map
            </span>
            <span>
              Back to Map
            </span>
          </button>
          <div className={"text-center pt-1 pb-2"}>
            <a onClick={onPlugClick} className={"text-xs font-semibold text-secondary hover:underline underline-offset-4 py-1.5 px-3"} href={"#submitted-places"} data-act={"view-my-submitted-places"}>
              View My Submitted Places
            </a>
          </div>
        </div>
      </main>
    </div>
  );
}
