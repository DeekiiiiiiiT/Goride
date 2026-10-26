import { useEffect, useRef } from 'react';
import { onPlugClick } from '../../shell/actions';
import { bindScreen } from '../../shell/bind';


export function ModelYearScreen() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (ref.current) bindScreen("10-model-year.html", ref.current); }, []);
  return (
    <div ref={ref} data-plug-screen={"10-model-year.html"} className={"bg-surface text-on-surface font-body-md text-body-md min-h-screen flex flex-col pt-safe pb-safe antialiased selection:bg-primary/20"}>
      <main className={"flex-1 flex flex-col relative w-full bg-surface"}>
        <div className={"flex flex-col w-full pb-8"}>
          <div className={"px-space-md pt-2 pb-space-sm flex items-center justify-between"}>
            <button onClick={onPlugClick} aria-label={"Go Back"} className={"w-12 h-12 flex items-center justify-center rounded-full bg-surface-container-high text-on-surface active:bg-surface-variant transition-colors"} type={"button"} data-act={"arrow-back"} data-way-out={"back"}>
              <span className={"material-symbols-outlined text-[24px]"}>
                arrow_back
              </span>
            </button>
            <div className={"flex items-center gap-1.5 px-3 py-1 rounded-full bg-secondary-fixed text-on-secondary-fixed font-label-md text-label-md uppercase tracking-wider"}>
              <span className={"material-symbols-outlined text-[14px]"}>
                tune
              </span>
              <span>
                Step 2 of 3
              </span>
            </div>
            <button onClick={onPlugClick} className={"w-12 h-12 flex items-center justify-center font-label-lg text-label-lg text-secondary active:opacity-70 transition-opacity"} type={"button"} data-act={"skip"}>
              Skip
            </button>
          </div>
          <div className={"px-space-md mb-space-md"}>
            <div className={"w-full flex items-center gap-2 h-1.5"}>
              <div className={"h-full flex-1 rounded-full bg-secondary-container"} />
              <div className={"h-full flex-1 rounded-full bg-secondary-container relative overflow-hidden"}>
                <div className={"absolute inset-0 bg-primary animate-pulse"} />
              </div>
              <div className={"h-full flex-1 rounded-full bg-surface-container-highest"} />
            </div>
          </div>
          <div className={"px-space-md mb-space-md"}>
            <div className={"flex items-center justify-between p-2.5 pl-3.5 rounded-xl bg-surface-container-low shadow-sm"}>
              <div className={"flex items-center gap-3"}>
                <div className={"w-9 h-9 rounded-lg bg-surface-container-lowest flex items-center justify-center text-primary shadow-sm font-headline-sm text-headline-sm font-black"}>
                  T
                </div>
                <div className={"flex flex-col"}>
                  <div className={"flex items-center gap-1.5"}>
                    <span className={"font-headline-sm text-headline-sm text-on-surface font-bold leading-tight"}>
                      Toyota
                    </span>
                    <span className={"material-symbols-outlined text-secondary text-[16px]"} style={{ fontVariationSettings: "'FILL' 1" }}>
                      verified
                    </span>
                  </div>
                  <span className={"font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider"}>
                    Selected Fleet Make
                  </span>
                </div>
              </div>
              <button onClick={onPlugClick} className={"px-3 py-1.5 rounded-lg bg-surface-container-highest text-secondary font-label-md text-label-md flex items-center gap-1 active:bg-secondary-fixed transition-colors"} type={"button"} data-act={"change"}>
                <span className={"material-symbols-outlined text-[15px]"}>
                  edit
                </span>
                <span>
                  Change
                </span>
              </button>
            </div>
          </div>
          <div className={"px-space-md mb-space-md"}>
            <h1 className={"font-display-lg-mobile text-display-lg-mobile text-on-surface font-extrabold tracking-tight mb-1"}>
              {"Select Model & Year"}
            </h1>
            <p className={"font-body-md text-body-md text-on-surface-variant"}>
              Pick your exact spec so we can tune Jamaican pump pricing, route consumption, and road fitness schedules.
            </p>
          </div>
          <div className={"px-space-md mb-space-md"}>
            <div className={"relative w-full"}>
              <div className={"absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-on-surface-variant"}>
                <span className={"material-symbols-outlined text-[22px]"}>
                  search
                </span>
              </div>
              <input onClick={onPlugClick} className={"w-full h-12 pl-11 pr-4 rounded-xl bg-surface-container-lowest text-on-surface placeholder:text-on-surface-variant/60 font-body-md text-body-md shadow-sm outline-none focus:bg-surface-container-low"} placeholder={"Search Toyota model (e.g. Roomy, Axio)..."} type={"text"} data-act={"input"} />
            </div>
          </div>
          <div className={"mb-space-lg"}>
            <div className={"px-space-md flex items-center justify-between mb-2"}>
              <span className={"font-label-md text-label-md text-on-surface-variant uppercase tracking-wider"}>
                Popular Island Models
              </span>
              <span className={"font-label-sm text-label-sm text-secondary font-semibold"}>
                9 Models Found
              </span>
            </div>
            <div className={"flex gap-2 overflow-x-auto px-space-md no-scrollbar py-0.5"}>
              <button onClick={onPlugClick} className={"flex-shrink-0 h-11 px-4 rounded-xl bg-secondary-fixed text-on-secondary-fixed font-label-lg text-label-lg font-bold shadow-sm flex items-center gap-1.5 transition-transform active:scale-95"} type={"button"} data-act={"roomy"}>
                <span className={"material-symbols-outlined text-[18px]"} style={{ fontVariationSettings: "'FILL' 1" }}>
                  directions_car
                </span>
                <span>
                  Roomy
                </span>
              </button>
              <button onClick={onPlugClick} className={"flex-shrink-0 h-11 px-4 rounded-xl bg-surface-container-lowest text-on-surface font-label-lg text-label-lg shadow-sm flex items-center active:bg-surface-container transition-colors"} type={"button"} data-act={"axio"}>
                Axio
              </button>
              <button onClick={onPlugClick} className={"flex-shrink-0 h-11 px-4 rounded-xl bg-surface-container-lowest text-on-surface font-label-lg text-label-lg shadow-sm flex items-center active:bg-surface-container transition-colors"} type={"button"} data-act={"fielder"}>
                Fielder
              </button>
              <button onClick={onPlugClick} className={"flex-shrink-0 h-11 px-4 rounded-xl bg-surface-container-lowest text-on-surface font-label-lg text-label-lg shadow-sm flex items-center active:bg-surface-container transition-colors"} type={"button"} data-act={"probox"}>
                Probox
              </button>
              <button onClick={onPlugClick} className={"flex-shrink-0 h-11 px-4 rounded-xl bg-surface-container-lowest text-on-surface font-label-lg text-label-lg shadow-sm flex items-center active:bg-surface-container transition-colors"} type={"button"} data-act={"voxy"}>
                Voxy
              </button>
              <button onClick={onPlugClick} className={"flex-shrink-0 h-11 px-4 rounded-xl bg-surface-container-lowest text-on-surface font-label-lg text-label-lg shadow-sm flex items-center active:bg-surface-container transition-colors"} type={"button"} data-act={"noah"}>
                Noah
              </button>
              <button onClick={onPlugClick} className={"flex-shrink-0 h-11 px-4 rounded-xl bg-surface-container-lowest text-on-surface font-label-lg text-label-lg shadow-sm flex items-center active:bg-surface-container transition-colors"} type={"button"} data-act={"hiace"}>
                Hiace
              </button>
              <button onClick={onPlugClick} className={"flex-shrink-0 h-11 px-4 rounded-xl bg-surface-container-lowest text-on-surface font-label-lg text-label-lg shadow-sm flex items-center active:bg-surface-container transition-colors"} type={"button"} data-act={"vitz"}>
                Vitz
              </button>
              <button onClick={onPlugClick} className={"flex-shrink-0 h-11 px-4 rounded-xl bg-surface-container-lowest text-on-surface font-label-lg text-label-lg shadow-sm flex items-center active:bg-surface-container transition-colors"} type={"button"} data-act={"corolla"}>
                Corolla
              </button>
            </div>
          </div>
          <div className={"mb-space-lg"}>
            <div className={"px-space-md flex items-center justify-between mb-2"}>
              <span className={"font-label-md text-label-md text-on-surface-variant uppercase tracking-wider"}>
                Year of Manufacture
              </span>
              <span className={"font-label-sm text-label-sm text-on-surface-variant"}>
                JDM Import Specs
              </span>
            </div>
            <div className={"flex gap-2 overflow-x-auto px-space-md no-scrollbar py-0.5"}>
              <button onClick={onPlugClick} className={"flex-shrink-0 w-16 h-12 rounded-xl bg-surface-container-lowest text-on-surface font-headline-sm text-headline-sm shadow-sm flex items-center justify-center active:bg-surface-container"} type={"button"} data-act={"2016"}>
                2016
              </button>
              <button onClick={onPlugClick} className={"flex-shrink-0 w-16 h-12 rounded-xl bg-surface-container-lowest text-on-surface font-headline-sm text-headline-sm shadow-sm flex items-center justify-center active:bg-surface-container"} type={"button"} data-act={"2017"}>
                2017
              </button>
              <button onClick={onPlugClick} className={"flex-shrink-0 w-16 h-12 rounded-xl bg-surface-container-lowest text-on-surface font-headline-sm text-headline-sm shadow-sm flex items-center justify-center active:bg-surface-container"} type={"button"} data-act={"2018"}>
                2018
              </button>
              <button onClick={onPlugClick} className={"flex-shrink-0 w-20 h-12 rounded-xl bg-primary text-on-primary font-headline-sm text-headline-sm font-bold shadow-md flex items-center justify-center relative"} type={"button"} data-act={"2019"} data-way-out={"primary"}>
                <span>
                  2019
                </span>
                <span className={"absolute -top-1 -right-1 w-2.5 h-2.5 bg-tertiary-fixed-dim rounded-full"} />
              </button>
              <button onClick={onPlugClick} className={"flex-shrink-0 w-16 h-12 rounded-xl bg-surface-container-lowest text-on-surface font-headline-sm text-headline-sm shadow-sm flex items-center justify-center active:bg-surface-container"} type={"button"} data-act={"2020"}>
                2020
              </button>
              <button onClick={onPlugClick} className={"flex-shrink-0 w-16 h-12 rounded-xl bg-surface-container-lowest text-on-surface font-headline-sm text-headline-sm shadow-sm flex items-center justify-center active:bg-surface-container"} type={"button"} data-act={"2021"}>
                2021
              </button>
              <button onClick={onPlugClick} className={"flex-shrink-0 w-16 h-12 rounded-xl bg-surface-container-lowest text-on-surface font-headline-sm text-headline-sm shadow-sm flex items-center justify-center active:bg-surface-container"} type={"button"} data-act={"2022"}>
                2022
              </button>
              <button onClick={onPlugClick} className={"flex-shrink-0 w-16 h-12 rounded-xl bg-surface-container-lowest text-on-surface font-headline-sm text-headline-sm shadow-sm flex items-center justify-center active:bg-surface-container"} type={"button"} data-act={"2023"}>
                2023
              </button>
              <button onClick={onPlugClick} className={"flex-shrink-0 w-16 h-12 rounded-xl bg-surface-container-lowest text-on-surface font-headline-sm text-headline-sm shadow-sm flex items-center justify-center active:bg-surface-container"} type={"button"} data-act={"2024"}>
                2024
              </button>
            </div>
          </div>
          <div className={"px-space-md flex flex-col gap-3 mb-space-lg"}>
            <div className={"flex items-center justify-between mb-0.5"}>
              <span className={"font-label-md text-label-md text-on-surface-variant uppercase tracking-wider"}>
                {"Trim & Engine Spec (Jamaica Market)"}
              </span>
              <span className={"font-label-sm text-label-sm text-secondary font-bold"}>
                3 Trims
              </span>
            </div>
            <div className={"p-4 rounded-xl bg-secondary-fixed/50 shadow-md relative overflow-hidden flex flex-col gap-3"}>
              <div className={"flex items-start justify-between gap-3"}>
                <div className={"flex flex-col"}>
                  <div className={"flex items-center gap-2"}>
                    <span className={"font-headline-sm text-headline-sm font-bold text-on-surface"}>
                      Roomy Custom G
                    </span>
                    <span className={"px-2 py-0.5 rounded-full bg-surface-container-lowest text-on-secondary-fixed font-label-sm text-label-sm font-bold"}>
                      M900A
                    </span>
                  </div>
                  <span className={"font-body-sm text-body-sm text-on-surface-variant mt-0.5"}>
                    2WD Front Wheel Drive • 2016–2020
                  </span>
                </div>
                <div className={"w-6 h-6 rounded-full bg-primary flex items-center justify-center text-on-primary flex-shrink-0 mt-0.5 shadow-sm"}>
                  <span className={"material-symbols-outlined text-[16px] font-bold"}>
                    check
                  </span>
                </div>
              </div>
              <div className={"flex flex-wrap items-center gap-2"}>
                <span className={"px-2.5 py-1 rounded-lg bg-surface-container-lowest text-on-surface font-label-md text-label-md font-semibold flex items-center gap-1 shadow-sm"}>
                  <span className={"material-symbols-outlined text-[15px] text-primary"}>
                    bolt
                  </span>
                  1.0L 1KR-FE Turbo
                </span>
                <span className={"px-2.5 py-1 rounded-lg bg-surface-container-lowest text-on-surface font-label-md text-label-md font-semibold flex items-center gap-1 shadow-sm"}>
                  <span className={"material-symbols-outlined text-[15px] text-tertiary"}>
                    local_gas_station
                  </span>
                  E-10 87 recommended
                </span>
              </div>
              <div className={"flex items-center justify-between pt-2"}>
                <div className={"flex items-center gap-2 text-on-surface-variant font-label-sm text-label-sm"}>
                  <span className={"material-symbols-outlined text-[16px] text-secondary"}>
                    speed
                  </span>
                  <span>
                    /L Est. Kingston Urban
                  </span>
                </div>
                <div className={"w-16 h-8 flex items-center justify-end text-primary opacity-80"}>
                  <svg className={"w-14 h-7 stroke-current"} fill={"none"} strokeLinecap={"round"} strokeLinejoin={"round"} strokeWidth={"2"} viewBox={"0 0 72 32"}>
                    <path d={"M4 22L12 22M60 22L68 22M12 22C12 18.5 15 16 18.5 16C22 16 25 18.5 25 22M47 22C47 18.5 50 16 53.5 16C57 16 60 18.5 60 22"} />
                    <path d={"M12 22H6M6 22L8 15L15 11L28 8H44L56 12L66 16L66 22H60"} />
                    <path d={"M28 8L26 15H46L44 8"} />
                    <circle cx={"18.5"} cy={"22"} fill={"currentColor"} r={"3.5"} />
                    <circle cx={"53.5"} cy={"22"} fill={"currentColor"} r={"3.5"} />
                  </svg>
                </div>
              </div>
            </div>
            <div className={"p-4 rounded-xl bg-surface-container-lowest shadow-sm flex flex-col gap-3 active:bg-surface-container-low transition-colors"}>
              <div className={"flex items-start justify-between gap-3"}>
                <div className={"flex flex-col"}>
                  <div className={"flex items-center gap-2"}>
                    <span className={"font-headline-sm text-headline-sm font-bold text-on-surface"}>
                      Roomy X / Standard
                    </span>
                    <span className={"px-2 py-0.5 rounded-full bg-surface-container-high text-on-surface-variant font-label-sm text-label-sm font-semibold"}>
                      M900A
                    </span>
                  </div>
                  <span className={"font-body-sm text-body-sm text-on-surface-variant mt-0.5"}>
                    2WD Front Wheel Drive • 2016–2020
                  </span>
                </div>
                <div className={"w-6 h-6 rounded-full bg-surface-container-highest flex items-center justify-center text-transparent flex-shrink-0 mt-0.5"}>
                  <div className={"w-2 h-2 rounded-full bg-surface-container"} />
                </div>
              </div>
              <div className={"flex flex-wrap items-center gap-2"}>
                <span className={"px-2.5 py-1 rounded-lg bg-surface-container-high text-on-surface font-label-md text-label-md font-semibold flex items-center gap-1"}>
                  <span className={"material-symbols-outlined text-[15px] text-on-surface-variant"}>
                    eco
                  </span>
                  1.0L 1KR-FE Non-Turbo
                </span>
                <span className={"px-2.5 py-1 rounded-lg bg-surface-container-high text-on-surface font-label-md text-label-md font-semibold flex items-center gap-1"}>
                  <span className={"material-symbols-outlined text-[15px] text-on-surface-variant"}>
                    local_gas_station
                  </span>
                  E-10 87 recommended
                </span>
              </div>
              <div className={"flex items-center gap-2 text-on-surface-variant font-label-sm text-label-sm pt-1"}>
                <span className={"material-symbols-outlined text-[16px]"}>
                  speed
                </span>
                <span>
                  /L Est. Island Commute
                </span>
              </div>
            </div>
            <div className={"p-4 rounded-xl bg-surface-container-lowest shadow-sm flex flex-col gap-3 active:bg-surface-container-low transition-colors"}>
              <div className={"flex items-start justify-between gap-3"}>
                <div className={"flex flex-col"}>
                  <div className={"flex items-center gap-2"}>
                    <span className={"font-headline-sm text-headline-sm font-bold text-on-surface"}>
                      Roomy 4WD
                    </span>
                    <span className={"px-2 py-0.5 rounded-full bg-surface-container-high text-on-surface-variant font-label-sm text-label-sm font-semibold"}>
                      M910A
                    </span>
                  </div>
                  <span className={"font-body-sm text-body-sm text-on-surface-variant mt-0.5"}>
                    All-Wheel Drive • 2016–2020
                  </span>
                </div>
                <div className={"w-6 h-6 rounded-full bg-surface-container-highest flex items-center justify-center text-transparent flex-shrink-0 mt-0.5"}>
                  <div className={"w-2 h-2 rounded-full bg-surface-container"} />
                </div>
              </div>
              <div className={"flex flex-wrap items-center gap-2"}>
                <span className={"px-2.5 py-1 rounded-lg bg-surface-container-high text-on-surface font-label-md text-label-md font-semibold flex items-center gap-1"}>
                  <span className={"material-symbols-outlined text-[15px] text-on-surface-variant"}>
                    all_inclusive
                  </span>
                  1.0L AWD Hill Assist
                </span>
                <span className={"px-2.5 py-1 rounded-lg bg-surface-container-high text-on-surface font-label-md text-label-md font-semibold flex items-center gap-1"}>
                  <span className={"material-symbols-outlined text-[15px] text-on-surface-variant"}>
                    local_gas_station
                  </span>
                  E-10 87 / 90
                </span>
              </div>
              <div className={"flex items-center gap-2 text-on-surface-variant font-label-sm text-label-sm pt-1"}>
                <span className={"material-symbols-outlined text-[16px]"}>
                  speed
                </span>
                <span>
                  /L Est. Hill Route Spec
                </span>
              </div>
            </div>
          </div>
          <div className={"px-space-md mb-6"}>
            <button onClick={onPlugClick} className={"w-full p-3.5 rounded-xl bg-surface-container-low flex items-center justify-center gap-2 text-secondary active:bg-secondary-fixed/50 transition-colors"} type={"button"} data-act={"can-t-find-your-car-enter-custom-vehicle-specs"}>
              <span className={"material-symbols-outlined text-[18px]"}>
                help_center
              </span>
              <span className={"font-label-lg text-label-lg font-bold"}>
                Can't find your car? Enter custom vehicle specs
              </span>
            </button>
          </div>
          <div className={"px-space-md flex flex-col gap-2"}>
            <button onClick={onPlugClick} className={"w-full h-[50px] rounded-xl bg-primary text-on-primary font-headline-sm text-headline-sm font-bold shadow-md flex items-center justify-center gap-2 active:bg-primary-container transition-all"} type={"button"} data-act={"continue-with-roomy-2019"} data-way-out={"primary"}>
              <span>
                Continue with Roomy (2019)
              </span>
              <span className={"material-symbols-outlined text-[20px]"}>
                arrow_forward
              </span>
            </button>
            <p className={"font-body-sm text-body-sm text-on-surface-variant text-center px-4"}>
              You can edit this or add a second vehicle anytime in Garage.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
