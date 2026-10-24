import { useEffect, useRef } from 'react';
import { onPlugClick } from '../../shell/actions';
import { bindScreen } from '../../shell/bind';
import { ExploreMap } from '../../live/maps';
import { ExploreSheet } from '../../live/ExploreSheet';

export function HomeExploreScreen() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (ref.current) bindScreen("15-home-explore.html", ref.current); }, []);
  return (
    <div ref={ref} data-plug-screen={"15-home-explore.html"} className={"bg-surface font-body-md text-on-surface flex flex-col min-h-screen"}>
      <header className={"fixed top-0 inset-x-0 z-50 bg-surface/85 backdrop-blur-xl shadow-[0_1px_8px_rgba(0,0,0,0.04)] pt-safe"}>
        <div className={"h-16 px-space-md flex items-center justify-between"}>
          <div className={"flex items-center gap-space-sm"}>
            <div className={"w-10 h-10 rounded-xl bg-primary flex items-center justify-center text-on-primary shadow-[0_4px_12px_rgba(163,57,0,0.25)]"}>
              <span className={"material-symbols-outlined text-[22px]"}>
                local_gas_station
              </span>
            </div>
            <div className={"flex flex-col"}>
              <span className={"font-label-sm text-label-sm text-primary tracking-wider uppercase"}>
                Roam Plug
              </span>
              <h1 className={"font-headline-sm text-headline-sm text-on-surface leading-tight"}>
                Explore
              </h1>
            </div>
          </div>
          <div className={"flex items-center gap-space-xs"}>
            <button onClick={onPlugClick} aria-label={"Parish Selection & Alerts"} className={"w-11 h-11 min-h-[44px] min-w-[44px] rounded-full flex items-center justify-center text-on-surface-variant hover:text-primary transition-colors"} data-act={"notifications"}>
              <span className={"material-symbols-outlined text-[24px]"}>
                notifications
              </span>
            </button>
            <div className={"w-8 h-8 rounded-full bg-primary flex items-center justify-center"}>
              <span className={"material-symbols-outlined text-on-primary text-[18px]"}>
                person
              </span>
            </div>
          </div>
        </div>
      </header>
      <main className={"flex flex-col relative w-full pt-16 pb-28 bg-surface min-h-screen"}>
        <div className={"flex flex-col w-full relative select-none"}>
          <div className={"sticky top-0 z-30 flex flex-col w-full px-space-md pt-space-sm pb-space-xs gap-space-sm bg-gradient-to-b from-surface via-surface/90 to-transparent pointer-events-auto"}>
            <div className={"flex items-center justify-between w-full"}>
              <button onClick={onPlugClick} className={"flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface-container-lowest shadow-md active:scale-95 transition-transform min-h-[44px]"} id={"parishSelectorBtn"} data-act={"parishSelectorBtn"}>
                <span className={"material-symbols-outlined text-primary text-[18px]"}>
                  location_on
                </span>
                <span className={"font-headline-sm text-label-md text-on-surface font-bold tracking-tight"}>
                  Half-Way-Tree, St Andrew
                </span>
                <span className={"material-symbols-outlined text-on-surface-variant text-[16px]"}>
                  expand_more
                </span>
              </button>
              <div className={"flex items-center gap-space-xs"}>
                <div className={"flex items-center gap-1 px-2.5 py-1 rounded-full bg-surface-container-high text-on-surface-variant"}>
                  <span className={"w-2 h-2 rounded-full bg-emerald-500 animate-pulse"} />
                  <span className={"font-label-sm text-[10px] uppercase font-bold text-on-surface-variant"}>
                    Live Plugs
                  </span>
                </div>
                <div className={"relative w-10 h-10 rounded-full bg-surface-container-highest flex items-center justify-center shadow-sm"}>
                  <span className={"font-label-lg text-label-sm text-primary font-bold"}>
                    AB
                  </span>
                  <span className={"absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-secondary-container ring-2 ring-surface"} />
                </div>
              </div>
            </div>
            <div className={"relative flex items-center w-full shadow-md rounded-2xl bg-surface-container-lowest"}>
              <div className={"pl-3.5 pr-2 flex items-center justify-center text-primary pointer-events-none"}>
                <span className={"material-symbols-outlined text-[22px]"}>
                  search
                </span>
              </div>
              <input onClick={onPlugClick} className={"w-full h-12 bg-transparent text-on-surface font-body-md text-body-md placeholder:text-on-surface-variant focus:outline-none pr-12 min-h-[48px]"} placeholder={"Search stations, parts stores, mechanics..."} type={"text"} data-act={"input"} />
              <div className={"absolute right-1 flex items-center gap-1"}>
                <button aria-label={"Voice Search"} className={"w-10 h-10 min-w-[40px] min-h-[40px] flex items-center justify-center text-on-surface-variant hover:text-primary active:scale-95 transition-all"} disabled={true} title={"Voice search is not in this version"}>
                  <span className={"material-symbols-outlined text-[20px]"}>
                    mic
                  </span>
                </button>
                <button onClick={onPlugClick} aria-label={"Filters"} className={"w-10 h-10 min-w-[40px] min-h-[40px] flex items-center justify-center text-on-surface-variant hover:text-primary active:scale-95 transition-all"} data-act={"tune"}>
                  <span className={"material-symbols-outlined text-[20px]"}>
                    tune
                  </span>
                </button>
              </div>
            </div>
            <div className={"flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5 -mx-space-md px-space-md"}>
              <button onClick={onPlugClick} className={"flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-secondary-container text-on-primary shadow-sm min-h-[38px] active:scale-95 transition-all shrink-0"} data-act={"fuel"}>
                <span className={"material-symbols-outlined text-[17px]"}>
                  local_gas_station
                </span>
                <span className={"font-label-lg text-label-sm font-bold tracking-tight"}>
                  Fuel
                </span>
              </button>
              <button onClick={onPlugClick} className={"flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-surface-container-lowest text-on-surface shadow-sm min-h-[38px] active:scale-95 transition-all shrink-0"} data-act={"mechanics"}>
                <span className={"material-symbols-outlined text-[17px] text-tertiary"}>
                  build
                </span>
                <span className={"font-label-md text-label-sm font-semibold"}>
                  Mechanics
                </span>
              </button>
              <button onClick={onPlugClick} className={"flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-surface-container-lowest text-on-surface shadow-sm min-h-[38px] active:scale-95 transition-all shrink-0"} data-act={"parts-stores"}>
                <span className={"material-symbols-outlined text-[17px] text-primary"}>
                  settings
                </span>
                <span className={"font-label-md text-label-sm font-semibold"}>
                  Parts Stores
                </span>
              </button>
              <button onClick={onPlugClick} className={"flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-surface-container-lowest text-on-surface shadow-sm min-h-[38px] active:scale-95 transition-all shrink-0"} data-act={"air-pump"}>
                <span className={"material-symbols-outlined text-[17px] text-secondary"}>
                  tire_repair
                </span>
                <span className={"font-label-md text-label-sm font-semibold"}>
                  Air Pump
                </span>
              </button>
              <button onClick={onPlugClick} className={"flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-surface-container-lowest text-on-surface shadow-sm min-h-[38px] active:scale-95 transition-all shrink-0"} data-act={"restrooms"}>
                <span className={"material-symbols-outlined text-[17px] text-on-surface-variant"}>
                  wc
                </span>
                <span className={"font-label-md text-label-sm font-semibold"}>
                  Restrooms
                </span>
              </button>
              <button onClick={onPlugClick} className={"flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-surface-container-lowest text-on-surface shadow-sm min-h-[38px] active:scale-95 transition-all shrink-0"} data-act={"car-wash"}>
                <span className={"material-symbols-outlined text-[17px] text-primary"}>
                  local_car_wash
                </span>
                <span className={"font-label-md text-label-sm font-semibold"}>
                  Car Wash
                </span>
              </button>
              <button onClick={onPlugClick} className={"flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-surface-container-lowest text-on-surface shadow-sm min-h-[38px] active:scale-95 transition-all shrink-0"} data-act={"ev-charging"}>
                <span className={"material-symbols-outlined text-[17px] text-emerald-600"}>
                  ev_station
                </span>
                <span className={"font-label-md text-label-sm font-semibold"}>
                  EV Charging
                </span>
              </button>
              <button onClick={onPlugClick} className={"flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-surface-container-lowest text-on-surface shadow-sm min-h-[38px] active:scale-95 transition-all shrink-0"} data-act={"tolls"}>
                <span className={"material-symbols-outlined text-[17px] text-tertiary"}>
                  toll
                </span>
                <span className={"font-label-md text-label-sm font-semibold"}>
                  Tolls
                </span>
              </button>
            </div>
          </div>
          <div className={"flex items-center gap-2 px-space-md pb-2"}>
            <button onClick={onPlugClick} type={"button"} data-plug-grade={"e10_87"} className={"px-3 py-2 rounded-full bg-secondary-container text-on-primary min-h-[40px] font-bold"} data-act={"e-10-87"}>
              E-10 87
            </button>
            <button onClick={onPlugClick} type={"button"} data-plug-grade={"e10_90"} className={"px-3 py-2 rounded-full bg-surface-container-lowest min-h-[40px]"} data-act={"e-10-90"}>
              E-10 90
            </button>
            <button onClick={onPlugClick} type={"button"} data-plug-grade={"diesel"} className={"px-3 py-2 rounded-full bg-surface-container-lowest min-h-[40px]"} data-act={"ulsd"}>
              ULSD
            </button>
          </div>
          <div className={"relative w-full h-[512px] bg-surface-container-low overflow-hidden cursor-grab active:cursor-grabbing"}>
            <ExploreMap />
          </div>
          <ExploreSheet />
        </div>
      </main>
    </div>
  );
}
