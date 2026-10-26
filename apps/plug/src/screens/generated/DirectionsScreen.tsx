import { useEffect, useRef } from 'react';
import { onPlugClick } from '../../shell/actions';
import { bindScreen } from '../../shell/bind';


export function DirectionsScreen() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (ref.current) bindScreen("19b-directions.html", ref.current); }, []);
  return (
    <div ref={ref} data-plug-screen={"19b-directions.html"} className={"bg-background text-on-surface antialiased font-body-md selection:bg-primary-fixed selection:text-on-primary-fixed"}>
      <div className={"relative w-full max-w-md mx-auto min-h-screen bg-background overflow-x-hidden shadow-2xl flex flex-col pb-20"}>
        <header className={"bg-surface-container-lowest/90 backdrop-blur-md text-primary shadow-sm flex justify-between items-center w-full px-4 h-14 max-w-md mx-auto border-b border-outline-variant/30 sticky top-0 z-10"}>
          <div className={"flex items-center gap-2"}>
            <button onClick={onPlugClick} aria-label={"Go back"} className={"tap-target flex items-center justify-center text-on-surface hover:bg-surface-container-high/50 rounded-full transition-colors active:scale-95 duration-150"} data-act={"arrow-back"} data-way-out={"back"}>
              <span className={"material-symbols-outlined text-2xl"} data-icon={"arrow_back"}>
                arrow_back
              </span>
            </button>
            <h1 className={"text-headline-sm font-headline-sm text-primary tracking-tight"}>
              Station Details
            </h1>
          </div>
          <div className={"flex items-center gap-1"}>
            <button onClick={onPlugClick} aria-label={"Share station"} className={"tap-target flex items-center justify-center text-on-surface-variant hover:bg-surface-container-high/50 rounded-full transition-colors active:scale-95 duration-150"} data-act={"share"}>
              <span className={"material-symbols-outlined text-xl"} data-icon={"share"}>
                share
              </span>
            </button>
            <div className={"w-8 h-8 rounded-full bg-secondary-container flex items-center justify-center text-on-primary font-label-md ml-1 ring-2 ring-primary-fixed"}>
              <span>
                JA
              </span>
            </div>
          </div>
        </header>
        <main className={"flex-1 px-4 pt-3 space-y-4"}>
          <section className={"relative w-full rounded-xl overflow-hidden shadow-sm border border-outline-variant/40 bg-surface-container-lowest"}>
            <div className={"relative h-44 w-full"}>
              <div className={"w-full h-full object-cover bg-surface-container flex items-center justify-center text-primary"} aria-hidden={"true"}><span className={"material-symbols-outlined text-[32px]"}>image</span></div>
              <div className={"absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent"} />
              <div className={"absolute top-3 left-3 flex items-center gap-2"}>
                <span className={"inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-600 text-white font-label-sm tracking-wider uppercase shadow-sm"}>
                  <span className={"w-1.5 h-1.5 rounded-full bg-emerald-300 animate-pulse"} />
                  Pumps Active Now
                </span>
              </div>
              <div className={"hidden absolute -bottom-4 left-4 w-12 h-12 rounded-xl bg-surface-container-lowest p-1 shadow-md border border-outline-variant/40 flex items-center justify-center"} data-slot-row={"brand"} style={{ display: "none" }}>
                <div className={"w-full h-full rounded-lg bg-surface-container flex items-center justify-center text-on-surface font-black tracking-tighter text-xs"}>
                  <span data-slot={"brand"} />
                </div>
              </div>
            </div>
            <div className={"pt-6 pb-4 px-4"}>
              <div className={"flex items-center gap-2 flex-wrap mb-1"}>
                <h2 className={"text-headline-md font-headline-md text-on-background"} data-slot={"station-name"} />
                <span className={"hidden px-2 py-0.5 rounded bg-primary-fixed text-on-primary-fixed font-label-sm font-bold"} data-slot-row={"brand"} style={{ display: "none" }}>
                  <span data-slot={"brand"} />
                </span>
                <span className={"inline-flex items-center gap-0.5 text-emerald-700 font-label-sm font-semibold"}>
                  <span className={"material-symbols-outlined text-sm text-emerald-600"} data-icon={"verified"} style={{ fontVariationSettings: "'FILL' 1" }}>
                    verified
                  </span>
                  Verified
                </span>
              </div>
              <p className={"hidden text-body-sm font-body-sm text-on-surface-variant flex items-center gap-1"} data-slot-row={"address"} style={{ display: "none" }}>
                <span className={"material-symbols-outlined text-sm text-primary"} data-icon={"location_on"}>
                  location_on
                </span>
                <span data-slot={"address"} />
              </p>
              <div className={"grid grid-cols-2 gap-2 mt-4 pt-3 border-t border-outline-variant/30"}>
                <button onClick={onPlugClick} className={"tap-target w-full rounded-lg bg-primary-container text-on-primary-container font-label-lg flex items-center justify-center gap-2 shadow-sm ring-2 ring-primary"} data-act={"directions"} data-way-out={"primary"}>
                  <span className={"material-symbols-outlined text-lg"} data-icon={"directions"}>
                    directions
                  </span>
                  <span>
                    Directions
                  </span>
                </button>
                <button onClick={onPlugClick} className={"tap-target w-full rounded-lg bg-surface-container-high text-on-surface font-label-lg flex items-center justify-center gap-2 hover:bg-surface-container-highest transition-colors"} data-act={"log-fuel-here"}>
                  <span className={"material-symbols-outlined text-lg text-primary"} data-icon={"local_gas_station"}>
                    local_gas_station
                  </span>
                  <span>
                    Log Fuel Here
                  </span>
                </button>
              </div>
            </div>
          </section>
          <section className={"bg-surface-container-lowest rounded-xl p-4 border border-outline-variant/40 shadow-sm"}>
            <div className={"flex items-center justify-between mb-3"}>
              <div className={"flex items-center gap-1.5"}>
                <span className={"material-symbols-outlined text-primary text-xl"} data-icon={"payments"}>
                  payments
                </span>
                <h3 className={"text-headline-sm font-headline-sm text-on-surface"}>
                  Live Pump Rates
                </h3>
              </div>
              <span className={"hidden text-body-sm font-body-sm text-on-surface-variant"} data-slot-row={"price-updated"} style={{ display: "none" }}>
                <span data-slot={"price-updated"} />
              </span>
            </div>
            <div className={"grid grid-cols-3 gap-2"} data-slot={"prices"} />
          </section>
          <section className={"bg-surface-container-lowest rounded-xl p-4 border border-outline-variant/40 shadow-sm"} style={{ display: "none" }}>
            <h3 className={"text-headline-sm font-headline-sm text-on-surface mb-3"}>
              Station Amenities
            </h3>
            <div className={"grid grid-cols-2 gap-2.5"}>
              <div className={"flex items-center gap-2.5 p-2 rounded-lg bg-surface-container-low border border-outline-variant/30"}>
                <span className={"material-symbols-outlined text-primary text-xl"} data-icon={"mode_fan"}>
                  mode_fan
                </span>
                <div>
                  <p className={"font-label-md text-on-surface leading-tight"}>
                    Air Gauge / Pump
                  </p>
                  <p className={"text-body-sm text-emerald-700 font-medium"}>
                    Calibrated Free
                  </p>
                </div>
              </div>
              <div className={"flex items-center gap-2.5 p-2 rounded-lg bg-surface-container-low border border-outline-variant/30"}>
                <span className={"material-symbols-outlined text-primary text-xl"} data-icon={"wc"}>
                  wc
                </span>
                <div>
                  <p className={"font-label-md text-on-surface leading-tight"}>
                    Clean Restrooms
                  </p>
                  <p className={"text-body-sm text-on-surface-variant"}>
                     token fee
                  </p>
                </div>
              </div>
              <div className={"flex items-center gap-2.5 p-2 rounded-lg bg-surface-container-low border border-outline-variant/30"}>
                <span className={"material-symbols-outlined text-primary text-xl"} data-icon={"storefront"}>
                  storefront
                </span>
                <div>
                  <p className={"font-label-md text-on-surface leading-tight"}>
                    Ultra Shop
                  </p>
                  <p className={"text-body-sm text-on-surface-variant"}>
                    {"Snacks & Oils"}
                  </p>
                </div>
              </div>
              <div className={"flex items-center gap-2.5 p-2 rounded-lg bg-surface-container-low border border-outline-variant/30"}>
                <span className={"material-symbols-outlined text-primary text-xl"} data-icon={"atm"}>
                  atm
                </span>
                <div>
                  <p className={"font-label-md text-on-surface leading-tight"}>
                    24/7 Bank ATM
                  </p>
                  <p className={"text-body-sm text-emerald-700 font-medium"}>
                    NCB MultiLink
                  </p>
                </div>
              </div>
            </div>
          </section>
        </main>
        <div className={"fixed inset-0 max-w-md mx-auto bg-black/50 backdrop-blur-[2px] z-40 transition-opacity flex flex-col justify-end"}>
          <section className={"bg-surface-container-lowest rounded-t-[28px] border-t border-outline-variant/50 shadow-[0_-12px_32px_rgba(28,25,23,0.18)] px-5 pt-3 pb-6 flex flex-col space-y-4 animate-in slide-in-from-bottom duration-200"}>
            <div className={"w-12 h-1.5 bg-stone-300 rounded-full mx-auto my-1"} />
            <div className={"pt-1"}>
              <div className={"flex items-center justify-between"}>
                <h2 className={"text-headline-md font-headline-md text-stone-900 tracking-tight"}>
                  Get directions
                </h2>
              </div>
              <p className={"text-body-md font-body-md text-on-surface-variant mt-1 leading-snug"}>
                Choose navigation app for
                <span className={"font-semibold text-on-surface"} data-slot={"station-name"} />
              </p>
            </div>
            <div className={"space-y-3 pt-1"}>
              <a onClick={onPlugClick} className={"group block tap-target rounded-xl p-3.5 bg-surface-container-lowest border-2 border-primary/20 hover:border-primary/60 transition-all shadow-sm active:scale-[0.98] duration-150"} href={"#"} data-act={"google-maps-default-best-for-kingston-lane-guida"}>
                <div className={"flex items-center justify-between gap-3"}>
                  <div className={"w-12 h-12 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center shrink-0 shadow-sm group-hover:bg-blue-100 transition-colors"}>
                    <span className={"material-symbols-outlined text-2xl text-blue-600"} data-icon={"map"}>
                      map
                    </span>
                  </div>
                  <div className={"flex-1 min-w-0"}>
                    <div className={"flex items-center gap-2"}>
                      <span className={"font-headline-sm text-stone-900 leading-tight"}>
                        Google Maps
                      </span>
                      <span className={"bg-blue-100 text-blue-800 text-[12px] font-bold px-1.5 py-0.5 rounded"}>
                        Default
                      </span>
                    </div>
                    <p className={"text-body-sm font-body-sm text-stone-600 truncate mt-0.5"}>
                      {"Best for Kingston lane guidance & island-wide routes"}
                    </p>
                  </div>
                  <div className={"text-right shrink-0 flex items-center gap-1"}>
                    <span className={"material-symbols-outlined text-on-surface-variant text-lg"} data-icon={"chevron_right"}>
                      chevron_right
                    </span>
                  </div>
                </div>
              </a>
              <a onClick={onPlugClick} className={"group block tap-target rounded-xl p-3.5 bg-surface-container-lowest border border-outline-variant/60 hover:border-secondary transition-all shadow-sm active:scale-[0.98] duration-150"} href={"#"} data-act={"waze-alerts-real-time-jamaican-police-traps-poth"}>
                <div className={"flex items-center justify-between gap-3"}>
                  <div className={"w-12 h-12 rounded-xl bg-cyan-50 border border-cyan-200 flex items-center justify-center shrink-0 shadow-sm group-hover:bg-cyan-100 transition-colors"}>
                    <span className={"material-symbols-outlined text-2xl text-cyan-600"} data-icon={"alt_route"}>
                      alt_route
                    </span>
                  </div>
                  <div className={"flex-1 min-w-0"}>
                    <div className={"flex items-center gap-2"}>
                      <span className={"font-headline-sm text-stone-900 leading-tight"}>
                        Waze
                      </span>
                      <span className={"bg-amber-100 text-amber-900 text-[12px] font-bold px-1.5 py-0.5 rounded flex items-center gap-0.5"}>
                        <span className={"material-symbols-outlined text-[10px]"} data-icon={"warning"}>
                          warning
                        </span>
                        Alerts
                      </span>
                    </div>
                    <p className={"text-body-sm font-body-sm text-stone-600 truncate mt-0.5"}>
                      {"Real-time Jamaican police traps, potholes & hazards"}
                    </p>
                  </div>
                  <div className={"text-right shrink-0 flex items-center gap-1"}>
                    <span className={"material-symbols-outlined text-on-surface-variant text-lg"} data-icon={"chevron_right"}>
                      chevron_right
                    </span>
                  </div>
                </div>
              </a>
            </div>
            <div className={"pt-2"}>
              <button onClick={onPlugClick} className={"tap-target w-full rounded-xl bg-surface-container-high text-stone-800 font-headline-sm flex items-center justify-center hover:bg-surface-container-highest transition-colors active:scale-95 duration-150 shadow-sm"} data-act={"cancel"}>
                Cancel
              </button>
            </div>
          </section>
          <nav className={"bg-surface-container-lowest/95 backdrop-blur-md shadow-[0_-4px_16px_rgba(28,25,23,0.06)] flex justify-around items-center h-16 w-full max-w-md mx-auto px-2 pb-safe border-t border-outline-variant/30"}>
            <a onClick={onPlugClick} className={"flex flex-col items-center justify-center text-primary font-bold px-3 py-1.5 active:scale 0.96 transition-all duration-150"} href={"#"} data-act={"explore"}>
              <span className={"material-symbols-outlined text-2xl"} data-icon={"local_gas_station"} style={{ fontVariationSettings: "'FILL' 1" }}>
                local_gas_station
              </span>
              <span className={"text-label-sm font-label-sm"}>
                Explore
              </span>
            </a>
            <a onClick={onPlugClick} className={"flex flex-col items-center justify-center text-on-surface-variant px-3 py-1.5 hover:text-primary transition-colors active:scale 0.96 duration-150"} href={"#"} data-act={"routes"}>
              <span className={"material-symbols-outlined text-2xl"} data-icon={"alt_route"}>
                alt_route
              </span>
              <span className={"text-label-sm font-label-sm"}>
                Routes
              </span>
            </a>
            <a onClick={onPlugClick} className={"flex flex-col items-center justify-center -mt-4 text-primary px-2 active:scale 0.96 transition-all duration-150 group"} href={"#"} data-act={"log-fuel"}>
              <div className={"w-12 h-12 rounded-full bg-gradient-to-tr from-primary to-secondary-container text-white flex items-center justify-center shadow-lg group-hover:shadow-primary/30 transition-all"}>
                <span className={"material-symbols-outlined text-2xl"} data-icon={"add_circle"} style={{ fontVariationSettings: "'FILL' 1" }}>
                  add_circle
                </span>
              </div>
              <span className={"text-label-sm font-label-sm font-bold text-primary mt-0.5"}>
                Log Fuel
              </span>
            </a>
            <a onClick={onPlugClick} className={"flex flex-col items-center justify-center text-on-surface-variant px-3 py-1.5 hover:text-primary transition-colors active:scale 0.96 duration-150"} href={"#"} data-act={"alerts"}>
              <span className={"material-symbols-outlined text-2xl"} data-icon={"warning"}>
                warning
              </span>
              <span className={"text-label-sm font-label-sm"}>
                Alerts
              </span>
            </a>
            <a onClick={onPlugClick} className={"flex flex-col items-center justify-center text-on-surface-variant px-3 py-1.5 hover:text-primary transition-colors active:scale 0.96 duration-150"} href={"#"} data-act={"garage"}>
              <span className={"material-symbols-outlined text-2xl"} data-icon={"directions_car"}>
                directions_car
              </span>
              <span className={"text-label-sm font-label-sm"}>
                Garage
              </span>
            </a>
          </nav>
        </div>
      </div>
    </div>
  );
}
