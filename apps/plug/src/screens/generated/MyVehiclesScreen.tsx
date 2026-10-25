import { useEffect, useRef } from 'react';
import { onPlugClick } from '../../shell/actions';
import { bindScreen } from '../../shell/bind';


export function MyVehiclesScreen() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (ref.current) bindScreen("29-my-vehicles.html", ref.current); }, []);
  return (
    <div ref={ref} data-plug-screen={"29-my-vehicles.html"} className={"bg-surface font-body-md text-on-surface min-h-screen flex flex-col antialiased selection:bg-primary/20 selection:text-primary"}>
      <header className={"fixed top-0 w-full z-50 bg-surface/85 backdrop-blur-xl shadow-[0_1px_8px_rgba(28,25,23,0.04)] pt-safe"}>
        <div className={"h-16 px-space-md flex items-center justify-between"}>
          <div className={"flex items-center gap-space-sm"}>
            <h1 className={"font-headline-md text-headline-md text-on-surface tracking-tight font-headline-md"}>
              My Vehicles
            </h1>
          </div>
          <div className={"flex items-center gap-space-xs"}>
            <button onClick={onPlugClick} aria-label={"Notifications"} className={"w-11 h-11 flex items-center justify-center rounded-full text-on-surface-variant hover:text-primary hover:bg-surface-container active:scale-95 transition-all"} data-act={"notifications"}>
              <span className={"material-symbols-outlined text-[24px]"}>
                notifications
              </span>
            </button>
            <button onClick={onPlugClick} aria-label={"Settings"} className={"w-11 h-11 flex items-center justify-center rounded-full text-on-surface-variant hover:text-primary hover:bg-surface-container active:scale-95 transition-all"} data-act={"settings"}>
              <span className={"material-symbols-outlined text-[24px]"}>
                settings
              </span>
            </button>
            <div className={"w-8 h-8 rounded-full bg-primary flex items-center justify-center ml-space-xs shadow-sm"}>
              <span className={"material-symbols-outlined text-on-primary text-[18px]"}>
                person
              </span>
            </div>
          </div>
        </div>
      </header>
      <main className={"flex-1 w-full bg-surface pt-16 pb-28"}>
        <div className={"flex flex-col w-full px-space-md pb-12 gap-space-lg"}>
          <div className={"flex items-center justify-between pt-space-xs"}>
            <div>
              <h2 className={"font-headline-md text-headline-md text-on-surface tracking-tight"}>
                My Garage
              </h2>
              <p className={"font-body-sm text-body-sm text-on-surface-variant flex items-center gap-1.5 mt-0.5"}>
                <span className={"w-2 h-2 rounded-full bg-primary inline-block animate-pulse"} />
                {"2 vehicles registered • St. Andrew & St. Catherine"}
              </p>
            </div>
            <div className={"flex items-center gap-1.5 px-space-sm py-1 rounded-full bg-surface-container text-on-surface-variant"}>
              <span className={"material-symbols-outlined text-[16px] text-primary"}>
                sync
              </span>
              <span className={"font-label-sm text-label-sm"}>
                Synced 10m ago
              </span>
            </div>
          </div>
          <div className={"w-full bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden flex flex-col"}>
            <div className={"relative w-full h-44 bg-surface-container-high overflow-hidden"}>
              <div className={"w-full h-full object-cover bg-surface-container flex items-center justify-center text-primary"} aria-hidden={"true"}><span className={"material-symbols-outlined text-[32px]"}>image</span></div>
              <div className={"absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent"} />
              <div className={"absolute top-space-sm left-space-sm right-space-sm flex items-center justify-between"}>
                <span className={"px-2.5 py-1 rounded-full bg-surface-container-lowest/90 backdrop-blur-md text-on-surface font-label-sm text-label-sm tracking-wider uppercase shadow-sm"}>
                  
                </span>
                <span className={"px-2.5 py-1 rounded-full bg-primary text-on-primary font-label-sm text-label-sm flex items-center gap-1 shadow-sm"}>
                  <span className={"material-symbols-outlined text-[14px]"}>
                    star
                  </span>
                  Add a car
                </span>
              </div>
              <div className={"absolute bottom-space-sm left-space-md right-space-md text-on-primary"}>
                <h3 className={"font-headline-sm text-headline-sm font-headline-lg tracking-tight leading-tight drop-shadow-sm"} data-slot={"car"}>
                  Add a car</h3>
                <p className={"font-body-sm text-body-sm text-on-primary/90"}>
                  1.0L Turbo GS • Auto CVT • Pearl White
                </p>
              </div>
            </div>
            <div className={"px-space-md py-2 bg-tertiary-fixed flex items-center justify-between"}>
              <div className={"flex items-center gap-1.5 text-on-tertiary-fixed"}>
                <span className={"material-symbols-outlined text-[18px]"}>
                  build_circle
                </span>
                <span className={"font-label-md text-label-md"}>
                  Service due soon • 380 km left
                </span>
              </div>
              <span className={"font-label-sm text-label-sm text-on-tertiary-fixed-variant uppercase tracking-wider"}>
                Oil Change
              </span>
            </div>
            <div className={"p-space-md flex flex-col gap-space-md"}>
              <div className={"grid grid-cols-3 gap-space-xs bg-surface-container-low p-space-sm rounded-lg"}>
                <div className={"flex flex-col items-center text-center p-1"}>
                  <span className={"font-label-sm text-label-sm text-on-surface-variant flex items-center gap-1"}>
                    <span className={"material-symbols-outlined text-[14px]"}>
                      speed
                    </span>
                    Odo
                  </span>
                  <span className={"font-label-lg text-label-lg text-on-surface mt-0.5"}>
                    
                  </span>
                  <span className={"font-label-sm text-label-sm text-on-surface-variant"}>
                    km
                  </span>
                </div>
                <div className={"flex flex-col items-center text-center p-1 bg-surface-container-lowest rounded shadow-xs"}>
                  <span className={"font-label-sm text-label-sm text-on-surface-variant flex items-center gap-1"}>
                    <span className={"material-symbols-outlined text-[14px] text-primary"}>
                      eco
                    </span>
                    Economy
                  </span>
                  <div className={"flex items-baseline gap-0.5 mt-0.5"}>
                    <span className={"font-label-lg text-label-lg text-on-surface"}>
                      14.2
                    </span>
                    <span className={"font-label-sm text-label-sm text-primary"}>
                      +0.8
                    </span>
                  </div>
                  <span className={"font-label-sm text-label-sm text-on-surface-variant"}>
                    km/L
                  </span>
                </div>
                <div className={"flex flex-col items-center text-center p-1"}>
                  <span className={"font-label-sm text-label-sm text-on-surface-variant flex items-center gap-1"}>
                    <span className={"material-symbols-outlined text-[14px]"}>
                      verified
                    </span>
                    Fitness
                  </span>
                  <span className={"font-label-lg text-label-lg text-secondary mt-0.5"}>
                    21 d
                  </span>
                  <span className={"font-label-sm text-label-sm text-secondary"}>
                    Renewal
                  </span>
                </div>
              </div>
              <div className={"grid grid-cols-2 gap-space-sm pt-1"}>
                <button onClick={onPlugClick} className={"h-12 w-full rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface font-label-lg text-label-lg flex items-center justify-center gap-1.5 active:scale-[0.98] transition-transform"} type={"button"} data-act={"overview"}>
                  <span>
                    Overview
                  </span>
                  <span className={"material-symbols-outlined text-[18px]"}>
                    chevron_right
                  </span>
                </button>
                <button onClick={onPlugClick} className={"h-12 w-full rounded-lg bg-primary hover:bg-secondary text-on-primary font-label-lg text-label-lg flex items-center justify-center gap-1.5 shadow-sm active:scale-[0.98] transition-transform"} type={"button"} data-act={"log-fuel"} data-way-out={"primary"}>
                  <span className={"material-symbols-outlined text-[18px]"}>
                    local_gas_station
                  </span>
                  <span>
                    Log Fuel
                  </span>
                </button>
              </div>
            </div>
          </div>
          <div className={"w-full bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden flex flex-col"}>
            <div className={"relative w-full h-44 bg-surface-container-high overflow-hidden"}>
              <div className={"w-full h-full object-cover bg-surface-container flex items-center justify-center text-primary"} aria-hidden={"true"}><span className={"material-symbols-outlined text-[32px]"}>image</span></div>
              <div className={"absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent"} />
              <div className={"absolute top-space-sm left-space-sm right-space-sm flex items-center justify-between"}>
                <span className={"px-2.5 py-1 rounded-full bg-surface-container-lowest/90 backdrop-blur-md text-on-surface font-label-sm text-label-sm tracking-wider uppercase shadow-sm"}>
                  🇯🇲 PA 4910
                </span>
                <span className={"px-2.5 py-1 rounded-full bg-surface-container-highest text-on-surface font-label-sm text-label-sm flex items-center gap-1 shadow-sm"}>
                  <span className={"material-symbols-outlined text-[14px]"}>
                    local_taxi
                  </span>
                  The Taxi Run
                </span>
              </div>
              <div className={"absolute bottom-space-sm left-space-md right-space-md text-on-primary"}>
                <h3 className={"font-headline-sm text-headline-sm font-headline-lg tracking-tight leading-tight drop-shadow-sm"}>
                  2016 Nissan AD Wagon
                </h3>
                <p className={"font-body-sm text-body-sm text-on-primary/90"}>
                  1.5L DX • 4-Speed Auto • Classic White
                </p>
              </div>
            </div>
            <div className={"px-space-md py-2 bg-error-container flex items-center justify-between"}>
              <div className={"flex items-center gap-1.5 text-on-error-container"}>
                <span className={"material-symbols-outlined text-[18px]"}>
                  warning
                </span>
                <span className={"font-label-md text-label-md font-label-md"}>
                  1 service overdue • Brake Fluid Flush
                </span>
              </div>
              <span className={"font-label-sm text-label-sm text-error uppercase font-label-sm tracking-wider"}>
                Action Req
              </span>
            </div>
            <div className={"p-space-md flex flex-col gap-space-md"}>
              <div className={"grid grid-cols-3 gap-space-xs bg-surface-container-low p-space-sm rounded-lg"}>
                <div className={"flex flex-col items-center text-center p-1"}>
                  <span className={"font-label-sm text-label-sm text-on-surface-variant flex items-center gap-1"}>
                    <span className={"material-symbols-outlined text-[14px]"}>
                      speed
                    </span>
                    Odo
                  </span>
                  <span className={"font-label-lg text-label-lg text-on-surface mt-0.5"}>
                    142,300
                  </span>
                  <span className={"font-label-sm text-label-sm text-on-surface-variant"}>
                    km
                  </span>
                </div>
                <div className={"flex flex-col items-center text-center p-1 bg-surface-container-lowest rounded shadow-xs"}>
                  <span className={"font-label-sm text-label-sm text-on-surface-variant flex items-center gap-1"}>
                    <span className={"material-symbols-outlined text-[14px] text-on-surface-variant"}>
                      eco
                    </span>
                    Economy
                  </span>
                  <div className={"flex items-baseline gap-0.5 mt-0.5"}>
                    <span className={"font-label-lg text-label-lg text-on-surface"}>
                      11.8
                    </span>
                  </div>
                  <span className={"font-label-sm text-label-sm text-on-surface-variant"}>
                    km/L
                  </span>
                </div>
                <div className={"flex flex-col items-center text-center p-1"}>
                  <span className={"font-label-sm text-label-sm text-on-surface-variant flex items-center gap-1"}>
                    <span className={"material-symbols-outlined text-[14px]"}>
                      security
                    </span>
                    Insurance
                  </span>
                  <span className={"font-label-lg text-label-lg text-on-surface mt-0.5"}>
                    45 d
                  </span>
                  <span className={"font-label-sm text-label-sm text-on-surface-variant"}>
                    Valid
                  </span>
                </div>
              </div>
              <div className={"grid grid-cols-2 gap-space-sm pt-1"}>
                <button onClick={onPlugClick} className={"h-12 w-full rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface font-label-lg text-label-lg flex items-center justify-center gap-1.5 active:scale-[0.98] transition-transform"} type={"button"} data-act={"overview-2"}>
                  <span>
                    Overview
                  </span>
                  <span className={"material-symbols-outlined text-[18px]"}>
                    chevron_right
                  </span>
                </button>
                <button onClick={onPlugClick} className={"h-12 w-full rounded-lg bg-primary hover:bg-secondary text-on-primary font-label-lg text-label-lg flex items-center justify-center gap-1.5 shadow-sm active:scale-[0.98] transition-transform"} type={"button"} data-act={"log-fuel-2"} data-way-out={"primary"}>
                  <span className={"material-symbols-outlined text-[18px]"}>
                    local_gas_station
                  </span>
                  <span>
                    Log Fuel
                  </span>
                </button>
              </div>
            </div>
          </div>
          <button onClick={onPlugClick} className={"w-full p-space-md rounded-xl bg-surface-container-low hover:bg-surface-container transition-all flex items-center gap-space-md text-left active:scale-[0.99]"} type={"button"} data-act={"add-vehicle-1-slot-free-track-jdm-imports-route-"}>
            <div className={"w-14 h-14 rounded-full bg-primary-fixed flex items-center justify-center text-primary flex-shrink-0 shadow-sm"}>
              <span className={"material-symbols-outlined text-[28px]"}>
                add_circle
              </span>
            </div>
            <div className={"flex-1 min-w-0"}>
              <div className={"flex items-center gap-2"}>
                <h4 className={"font-headline-sm text-headline-sm text-on-surface"}>
                  Add Vehicle
                </h4>
                <span className={"px-2 py-0.5 rounded-full bg-secondary-fixed text-on-secondary-fixed font-label-sm text-label-sm"}>
                  +1 Slot Free
                </span>
              </div>
              <p className={"font-body-sm text-body-sm text-on-surface-variant mt-0.5 truncate"}>
                Track JDM imports, route taxis, or family pickups across Jamaica
              </p>
            </div>
            <span className={"material-symbols-outlined text-on-surface-variant"}>
              arrow_forward_ios
            </span>
          </button>
          <div className={"w-full bg-surface-container-lowest rounded-xl p-space-md shadow-sm flex flex-col gap-space-md"}>
            <div className={"flex items-center justify-between"}>
              <div className={"flex items-center gap-2"}>
                <div className={"w-8 h-8 rounded-full bg-secondary-container/20 flex items-center justify-center text-secondary"}>
                  <span className={"material-symbols-outlined text-[20px]"}>
                    insights
                  </span>
                </div>
                <div>
                  <h4 className={"font-headline-sm text-headline-sm text-on-surface"}>
                    Garage Insights
                  </h4>
                  <p className={"font-body-sm text-body-sm text-on-surface-variant"}>
                    October • All 2 Vehicles Combined
                  </p>
                </div>
              </div>
              <span className={"font-label-sm text-label-sm px-2 py-1 rounded bg-surface-container text-on-surface-variant font-label-md"}>
                Kingston • St. Cath
              </span>
            </div>
            <div className={"grid grid-cols-2 gap-space-sm"}>
              <div className={"p-space-sm rounded-lg bg-surface-container-low flex flex-col justify-between"}>
                <div className={"flex items-center gap-1.5 text-on-surface-variant font-body-sm text-body-sm"}>
                  <span className={"material-symbols-outlined text-[16px] text-primary"}>
                    local_gas_station
                  </span>
                  <span>
                    Fuel Spend
                  </span>
                </div>
                <div className={"mt-2"}>
                  <p className={"font-price-display text-price-display text-on-surface tracking-tight"}>
                    J$ 28,450
                  </p>
                  <p className={"font-label-sm text-label-sm text-on-surface-variant"}>
                    184 Litres logged
                  </p>
                </div>
              </div>
              <div className={"p-space-sm rounded-lg bg-surface-container-low flex flex-col justify-between"}>
                <div className={"flex items-center gap-1.5 text-on-surface-variant font-body-sm text-body-sm"}>
                  <span className={"material-symbols-outlined text-[16px] text-tertiary"}>
                    alt_route
                  </span>
                  <span>
                    Distance Logged
                  </span>
                </div>
                <div className={"mt-2"}>
                  <p className={"font-price-display text-price-display text-on-surface tracking-tight"}>
                    2,140
                    <span className={"font-label-md text-label-md"}>
                      km
                    </span>
                  </p>
                  <p className={"font-label-sm text-label-sm text-primary"}>
                    +340 km vs Sept
                  </p>
                </div>
              </div>
            </div>
            <div className={"flex items-center gap-space-sm p-space-sm rounded-lg bg-primary-fixed/50 text-on-primary-fixed"}>
              <div className={"w-10 h-10 rounded-full bg-primary flex items-center justify-center text-on-primary flex-shrink-0 shadow-xs"}>
                <span className={"material-symbols-outlined text-[20px]"}>
                  savings
                </span>
              </div>
              <div className={"flex-1 min-w-0"}>
                <p className={"font-label-md text-label-md font-label-lg"}>
                  J$ 1,820 Parish Savings
                </p>
                <p className={"font-body-sm text-body-sm text-on-primary-fixed-variant leading-tight mt-0.5"}>
                  {"Saved this month by choosing lowest-rate stations along Constant Spring & Spanish Town Rd."}
                </p>
              </div>
            </div>
          </div>
          <div className={"p-space-md rounded-xl bg-surface-container flex items-start gap-space-sm"}>
            <span className={"material-symbols-outlined text-primary text-[22px] flex-shrink-0 mt-0.5"}>
              policy
            </span>
            <div className={"flex-1 min-w-0"}>
              <h5 className={"font-label-lg text-label-lg text-on-surface"}>
                Jamaica Road Code Reminders
              </h5>
              <p className={"font-body-sm text-body-sm text-on-surface-variant mt-0.5"}>
                {"Automated SMS & push reminders trigger 30, 14, and 3 days before your Fitness Certificate, Registration Disc, and Insurance policies expire at Island Traffic Authority depots."}
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
