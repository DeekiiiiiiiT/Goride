import { useEffect, useRef } from 'react';
import { onPlugClick } from '../../shell/actions';
import { bindScreen } from '../../shell/bind';


export function VehicleOverviewScreen() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (ref.current) bindScreen("30-vehicle-overview.html", ref.current); }, []);
  return (
    <div ref={ref} data-plug-screen={"30-vehicle-overview.html"} className={"bg-surface font-body-md text-on-surface min-h-screen flex flex-col antialiased selection:bg-primary/20 selection:text-primary"}>
      <header className={"fixed top-0 w-full z-50 bg-surface/85 backdrop-blur-xl shadow-[0_1px_8px_rgba(28,25,23,0.04)] pt-safe"}>
        <div className={"h-16 px-space-sm flex items-center justify-between"}>
          <div className={"flex items-center gap-space-xs"}>
            <button onClick={onPlugClick} aria-label={"Go Back to My Garage"} className={"w-11 h-11 flex items-center justify-center rounded-full text-on-surface hover:text-primary hover:bg-surface-container active:scale-95 transition-all"} data-act={"arrow-back"} data-way-out={"back"}>
              <span className={"material-symbols-outlined text-[24px]"}>
                arrow_back
              </span>
            </button>
            <h1 className={"font-headline-md text-headline-md text-on-surface tracking-tight font-headline-md"}>
              Vehicle Overview
            </h1>
          </div>
          <div className={"flex items-center gap-space-xs"}>
            <button onClick={onPlugClick} aria-label={"Share Vehicle"} className={"w-11 h-11 flex items-center justify-center rounded-full text-on-surface-variant hover:text-primary hover:bg-surface-container active:scale-95 transition-all"} data-act={"share"}>
              <span className={"material-symbols-outlined text-[22px]"}>
                share
              </span>
            </button>
            <button onClick={onPlugClick} aria-label={"More Options"} className={"w-11 h-11 flex items-center justify-center rounded-full text-on-surface-variant hover:text-primary hover:bg-surface-container active:scale-95 transition-all"} data-act={"more-vert"}>
              <span className={"material-symbols-outlined text-[22px]"}>
                more_vert
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
      <main className={"flex-1 w-full bg-surface pt-16 pb-safe"}>
        <div className={"flex flex-col w-full px-margin pb-space-xl gap-space-lg"}>
          <section className={"w-full bg-surface-container-lowest rounded-xl p-space-md shadow-sm relative overflow-hidden flex flex-col gap-space-md"}>
            <div className={"absolute -right-16 -top-16 w-44 h-44 rounded-full bg-secondary-container/10 pointer-events-none blur-2xl"} />
            <div className={"flex items-start justify-between gap-space-sm relative z-10"}>
              <div className={"flex flex-col min-w-0"}>
                <div className={"flex items-center gap-space-xs mb-1"}>
                  <span className={"inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface-container text-on-surface-variant font-label-sm text-label-sm"}>
                    <span className={"material-symbols-outlined text-[13px] text-tertiary"}>
                      lock
                    </span>
                    
                  </span>
                  <span className={"text-on-surface-variant font-label-sm text-label-sm tracking-tight opacity-75"}>
                    Private
                  </span>
                </div>
                <h2 className={"font-headline-md text-headline-md text-on-surface truncate"} data-slot={"car"}>
                  Add a car</h2>
                <p className={"font-label-lg text-label-lg text-primary font-semibold"}>
                  Add a car
                </p>
              </div>
              <div className={"flex flex-col items-end shrink-0"}>
                <button onClick={onPlugClick} aria-controls={"schedule-tooltip"} aria-expanded={"false"} className={"flex items-center gap-1 bg-surface-container-high px-2.5 py-1.5 rounded-full text-on-surface hover:bg-surface-variant transition-colors"} id={"schedule-pill-btn"} data-act={"schedule-pill-btn"}>
                  <span className={"material-symbols-outlined text-primary text-[15px]"}>
                    event_repeat
                  </span>
                  <span className={"font-label-sm text-label-sm"}>
                    General Schedule
                  </span>
                  <span className={"material-symbols-outlined text-[14px] text-on-surface-variant"}>
                    info
                  </span>
                </button>
              </div>
            </div>
            <div className={"hidden bg-surface-container-high text-on-surface p-space-sm rounded-lg text-body-sm font-body-sm animate-fade-in"} id={"schedule-tooltip"}>
              <div className={"flex items-start gap-space-xs"}>
                <span className={"material-symbols-outlined text-primary text-[16px] shrink-0 mt-0.5"}>
                  verified
                </span>
                <p className={"text-on-surface-variant leading-tight"}>
                  {"General baseline schedule — model-specific Jamaican tropical driving schedule syncing (Montego Bay & Kingston commuter adjusted)."}
                </p>
              </div>
            </div>
            <div className={"relative w-full rounded-lg overflow-hidden bg-surface-container flex flex-col"}>
              <div className={"w-full h-44 relative bg-surface-container-high"}>
                <div className={"absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent"} />
                <div className={"absolute bottom-3 left-3 right-3 flex items-center justify-between"}>
                  <span className={"inline-flex items-center gap-1.5 bg-black/60 backdrop-blur-md px-2.5 py-1 rounded-full text-white font-label-md text-label-md"}>
                    <span className={"w-2 h-2 rounded-full bg-emerald-500 animate-pulse"} />
                    1KR-FE Turbo
                  </span>
                  <span className={"bg-primary-container text-on-primary-container font-label-sm text-label-sm px-2.5 py-1 rounded-full uppercase tracking-wider font-bold"}>
                    GS Grade
                  </span>
                </div>
              </div>
              <div className={"px-space-md py-2.5 bg-surface-container-high flex items-center justify-between text-on-surface-variant font-label-md text-label-md"}>
                <div className={"flex items-center gap-1.5"}>
                  <span className={"material-symbols-outlined text-[16px]"}>
                    tune
                  </span>
                  <span>
                    1.0L Turbo GS (1KR-FE)
                  </span>
                </div>
                <span className={"text-outline"}>
                  •
                </span>
                <div className={"flex items-center gap-1.5"}>
                  <span className={"material-symbols-outlined text-[16px]"}>
                    settings_input_component
                  </span>
                  <span>
                    FWD CVT
                  </span>
                </div>
              </div>
            </div>
          </section>
          <nav aria-label={"Vehicle Sections"} className={"w-full bg-surface-container-low p-1 rounded-xl flex items-center gap-1 shadow-sm"}>
            <button onClick={onPlugClick} className={"flex-1 py-2 rounded-lg bg-surface-container-lowest text-primary font-label-lg text-label-lg font-bold shadow-sm flex items-center justify-center gap-1.5 transition-all"} data-act={"overview"}>
              <span className={"material-symbols-outlined text-[18px]"}>
                dashboard
              </span>
              <span>
                Overview
              </span>
            </button>
            <button onClick={onPlugClick} className={"flex-1 py-2 rounded-lg text-on-surface-variant hover:text-on-surface font-label-lg text-label-lg flex items-center justify-center gap-1.5 transition-all"} data-act={"service"}>
              <span className={"material-symbols-outlined text-[18px]"}>
                build
              </span>
              <span>
                Service
              </span>
            </button>
            <button onClick={onPlugClick} className={"flex-1 py-2 rounded-lg text-on-surface-variant hover:text-on-surface font-label-lg text-label-lg flex items-center justify-center gap-1.5 transition-all"} data-act={"fuel"}>
              <span className={"material-symbols-outlined text-[18px]"}>
                local_gas_station
              </span>
              <span>
                Fuel
              </span>
            </button>
            <button onClick={onPlugClick} className={"flex-1 py-2 rounded-lg text-on-surface-variant hover:text-on-surface font-label-lg text-label-lg flex items-center justify-center gap-1.5 transition-all"} data-act={"docs"}>
              <span className={"material-symbols-outlined text-[18px]"}>
                folder_shared
              </span>
              <span>
                Docs
              </span>
            </button>
          </nav>
          <section aria-label={"Key Vehicle Statistics"} className={"grid grid-cols-2 gap-space-sm w-full"}>
            <div className={"bg-surface-container-lowest p-space-md rounded-xl shadow-sm flex flex-col justify-between gap-1"}>
              <div className={"flex items-center justify-between text-on-surface-variant"}>
                <span className={"font-label-sm text-label-sm uppercase tracking-wider font-semibold"}>
                  Odometer
                </span>
                <span className={"material-symbols-outlined text-primary text-[18px]"}>
                  speed
                </span>
              </div>
              <div className={"mt-1"}>
                <p className={"font-headline-sm text-headline-sm text-on-surface font-bold tracking-tight"}>
                  
                  <span className={"font-label-md text-label-md font-normal text-on-surface-variant"}>
                    km
                  </span>
                </p>
                <p className={"font-body-sm text-body-sm text-on-surface-variant flex items-center gap-1 mt-0.5"}>
                  <span className={"w-1.5 h-1.5 rounded-full bg-emerald-500"} />
                  Updated today
                </p>
              </div>
            </div>
            <div className={"bg-surface-container-lowest p-space-md rounded-xl shadow-sm flex flex-col justify-between gap-1"}>
              <div className={"flex items-center justify-between text-on-surface-variant"}>
                <span className={"font-label-sm text-label-sm uppercase tracking-wider font-semibold"}>
                  Avg Usage
                </span>
                <span className={"material-symbols-outlined text-secondary text-[18px]"}>
                  commute
                </span>
              </div>
              <div className={"mt-1"}>
                <p className={"font-body-md text-on-surface"}>
                  No fills yet
                </p>
              </div>
            </div>
            <div className={"bg-surface-container-lowest p-space-md rounded-xl shadow-sm flex flex-col justify-between gap-1"}>
              <div className={"flex items-center justify-between text-on-surface-variant"}>
                <span className={"font-label-sm text-label-sm uppercase tracking-wider font-semibold"}>
                  Avg Economy
                </span>
                <span className={"material-symbols-outlined text-tertiary text-[18px]"}>
                  eco
                </span>
              </div>
              <div className={"mt-1"}>
                <p className={"font-body-md text-on-surface"}>
                  No fills yet
                </p>
              </div>
            </div>
            <div className={"bg-surface-container-lowest p-space-md rounded-xl shadow-sm flex flex-col justify-between gap-1"}>
              <div className={"flex items-center justify-between text-on-surface-variant"}>
                <span className={"font-label-sm text-label-sm uppercase tracking-wider font-semibold"}>
                  Spend (Oct)
                </span>
                <span className={"material-symbols-outlined text-primary text-[18px]"}>
                  payments
                </span>
              </div>
              <div className={"mt-1"}>
                <p className={"font-headline-sm text-headline-sm text-primary font-bold tracking-tight"}>
                  No fills yet
                </p>
                <p className={"font-body-sm text-body-sm text-on-surface-variant mt-0.5"}>
                  3 fill-ups recorded
                </p>
              </div>
            </div>
          </section>
          <section aria-label={"Vehicle Quick Actions"} className={"grid grid-cols-3 gap-space-xs w-full"}>
            <button onClick={onPlugClick} className={"h-14 bg-primary text-on-primary rounded-xl font-label-md text-label-md font-bold flex flex-col items-center justify-center gap-0.5 shadow-sm active:scale-95 transition-all"} data-act={"log-fuel"} data-way-out={"primary"}>
              <span className={"material-symbols-outlined text-[20px]"}>
                local_gas_station
              </span>
              <span>
                Log Fuel
              </span>
            </button>
            <button onClick={onPlugClick} className={"h-14 bg-surface-container-high text-on-surface rounded-xl font-label-md text-label-md font-semibold flex flex-col items-center justify-center gap-0.5 hover:bg-surface-variant active:scale-95 transition-all"} data-act={"log-service"}>
              <span className={"material-symbols-outlined text-[20px] text-secondary"}>
                build
              </span>
              <span>
                Log Service
              </span>
            </button>
            <button onClick={onPlugClick} className={"h-14 bg-surface-container-high text-on-surface rounded-xl font-label-md text-label-md font-semibold flex flex-col items-center justify-center gap-0.5 hover:bg-surface-variant active:scale-95 transition-all"} data-act={"find-parts"}>
              <span className={"material-symbols-outlined text-[20px] text-tertiary"}>
                precision_manufacturing
              </span>
              <span className={"truncate px-1"}>
                Find Parts
              </span>
            </button>
          </section>
          <section className={"w-full bg-surface-container-lowest rounded-xl p-space-md shadow-sm flex flex-col gap-space-md"}>
            <div className={"flex items-center justify-between"}>
              <div className={"flex items-center gap-2"}>
                <div className={"w-8 h-8 rounded-full bg-primary-fixed flex items-center justify-center text-primary"}>
                  <span className={"material-symbols-outlined text-[18px]"}>
                    verified_user
                  </span>
                </div>
                <h3 className={"font-headline-sm text-headline-sm text-on-surface"}>
                  Jamaica Compliance
                </h3>
              </div>
              <span className={"font-label-sm text-label-sm bg-surface-container px-2 py-1 rounded text-on-surface-variant font-semibold"}>
                Motor Vehicle Act
              </span>
            </div>
            <div className={"hidden flex flex-col gap-2"} data-slot={"reminders"} data-slot-row={"reminders"} style={{ display: "none" }} />
          </section>
          <section className={"w-full bg-surface-container-lowest rounded-xl p-space-md shadow-sm flex flex-col gap-space-md"}>
            <div className={"flex items-center justify-between"}>
              <div className={"flex items-center gap-2"}>
                <div className={"w-8 h-8 rounded-full bg-secondary-fixed flex items-center justify-center text-secondary"}>
                  <span className={"material-symbols-outlined text-[18px]"}>
                    oil_barrel
                  </span>
                </div>
                <h3 className={"font-headline-sm text-headline-sm text-on-surface"}>
                  Up Next Maintenance
                </h3>
              </div>
              <button onClick={onPlugClick} className={"font-label-md text-label-md font-bold text-primary hover:underline flex items-center gap-0.5"} data-act={"view-all-8"}>
                <span>
                  View All (8)
                </span>
                <span className={"material-symbols-outlined text-[16px]"}>
                  chevron_right
                </span>
              </button>
            </div>
            <div className={"flex flex-col gap-space-sm"}>
              <div className={"p-space-sm bg-surface-container-low rounded-xl flex items-start gap-3 relative overflow-hidden"}>
                <div className={"absolute left-0 top-0 bottom-0 w-1.5 bg-secondary-container"} />
                <div className={"w-10 h-10 rounded-lg bg-surface-container-high flex items-center justify-center text-primary shrink-0 ml-1"}>
                  <span className={"material-symbols-outlined text-[20px]"}>
                    water_drop
                  </span>
                </div>
                <div className={"flex-1 min-w-0"}>
                  <div className={"flex items-center justify-between gap-1"}>
                    <h4 className={"font-label-lg text-label-lg font-bold text-on-surface truncate"}>
                      {"Engine Oil & Filter Service"}
                    </h4>
                    <span className={"font-label-sm text-label-sm font-bold text-primary bg-primary-fixed px-2 py-0.5 rounded shrink-0"}>
                      </span>
                  </div>
                  <p className={"font-body-sm text-body-sm text-on-surface-variant mt-0.5"}>
                    0W-20 / 5W-30 Synthetic • High-temp tropical stop-and-go
                  </p>
                  <div className={"flex items-center gap-3 mt-2 text-on-surface-variant font-label-sm text-label-sm"}>
                    <span>
                      Target:
                      <strong>
                        
                      </strong>
                    </span>
                    <span>
                      •
                    </span>
                    <span className={"text-primary font-semibold"}>
                      Recommended Brand: Idemitsu / Castrol
                    </span>
                  </div>
                </div>
              </div>
              <div className={"p-space-sm bg-surface-container-low rounded-xl flex items-start gap-3 relative overflow-hidden"}>
                <div className={"absolute left-0 top-0 bottom-0 w-1.5 bg-surface-variant"} />
                <div className={"w-10 h-10 rounded-lg bg-surface-container-high flex items-center justify-center text-on-surface-variant shrink-0 ml-1"}>
                  <span className={"material-symbols-outlined text-[20px]"}>
                    disc_full
                  </span>
                </div>
                <div className={"flex-1 min-w-0"}>
                  <div className={"flex items-center justify-between gap-1"}>
                    <h4 className={"font-label-lg text-label-lg font-bold text-on-surface truncate"}>
                      {"Front Brake Pad & Rotor Check"}
                    </h4>
                    <span className={"font-label-sm text-label-sm font-semibold text-on-surface-variant bg-surface-container px-2 py-0.5 rounded shrink-0"}>
                      </span>
                  </div>
                  <p className={"font-body-sm text-body-sm text-on-surface-variant mt-0.5"}>
                    {"Crucial for Mount Rosser & Junction grade descents"}
                  </p>
                  <div className={"flex items-center gap-3 mt-2 text-on-surface-variant font-label-sm text-label-sm"}>
                    <span>
                      Target:
                      <strong>
                        
                      </strong>
                    </span>
                    <span>
                      •
                    </span>
                    <span>
                      Akebono / OEM spec
                    </span>
                  </div>
                </div>
              </div>
              <div className={"p-space-sm bg-surface-container-low rounded-xl flex items-start gap-3 relative overflow-hidden"}>
                <div className={"absolute left-0 top-0 bottom-0 w-1.5 bg-surface-variant"} />
                <div className={"w-10 h-10 rounded-lg bg-surface-container-high flex items-center justify-center text-on-surface-variant shrink-0 ml-1"}>
                  <span className={"material-symbols-outlined text-[20px]"}>
                    swap_driving_apps
                  </span>
                </div>
                <div className={"flex-1 min-w-0"}>
                  <div className={"flex items-center justify-between gap-1"}>
                    <h4 className={"font-label-lg text-label-lg font-bold text-on-surface truncate"}>
                      CVT Transmission Fluid Flush
                    </h4>
                    <span className={"font-label-sm text-label-sm font-semibold text-on-surface-variant bg-surface-container px-2 py-0.5 rounded shrink-0"}>
                      </span>
                  </div>
                  <p className={"font-body-sm text-body-sm text-on-surface-variant mt-0.5"}>
                    Toyota TC / FE Fluid spec • CVT longevity prevention
                  </p>
                  <div className={"flex items-center gap-3 mt-2 text-on-surface-variant font-label-sm text-label-sm"}>
                    <span>
                      Target:
                      <strong>
                        
                      </strong>
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </section>
          <section className={"w-full bg-surface-container-lowest rounded-xl p-space-md shadow-sm flex flex-col gap-space-sm"}>
            <div className={"flex items-center justify-between"}>
              <div className={"flex items-center gap-2"}>
                <div className={"w-8 h-8 rounded-full bg-tertiary-fixed flex items-center justify-center text-tertiary"}>
                  <span className={"material-symbols-outlined text-[18px]"}>
                    receipt_long
                  </span>
                </div>
                <h3 className={"font-headline-sm text-headline-sm text-on-surface"}>
                  Recent Fill-Up
                </h3>
              </div>
              <button onClick={onPlugClick} className={"font-label-md text-label-md font-bold text-primary hover:underline flex items-center gap-0.5"} data-act={"history"}>
                <span>
                  History
                </span>
                <span className={"material-symbols-outlined text-[16px]"}>
                  chevron_right
                </span>
              </button>
            </div>
            <div className={"p-space-sm rounded-lg bg-surface-container-low flex items-center justify-between gap-2"}>
              <div className={"flex items-center gap-3 min-w-0"}>
                <div className={"w-9 h-9 rounded-full bg-emerald-700 text-white flex items-center justify-center font-bold text-[12px] shrink-0"}>
                  87
                </div>
                <div className={"min-w-0"}>
                  <p className={"font-label-lg text-label-lg font-bold text-on-surface truncate"} data-slot={"last-station"}>
                    No fills yet
                  </p>
                  <p className={"font-body-sm text-body-sm text-on-surface-variant flex items-center gap-1.5 mt-0.5"} data-slot={"last-detail"}>
                  </p>
                </div>
              </div>
              <div className={"text-right shrink-0"}>
                <span className={"font-headline-sm text-headline-sm font-bold text-on-surface"}>
                  
                </span>
                <p className={"font-label-sm text-label-sm text-emerald-700 font-semibold"}>
                   / L
                </p>
              </div>
            </div>
            <div className={"w-full pt-1 flex items-center justify-between text-body-sm font-body-sm text-on-surface-variant"}>
              <span className={"flex items-center gap-1"}>
                <span className={"material-symbols-outlined text-[16px] text-tertiary"}>
                  local_offer
                </span>
                Full tank to Full tank logged
              </span>
              <span className={"font-semibold text-on-surface"}>
                Eff: /L
              </span>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
