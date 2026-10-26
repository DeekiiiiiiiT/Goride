import { useEffect, useRef } from 'react';
import { onPlugClick } from '../../shell/actions';
import { bindScreen } from '../../shell/bind';


export function MaintenanceScheduleScreen() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (ref.current) bindScreen("31-maintenance-schedule.html", ref.current); }, []);
  return (
    <div ref={ref} data-plug-screen={"31-maintenance-schedule.html"} className={"bg-surface font-body-md text-on-surface flex flex-col min-h-screen"}>
      <header className={"fixed top-0 w-full z-50 pt-safe bg-surface/80 backdrop-blur-xl shadow-[0_1px_8px_rgba(0,0,0,0.04)]"}>
        <div className={"h-16 px-gutter flex items-center justify-between gap-space-sm"}>
          <div className={"flex items-center gap-space-sm min-w-0"}>
            <button onClick={onPlugClick} aria-label={"Go back"} className={"w-12 h-12 rounded-full flex items-center justify-center text-on-surface hover:bg-surface-container-high transition-colors active:scale-95"} data-act={"arrow-back"} data-way-out={"back"}>
              <span className={"material-symbols-outlined text-[24px]"}>
                arrow_back
              </span>
            </button>
            <div className={"flex flex-col min-w-0"}>
              <h1 className={"font-headline-sm text-headline-sm text-on-surface truncate"}>
                Maintenance Schedule
              </h1>
              <span className={"font-label-md text-label-md text-on-surface-variant truncate"} data-slot={"car"}>
                Add a car</span>
            </div>
          </div>
          <div className={"flex items-center gap-space-xs"}>
            <div className={"w-8 h-8 rounded-full bg-primary flex items-center justify-center"}>
              <span className={"material-symbols-outlined text-on-primary text-[18px]"}>
                person
              </span>
            </div>
          </div>
        </div>
      </header>
      <main className={"flex-1 flex flex-col relative w-full px-gutter pt-16 pb-safe bg-surface"}>
        <div className={"flex flex-col w-full pb-24"}>
          <section className={"bg-surface-container rounded-xl p-space-md shadow-sm mb-space-md"}>
            <div className={"flex items-start justify-between gap-space-sm mb-space-sm"}>
              <div className={"flex flex-col min-w-0"}>
                <div className={"flex items-center gap-space-xs"}>
                  <span className={"font-headline-sm text-headline-sm text-on-surface truncate"} data-slot={"car"}>
                    Add a car</span>
                  <span className={"material-symbols-outlined text-primary text-[20px]"} style={{ fontVariationSettings: "'FILL' 1" }}>
                    verified
                  </span>
                </div>
                <div className={"flex items-center gap-space-xs mt-space-xs"}>
                  <span className={"bg-surface-container-highest text-on-surface-variant font-label-md text-label-md px-space-sm py-0.5 rounded flex items-center gap-1 shadow-sm"}>
                    <span>
                      🔒
                    </span>
                    <span className={"tracking-wider"}>
                      
                    </span>
                  </span>
                  <span className={"font-label-md text-label-md text-on-surface-variant"}>
                    • 
                  </span>
                </div>
              </div>
              <div className={"w-12 h-12 rounded-lg bg-surface-container-highest overflow-hidden flex-shrink-0 shadow-sm"}>
                <div className={"w-full h-full object-cover bg-surface-container flex items-center justify-center text-primary"} aria-hidden={"true"}><span className={"material-symbols-outlined text-[32px]"}>image</span></div>
              </div>
            </div>
            <div className={"bg-surface-container-lowest rounded-lg p-space-sm flex items-center gap-space-xs shadow-sm"}>
              <span className={"material-symbols-outlined text-secondary text-[18px] flex-shrink-0"}>
                info
              </span>
              <p className={"font-body-sm text-body-sm text-on-surface-variant leading-tight"}>
                General schedule — your exact car's schedule is coming
              </p>
            </div>
          </section>
          <section className={"bg-surface-container-low rounded-xl p-space-md shadow-sm mb-space-lg"}>
            <div className={"flex items-center gap-space-sm"}>
              <div className={"w-10 h-10 rounded-full bg-secondary-container/20 flex items-center justify-center flex-shrink-0"}>
                <span className={"material-symbols-outlined text-secondary text-[22px]"}>
                  commute
                </span>
              </div>
              <div className={"flex flex-col min-w-0 flex-1"}>
                <div className={"flex items-center justify-between"}>
                  <span className={"font-label-sm text-label-sm uppercase tracking-wider text-secondary"}>
                    Telemetry Sync
                  </span>
                  <span className={"font-label-sm text-label-sm text-on-surface-variant flex items-center gap-1"}>
                    <span className={"w-2 h-2 rounded-full bg-tertiary"} />
                    Moderate Wear
                  </span>
                </div>
                <p className={"font-label-lg text-label-lg text-on-surface truncate"}>
                  <span className={"font-body-sm text-body-sm text-on-surface-variant"}>
                    
                  </span>
                </p>
              </div>
            </div>
          </section>
          <section className={"mb-space-lg"}>
            <div className={"bg-surface-container-lowest rounded-xl p-space-sm px-space-md flex items-center justify-between shadow-sm"}>
              <div className={"flex items-center gap-space-sm"}>
                <span className={"material-symbols-outlined text-tertiary text-[20px]"} style={{ fontVariationSettings: "'FILL' 1" }}>
                  check_circle
                </span>
                <span className={"font-label-lg text-label-lg text-on-surface"}>
                  No Overdue Items
                </span>
              </div>
              <span className={"bg-surface-container-high text-on-surface-variant font-label-sm text-label-sm px-space-sm py-0.5 rounded-full"}>
                OVERDUE (0)
              </span>
            </div>
          </section>
          <section className={"mb-space-lg"}>
            <div className={"flex items-center justify-between mb-space-sm px-space-xs"}>
              <div className={"flex items-center gap-space-xs"}>
                <span className={"w-2.5 h-2.5 rounded-full bg-secondary-container animate-pulse"} />
                <h2 className={"font-headline-sm text-headline-sm text-on-surface"}>
                  DUE SOON
                </h2>
              </div>
              <span className={"bg-secondary-container text-on-secondary font-label-sm text-label-sm px-space-sm py-0.5 rounded-full"}>
                1 ACTION
              </span>
            </div>
            <div className={"bg-surface-container-lowest rounded-xl p-space-md shadow-md transition-all active:scale-[0.99] cursor-pointer"}>
              <div className={"flex items-start justify-between gap-space-sm mb-space-xs"}>
                <div className={"flex items-center gap-space-sm"}>
                  <div className={"w-10 h-10 rounded-lg bg-secondary-container/15 flex items-center justify-center flex-shrink-0 text-secondary"}>
                    <span className={"material-symbols-outlined text-[24px]"}>
                      oil_barrel
                    </span>
                  </div>
                  <div className={"flex flex-col"}>
                    <span className={"font-headline-sm text-headline-sm text-on-surface"}>
                      {"Engine Oil & Filter Service"}
                    </span>
                    <span className={"font-body-sm text-body-sm text-on-surface-variant"}>
                      Every  or 6 months
                    </span>
                  </div>
                </div>
                <span className={"material-symbols-outlined text-outline text-[22px]"}>
                  chevron_right
                </span>
              </div>
              <div className={"bg-surface-container-low rounded-lg p-space-sm my-space-sm"}>
                <div className={"flex items-center justify-between mb-space-xs"}>
                  <span className={"font-label-md text-label-md text-secondary font-semibold"}>
                    Due at 
                  </span>
                  <span className={"font-label-md text-label-md text-secondary font-bold"}>
                    left (8 days)
                  </span>
                </div>
                <div className={"w-full bg-surface-container-highest h-2.5 rounded-full overflow-hidden"}>
                  <div className={"bg-secondary-container h-full rounded-full"} style={{ width: "92%" }} />
                </div>
                <div className={"flex justify-between items-center mt-1 text-[12px] font-label-sm text-on-surface-variant"}>
                  <span>
                    
                  </span>
                  <span>
                    
                  </span>
                </div>
              </div>
              <div className={"flex items-center gap-space-xs pt-space-xs"}>
                <span className={"material-symbols-outlined text-tertiary text-[16px]"}>
                  tune
                </span>
                <p className={"font-body-sm text-body-sm text-on-surface-variant"}>
                  Spec:
                  <span className={"font-semibold text-on-surface"}>
                    0W-20 / 5W-30 Synthetic
                  </span>
                  (Idemitsu / Castrol)
                </p>
              </div>
            </div>
          </section>
          <section className={"mb-space-lg"}>
            <div className={"flex items-center justify-between mb-space-sm px-space-xs"}>
              <h2 className={"font-headline-sm text-headline-sm text-on-surface"}>
                UPCOMING
              </h2>
              <span className={"bg-surface-container-high text-on-surface-variant font-label-sm text-label-sm px-space-sm py-0.5 rounded-full"}>
                4 ITEMS
              </span>
            </div>
            <div className={"flex flex-col gap-space-sm"}>
              <div className={"bg-surface-container-lowest rounded-xl p-space-md shadow-sm"}>
                <div className={"flex items-start justify-between gap-space-sm"}>
                  <div className={"flex items-center gap-space-sm"}>
                    <div className={"w-9 h-9 rounded-lg bg-surface-container flex items-center justify-center flex-shrink-0 text-on-surface-variant"}>
                      <span className={"material-symbols-outlined text-[20px]"}>
                        disc_full
                      </span>
                    </div>
                    <div className={"flex flex-col"}>
                      <span className={"font-label-lg text-label-lg text-on-surface"}>
                        {"Front Brake Pads & Rotors"}
                      </span>
                      <span className={"font-body-sm text-body-sm text-on-surface-variant"}>
                        Every 
                      </span>
                    </div>
                  </div>
                  <span className={"font-label-md text-label-md text-on-surface-variant font-medium"}>
                     left
                  </span>
                </div>
                <div className={"mt-space-sm"}>
                  <div className={"w-full bg-surface-container h-1.5 rounded-full overflow-hidden"}>
                    <div className={"bg-outline h-full rounded-full"} style={{ width: "65%" }} />
                  </div>
                  <div className={"flex justify-between items-center mt-1"}>
                    <span className={"font-body-sm text-body-sm text-on-surface-variant"}>
                      Due at 
                    </span>
                    <span className={"font-label-sm text-label-sm text-on-surface-variant"}>
                      3.5 months
                    </span>
                  </div>
                </div>
              </div>
              <div className={"bg-surface-container-lowest rounded-xl p-space-md shadow-sm"}>
                <div className={"flex items-start justify-between gap-space-sm"}>
                  <div className={"flex items-center gap-space-sm"}>
                    <div className={"w-9 h-9 rounded-lg bg-surface-container flex items-center justify-center flex-shrink-0 text-on-surface-variant"}>
                      <span className={"material-symbols-outlined text-[20px]"}>
                        air
                      </span>
                    </div>
                    <div className={"flex flex-col"}>
                      <span className={"font-label-lg text-label-lg text-on-surface"}>
                        {"Air Filter & Cabin AC Filter"}
                      </span>
                      <span className={"font-body-sm text-body-sm text-on-surface-variant"}>
                        Every 
                      </span>
                    </div>
                  </div>
                  <span className={"font-label-md text-label-md text-on-surface-variant font-medium"}>
                     left
                  </span>
                </div>
                <div className={"mt-space-sm"}>
                  <div className={"w-full bg-surface-container h-1.5 rounded-full overflow-hidden"}>
                    <div className={"bg-outline h-full rounded-full"} style={{ width: "31%" }} />
                  </div>
                  <div className={"flex justify-between items-center mt-1"}>
                    <span className={"font-body-sm text-body-sm text-on-surface-variant"}>
                      Due at 
                    </span>
                    <span className={"font-label-sm text-label-sm text-on-surface-variant"}>
                      7 months
                    </span>
                  </div>
                </div>
              </div>
              <div className={"bg-surface-container-lowest rounded-xl p-space-md shadow-sm"}>
                <div className={"flex items-start justify-between gap-space-sm"}>
                  <div className={"flex items-center gap-space-sm"}>
                    <div className={"w-9 h-9 rounded-lg bg-surface-container flex items-center justify-center flex-shrink-0 text-on-surface-variant"}>
                      <span className={"material-symbols-outlined text-[20px]"}>
                        settings_input_component
                      </span>
                    </div>
                    <div className={"flex flex-col"}>
                      <span className={"font-label-lg text-label-lg text-on-surface"}>
                        CVT Transmission Fluid (TC/FE)
                      </span>
                      <span className={"font-body-sm text-body-sm text-on-surface-variant"}>
                        Every 
                      </span>
                    </div>
                  </div>
                  <span className={"font-label-md text-label-md text-on-surface-variant font-medium"}>
                     left
                  </span>
                </div>
                <div className={"mt-space-sm"}>
                  <div className={"w-full bg-surface-container h-1.5 rounded-full overflow-hidden"}>
                    <div className={"bg-outline h-full rounded-full"} style={{ width: "20%" }} />
                  </div>
                  <div className={"flex justify-between items-center mt-1"}>
                    <span className={"font-body-sm text-body-sm text-on-surface-variant"}>
                      Due at 
                    </span>
                    <span className={"font-label-sm text-label-sm text-on-surface-variant"}>
                      11 months
                    </span>
                  </div>
                </div>
              </div>
              <div className={"bg-surface-container-lowest rounded-xl p-space-md shadow-sm"}>
                <div className={"flex items-start justify-between gap-space-sm"}>
                  <div className={"flex items-center gap-space-sm"}>
                    <div className={"w-9 h-9 rounded-lg bg-surface-container flex items-center justify-center flex-shrink-0 text-on-surface-variant"}>
                      <span className={"material-symbols-outlined text-[20px]"}>
                        bolt
                      </span>
                    </div>
                    <div className={"flex flex-col"}>
                      <span className={"font-label-lg text-label-lg text-on-surface"}>
                        Spark Plugs (Iridium)
                      </span>
                      <span className={"font-body-sm text-body-sm text-on-surface-variant"}>
                        Every 
                      </span>
                    </div>
                  </div>
                  <span className={"font-label-md text-label-md text-on-surface-variant font-medium"}>
                     left
                  </span>
                </div>
                <div className={"mt-space-sm"}>
                  <div className={"w-full bg-surface-container h-1.5 rounded-full overflow-hidden"}>
                    <div className={"bg-outline h-full rounded-full"} style={{ width: "10%" }} />
                  </div>
                  <div className={"flex justify-between items-center mt-1"}>
                    <span className={"font-body-sm text-body-sm text-on-surface-variant"}>
                      Due at 
                    </span>
                    <span className={"font-label-sm text-label-sm text-on-surface-variant"}>
                      2 years
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </section>
          <section className={"mb-space-xl"}>
            <div className={"flex items-center justify-between mb-space-sm px-space-xs"}>
              <h2 className={"font-headline-sm text-headline-sm text-on-surface"}>
                DONE RECENTLY
              </h2>
              <span className={"bg-surface-container-high text-on-surface-variant font-label-sm text-label-sm px-space-sm py-0.5 rounded-full"}>
                2 LOGGED
              </span>
            </div>
            <div className={"flex flex-col gap-space-sm"}>
              <div className={"bg-surface-container-lowest rounded-xl p-space-md shadow-sm"}>
                <div className={"flex items-start gap-space-sm"}>
                  <div className={"w-8 h-8 rounded-full bg-tertiary-fixed flex items-center justify-center flex-shrink-0 text-on-tertiary-fixed"}>
                    <span className={"material-symbols-outlined text-[18px]"}>
                      check
                    </span>
                  </div>
                  <div className={"flex flex-col flex-1 min-w-0"}>
                    <div className={"flex items-center justify-between"}>
                      <span className={"font-label-lg text-label-lg text-on-surface truncate"}>
                        {"Tyre Rotation & Balancing"}
                      </span>
                      <span className={"font-label-sm text-label-sm text-on-surface-variant"}>
                        
                      </span>
                    </div>
                    <p className={"font-body-sm text-body-sm text-on-surface-variant mt-0.5"}>
                      
                    </p>
                  </div>
                </div>
              </div>
              <div className={"bg-surface-container-lowest rounded-xl p-space-md shadow-sm"}>
                <div className={"flex items-start gap-space-sm"}>
                  <div className={"w-8 h-8 rounded-full bg-tertiary-fixed flex items-center justify-center flex-shrink-0 text-on-tertiary-fixed"}>
                    <span className={"material-symbols-outlined text-[18px]"}>
                      check
                    </span>
                  </div>
                  <div className={"flex flex-col flex-1 min-w-0"}>
                    <div className={"flex items-center justify-between"}>
                      <span className={"font-label-lg text-label-lg text-on-surface truncate"}>
                        {"Coolant Flush & Top-up"}
                      </span>
                      <span className={"font-label-sm text-label-sm text-on-surface-variant"}>
                        
                      </span>
                    </div>
                    <p className={"font-body-sm text-body-sm text-on-surface-variant mt-0.5"}>
                      
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>
          <div className={"fixed bottom-0 left-0 right-0 p-space-md bg-surface/90 backdrop-blur-xl shadow-lg flex flex-col gap-space-xs z-40 max-w-md mx-auto"}>
            <button onClick={onPlugClick} className={"w-full h-12 bg-primary hover:bg-primary-container active:scale-[0.98] transition-all rounded-lg text-on-primary font-label-lg text-label-lg flex items-center justify-center gap-space-xs shadow-md"} type={"button"} data-act={"log-a-service"} data-way-out={"primary"}>
              <span className={"material-symbols-outlined text-[20px]"}>
                add_circle
              </span>
              <span>
                Log a Service
              </span>
            </button>
            <button onClick={onPlugClick} className={"w-full py-1 text-center font-label-md text-label-md text-secondary hover:text-primary transition-colors flex items-center justify-center gap-1"} type={"button"} data-act={"view-history-pdf-export"}>
              <span className={"material-symbols-outlined text-[16px]"}>
                picture_as_pdf
              </span>
              <span>
                View History (PDF Export)
              </span>
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
