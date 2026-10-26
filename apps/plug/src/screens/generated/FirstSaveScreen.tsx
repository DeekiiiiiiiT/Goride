import { useEffect, useRef } from 'react';
import { onPlugClick } from '../../shell/actions';
import { bindScreen } from '../../shell/bind';


export function FirstSaveScreen() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (ref.current) bindScreen("27b-first-save.html", ref.current); }, []);
  return (
    <div ref={ref} data-plug-screen={"27b-first-save.html"} className={"bg-surface font-body-md text-on-surface flex flex-col min-h-screen pt-safe pb-safe"}>
      <main className={"flex-1 flex flex-col relative w-full bg-surface"}>
        <div className={"sticky top-2 z-30 flex justify-center w-full px-4 pointer-events-none mb-2"}>
          <div className={"inline-flex items-center gap-2 bg-[#059669] text-white px-4 py-2 rounded-full shadow-lg border border-emerald-400/40 transform transition duration-300 pointer-events-auto backdrop-blur-md"}>
            <span className={"material-symbols-outlined text-[18px] text-white"} style={{ fontVariationSettings: "'wght' 700" }}>
              check_circle
            </span>
            <span className={"font-label-md text-label-md font-semibold tracking-wide"}>
              Saved • Logged to your garage
            </span>
          </div>
        </div>
        <div className={"absolute inset-0 pointer-events-none overflow-hidden z-20"}>
          <div className={"absolute top-6 left-8 w-2 h-4 rounded-sm bg-[#fd761a] rotate-12 opacity-90"} />
          <div className={"absolute top-12 left-20 w-3 h-2 rounded bg-[#f7be1d] -rotate-45 opacity-80"} />
          <div className={"absolute top-16 right-10 w-2.5 h-3 rounded-sm bg-[#059669] rotate-45 opacity-90"} />
          <div className={"absolute top-8 right-24 w-3.5 h-2 rounded bg-[#a33900] rotate-12 opacity-85"} />
          <div className={"absolute top-28 left-6 w-2 h-3.5 rounded bg-[#f7be1d] 30deg opacity-75"} />
          <div className={"absolute top-32 right-8 w-3 h-2 rounded-sm bg-[#ff6b6b] -rotate-12 opacity-85"} />
          <div className={"absolute top-44 left-16 w-2.5 h-2.5 rounded-full bg-[#059669] opacity-80"} />
          <div className={"absolute top-48 right-16 w-2 h-3 rounded-sm bg-[#fd761a] rotate-45 opacity-75"} />
          <div className={"absolute top-64 left-10 w-3 h-1.5 rounded-sm bg-[#a33900] -rotate-30 opacity-70"} />
          <div className={"absolute top-72 right-12 w-2.5 h-2.5 rounded bg-[#f7be1d] rotate-12 opacity-75"} />
          <div className={"absolute top-80 left-24 w-2 h-3 rounded-sm bg-[#059669] rotate-60 opacity-65"} />
        </div>
        <div className={"flex flex-col w-full px-margin pb-space-xl"}>
          <div className={"relative flex flex-col items-center justify-center pt-space-md text-center"}>
            <div className={"absolute w-48 h-48 rounded-full bg-secondary-fixed/50 blur-3xl -top-6 pointer-events-none"} />
            <div className={"relative flex items-center justify-center mb-space-sm"}>
              <div className={"w-24 h-24 rounded-full bg-secondary-fixed flex items-center justify-center animate-pulse"}>
                <div className={"w-20 h-20 rounded-full bg-primary flex items-center justify-center shadow-lg transform transition-transform duration-300 hover:scale-105"}>
                  <span className={"material-symbols-outlined text-on-primary text-[44px]"} style={{ fontVariationSettings: "'FILL' 1, 'wght' 700" }}>
                    check_circle
                  </span>
                </div>
              </div>
              <div className={"absolute -top-1 -right-1 w-8 h-8 rounded-full bg-tertiary-fixed-dim text-on-tertiary-fixed flex items-center justify-center shadow-md animate-bounce"}>
                <span className={"material-symbols-outlined text-[18px]"} style={{ fontVariationSettings: "'FILL' 1" }}>
                  arrow_back_ios_new
                </span>
              </div>
              <div className={"absolute -bottom-1 -left-2 w-7 h-7 rounded-full bg-surface-container-lowest text-primary flex items-center justify-center shadow-sm"}>
                <span className={"material-symbols-outlined text-[16px]"} style={{ fontVariationSettings: "'FILL' 1" }}>
                  local_gas_station
                </span>
              </div>
            </div>
            <div className={"inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-secondary-fixed text-on-secondary-fixed font-label-md text-label-md font-bold mb-2 shadow-sm border border-secondary-container/20"}>
              <span className={"material-symbols-outlined text-[16px] text-primary"} style={{ fontVariationSettings: "'FILL' 1" }}>
                celebration
              </span>
              <span>
                First Fuel Log Completed! 🎉
              </span>
            </div>
            <h1 className={"font-headline-lg text-headline-lg text-on-surface tracking-tight"}>
              Fuel Logged!
            </h1>
            <p className={"font-body-md text-body-md text-on-surface-variant mt-space-xs max-w-xs"}>
              Odometer saved
              <span className={"font-label-lg text-on-surface"}>
                
              </span>
            </p>
          </div>
          <div className={"flex flex-col gap-space-md mt-space-lg"}>
            <div className={"bg-surface-container-lowest rounded-xl p-space-md shadow-sm relative overflow-hidden"}>
              <div className={"flex items-center justify-between"}>
                <span className={"font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant flex items-center gap-space-xs"}>
                  <span className={"material-symbols-outlined text-[16px] text-primary"} style={{ fontVariationSettings: "'FILL' 1" }}>
                    speed
                  </span>
                  Fuel Economy
                </span>
                <span className={"inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-surface-container text-on-surface text-[12px] font-label-md"}>
                  <span className={"material-symbols-outlined text-[14px] text-tertiary"} style={{ fontVariationSettings: "'wght' 700" }}>
                    arrow_upward
                  </span>
                  +/L
                </span>
              </div>
              <div className={"flex items-baseline gap-space-xs mt-space-xs"}>
                <span className={"font-display-lg-mobile text-display-lg-mobile text-on-surface font-extrabold tracking-tight"} data-slot={"receipt-economy"}>
                </span>
                <span className={"font-headline-sm text-headline-sm text-on-surface-variant font-semibold"}>
                  km/L
                </span>
              </div>
              <p className={"font-body-sm text-body-sm text-on-surface-variant mt-space-xs flex items-center gap-1"}>
                <span className={"w-1.5 h-1.5 rounded-full bg-tertiary"} />
                Better than St. Andrew average for Roomy 1.0L (/L)
              </p>
              <div className={"w-full bg-surface-container h-2 rounded-full mt-space-sm overflow-hidden flex"}>
                <div className={"bg-tertiary-container h-full rounded-full"} style={{ width: "78%" }} />
              </div>
            </div>
            <div className={"bg-surface-container-lowest rounded-xl p-space-md shadow-sm"}>
              <div className={"flex items-center justify-between pb-space-xs"}>
                <span className={"font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant"}>
                  This Refuel
                </span>
                <span className={"px-2.5 py-1 rounded bg-surface-container-highest text-on-surface font-label-md text-label-md flex items-center gap-1"} data-slot={"receipt-grade"}>
                  <span className={"w-2 h-2 rounded-full bg-primary"} />
                  E-10 87 @ /L
                </span>
              </div>
              <div className={"flex items-baseline justify-between mt-space-xs"}>
                <div>
                  <span className={"font-price-display text-price-display text-on-surface font-bold"} data-slot={"receipt-amount"}>
                    
                  </span>
                  <span className={"font-body-md text-body-md text-on-surface-variant ml-1"}>
                    <span data-slot={"receipt-litres"}></span>
                  </span>
                </div>
                <div className={"flex items-center text-primary font-label-md text-label-md gap-0.5"} data-slot={"receipt-station"}>
                  <span className={"material-symbols-outlined text-[16px]"}>
                    pin_drop
                  </span>
                  
                </div>
              </div>
            </div>
            <div className={"bg-surface-container-lowest rounded-xl p-space-md shadow-sm relative overflow-hidden"}>
              <div className={"absolute left-0 top-0 bottom-0 w-1.5 bg-secondary-container"} />
              <div className={"flex items-start justify-between pl-space-xs"}>
                <div className={"flex flex-col"}>
                  <div className={"flex items-center gap-space-xs"}>
                    <span className={"material-symbols-outlined text-secondary-container text-[20px]"} style={{ fontVariationSettings: "'FILL' 1" }}>
                      build
                    </span>
                    <span className={"font-headline-sm text-headline-sm text-on-surface"}>
                      </span>
                  </div>
                  <span className={"font-body-sm text-body-sm text-on-surface-variant mt-1"}>
                    <strong className={"text-on-surface"}>
                      
                    </strong>
                    • Approx. 6 days left at your pace
                  </span>
                </div>
                <span className={"px-2 py-0.5 rounded-full bg-secondary-fixed text-on-secondary-fixed font-label-sm text-label-sm uppercase tracking-wide"}>
                  Due Soon
                </span>
              </div>
            </div>
            <div className={"relative overflow-hidden rounded-xl bg-gradient-to-r from-secondary-container via-primary-container to-tertiary p-space-md text-on-primary-container shadow-md"}>
              <div className={"absolute -right-4 -bottom-6 w-28 h-28 rounded-full bg-surface-container-lowest/15 pointer-events-none"} />
              <div className={"relative z-10 flex flex-col gap-space-xs"}>
                <div className={"flex items-center justify-between"}>
                  <div className={"flex items-center gap-space-xs"}>
                    <span className={"material-symbols-outlined text-tertiary-fixed text-[22px]"} style={{ fontVariationSettings: "'FILL' 1" }}>
                      volunteer_activism
                    </span>
                    <span className={"font-label-lg text-label-lg tracking-wide uppercase text-tertiary-fixed"}>
                      Driver Network Impact
                    </span>
                  </div>
                  <span className={"px-2 py-0.5 rounded-full bg-surface-container-lowest/25 text-on-primary font-label-sm text-[12px] uppercase font-bold tracking-wider"}>
                    1st Log Milestone
                  </span>
                </div>
                <p className={"font-headline-sm text-headline-sm font-semibold leading-snug mt-1 text-on-primary"}>
                  You completed your very first log — welcome to Roam Plug! You updated E-10 87 for all drivers 🇯🇲
                </p>
                <div className={"flex flex-wrap items-center justify-between gap-2 pt-space-xs mt-space-xs"} style={{ display: "none" }}>
                  <div className={"inline-flex items-center gap-1.5 bg-on-secondary-container/30 px-space-sm py-1 rounded-full text-on-primary font-label-md text-label-md backdrop-blur-sm"}>
                    <span className={"material-symbols-outlined text-[16px] text-tertiary-fixed-dim"} style={{ fontVariationSettings: "'FILL' 1" }}>
                      military_tech
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className={"flex flex-col gap-space-sm mt-space-xl"}>
            <button onClick={onPlugClick} className={"w-full h-12 rounded-xl bg-primary hover:bg-primary-container active:scale-[0.99] text-on-primary font-label-lg text-label-lg shadow-md flex items-center justify-center gap-space-xs transition duration-150"} type={"button"} data-act={"done"} data-way-out={"primary"}>
              <span>
                Done
              </span>
              <span className={"material-symbols-outlined text-[18px]"}>
                check
              </span>
            </button>
            <button onClick={onPlugClick} className={"w-full h-12 rounded-xl bg-surface-container-low hover:bg-surface-container active:scale-[0.99] text-primary font-label-lg text-label-lg flex items-center justify-center gap-space-xs transition duration-150"} type={"button"} data-act={"view-in-fuel-history"}>
              <span className={"material-symbols-outlined text-[18px]"}>
                receipt_long
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
