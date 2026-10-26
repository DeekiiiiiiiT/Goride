import { useEffect, useRef } from 'react';
import { onPlugClick } from '../../shell/actions';
import { bindScreen } from '../../shell/bind';


export function WithdrawScreen() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (ref.current) bindScreen("23b-withdraw.html", ref.current); }, []);
  return (
    <div ref={ref} data-plug-screen={"23b-withdraw.html"} className={"h-full flex items-center justify-center p-0 sm:p-4 text-on-surface"}>
      <div className={"relative w-full max-w-md h-full sm:h-[844px] bg-background sm:rounded-[36px] overflow-hidden shadow-2xl flex flex-col border border-outline-variant/30 select-none"}>
        <div aria-hidden={"true"} className={"flex-1 overflow-y-auto filter blur-[1.5px] opacity-70 pointer-events-none"}>
          <div className={"bg-surface-container-lowest/90 backdrop-blur-md text-primary border-b border-outline-variant/30 shadow-sm flex justify-between items-center w-full px-4 h-14"}>
            <button onClick={onPlugClick} className={"w-10 h-10 flex items-center justify-center text-on-surface hover:bg-surface-container-high/50 rounded-full transition-colors"} data-act={"arrow-back"} data-way-out={"back"}>
              <span className={"material-symbols-outlined"} data-icon={"arrow_back"}>
                arrow_back
              </span>
            </button>
            <span className={"text-headline-sm font-headline-sm font-bold text-on-surface"}>
              Pending Place
            </span>
            <button onClick={onPlugClick} className={"w-10 h-10 flex items-center justify-center text-on-surface-variant hover:bg-surface-container-high/50 rounded-full transition-colors"} data-act={"share"}>
              <span className={"material-symbols-outlined"} data-icon={"share"}>
                share
              </span>
            </button>
          </div>
          <div className={"p-4 space-y-4 pb-24"}>
            <div className={"flex items-center justify-between p-3.5 bg-tertiary-fixed/40 border border-tertiary/20 rounded-2xl"}>
              <div className={"flex items-center gap-2.5"}>
                <span className={"material-symbols-outlined text-tertiary"} data-icon={"pending"}>
                  pending
                </span>
                <div>
                  <p className={"font-label-sm text-label-sm uppercase tracking-wider text-tertiary font-bold"}>
                    Verification Queue
                  </p>
                  <p className={"font-label-md text-label-md text-on-surface font-semibold"}>
                    Waiting for Roam
                  </p>
                </div>
              </div>
              <span className={"px-2 py-0.5 rounded-full bg-tertiary/10 text-tertiary font-label-sm text-label-sm font-bold"}>
                In Review
              </span>
            </div>
            <div className={"bg-surface-container-lowest p-4 rounded-2xl border border-outline-variant/40 shadow-sm"}>
              <div className={"flex items-start justify-between gap-2 mb-2"}>
                <div>
                  <span className={"inline-block px-2 py-0.5 rounded bg-primary-fixed text-primary font-label-sm text-label-sm mb-1 font-bold"}>
                    {"Tyre & Air Station"}
                  </span>
                  <h1 className={"font-headline-sm text-headline-sm font-bold text-on-surface"}>
                    {""}
                  </h1>
                </div>
                <div className={"w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center flex-shrink-0"}>
                  <span className={"material-symbols-outlined"} data-icon={"build"}>
                    build
                  </span>
                </div>
              </div>
              <div className={"flex items-center gap-1.5 text-on-surface-variant font-body-sm text-body-sm mb-3"}>
                <span className={"material-symbols-outlined text-primary text-[18px]"} data-icon={"location_on"}>
                  location_on
                </span>
                <span>
                  
                </span>
              </div>
              <div className={"relative w-full h-32 rounded-xl overflow-hidden border border-outline-variant/30 mb-3 bg-surface-container-high"}>
                <div className={"w-full h-full object-cover bg-surface-container flex items-center justify-center text-primary"} aria-hidden={"true"}><span className={"material-symbols-outlined text-[32px]"}>image</span></div>
                <div className={"absolute bottom-2 left-2 bg-surface-container-lowest/90 px-2 py-1 rounded text-[12px] font-semibold text-on-surface shadow-xs"}>
                  St. Andrew Parish
                </div>
              </div>
              <div className={"pt-2 border-t border-outline-variant/20"}>
                <p className={"font-label-sm text-label-sm text-on-surface-variant uppercase font-bold mb-2"}>
                  Scout Community Progress
                </p>
                <div className={"flex items-center gap-2"}>
                  <div className={"flex-1 bg-primary h-2 rounded-full"} />
                  <div className={"flex-1 bg-primary h-2 rounded-full"} />
                  <div className={"flex-1 bg-surface-container-highest h-2 rounded-full"} />
                  <span className={"font-label-sm text-label-sm font-bold text-primary"}>
                    2/3 Votes
                  </span>
                </div>
              </div>
            </div>
            <div className={"bg-surface-container-lowest p-4 rounded-2xl border border-outline-variant/40 space-y-3 shadow-sm"}>
              <h2 className={"font-label-md text-label-md font-bold text-on-surface uppercase tracking-wider"}>
                Submitted Amenities
              </h2>
              <div className={"grid grid-cols-2 gap-2"}>
                <div className={"flex items-center gap-2 p-2 rounded-lg bg-surface-container-low border border-outline-variant/20"}>
                  <span className={"material-symbols-outlined text-primary text-[20px]"} data-icon={"air"}>
                    air
                  </span>
                  <span className={"font-body-sm text-body-sm text-on-surface font-medium"}>
                    Free Air Gauge
                  </span>
                </div>
                <div className={"flex items-center gap-2 p-2 rounded-lg bg-surface-container-low border border-outline-variant/20"}>
                  <span className={"material-symbols-outlined text-primary text-[20px]"} data-icon={"schedule"}>
                    schedule
                  </span>
                  <span className={"font-body-sm text-body-sm text-on-surface font-medium"}>
                    Open 24/7
                  </span>
                </div>
                <div className={"flex items-center gap-2 p-2 rounded-lg bg-surface-container-low border border-outline-variant/20"}>
                  <span className={"material-symbols-outlined text-primary text-[20px]"} data-icon={"payments"}>
                    payments
                  </span>
                  <span className={"font-body-sm text-body-sm text-on-surface font-medium"}>
                    JMD Cash / Linx
                  </span>
                </div>
                <div className={"flex items-center gap-2 p-2 rounded-lg bg-surface-container-low border border-outline-variant/20"}>
                  <span className={"material-symbols-outlined text-primary text-[20px]"} data-icon={"verified_user"}>
                    verified_user
                  </span>
                  <span className={"font-body-sm text-body-sm text-on-surface font-medium"}>
                    Vulcanizer on Duty
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className={"absolute inset-0 bg-[#1c1917]/70 backdrop-blur-[4px] z-40 transition-opacity duration-300 flex flex-col justify-end sm:justify-center p-4"}>
          <div aria-labelledby={"modal-headline"} aria-modal={"true"} className={"relative w-full bg-surface-container-lowest rounded-3xl p-6 shadow-2xl border border-outline-variant/30 transform transition-all duration-200 animate-in fade-in zoom-in-95 max-w-sm mx-auto"} role={"dialog"}>
            <button onClick={onPlugClick} aria-label={"Close dialog"} className={"absolute top-4 right-4 w-9 h-9 rounded-full bg-surface-container-high/60 hover:bg-surface-container-high text-on-surface-variant flex items-center justify-center transition-colors active:scale-95"} data-act={"close"} data-way-out={"back"}>
              <span className={"material-symbols-outlined text-[20px]"} data-icon={"close"}>
                close
              </span>
            </button>
            <div className={"flex flex-col items-center text-center"}>
              <div className={"w-16 h-16 rounded-full bg-error-container/60 border border-error/20 flex items-center justify-center mb-4 text-error shadow-sm"}>
                <span className={"material-symbols-outlined text-[32px]"} data-icon={"remove_circle_outline"}>
                  remove_circle_outline
                </span>
              </div>
              <h2 className={"font-headline-md text-headline-md font-bold text-on-surface mb-1.5 tracking-tight"} id={"modal-headline"}>
                Withdraw this pin?
              </h2>
              <p className={"font-label-lg text-label-lg text-primary font-bold mb-3"}>
                It leaves the review queue.
              </p>
              <p className={"font-body-md text-body-md text-on-surface-variant leading-relaxed mb-4 text-center"}>
                If you withdraw, Roam will stop reviewing
                <strong className={"text-on-surface font-semibold"}>
                  {""}
                </strong>
                and it won't be published to the island map.
              </p>
              <div className={"w-full bg-surface-container-low border border-outline-variant/30 rounded-2xl p-3 mb-6 flex items-start gap-2.5 text-left"}>
                <span className={"material-symbols-outlined text-secondary-container text-[20px] flex-shrink-0 mt-0.5"} data-icon={"warning"}>
                  warning
                </span>
                <p className={"font-body-sm text-body-sm text-on-surface-variant"}>
                  Any pending
                  <strong className={"text-on-surface font-semibold"}>
                    
                  </strong>
                  for this submission will be cancelled.
                </p>
              </div>
              <div className={"w-full space-y-2.5"}>
                <button onClick={onPlugClick} className={"w-full min-h-[48px] bg-error hover:bg-error/90 active:scale-[0.98] text-on-error font-label-lg text-label-lg font-bold py-3.5 px-4 rounded-xl shadow-[0_4px_12px_rgba(186,26,26,0.25)] flex items-center justify-center gap-2 transition-all"} type={"button"} data-act={"withdraw-pin"}>
                  <span className={"material-symbols-outlined text-[20px]"} data-icon={"delete_outline"}>
                    delete_outline
                  </span>
                  <span>
                    Withdraw Pin
                  </span>
                </button>
                <button onClick={onPlugClick} className={"w-full min-h-[48px] bg-surface-container-high/80 hover:bg-surface-container-highest active:scale-[0.98] text-on-surface font-label-lg text-label-lg font-semibold py-3.5 px-4 rounded-xl border border-outline-variant/40 flex items-center justify-center transition-all"} type={"button"} data-act={"keep-it"}>
                  Keep it
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
