import { useEffect, useRef } from 'react';
import { onPlugClick } from '../../shell/actions';
import { bindScreen } from '../../shell/bind';


export function SavedOfflineScreen() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (ref.current) bindScreen("28-saved-offline.html", ref.current); }, []);
  return (
    <div ref={ref} data-plug-screen={"28-saved-offline.html"} className={"bg-surface font-body-md text-on-surface flex flex-col min-h-screen pt-safe pb-safe"}>
      <main className={"flex-1 flex flex-col relative w-full bg-surface"}>
        <div className={"flex flex-col w-full px-margin pb-space-xl"}>
          <div className={"relative flex flex-col items-center justify-center pt-space-md pb-space-lg text-center overflow-hidden"}>
            <div className={"absolute -top-10 w-56 h-56 rounded-full bg-secondary-fixed/50 blur-3xl pointer-events-none -z-10"} />
            <div className={"relative w-24 h-24 mb-space-md flex items-center justify-center rounded-full bg-surface-container-high shadow-sm"}>
              <div className={"absolute inset-1.5 rounded-full bg-surface-container-low flex items-center justify-center"}>
                <span className={"absolute w-full h-full rounded-full bg-tertiary-fixed/30 animate-ping opacity-60"} />
                <div className={"relative flex items-center justify-center w-14 h-14 rounded-full bg-surface-container-highest text-tertiary"}>
                  <span className={"material-symbols-outlined text-[36px]"} style={{ fontVariationSettings: "'FILL' 1" }}>
                    cloud_off
                  </span>
                </div>
              </div>
              <div className={"absolute bottom-0 right-0 flex items-center justify-center w-8 h-8 rounded-full bg-tertiary-container text-on-tertiary-container shadow-md"}>
                <span className={"material-symbols-outlined text-[18px]"}>
                  lock
                </span>
              </div>
            </div>
            <h1 className={"font-headline-lg text-headline-lg text-on-surface mb-space-xs tracking-tight"}>
              Saved on your phone
            </h1>
            <p className={"font-body-md text-body-md text-on-surface-variant max-w-xs leading-relaxed"}>
              No mobile data? No problem. Roam Plug stored your log safely. We'll automatically send it when you're back online.
            </p>
          </div>
          <div className={"flex flex-col w-full mb-space-lg"}>
            <div className={"flex items-center justify-between mb-space-sm px-space-xs"}>
              <div className={"flex items-center gap-2"}>
                <span className={"font-label-lg text-label-lg text-on-surface uppercase tracking-wider"}>
                  Queued Logs
                </span>
                <span className={"font-label-sm text-label-sm px-2 py-0.5 rounded-full bg-tertiary-fixed text-on-tertiary-fixed font-bold"}>
                  1 Pending
                </span>
              </div>
              <span className={"font-label-sm text-label-sm text-on-surface-variant"}>
                St. Andrew
              </span>
            </div>
            <div className={"relative overflow-hidden rounded-xl bg-surface-container-lowest p-space-md shadow-md flex flex-col gap-space-sm"}>
              <div className={"flex items-center justify-between gap-2"}>
                <div className={"flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-tertiary-fixed/60 text-on-tertiary-fixed"}>
                  <span className={"material-symbols-outlined text-[14px] animate-spin"} style={{ animationDuration: "3s" }}>
                    sync
                  </span>
                  <span className={"font-label-sm text-label-sm tracking-wide uppercase"}>
                    Waiting to send
                  </span>
                </div>
                <div className={"flex items-center gap-1 text-on-surface-variant"}>
                  <span className={"material-symbols-outlined text-[14px]"}>
                    schedule
                  </span>
                  <span className={"font-body-sm text-body-sm"}>
                    Today at 3:45 PM
                  </span>
                </div>
              </div>
              <div className={"flex items-start justify-between gap-2 pt-1"}>
                <div className={"flex flex-col min-w-0"}>
                  <div className={"flex items-center gap-1.5"}>
                    <span className={"font-headline-sm text-headline-sm text-on-surface truncate"}>
                      Texaco Barbican
                    </span>
                  </div>
                  <p className={"font-body-sm text-body-sm text-on-surface-variant"}>
                    Barbican Rd, Kingston 6
                  </p>
                </div>
                <span className={"inline-flex items-center justify-center px-2 py-1 rounded bg-[#16a34a] text-white font-label-sm text-label-sm font-bold shadow-sm whitespace-nowrap"}>
                  E-10 87
                </span>
              </div>
              <div className={"grid grid-cols-3 gap-2 p-space-sm rounded-lg bg-surface-container-low mt-1"}>
                <div className={"flex flex-col"}>
                  <span className={"font-label-sm text-label-sm text-on-surface-variant uppercase"}>
                    Amount
                  </span>
                  <span className={"font-label-lg text-label-lg text-on-surface font-bold"}>
                    J$4,290
                  </span>
                </div>
                <div className={"flex flex-col"}>
                  <span className={"font-label-sm text-label-sm text-on-surface-variant uppercase"}>
                    Volume
                  </span>
                  <span className={"font-label-lg text-label-lg text-on-surface font-bold"}>
                    20.0 L
                  </span>
                </div>
                <div className={"flex flex-col"}>
                  <span className={"font-label-sm text-label-sm text-on-surface-variant uppercase"}>
                    Odometer
                  </span>
                  <span className={"font-label-lg text-label-lg text-on-surface font-bold"}>
                    
                  </span>
                </div>
              </div>
              <div className={"flex items-center gap-1.5 pt-1 text-on-surface-variant/80"}>
                <span className={"material-symbols-outlined text-[14px] text-tertiary"} style={{ fontVariationSettings: "'FILL' 1" }}>
                  check_circle
                </span>
                <span className={"font-body-sm text-body-sm"}>
                  Saved locally to device sandbox database
                </span>
              </div>
            </div>
          </div>
          <div className={"relative overflow-hidden rounded-xl bg-surface-container p-space-md mb-space-lg shadow-sm"}>
            <div className={"flex items-start gap-space-sm"}>
              <div className={"flex-shrink-0 w-10 h-10 rounded-full bg-secondary-fixed flex items-center justify-center text-on-secondary-fixed"}>
                <span className={"material-symbols-outlined text-[20px]"}>
                  speed
                </span>
              </div>
              <div className={"flex flex-col min-w-0"}>
                <span className={"font-label-lg text-label-lg text-on-surface mb-0.5"}>
                  Zero Downtime Co-Pilot
                </span>
                <p className={"font-body-sm text-body-sm text-on-surface-variant leading-relaxed"}>
                  Your local vehicle stats, km/L calculation, and oil change reminders have already updated on this device.
                </p>
              </div>
            </div>
            <div className={"mt-space-md pt-space-sm flex items-center justify-between text-on-surface-variant"}>
              <div className={"flex items-center gap-2"}>
                <span className={"material-symbols-outlined text-[16px] text-primary"}>
                  eco
                </span>
                <span className={"font-body-sm text-body-sm font-semibold text-on-surface"}>
                  Calculated Rate:
                </span>
              </div>
              <span className={"font-label-lg text-label-lg text-primary font-bold"}>
                11.4 km/L
              </span>
            </div>
          </div>
          <div className={"flex items-center justify-center mb-space-lg"}>
            <div className={"inline-flex items-center gap-2 px-4 py-2 rounded-full bg-surface-container-high text-on-surface-variant shadow-sm transition-all duration-300"} id={"network-pill"}>
              <span className={"relative flex h-2.5 w-2.5"}>
                <span className={"animate-ping absolute inline-flex h-full w-full rounded-full bg-secondary-container opacity-75"} />
                <span className={"relative inline-flex rounded-full h-2.5 w-2.5 bg-secondary-container"} />
              </span>
              <span className={"font-label-sm text-label-sm tracking-wide"} id={"network-text"}>
                Checking Jamaican network connection...
              </span>
            </div>
          </div>
          <div className={"w-full flex flex-col gap-space-sm mt-auto"}>
            <button onClick={onPlugClick} className={"w-full h-12 flex items-center justify-center rounded-xl bg-[#ea580c] active:bg-[#c2410c] text-white font-label-lg text-label-lg uppercase tracking-wider shadow-lg shadow-primary/20 transition-all duration-150 active:scale-[0.98]"} id={"done-btn"} type={"button"} data-act={"done-btn"}>
              Done
            </button>
            <button onClick={onPlugClick} className={"w-full h-10 flex items-center justify-center gap-1.5 rounded-lg bg-transparent text-secondary active:text-primary font-label-sm text-label-sm transition-colors"} type={"button"} data-act={"force-sync-now"}>
              <span className={"material-symbols-outlined text-[16px]"}>
                refresh
              </span>
              <span>
                Force Sync Now
              </span>
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
