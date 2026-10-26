import { useEffect, useRef } from 'react';
import { onPlugClick } from '../../shell/actions';
import { bindScreen } from '../../shell/bind';
import { CarStrip } from '../../live/CarStrip';
import { ExploreMap } from '../../live/maps';
import { ExploreSheet } from '../../live/ExploreSheet';
import { FuelGrades, ServiceGrid } from '../../live/ServiceGrid';

export function HomeExploreScreen() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (ref.current) bindScreen("15-home-explore.html", ref.current); }, []);
  return (
    <div ref={ref} data-plug-screen={"15-home-explore.html"} className={"bg-surface font-body-md text-on-surface flex flex-col h-dvh overflow-hidden"}>
      <header className={"relative z-50 shrink-0 bg-surface shadow-[0_1px_8px_rgba(0,0,0,0.04)] pt-safe"}>
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
                Near you
              </h1>
            </div>
          </div>
          <div className={"flex items-center gap-space-xs"}>
            <button onClick={onPlugClick} aria-label={"Notifications"} className={"w-11 h-11 min-h-[44px] min-w-[44px] rounded-full flex items-center justify-center text-on-surface-variant hover:text-primary transition-colors"} data-act={"notifications"}>
              <span className={"material-symbols-outlined text-[24px]"}>
                notifications
              </span>
            </button>
            <button type="button" onClick={onPlugClick} aria-label={"Account"} data-path={"account"} data-act={"person"} className={"w-11 h-11 min-h-[44px] min-w-[44px] rounded-full bg-primary flex items-center justify-center"}>
              <span className={"material-symbols-outlined text-on-primary text-[18px]"}>
                person
              </span>
            </button>
          </div>
        </div>
      </header>
      <main className={"flex min-h-0 flex-1 flex-col relative w-full bg-surface"}>
        <div className={"flex min-h-0 flex-1 flex-col w-full relative select-none"}>
          <div className={"shrink-0 z-30 flex flex-col w-full px-space-md pt-space-sm pb-space-xs gap-space-sm bg-surface"}>
            <div className={"flex items-center justify-between w-full"}>
              <div className={"flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface-container-lowest shadow-md min-h-[44px]"} id={"parishSelectorBtn"}>
                <span className={"material-symbols-outlined text-primary text-[18px]"}>
                  location_on
                </span>
                <span className={"font-headline-sm text-label-md text-on-surface font-bold tracking-tight"} data-slot={"where"}>
                  Near you
                </span>
              </div>
            </div>
            <div className={"relative flex items-center w-full shadow-md rounded-2xl bg-surface-container-lowest"}>
              <div className={"pl-3.5 pr-2 flex items-center justify-center text-primary pointer-events-none"}>
                <span className={"material-symbols-outlined text-[22px]"}>
                  search
                </span>
              </div>
              <input onClick={onPlugClick} aria-label={"Search mechanics, parts, fuel, car wash"} className={"w-full h-12 bg-transparent text-on-surface font-body-md text-body-md placeholder:text-on-surface-variant focus:outline-none pr-12 min-h-[48px]"} placeholder={"Search mechanics, parts, fuel, car wash…"} type={"text"} data-act={"input"} />
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
            <ServiceGrid />
            <FuelGrades />
            <CarStrip />
          </div>
          <div className={"relative min-h-0 flex-1 w-full bg-surface-container-low overflow-hidden"}>
            <ExploreMap />
            <ExploreSheet />
          </div>
        </div>
      </main>
    </div>
  );
}
