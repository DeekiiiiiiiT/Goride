import { useEffect, useRef } from 'react';
import { onPlugClick } from '../../shell/actions';
import { bindScreen } from '../../shell/bind';


export function SaveErrorScreen() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (ref.current) bindScreen("26b-save-error.html", ref.current); }, []);
  return (
    <div ref={ref} data-plug-screen={"26b-save-error.html"} className={"h-full bg-surface-dim font-body-md text-on-surface antialiased flex justify-center items-center p-0 md:p-6 overflow-hidden"}>
      <main className={"relative w-full h-full md:h-[844px] max-w-[390px] bg-surface flex flex-col shadow-2xl overflow-hidden md:rounded-[40px] md:border md:border-outline-variant/40"}>
        <div className={"bg-surface pt-safe text-primary shadow-sm z-20"}>
          <div className={"flex justify-between items-center w-full px-4 h-14 max-w-md mx-auto"}>
            <button onClick={onPlugClick} aria-label={"Back"} className={"w-10 h-10 flex items-center justify-center rounded-full hover:bg-surface-container-high/50 transition-colors text-primary active:scale-95 duration-150"} type={"button"} data-act={"arrow-back"} data-way-out={"back"}>
              <span className={"material-symbols-outlined"} data-icon={"arrow_back"}>
                arrow_back
              </span>
            </button>
            <div className={"flex flex-col items-center"}>
              <span className={"text-label-sm font-label-sm text-secondary tracking-wider uppercase font-bold"}>
                Step 2 of 2
              </span>
              <h1 className={"text-headline-sm font-headline-sm text-on-surface font-bold leading-tight"}>
                Station Details
              </h1>
            </div>
            <button onClick={onPlugClick} aria-label={"Share"} className={"w-10 h-10 flex items-center justify-center rounded-full hover:bg-surface-container-high/50 transition-colors text-on-surface-variant active:scale-95 duration-150"} type={"button"} data-act={"share"}>
              <span className={"material-symbols-outlined"} data-icon={"share"}>
                share
              </span>
            </button>
          </div>
        </div>
        <div className={"relative flex-1 overflow-hidden"}>
          <div className={"h-full overflow-y-auto px-4 pt-3 pb-24 opacity-40 filter blur-[0.4px] pointer-events-none transition-all duration-300"} id={"form-container"}>
            <section className={"bg-surface-container-lowest rounded-xl p-space-md border border-outline-variant/40 shadow-sm mb-4"}>
              <div className={"flex items-start justify-between"}>
                <div className={"flex items-center space-x-3"}>
                  <div className={"w-12 h-12 rounded-lg bg-surface-container flex items-center justify-center text-primary border border-outline-variant/30"}>
                    <span className={"material-symbols-outlined text-2xl"} data-icon={"local_gas_station"} data-weight={"fill"}>
                      local_gas_station
                    </span>
                  </div>
                  <div>
                    <div className={"flex items-center space-x-1.5"}>
                      <h2 className={"text-headline-sm font-headline-sm text-on-surface font-bold"}>
                        Texaco Barbican
                      </h2>
                      <span className={"material-symbols-outlined text-primary text-base"} data-icon={"verified"} data-weight={"fill"}>
                        verified
                      </span>
                    </div>
                    <p className={"text-body-sm font-body-sm text-on-surface-variant"}>
                      Barbican Rd, Kingston 6 • St. Andrew
                    </p>
                  </div>
                </div>
                <span className={"px-2 py-0.5 rounded-full bg-surface-container text-on-surface text-label-sm font-label-sm border border-outline-variant/30"}>
                  0.8 km
                </span>
              </div>
              <div className={"mt-3 pt-3 border-t border-surface-container-high flex items-center justify-between"}>
                <div className={"inline-flex items-center space-x-2 px-3 py-1.5 rounded-full bg-surface-container-low text-on-surface text-label-md font-label-md border border-outline-variant/40"}>
                  <span className={"material-symbols-outlined text-primary text-sm"} data-icon={"directions_car"}>
                    directions_car
                  </span>
                  <span className={"font-semibold text-on-surface"}>
                    Add a car
                  </span>
                </div>
                <button onClick={onPlugClick} className={"text-primary text-label-sm font-label-sm font-bold flex items-center"} data-act={"edit"}>
                  Edit
                </button>
              </div>
            </section>
            <section className={"mb-4"}>
              <div className={"flex justify-between items-center mb-2 px-1"}>
                <label className={"text-label-lg font-label-lg text-on-surface font-bold"}>
                  Fuel Grade Dispensed
                </label>
                <span className={"text-label-sm font-label-sm text-on-surface-variant font-medium"}>
                  Octane / Type
                </span>
              </div>
              <div className={"grid grid-cols-3 gap-2"}>
                <button onClick={onPlugClick} className={"flex flex-col items-center justify-center p-3 rounded-xl bg-surface-container-lowest border-2 border-primary shadow-sm relative"} type={"button"} data-act={"regular-e-10-87-j-214-50"}>
                  <span className={"text-label-sm font-label-sm text-primary font-bold"}>
                    REGULAR
                  </span>
                  <span className={"text-headline-sm font-headline-sm text-on-surface font-extrabold mt-0.5"}>
                    E-10 87
                  </span>
                  <span className={"mt-1 px-2 py-0.5 rounded bg-primary text-on-primary text-label-sm font-label-sm font-bold"}>
                    J$214.50
                  </span>
                  <div className={"absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-primary text-on-primary flex items-center justify-center"}>
                    <span className={"material-symbols-outlined text-xs font-bold"} data-icon={"check"}>
                      check
                    </span>
                  </div>
                </button>
                <button onClick={onPlugClick} className={"flex flex-col items-center justify-center p-3 rounded-xl bg-surface-container-lowest border border-outline-variant/40 shadow-sm opacity-75"} type={"button"} data-act={"premium-e-10-90-j-228-90"}>
                  <span className={"text-label-sm font-label-sm text-on-surface-variant font-medium"}>
                    PREMIUM
                  </span>
                  <span className={"text-headline-sm font-headline-sm text-on-surface font-bold mt-0.5"}>
                    E-10 90
                  </span>
                  <span className={"mt-1 px-2 py-0.5 rounded bg-surface-container text-on-surface-variant text-label-sm font-label-sm"}>
                    J$228.90
                  </span>
                </button>
                <button onClick={onPlugClick} className={"flex flex-col items-center justify-center p-3 rounded-xl bg-surface-container-lowest border border-outline-variant/40 shadow-sm opacity-75"} type={"button"} data-act={"diesel-ulsd-j-221-10"}>
                  <span className={"text-label-sm font-label-sm text-on-surface-variant font-medium"}>
                    DIESEL
                  </span>
                  <span className={"text-headline-sm font-headline-sm text-on-surface font-bold mt-0.5"}>
                    ULSD
                  </span>
                  <span className={"mt-1 px-2 py-0.5 rounded bg-surface-container text-on-surface-variant text-label-sm font-label-sm"}>
                    J$221.10
                  </span>
                </button>
              </div>
            </section>
            <section className={"bg-surface-container-lowest rounded-xl p-4 border border-outline-variant/40 shadow-sm space-y-4 mb-4"}>
              <div>
                <div className={"flex justify-between items-center mb-1.5"}>
                  <label className={"text-label-md font-label-md text-on-surface font-bold"} htmlFor={"total-cost"}>
                    Total Cost Paid
                  </label>
                  <span className={"text-label-sm font-label-sm text-secondary font-bold"}>
                    Jamaican Dollars (JMD)
                  </span>
                </div>
                <div className={"relative flex items-center"}>
                  <div className={"absolute left-3.5 flex items-center pointer-events-none text-on-surface-variant font-bold text-headline-sm font-headline-sm"}>
                    J$
                  </div>
                  <input className={"w-full h-12 pl-12 pr-4 bg-surface-container-low border border-outline-variant rounded-lg text-headline-sm font-headline-sm font-bold text-on-surface focus:outline-none"} id={"total-cost"} readOnly={true} type={"text"} defaultValue={"4,290"} />
                </div>
              </div>
              <div>
                <div className={"flex justify-between items-center mb-1.5"}>
                  <label className={"text-label-md font-label-md text-on-surface font-bold"} htmlFor={"volume-litres"}>
                    Volume Pumped
                  </label>
                  <span className={"text-label-sm font-label-sm text-on-surface-variant"}>
                    Litres (L)
                  </span>
                </div>
                <div className={"relative flex items-center"}>
                  <input className={"w-full h-12 pl-3.5 pr-10 bg-surface-container-low border border-outline-variant rounded-lg text-headline-sm font-headline-sm font-bold text-on-surface focus:outline-none"} id={"volume-litres"} readOnly={true} type={"text"} defaultValue={"20.00"} />
                  <div className={"absolute right-3.5 flex items-center pointer-events-none text-on-surface-variant font-bold text-body-md font-body-md"}>
                    L
                  </div>
                </div>
              </div>
              <div className={"p-3 bg-surface-container rounded-lg border border-outline-variant/30 flex items-center justify-between"}>
                <div className={"flex items-center space-x-2"}>
                  <span className={"material-symbols-outlined text-primary text-xl"} data-icon={"calculate"}>
                    calculate
                  </span>
                  <span className={"text-label-md font-label-md text-on-surface font-medium"}>
                    Calculated Unit Rate
                  </span>
                </div>
                <div className={"text-right"}>
                  <span className={"text-headline-sm font-headline-sm font-extrabold text-primary"}>
                    J$214.50
                  </span>
                  <span className={"text-label-sm font-label-sm text-on-surface-variant"}>
                    / L
                  </span>
                </div>
              </div>
            </section>
            <section className={"grid grid-cols-2 gap-3 mb-4"}>
              <div className={"p-3 bg-surface-container-lowest rounded-xl border border-outline-variant/40"}>
                <span className={"text-label-sm font-label-sm text-on-surface-variant block"}>
                  Odometer
                </span>
                <span className={"text-body-lg font-body-lg font-bold text-on-surface"}>
                  
                </span>
              </div>
              <div className={"p-3 bg-surface-container-lowest rounded-xl border border-outline-variant/40 flex items-center justify-between"}>
                <div>
                  <span className={"text-label-sm font-label-sm text-on-surface-variant block"}>
                    Full Tank Refill
                  </span>
                  <span className={"text-body-md font-body-md font-bold text-on-surface"}>
                    Yes
                  </span>
                </div>
                <div className={"w-5 h-5 rounded bg-primary text-on-primary flex items-center justify-center"}>
                  <span className={"material-symbols-outlined text-xs"} data-icon={"check"}>
                    check
                  </span>
                </div>
              </div>
            </section>
            <div className={"pt-2"}>
              <button onClick={onPlugClick} className={"w-full h-12 rounded-xl bg-primary/60 text-on-primary font-label-lg font-label-lg font-bold flex items-center justify-center shadow-sm cursor-not-allowed"} disabled={true} title={"Fix the fill before saving"} type={"button"} data-act={"save-fuel-log"} data-way-out={"primary"}>
                <span className={"material-symbols-outlined text-xl mr-2 animate-spin"} data-icon={"progress_activity"}>
                  progress_activity
                </span>
                Save Fuel Log
              </button>
            </div>
          </div>
          <div className={"absolute inset-0 bg-inverse-surface/25 backdrop-blur-[2px] z-30 pointer-events-auto transition-opacity duration-300"} />
          <div className={"absolute top-3 left-3 right-3 z-40 animate-bounce-short"}>
            <aside aria-live={"assertive"} className={"w-full bg-error text-on-error rounded-xl p-3.5 shadow-[0_12px_28px_-4px_rgba(186,26,26,0.35),0_4px_12px_-2px_rgba(28,25,23,0.15)] border border-on-error/20 flex items-center justify-between"} role={"alert"}>
              <div className={"flex items-center space-x-3 flex-1 mr-2 min-w-0"}>
                <div className={"w-9 h-9 rounded-lg bg-on-error/20 flex items-center justify-center flex-shrink-0 border border-on-error/30"}>
                  <span className={"material-symbols-outlined text-on-error text-2xl"} data-icon={"warning"} data-weight={"fill"}>
                    warning
                  </span>
                </div>
                <div className={"min-w-0"}>
                  <h3 className={"text-label-lg font-label-lg font-extrabold tracking-tight text-on-error leading-tight truncate"}>
                    Could not save. Try again.
                  </h3>
                  <p className={"text-label-sm font-label-sm text-on-error/85 tracking-normal mt-0.5"}>
                    Network timeout on Barbican gateway
                  </p>
                </div>
              </div>
              <div className={"flex items-center space-x-1 flex-shrink-0"}>
                <button onClick={onPlugClick} className={"px-3 py-1.5 bg-on-error text-error font-label-sm font-label-sm font-extrabold rounded-lg shadow-sm active:scale-95 transition-transform flex items-center space-x-1"} type={"button"} data-act={"retry"}>
                  <span className={"material-symbols-outlined text-sm font-bold"} data-icon={"refresh"}>
                    refresh
                  </span>
                  <span>
                    Retry
                  </span>
                </button>
                <button onClick={onPlugClick} aria-label={"Dismiss error"} className={"w-8 h-8 rounded-lg flex items-center justify-center text-on-error/90 hover:bg-on-error/15 active:scale-90 transition-all"} type={"button"} data-act={"close"} data-way-out={"back"}>
                  <span className={"material-symbols-outlined text-lg"} data-icon={"close"}>
                    close
                  </span>
                </button>
              </div>
            </aside>
          </div>
          <div className={"absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-surface via-surface/95 to-transparent z-35"}>
            <button onClick={onPlugClick} className={"w-full h-12 rounded-xl bg-error text-on-error font-label-lg font-label-lg font-bold flex items-center justify-center shadow-lg active:scale-98 transition-all"} type={"button"} data-act={"save-fuel-log-failed"} data-way-out={"primary"}>
              <span className={"material-symbols-outlined text-xl mr-2"} data-icon={"error_outline"}>
                error_outline
              </span>
              Save Fuel Log (Failed)
            </button>
          </div>
        </div>
        <nav className={"bg-surface-container-lowest/95 backdrop-blur-md shadow-[0_-4px_16px_rgba(28,25,23,0.06)] z-40 border-t border-outline-variant/30"}>
          <div className={"flex justify-around items-center h-16 max-w-md mx-auto px-2"}>
            <a onClick={onPlugClick} className={"flex flex-col items-center justify-center text-on-surface-variant hover:text-primary transition-colors px-3 py-1.5 active:scale-96"} href={"#explore"} data-act={"explore"}>
              <span className={"material-symbols-outlined text-2xl"} data-icon={"local_gas_station"}>
                local_gas_station
              </span>
              <span className={"text-label-sm font-label-sm mt-0.5"}>
                Explore
              </span>
            </a>
            <a onClick={onPlugClick} className={"flex flex-col items-center justify-center text-on-surface-variant hover:text-primary transition-colors px-3 py-1.5 active:scale-96"} href={"#routes"} data-act={"routes"}>
              <span className={"material-symbols-outlined text-2xl"} data-icon={"alt_route"}>
                alt_route
              </span>
              <span className={"text-label-sm font-label-sm mt-0.5"}>
                Routes
              </span>
            </a>
            <a onClick={onPlugClick} className={"flex flex-col items-center justify-center text-primary font-bold px-3 py-1.5 active:scale-96"} href={"#logfuel"} data-act={"log-fuel"}>
              <span className={"material-symbols-outlined text-2xl text-primary"} data-icon={"add_circle"} data-weight={"fill"}>
                add_circle
              </span>
              <span className={"text-label-sm font-label-sm mt-0.5 text-primary font-bold"}>
                Log Fuel
              </span>
            </a>
            <a onClick={onPlugClick} className={"flex flex-col items-center justify-center text-on-surface-variant hover:text-primary transition-colors px-3 py-1.5 active:scale-96"} href={"#alerts"} data-act={"alerts"}>
              <span className={"material-symbols-outlined text-2xl"} data-icon={"warning"}>
                warning
              </span>
              <span className={"text-label-sm font-label-sm mt-0.5"}>
                Alerts
              </span>
            </a>
            <a onClick={onPlugClick} className={"flex flex-col items-center justify-center text-on-surface-variant hover:text-primary transition-colors px-3 py-1.5 active:scale-96"} href={"#garage"} data-act={"garage"}>
              <span className={"material-symbols-outlined text-2xl"} data-icon={"directions_car"}>
                directions_car
              </span>
              <span className={"text-label-sm font-label-sm mt-0.5"}>
                Garage
              </span>
            </a>
          </div>
        </nav>
        <div className={"w-full bg-surface-container-lowest pb-1 flex justify-center items-center"}>
          <div className={"w-32 h-1 bg-on-surface/20 rounded-full"} />
        </div>
      </main>
    </div>
  );
}
