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
          <div className={"px-space-md flex flex-col gap-3 mb-space-lg"} data-slot={"trims"} />
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
