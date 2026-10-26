import { useEffect, useRef } from 'react';
import { onPlugClick } from '../../shell/actions';
import { bindScreen } from '../../shell/bind';


export function HowItWorksScreen() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (ref.current) bindScreen("03-how-it-works.html", ref.current); }, []);
  return (
    <div ref={ref} data-plug-screen={"03-how-it-works.html"} className={"bg-surface text-on-surface antialiased flex flex-col min-h-screen"}>
      <main className={"flex-1 flex flex-col relative w-full pt-safe pb-safe bg-surface px-margin"}>
        <div className={"flex flex-col w-full pb-6 select-none"}>
          <div className={"flex items-center justify-between w-full py-space-sm mb-space-sm"}>
            <div className={"flex items-center gap-2"}>
              <div className={"w-8 h-8 rounded-full bg-primary flex items-center justify-center text-on-primary shadow-sm"}>
                <span className={"material-symbols-outlined text-[18px]"}>
                  electric_bolt
                </span>
              </div>
              <div className={"flex flex-col"}>
                <span className={"font-headline-sm text-headline-sm text-on-surface leading-none"}>
                  Roam Plug
                </span>
                <span className={"font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider mt-0.5"}>
                  Island Driver Co-Pilot
                </span>
              </div>
            </div>
            <button onClick={onPlugClick} className={"px-space-sm py-1.5 rounded-full bg-surface-container hover:bg-surface-container-high transition-colors font-label-lg text-label-lg text-on-surface-variant"} id={"skipBtn"} data-act={"skipBtn"}>
              Skip
            </button>
          </div>
          <div className={"mb-space-md"}>
            <span className={"inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-secondary-fixed text-on-secondary-fixed font-label-md text-label-md mb-space-xs"}>
              <span className={"material-symbols-outlined text-[14px]"}>
                verified
              </span>
              100% Local Utility
            </span>
            <h1 className={"font-display-lg-mobile text-display-lg-mobile text-on-surface tracking-tight"}>
              Built for Jamaican Roads
            </h1>
            <p className={"font-body-md text-body-md text-on-surface-variant mt-1"}>
              Everything route taxis, couriers, and daily commuters need on one smart dashboard.
            </p>
          </div>
          <div className={"relative w-full overflow-hidden rounded-xl"}>
            <div className={"flex w-full transition-transform duration-300 ease-out"} id={"tourTrack"}>
              <div className={"w-full flex-shrink-0 flex flex-col"}>
                <div className={"bg-surface-container rounded-xl p-space-md shadow-sm flex flex-col gap-space-md"}>
                  <div className={"flex items-start justify-between"}>
                    <div className={"w-14 h-14 rounded-xl bg-primary-container flex items-center justify-center text-on-primary-container shadow-md"}>
                      <span className={"material-symbols-outlined text-[32px]"}>
                        local_gas_station
                      </span>
                    </div>
                    <span className={"px-2.5 py-1 rounded-full bg-tertiary-fixed text-on-tertiary-fixed font-label-md text-label-md flex items-center gap-1 shadow-sm"}>
                      <span className={"material-symbols-outlined text-[14px]"} style={{ fontVariationSettings: "'FILL' 1" }}>
                        price_check
                      </span>
                      Real-time JMD
                    </span>
                  </div>
                  <div>
                    <h2 className={"font-headline-md text-headline-md text-on-surface"}>
                      Find Fuel Fast
                    </h2>
                    <p className={"font-body-md text-body-md text-on-surface-variant mt-1"}>
                      See live fuel prices at stations across all 14 parishes, crowd-verified by Jamaican drivers.
                    </p>
                  </div>
                  <div className={"bg-surface-container-lowest rounded-xl p-space-md shadow-sm flex flex-col gap-3"}>
                    <div className={"flex items-start justify-between gap-2"}>
                      <div className={"flex items-center gap-2.5 min-w-0"}>
                        <div className={"w-9 h-9 rounded-lg bg-surface-container-high flex items-center justify-center text-primary flex-shrink-0"}>
                          <span className={"material-symbols-outlined text-[20px]"} style={{ fontVariationSettings: "'FILL' 1" }}>
                            local_gas_station
                          </span>
                        </div>
                        <div className={"min-w-0"}>
                          <div className={"flex items-center gap-1"}>
                            <span className={"font-label-lg text-label-lg text-on-surface truncate"}>
                              
                            </span>
                            <span className={"material-symbols-outlined text-[16px] text-primary"} style={{ fontVariationSettings: "'FILL' 1" }}>
                              verified
                            </span>
                          </div>
                          <span className={"font-body-sm text-body-sm text-on-surface-variant truncate block"}>
                            Ocho Rios, St. Ann
                          </span>
                        </div>
                      </div>
                      <span className={"font-label-sm text-label-sm text-on-surface-variant bg-surface-container px-2 py-0.5 rounded-full flex-shrink-0"}>
                         away
                      </span>
                    </div>
                    <div className={"grid grid-cols-2 gap-2"}>
                      <div className={"bg-surface-container-low rounded-lg p-2 flex flex-col"}>
                        <span className={"font-label-sm text-label-sm text-on-surface-variant uppercase"}>
                          E-10 87 Octane
                        </span>
                        <span className={"font-price-display text-price-display text-primary font-bold"}>
                          
                        </span>
                      </div>
                      <div className={"bg-surface-container-low rounded-lg p-2 flex flex-col"}>
                        <span className={"font-label-sm text-label-sm text-on-surface-variant uppercase"}>
                          Ultra Diesel
                        </span>
                        <span className={"font-price-display text-price-display text-on-surface font-bold"}>
                          
                        </span>
                      </div>
                    </div>
                    <div className={"flex items-center justify-between pt-1"}>
                      <span className={"px-2 py-0.5 rounded-full bg-tertiary-fixed-dim text-on-tertiary-fixed font-label-sm text-label-sm font-semibold"}>
                        ★ Cheapest in St. Ann
                      </span>
                      <span className={"font-label-sm text-label-sm text-on-surface-variant flex items-center gap-1"}>
                        <span className={"material-symbols-outlined text-[12px]"}>
                          schedule
                        </span>
                        updated 28m ago
                      </span>
                    </div>
                  </div>
                </div>
              </div>
              <div className={"w-full flex-shrink-0 flex flex-col"}>
                <div className={"bg-surface-container rounded-xl p-space-md shadow-sm flex flex-col gap-space-md"}>
                  <div className={"flex items-start justify-between"}>
                    <div className={"w-14 h-14 rounded-xl bg-secondary flex items-center justify-center text-on-secondary shadow-md"}>
                      <span className={"material-symbols-outlined text-[32px]"}>
                        speed
                      </span>
                    </div>
                    <span className={"px-2.5 py-1 rounded-full bg-secondary-fixed text-on-secondary-fixed font-label-md text-label-md flex items-center gap-1 shadow-sm"}>
                      <span className={"material-symbols-outlined text-[14px]"}>
                        notifications_active
                      </span>
                      Auto Alerts
                    </span>
                  </div>
                  <div>
                    <h2 className={"font-headline-md text-headline-md text-on-surface"}>
                      Track Your Car
                    </h2>
                    <p className={"font-body-md text-body-md text-on-surface-variant mt-1"}>
                      Log your odometer when you fuel up — we'll tell you when service is due (oil changes, fitness inspection, road license).
                    </p>
                  </div>
                  <div className={"bg-surface-container-lowest rounded-xl p-space-md shadow-sm flex flex-col gap-2.5"}>
                    <div className={"flex items-center justify-between"}>
                      <div className={"flex items-center gap-2"}>
                        <span className={"material-symbols-outlined text-[20px] text-secondary"}>
                          minor_crash
                        </span>
                        <span className={"font-label-lg text-label-lg text-on-surface"}>
                          Example · Toyota Probox (2018)
                        </span>
                      </div>
                      <span className={"font-label-sm text-label-sm bg-surface-container px-2 py-0.5 rounded-full text-on-surface"}>
                        
                      </span>
                    </div>
                    <div className={"flex flex-col gap-2 pt-1"}>
                      <div className={"flex items-center justify-between p-2 rounded-lg bg-surface-container-low"}>
                        <div className={"flex items-center gap-2"}>
                          <span className={"material-symbols-outlined text-[18px] text-primary"}>
                            car_repair
                          </span>
                          <span className={"font-label-md text-label-md text-on-surface"}>
                            {"Oil & Filter Change"}
                          </span>
                        </div>
                        <span className={"font-label-sm text-label-sm text-primary font-semibold"}>
                          </span>
                      </div>
                      <div className={"flex items-center justify-between p-2 rounded-lg bg-surface-container-low"}>
                        <div className={"flex items-center gap-2"}>
                          <span className={"material-symbols-outlined text-[18px] text-tertiary"}>
                            description
                          </span>
                          <span className={"font-label-md text-label-md text-on-surface"}>
                            Fitness Certificate
                          </span>
                        </div>
                        <span className={"font-label-sm text-label-sm text-on-surface-variant"}>
                          Due Oct 14
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className={"w-full flex-shrink-0 flex flex-col"}>
                <div className={"bg-surface-container rounded-xl p-space-md shadow-sm flex flex-col gap-space-md"}>
                  <div className={"flex items-start justify-between"}>
                    <div className={"w-14 h-14 rounded-xl bg-tertiary-container flex items-center justify-center text-on-tertiary-container shadow-md"}>
                      <span className={"material-symbols-outlined text-[32px]"}>
                        build_circle
                      </span>
                    </div>
                    <span className={"px-2.5 py-1 rounded-full bg-surface-container-highest text-on-surface font-label-md text-label-md flex items-center gap-1 shadow-sm"}>
                      <span className={"material-symbols-outlined text-[14px]"}>
                        tune
                      </span>
                      Island-Fit
                    </span>
                  </div>
                  <div>
                    <h2 className={"font-headline-md text-headline-md text-on-surface"}>
                      {"Parts & Trusted Mechanics"}
                    </h2>
                    <p className={"font-body-md text-body-md text-on-surface-variant mt-1"}>
                      See parts that fit your car (Roomy, Fit, Axio, Probox) and trusted alignment, tire, and repair shops near you.
                    </p>
                  </div>
                  <div className={"bg-surface-container-lowest rounded-xl p-space-md shadow-sm flex flex-col gap-2.5"}>
                    <div className={"flex items-center justify-between"}>
                      <span className={"font-label-sm text-label-sm text-on-surface-variant uppercase"}>
                        Compatible Match
                      </span>
                      <span className={"px-2 py-0.5 rounded-full bg-tertiary-fixed text-on-tertiary-fixed font-label-sm text-label-sm"}>
                        Exact Fit: Axio / Fielder
                      </span>
                    </div>
                    <div className={"flex items-center gap-3"}>
                      <div className={"w-12 h-12 rounded-lg bg-surface-container flex items-center justify-center text-primary flex-shrink-0"}>
                        <span className={"material-symbols-outlined text-[24px]"}>
                          precision_manufacturing
                        </span>
                      </div>
                      <div className={"min-w-0 flex-1"}>
                        <span className={"font-label-lg text-label-lg text-on-surface truncate block"}>
                          Front Brake Pads Set (OEM)
                        </span>
                        <span className={"font-body-sm text-body-sm text-on-surface-variant"}>
                          
                        </span>
                      </div>
                      <div className={"text-right"}>
                        <span className={"font-headline-sm text-headline-sm text-primary"}>
                          
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className={"w-full flex-shrink-0 flex flex-col"}>
                <div className={"bg-surface-container rounded-xl p-space-md shadow-sm flex flex-col gap-space-md"}>
                  <div className={"flex items-start justify-between"}>
                    <div className={"w-14 h-14 rounded-xl bg-inverse-surface flex items-center justify-center text-inverse-on-surface shadow-md"}>
                      <span className={"material-symbols-outlined text-[32px]"}>
                        pin_drop
                      </span>
                    </div>
                    <span className={"px-2.5 py-1 rounded-full bg-primary-fixed text-on-primary-fixed font-label-md text-label-md flex items-center gap-1 shadow-sm"}>
                      <span className={"material-symbols-outlined text-[14px]"}>
                        groups
                      </span>
                      Driver Network
                    </span>
                  </div>
                  <div>
                    <h2 className={"font-headline-md text-headline-md text-on-surface"}>
                      Map Jamaica Together
                    </h2>
                    <p className={"font-body-md text-body-md text-on-surface-variant mt-1"}>
                      Pin places you visit and help every driver on the island. Every single road pin is verified by our local team.
                    </p>
                  </div>
                  <div className={"bg-surface-container-lowest rounded-xl p-space-md shadow-sm flex flex-col gap-2.5"}>
                    <div className={"flex items-center gap-2"}>
                      <div className={"w-8 h-8 rounded-full bg-secondary-fixed flex items-center justify-center text-on-secondary-fixed"}>
                        <span className={"material-symbols-outlined text-[18px]"}>
                          add_location_alt
                        </span>
                      </div>
                      <div className={"flex-1 min-w-0"}>
                        <span className={"font-label-lg text-label-lg text-on-surface block truncate"}>
                          Spur Tree Hill Warning
                        </span>
                        <span className={"font-body-sm text-body-sm text-on-surface-variant"}>
                          Manchester / St. Elizabeth border
                        </span>
                      </div>
                      <span className={"px-2 py-0.5 rounded-full bg-surface-container text-on-surface-variant font-label-sm text-label-sm"}>
                        Verified
                      </span>
                    </div>
                    <div className={"p-2 rounded-lg bg-surface-container-low font-body-sm text-body-sm text-on-surface flex items-center gap-1.5"}>
                      <span className={"material-symbols-outlined text-[16px] text-primary"}>
                        warning
                      </span>
                      Oil slick reported near lookout curve — climb in low gear.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className={"grid grid-cols-4 gap-1.5 mt-space-sm mb-space-md"}>
            <button onClick={onPlugClick} className={"step-chip py-2 px-1 rounded-lg bg-primary text-on-primary text-center flex flex-col items-center gap-0.5 transition-all"} data-step={"0"} data-act={"fuel"} data-way-out={"primary"}>
              <span className={"material-symbols-outlined text-[18px]"}>
                local_gas_station
              </span>
              <span className={"font-label-sm text-label-sm truncate w-full"}>
                Fuel
              </span>
            </button>
            <button onClick={onPlugClick} className={"step-chip py-2 px-1 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface text-center flex flex-col items-center gap-0.5 transition-all"} data-step={"1"} data-act={"track"}>
              <span className={"material-symbols-outlined text-[18px]"}>
                speed
              </span>
              <span className={"font-label-sm text-label-sm truncate w-full"}>
                Track
              </span>
            </button>
            <button onClick={onPlugClick} className={"step-chip py-2 px-1 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface text-center flex flex-col items-center gap-0.5 transition-all"} data-step={"2"} data-act={"parts"}>
              <span className={"material-symbols-outlined text-[18px]"}>
                build
              </span>
              <span className={"font-label-sm text-label-sm truncate w-full"}>
                Parts
              </span>
            </button>
            <button onClick={onPlugClick} className={"step-chip py-2 px-1 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface text-center flex flex-col items-center gap-0.5 transition-all"} data-step={"3"} data-act={"map"}>
              <span className={"material-symbols-outlined text-[18px]"}>
                map
              </span>
              <span className={"font-label-sm text-label-sm truncate w-full"}>
                Map
              </span>
            </button>
          </div>
          <div className={"mt-auto flex flex-col gap-space-sm pt-space-xs"}>
            <div className={"flex items-center justify-center gap-2 py-1"}>
              <span className={"step-dot w-6 h-2 rounded-full bg-primary transition-all duration-300"} data-dot={"0"} />
              <span className={"step-dot w-2 h-2 rounded-full bg-surface-dim transition-all duration-300"} data-dot={"1"} />
              <span className={"step-dot w-2 h-2 rounded-full bg-surface-dim transition-all duration-300"} data-dot={"2"} />
              <span className={"step-dot w-2 h-2 rounded-full bg-surface-dim transition-all duration-300"} data-dot={"3"} />
            </div>
            <button onClick={onPlugClick} className={"w-full h-[52px] rounded-xl bg-primary text-on-primary font-headline-sm text-headline-sm flex items-center justify-center gap-2 shadow-md active:bg-primary-container transition-colors"} id={"nextBtn"} data-act={"nextBtn"} data-way-out={"primary"}>
              <span id={"btnLabel"}>
                Next
              </span>
              <span className={"material-symbols-outlined text-[20px]"} id={"btnIcon"}>
                arrow_forward
              </span>
            </button>
            <div className={"flex items-center justify-center gap-1.5 text-center text-on-surface-variant font-label-md text-label-md pt-1"}>
              <span className={"material-symbols-outlined text-[16px] text-tertiary"}>
                wifi_off
              </span>
              <span>
                Works offline • Syncs when connected
              </span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
