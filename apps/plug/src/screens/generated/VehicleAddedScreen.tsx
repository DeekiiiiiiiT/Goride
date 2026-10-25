import { useEffect, useRef } from 'react';
import { onPlugClick } from '../../shell/actions';
import { bindScreen } from '../../shell/bind';


export function VehicleAddedScreen() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (ref.current) bindScreen("13-vehicle-added.html", ref.current); }, []);
  return (
    <div ref={ref} data-plug-screen={"13-vehicle-added.html"} className={"bg-surface font-body-md text-on-surface flex flex-col min-h-screen pt-safe pb-safe"}>
      <main className={"flex-1 flex flex-col relative w-full bg-surface"}>
        <div className={"flex flex-col w-full px-margin pb-space-xl"}>
          <div className={"flex flex-col items-center text-center mt-space-md mb-space-lg relative"}>
            <div className={"relative flex items-center justify-center mb-space-md"}>
              <div className={"absolute w-24 h-24 rounded-full bg-gradient-to-tr from-secondary to-tertiary-fixed-dim opacity-20 blur-xl animate-pulse"} />
              <div className={"relative w-20 h-20 rounded-full p-1 bg-gradient-to-tr from-primary to-tertiary-fixed-dim shadow-xl flex items-center justify-center"}>
                <div className={"w-full h-full rounded-full bg-surface-container-lowest flex items-center justify-center shadow-inner"}>
                  <div className={"w-14 h-14 rounded-full bg-secondary-container flex items-center justify-center text-on-primary-container shadow-md"}>
                    <span className={"material-symbols-outlined text-[32px] font-bold"} style={{ fontVariationSettings: "'FILL' 1" }}>
                      check
                    </span>
                  </div>
                </div>
              </div>
              <div className={"absolute -top-1 -right-2 bg-tertiary-fixed text-on-tertiary-fixed p-1 rounded-full shadow-md flex items-center justify-center"}>
                <span className={"material-symbols-outlined text-[16px]"} style={{ fontVariationSettings: "'FILL' 1" }}>
                  auto_awesome
                </span>
              </div>
              <div className={"absolute -bottom-1 -left-2 bg-primary-fixed text-on-primary-fixed p-1 rounded-full shadow-md flex items-center justify-center"}>
                <span className={"material-symbols-outlined text-[14px]"} style={{ fontVariationSettings: "'FILL' 1" }}>
                  local_gas_station
                </span>
              </div>
            </div>
            <span className={"inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-secondary-fixed text-on-secondary-fixed font-label-sm uppercase tracking-wider mb-space-xs"}>
              <span className={"material-symbols-outlined text-[14px]"}>
                bolt
              </span>
              Sync Complete
            </span>
            <h1 className={"font-headline-lg text-headline-lg text-on-surface tracking-tight mb-space-xs"}>
              Vehicle Connected!
            </h1>
            <p className={"font-body-md text-body-md text-on-surface-variant max-w-[320px]"}>
              Your car is ready.
            </p>
          </div>
          <div className={"bg-surface-container-lowest rounded-xl p-space-md shadow-sm mb-space-lg relative overflow-hidden"}>
            <div className={"flex items-start justify-between mb-space-sm"}>
              <div className={"flex items-center gap-space-sm"}>
                <div className={"w-12 h-12 rounded-lg bg-surface-container-high flex items-center justify-center text-primary"}>
                  <span className={"material-symbols-outlined text-[28px]"} style={{ fontVariationSettings: "'FILL' 1" }}>
                    directions_car
                  </span>
                </div>
                <div>
                  <div className={"flex items-center gap-1.5"}>
                    <h2 className={"font-headline-sm text-headline-sm text-on-surface"} data-slot={"car"}>
                      Add a car</h2>
                    <span className={"material-symbols-outlined text-primary text-[18px]"} style={{ fontVariationSettings: "'FILL' 1" }}>
                      verified
                    </span>
                  </div>
                  <span className={"font-body-sm text-body-sm text-on-surface-variant"}>
                    Custom Micro-Van • JDM Import
                  </span>
                </div>
              </div>
            </div>
            <div className={"bg-surface-container-low rounded-lg p-space-sm flex flex-col gap-space-xs mb-space-sm"}>
              <div className={"flex items-center justify-between text-on-surface font-label-md text-label-md"}>
                <span className={"flex items-center gap-1 text-on-surface-variant"}>
                  <span className={"material-symbols-outlined text-[16px]"}>
                    speed
                  </span>
                  Baseline
                </span>
                <span className={"font-bold text-on-surface"}>
                  84,210 km
                </span>
              </div>
              <div className={"flex items-center justify-between text-on-surface font-label-md text-label-md"}>
                <span className={"flex items-center gap-1 text-on-surface-variant"}>
                  <span className={"material-symbols-outlined text-[16px]"}>
                    tune
                  </span>
                  Powertrain
                </span>
                <span>
                  1.0L Turbo (1KR-FE) • CVT
                </span>
              </div>
            </div>
            <div className={"flex flex-wrap items-center gap-space-xs"}>
              <span className={"inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-surface-container text-on-surface font-label-sm"}>
                <span>
                  🇯🇲
                </span>
                St. Catherine Primary Route
              </span>
              <span className={"inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-primary-fixed text-on-primary-fixed font-label-sm font-semibold"}>
                <span className={"material-symbols-outlined text-[12px]"}>
                  verified_user
                </span>
                Fitness Synced
              </span>
            </div>
          </div>
          <div className={"mb-space-lg"}>
            <div className={"flex items-center justify-between mb-space-xs"}>
              <div className={"flex items-center gap-space-xs text-on-surface"}>
                <span className={"material-symbols-outlined text-primary text-[22px]"}>
                  calendar_clock
                </span>
                <h3 className={"font-headline-sm text-headline-sm"}>
                  Maintenance Schedule
                </h3>
              </div>
              <span className={"px-2 py-0.5 rounded bg-tertiary-fixed text-on-tertiary-fixed font-label-sm"}>
                Ready
              </span>
            </div>
            <div className={"mb-space-md"}>
              <p className={"font-body-sm text-body-sm text-on-surface-variant"}>
                General baseline schedule active. Tailored Jamaican driving profiles syncing in background.
              </p>
            </div>
            <div className={"flex flex-col gap-space-sm"}>
              <div className={"bg-surface-container-lowest rounded-xl p-space-md shadow-sm relative overflow-hidden"}>
                <div className={"absolute left-0 top-0 bottom-0 w-1.5 bg-secondary-container"} />
                <div className={"pl-2"}>
                  <div className={"flex items-start justify-between mb-1"}>
                    <div className={"flex items-center gap-1.5"}>
                      <span className={"material-symbols-outlined text-secondary text-[20px]"} style={{ fontVariationSettings: "'FILL' 1" }}>
                        oil_barrel
                      </span>
                      <h4 className={"font-label-lg text-label-lg text-on-surface"}>
                        {"Engine Oil & Filter Service"}
                      </h4>
                    </div>
                    <span className={"px-2 py-0.5 rounded-full bg-error-container text-on-error-container font-label-sm font-bold animate-pulse"}>
                      Due in 790 km
                    </span>
                  </div>
                  <div className={"flex items-center gap-2 mb-2"}>
                    <span className={"font-label-md text-label-md text-on-surface font-semibold"}>
                      Target: 85,000 km
                    </span>
                    <span className={"text-on-surface-variant font-body-sm text-body-sm"}>
                      • Interval #9
                    </span>
                  </div>
                  <p className={"font-body-sm text-body-sm text-on-surface-variant bg-surface-container-low rounded-lg p-space-xs"}>
                    💡 Recommended:
                    <span className={"font-semibold text-on-surface"}>
                      0W-20 / 5W-30 synthetic
                    </span>
                    for high-temp stop-and-go tropical Jamaican climate.
                  </p>
                </div>
              </div>
              <div className={"bg-surface-container-lowest rounded-xl p-space-md shadow-sm relative overflow-hidden"}>
                <div className={"absolute left-0 top-0 bottom-0 w-1.5 bg-tertiary"} />
                <div className={"pl-2"}>
                  <div className={"flex items-start justify-between mb-1"}>
                    <div className={"flex items-center gap-1.5"}>
                      <span className={"material-symbols-outlined text-tertiary text-[20px]"}>
                        car_repair
                      </span>
                      <h4 className={"font-label-lg text-label-lg text-on-surface"}>
                        {"Front Brake Pad & Fluid Check"}
                      </h4>
                    </div>
                    <span className={"px-2 py-0.5 rounded-full bg-surface-container text-on-surface-variant font-label-sm"}>
                      In 5,790 km
                    </span>
                  </div>
                  <div className={"flex items-center gap-2 mb-2"}>
                    <span className={"font-label-md text-label-md text-on-surface font-semibold"}>
                      Target: 90,000 km
                    </span>
                    <span className={"text-on-surface-variant font-body-sm text-body-sm"}>
                      • Standard Interval
                    </span>
                  </div>
                  <p className={"font-body-sm text-body-sm text-on-surface-variant bg-surface-container-low rounded-lg p-space-xs"}>
                    {"⛰️ Crucial wear point for steep grade descents across Mount Rosser, Flat Bridge, & Junction routes."}
                  </p>
                </div>
              </div>
            </div>
          </div>
          <div className={"mb-space-xl"}>
            <h3 className={"font-label-lg text-label-lg text-on-surface mb-space-sm uppercase tracking-wide"}>
              Island Perks Activated
            </h3>
            <div className={"grid grid-cols-3 gap-space-xs"}>
              <div className={"bg-surface-container-lowest rounded-xl p-space-sm flex flex-col items-center text-center shadow-sm"}>
                <div className={"w-10 h-10 rounded-full bg-primary-fixed flex items-center justify-center text-on-primary-fixed mb-1.5"}>
                  <span className={"material-symbols-outlined text-[20px]"}>
                    local_gas_station
                  </span>
                </div>
                <span className={"font-label-md text-label-md text-on-surface font-bold leading-tight mb-1"}>
                  Fuel Log
                </span>
                <span className={"font-label-sm text-label-sm text-on-surface-variant"}>
                  {"Live km/L & E-10 tracking"}
                </span>
              </div>
              <div className={"bg-surface-container-lowest rounded-xl p-space-sm flex flex-col items-center text-center shadow-sm"}>
                <div className={"w-10 h-10 rounded-full bg-secondary-fixed flex items-center justify-center text-on-secondary-fixed mb-1.5"}>
                  <span className={"material-symbols-outlined text-[20px]"}>
                    notifications_active
                  </span>
                </div>
                <span className={"font-label-md text-label-md text-on-surface font-bold leading-tight mb-1"}>
                  Petrojam
                </span>
                <span className={"font-label-sm text-label-sm text-on-surface-variant"}>
                  Weekly pump price alerts
                </span>
              </div>
              <div className={"bg-surface-container-lowest rounded-xl p-space-sm flex flex-col items-center text-center shadow-sm"}>
                <div className={"w-10 h-10 rounded-full bg-tertiary-fixed flex items-center justify-center text-on-tertiary-fixed mb-1.5"}>
                  <span className={"material-symbols-outlined text-[20px]"}>
                    handyman
                  </span>
                </div>
                <span className={"font-label-md text-label-md text-on-surface font-bold leading-tight mb-1"}>
                  Parts Fit
                </span>
                <span className={"font-label-sm text-label-sm text-on-surface-variant"}>
                  Local Roomy parts match
                </span>
              </div>
            </div>
          </div>
          <div className={"flex flex-col gap-space-sm mt-auto"}>
            <button onClick={onPlugClick} className={"w-full h-[52px] bg-primary hover:bg-secondary-container active:bg-secondary text-on-primary rounded-xl font-label-lg text-label-lg font-bold flex items-center justify-center gap-2 shadow-lg transition-transform active:scale-[0.98]"} type={"button"} data-act={"go-to-home"} data-way-out={"primary"}>
              <span>
                Go to Home
              </span>
              <span className={"material-symbols-outlined text-[20px]"}>
                arrow_forward
              </span>
            </button>
            <button onClick={onPlugClick} className={"w-full py-space-sm text-primary font-label-md text-label-md font-semibold text-center hover:underline active:opacity-80"} type={"button"} data-act={"view-full-vehicle-garage"}>
              View Full Vehicle Garage
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
