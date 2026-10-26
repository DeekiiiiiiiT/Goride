import { useEffect, useRef } from 'react';
import { onPlugClick } from '../../shell/actions';
import { bindScreen } from '../../shell/bind';


export function StartingOdometerScreen() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (ref.current) bindScreen("12-starting-odometer.html", ref.current); }, []);
  return (
    <div ref={ref} data-plug-screen={"12-starting-odometer.html"} className={"bg-surface text-on-surface font-body-md text-body-md min-h-screen flex flex-col pt-safe pb-safe antialiased selection:bg-primary/20"}>
      <main className={"flex-1 flex flex-col relative w-full bg-surface"}>
        <div className={"flex flex-col w-full pb-8"}>
          <div className={"flex flex-col gap-3 px-4 pt-3 pb-2"}>
            <div className={"flex items-center justify-between"}>
              <button onClick={onPlugClick} aria-label={"Go back"} className={"flex items-center justify-center w-12 h-12 rounded-full bg-surface-container-high text-on-surface transition-transform active:scale-95"} type={"button"} data-act={"arrow-back"} data-way-out={"back"}>
                <span className={"material-symbols-outlined text-[24px]"}>
                  arrow_back
                </span>
              </button>
              <div className={"inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface-container-highest"}>
                <span className={"w-2 h-2 rounded-full bg-secondary-container animate-pulse"} />
                <span className={"font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant"}>
                  Step 3 of 3
                </span>
              </div>
              <button onClick={onPlugClick} className={"flex items-center justify-center h-12 px-3 rounded-full text-on-surface-variant font-label-lg text-label-lg active:bg-surface-container transition-colors"} type={"button"} data-act={"skip"}>
                Skip
              </button>
            </div>
            <div aria-label={"Progress: Step 3 of 3"} className={"grid grid-cols-3 gap-2 w-full pt-1"}>
              <div className={"h-1.5 rounded-full bg-primary"} />
              <div className={"h-1.5 rounded-full bg-primary"} />
              <div className={"h-1.5 rounded-full bg-secondary-container shadow-[0_0_8px_rgba(253,118,26,0.6)]"} />
            </div>
          </div>
          <div className={"flex flex-col px-4 pt-4 pb-2"}>
            <div className={"flex items-center gap-2 mb-1"}>
              <span className={"material-symbols-outlined text-secondary-container text-[20px]"} style={{ fontVariationSettings: "'FILL' 1" }}>
                speed
              </span>
              <span className={"font-label-sm text-label-sm uppercase tracking-widest text-secondary font-bold"}>
                Baseline Metric
              </span>
            </div>
            <h1 className={"font-headline-lg text-headline-lg text-on-surface tracking-tight"}>
              What's on your odometer?
            </h1>
            <p className={"font-body-md text-body-md text-on-surface-variant mt-1.5 leading-relaxed"}>
              Enter your starting mileage so Roam Plug can calculate live fuel efficiency (km/L) and trigger timely island maintenance alerts.
            </p>
          </div>
          <div className={"flex flex-col gap-4 px-4 mt-3"}>
            <div className={"relative overflow-hidden rounded-xl bg-gradient-to-br from-secondary-fixed via-surface-container-low to-surface-container p-4 shadow-sm"}>
              <div className={"absolute -right-6 -bottom-6 w-28 h-28 rounded-full bg-secondary-container/10 pointer-events-none blur-xl"} />
              <div className={"flex items-start gap-3.5 relative z-10"}>
                <div className={"flex items-center justify-center w-12 h-12 rounded-xl bg-primary text-on-primary shadow-md shrink-0"}>
                  <span className={"material-symbols-outlined text-[26px]"}>
                    document_scanner
                  </span>
                </div>
                <div className={"flex flex-col min-w-0 flex-1"}>
                  <div className={"flex items-center gap-2"}>
                    <h2 className={"font-headline-sm text-headline-sm text-on-surface font-bold"}>
                      Scan with Camera
                    </h2>
                    <span className={"px-2 py-0.5 rounded-full bg-secondary text-on-primary font-label-sm text-label-sm"}>
                      AI FAST
                    </span>
                  </div>
                  <p className={"font-body-sm text-body-sm text-on-surface-variant mt-0.5"}>
                    Point cluster gauge right at the pump — AI reads digits automatically.
                  </p>
                </div>
              </div>
              <div className={"mt-4 relative z-10"}>
                <button onClick={onPlugClick} className={"flex items-center justify-center gap-2.5 w-full h-12 rounded-xl bg-primary text-on-primary font-label-lg text-label-lg shadow-[0_4px_12px_rgba(163,57,0,0.25)] active:bg-on-primary-fixed-variant transition-all"} id={"cameraScanBtn"} type={"button"} data-act={"cameraScanBtn"} data-way-out={"primary"}>
                  <span className={"material-symbols-outlined text-[20px]"}>
                    photo_camera
                  </span>
                  <span>
                    Open Camera Scanner
                  </span>
                </button>
              </div>
            </div>
            <div className={"flex items-center justify-center gap-3 my-1"}>
              <div className={"flex-1 h-px bg-surface-container-highest"} />
              <span className={"font-label-sm text-label-sm uppercase tracking-widest text-on-surface-variant font-bold"}>
                OR ENTER MANUALLY
              </span>
              <div className={"flex-1 h-px bg-surface-container-highest"} />
            </div>
            <div className={"flex flex-col rounded-xl bg-surface-container-lowest p-5 shadow-sm"}>
              <div className={"flex items-center justify-between mb-3"}>
                <label className={"font-label-md text-label-md uppercase tracking-wider text-on-surface-variant font-bold"} htmlFor={"odometerDisplay"}>
                  Current Reading
                </label>
                <span className={"inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-surface-container-high text-on-surface-variant font-label-sm text-label-sm"}>
                  <span className={"material-symbols-outlined text-[14px] text-primary"} style={{ fontVariationSettings: "'FILL' 1" }}>
                    check_circle
                  </span>
                  Jamaica Standard (km)
                </span>
              </div>
              <div className={"flex items-baseline justify-between rounded-xl bg-surface-container-low px-4 py-3.5"}>
                <div className={"flex items-baseline gap-1.5 flex-1 overflow-x-auto"}>
                  <input aria-label={"Odometer value in kilometers"} className={"font-display-lg-mobile text-display-lg-mobile text-on-surface bg-transparent outline-none w-full tabular-nums font-extrabold tracking-tight selection:bg-secondary-fixed"} id={"odometerDisplay"} inputMode={"numeric"} type={"text"} defaultValue={""} />
                </div>
                <span className={"font-headline-md text-headline-md text-primary font-bold shrink-0 ml-2"}>
                  km
                </span>
              </div>
              <div className={"grid grid-cols-2 gap-2.5 mt-3"}>
                <button onClick={onPlugClick} className={"flex items-center justify-center gap-1.5 h-12 rounded-lg bg-surface-container font-label-md text-label-md text-on-surface active:bg-surface-container-high transition-colors"} id={"minus1000"} type={"button"} data-act={"minus1000"}>
                  <span className={"material-symbols-outlined text-[18px]"}>
                    remove
                  </span>
                  <span>
                    1,000
                  </span>
                </button>
                <button onClick={onPlugClick} className={"flex items-center justify-center gap-1.5 h-12 rounded-lg bg-surface-container font-label-md text-label-md text-on-surface active:bg-surface-container-high transition-colors"} id={"plus1000"} type={"button"} data-act={"plus1000"}>
                  <span className={"material-symbols-outlined text-[18px]"}>
                    add
                  </span>
                  <span>
                    1,000
                  </span>
                </button>
              </div>
              <div className={"flex items-center justify-center gap-1.5 mt-3.5 pt-3 border-t-0 text-on-surface-variant font-label-sm text-label-sm"}>
                <span className={"material-symbols-outlined text-[16px] text-tertiary"}>
                  calendar_today
                </span>
                <span>
                  Logged today as initial tank baseline
                </span>
              </div>
            </div>
            <details className={"group rounded-xl bg-surface-container-lowest overflow-hidden shadow-sm transition-all"}>
              <summary className={"flex items-center justify-between p-4 cursor-pointer list-none select-none active:bg-surface-container-low"}>
                <div className={"flex items-center gap-3"}>
                  <div className={"flex items-center justify-center w-8 h-8 rounded-lg bg-surface-container text-on-surface-variant"}>
                    <span className={"material-symbols-outlined text-[20px]"}>
                      directions_car
                    </span>
                  </div>
                  <div className={"flex flex-col"}>
                    <span className={"font-label-lg text-label-lg text-on-surface font-semibold"}>
                      {"Plate & Nickname"}
                    </span>
                    <span className={"font-label-sm text-label-sm text-on-surface-variant"}>
                      Optional Jamaican vehicle tags
                    </span>
                  </div>
                </div>
                <span className={"material-symbols-outlined text-[22px] text-on-surface-variant transition-transform duration-200 group-open:rotate-180"}>
                  expand_more
                </span>
              </summary>
              <div className={"flex flex-col gap-3.5 px-4 pb-4 pt-1"}>
                <div className={"flex flex-col gap-1.5"}>
                  <label className={"font-label-md text-label-md text-on-surface font-semibold"} htmlFor={"carNickname"}>
                    Vehicle Nickname
                  </label>
                  <div className={"flex items-center rounded-lg bg-surface-container-low px-3.5 h-12"}>
                    <input className={"bg-transparent w-full text-on-surface font-body-md text-body-md placeholder:text-on-surface-variant/60 outline-none"} id={"carNickname"} placeholder={"e.g. Work Roomy, Daily Fit, Red Probox"} type={"text"} />
                  </div>
                </div>
                <div className={"flex flex-col gap-1.5"}>
                  <div className={"flex items-center justify-between"}>
                    <label className={"font-label-md text-label-md text-on-surface font-semibold"} htmlFor={"plateNumber"}>
                      Jamaica License Plate
                    </label>
                    <span className={"flex items-center gap-1 font-label-sm text-label-sm text-on-surface-variant"}>
                      <span className={"material-symbols-outlined text-[13px] text-tertiary"}>
                        lock
                      </span>
                      {"Private & Encrypted"}
                    </span>
                  </div>
                  <div className={"flex items-center rounded-lg bg-surface-container-low px-3.5 h-12"}>
                    <span className={"material-symbols-outlined text-[20px] text-on-surface-variant mr-2"}>
                      badge
                    </span>
                    <input className={"bg-transparent w-full text-on-surface font-body-md text-body-md placeholder:text-on-surface-variant/60 uppercase tracking-widest outline-none font-semibold"} id={"plateNumber"} placeholder={"e.g. 8492 GA"} type={"text"} />
                  </div>
                  <p className={"font-body-sm text-body-sm text-on-surface-variant"}>
                    Kept strictly on your phone. Never displayed on parish fuel crowd-checks or speed alerts.
                  </p>
                </div>
              </div>
            </details>
            <div className={"flex items-start gap-3 rounded-xl bg-surface-container p-4 shadow-sm"}>
              <div className={"flex items-center justify-center w-9 h-9 rounded-lg bg-tertiary-fixed text-on-tertiary-fixed shrink-0"}>
                <span className={"material-symbols-outlined text-[20px]"} style={{ fontVariationSettings: "'FILL' 1" }}>
                  local_gas_station
                </span>
              </div>
              <div className={"flex flex-col min-w-0"}>
                <h2 className={"font-label-lg text-label-lg text-on-surface font-bold"}>
                  Island Fuel Plug
                </h2>
                <p className={"font-body-sm text-body-sm text-on-surface-variant mt-0.5 leading-snug"}>
                  On your next fill-up, enter the litres and the odometer. Roam Plug works out the cost from what you type.
                </p>
              </div>
            </div>
          </div>
          <div className={"flex flex-col items-center gap-2 px-4 pt-5 pb-2 mt-auto"}>
            <button onClick={onPlugClick} className={"flex items-center justify-center gap-2 w-full h-[52px] rounded-xl bg-primary text-on-primary font-headline-sm text-headline-sm font-bold shadow-[0_8px_20px_-4px_rgba(234,88,12,0.35)] active:scale-[0.98] transition-transform"} id={"finishBtn"} type={"button"} data-act={"finishBtn"} data-way-out={"primary"}>
              <span>
                {"Finish & Go to Radar"}
              </span>
              <span className={"material-symbols-outlined text-[22px]"}>
                arrow_forward
              </span>
            </button>
            <div className={"flex items-center gap-1.5 text-on-surface-variant font-label-sm text-label-sm"}>
              <span className={"material-symbols-outlined text-[14px] text-secondary"}>
                verified_user
              </span>
              <span>
                100% Free island motoring companion
              </span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
