import { useEffect, useRef } from 'react';
import { onPlugClick } from '../../shell/actions';
import { bindScreen } from '../../shell/bind';


export function ExploreLoadingScreen() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (ref.current) bindScreen("15b-explore-loading.html", ref.current); }, []);
  return (
    <div ref={ref} data-plug-screen={"15b-explore-loading.html"} className={"bg-surface-variant flex justify-center items-center min-h-screen text-on-surface antialiased p-0 sm:p-4 select-none"}>
      <main className={"w-[390px] h-[844px] bg-background relative flex flex-col overflow-hidden shadow-2xl sm:rounded-[36px] border border-surface-dim"}>
        <header className={"w-full px-space-md pt-safe pb-2.5 z-20 shrink-0"}>
          <div className={"flex items-center justify-between gap-2 mb-2.5"}>
            <div className={"flex items-center gap-2"}>
              <div className={"w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-on-primary shadow-sm shadow-primary/20"}>
                <span className={"material-symbols-outlined text-[20px] fill-icon"} data-icon={"local_gas_station"}>
                  local_gas_station
                </span>
              </div>
              <div className={"flex items-center gap-1.5"}>
                <span className={"font-headline-sm text-headline-sm font-bold tracking-tight text-on-surface"}>
                  Roam Plug
                </span>
                <div className={"flex items-center gap-0.5 bg-surface-container px-1.5 py-0.5 rounded border border-surface-dim"}>
                  <span className={"w-2 h-2 rounded-full bg-emerald-600 inline-block"} />
                  <span className={"font-label-sm text-label-sm font-bold text-on-surface-variant tracking-wider"}>
                    JA
                  </span>
                </div>
              </div>
            </div>
            <div className={"flex items-center gap-2"}>
              <div className={"w-9 h-9 rounded-full bg-surface-container-lowest border border-surface-dim flex items-center justify-center text-on-surface-variant relative"}>
                <span className={"material-symbols-outlined text-[20px]"} data-icon={"notifications"}>
                  notifications
                </span>
                <span className={"absolute top-2 right-2 w-2 h-2 rounded-full bg-primary border-2 border-surface-container-lowest"} />
              </div>
              <div className={"w-9 h-9 rounded-full skeleton-shimmer border border-surface-dim"} />
            </div>
          </div>
          <div className={"w-full h-11 bg-surface-container-lowest border border-surface-dim rounded-lg px-3 flex items-center gap-2.5 shadow-sm"}>
            <span className={"material-symbols-outlined text-outline text-[20px]"} data-icon={"search"}>
              search
            </span>
            <div className={"h-3.5 skeleton-shimmer rounded w-48"} />
            <div className={"ml-auto flex items-center gap-1 border-l border-surface-container pl-2 text-outline"}>
              <span className={"material-symbols-outlined text-[18px]"} data-icon={"tune"}>
                tune
              </span>
            </div>
          </div>
        </header>
        <div className={"flex-1 overflow-y-auto no-scrollbar pb-24 px-space-md space-y-4"}>
          <div className={"w-full flex justify-center pt-1 pb-1"}>
            <div className={"bg-surface-container-high/90 border border-surface-dim rounded-full py-1.5 px-3.5 flex items-center gap-2 shadow-sm"}>
              <span className={"material-symbols-outlined text-primary text-[15px] animate-spin"} data-icon={"sync"}>
                sync
              </span>
              <span className={"font-label-sm text-label-sm text-on-surface-variant font-medium"}>
                {"Updating station prices in Kingston & St. Andrew..."}
              </span>
            </div>
          </div>
          <section className={"w-full h-44 rounded-xl relative overflow-hidden border border-surface-dim bg-surface-container-low shadow-sm"}>
            <svg className={"absolute inset-0 w-full h-full opacity-35"} fill={"none"} viewBox={"0 0 390 180"} xmlns={"http://www.w3.org/2000/svg"}>
              <path d={"M-10 40 Q 60 70, 130 30 T 260 80 T 400 45"} fill={"none"} stroke={"#8e7166"} strokeDasharray={"4 4"} strokeWidth={"2.5"} />
              <path d={"M-20 120 C 50 110, 90 140, 180 120 C 270 100, 310 135, 410 110"} fill={"none"} stroke={"#8e7166"} strokeWidth={"3"} />
              <path d={"M80 -10 L 110 190"} fill={"none"} stroke={"#8e7166"} strokeDasharray={"6 3"} strokeWidth={"1.5"} />
              <path d={"M250 -10 L 230 190"} fill={"none"} stroke={"#8e7166"} strokeWidth={"2"} />
              <circle cx={"160"} cy={"75"} fill={"#e2bfb2"} fillOpacity={"0.35"} r={"28"} />
              <circle cx={"290"} cy={"110"} fill={"#e2bfb2"} fillOpacity={"0.25"} r={"38"} />
              <circle cx={"65"} cy={"50"} fill={"#e2bfb2"} fillOpacity={"0.2"} r={"18"} />
            </svg>
            <div className={"absolute inset-0 skeleton-shimmer opacity-40"} />
            <div className={"absolute inset-0 flex flex-col items-center justify-center pointer-events-none"}>
              <div className={"relative flex items-center justify-center"}>
                <div className={"absolute w-20 h-20 rounded-full bg-primary/20 radar-pulse"} />
                <div className={"absolute w-12 h-12 rounded-full bg-primary/30 radar-pulse"} style={{ animationDelay: "0.6s" }} />
                <div className={"relative z-10 w-9 h-9 rounded-full bg-primary text-on-primary flex items-center justify-center shadow-lg border-2 border-surface-container-lowest"}>
                  <span className={"material-symbols-outlined text-[18px] fill-icon"} data-icon={"near_me"}>
                    near_me
                  </span>
                </div>
              </div>
              <div className={"mt-2.5 bg-surface-container-lowest/95 backdrop-blur-md px-3 py-1 rounded-full border border-surface-dim shadow-sm flex items-center gap-1.5"}>
                <span className={"w-2 h-2 rounded-full bg-primary animate-ping"} />
                <span className={"font-label-sm text-label-sm font-semibold text-on-surface"}>
                  Locating nearest pumps in Kingston...
                </span>
              </div>
            </div>
            <div className={"absolute bottom-2 left-3 z-10"}>
              <div className={"h-3 w-28 rounded skeleton-shimmer opacity-70"} />
            </div>
            <div className={"absolute bottom-2 right-3 z-10 flex gap-1"}>
              <div className={"w-6 h-6 rounded bg-surface-container-lowest/90 border border-surface-dim flex items-center justify-center text-on-surface-variant shadow-xs"}>
                <span className={"material-symbols-outlined text-[14px]"} data-icon={"layers"}>
                  layers
                </span>
              </div>
            </div>
          </section>
          <section className={"space-y-3"}>
            <div className={"flex items-center justify-between pt-1"}>
              <div className={"flex items-center gap-2"}>
                <h2 className={"font-headline-sm text-headline-sm font-bold text-on-surface"}>
                  Nearby Gas Stations
                </h2>
                <div className={"w-7 h-5 rounded-md skeleton-shimmer"} />
              </div>
              <div className={"w-14 h-4 rounded skeleton-shimmer"} />
            </div>
            <div className={"flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5"}>
              <div className={"h-8 w-20 rounded-full skeleton-shimmer shrink-0 border border-surface-dim"} />
              <div className={"h-8 w-24 rounded-full skeleton-shimmer shrink-0 border border-surface-dim"} />
              <div className={"h-8 w-18 rounded-full skeleton-shimmer shrink-0 border border-surface-dim"} />
              <div className={"h-8 w-22 rounded-full skeleton-shimmer shrink-0 border border-surface-dim"} />
              <div className={"h-8 w-20 rounded-full skeleton-shimmer shrink-0 border border-surface-dim"} />
            </div>
            <div className={"space-y-3 pt-1"}>
              <article className={"w-full bg-surface-container-lowest rounded-xl p-3.5 border border-surface-dim shadow-sm flex flex-col gap-3"}>
                <div className={"flex items-start justify-between gap-3"}>
                  <div className={"flex items-start gap-3 flex-1"}>
                    <div className={"w-12 h-12 rounded-lg skeleton-shimmer shrink-0 border border-surface-dim"} />
                    <div className={"flex-1 space-y-2 pt-0.5"}>
                      <div className={"h-4 w-3/5 rounded skeleton-shimmer"} />
                      <div className={"h-3 w-2/5 rounded skeleton-shimmer"} />
                    </div>
                  </div>
                  <div className={"w-20 h-9 rounded-lg skeleton-shimmer shrink-0 border border-surface-dim"} />
                </div>
                <div className={"flex items-center gap-2 pt-0.5"}>
                  <div className={"h-5 w-14 rounded-full skeleton-shimmer"} />
                  <div className={"h-5 w-16 rounded-full skeleton-shimmer"} />
                  <div className={"h-5 w-20 rounded-full skeleton-shimmer"} />
                </div>
                <div className={"pt-2 border-t border-surface-container flex items-center justify-between gap-2"}>
                  <div className={"h-8 w-28 rounded-lg skeleton-shimmer"} />
                  <div className={"h-8 w-20 rounded-lg skeleton-shimmer"} />
                </div>
              </article>
              <article className={"w-full bg-surface-container-lowest rounded-xl p-3.5 border border-surface-dim shadow-sm flex flex-col gap-3"}>
                <div className={"flex items-start justify-between gap-3"}>
                  <div className={"flex items-start gap-3 flex-1"}>
                    <div className={"w-12 h-12 rounded-lg skeleton-shimmer shrink-0 border border-surface-dim"} />
                    <div className={"flex-1 space-y-2 pt-0.5"}>
                      <div className={"h-4 w-4/6 rounded skeleton-shimmer"} />
                      <div className={"h-3 w-1/3 rounded skeleton-shimmer"} />
                    </div>
                  </div>
                  <div className={"w-20 h-9 rounded-lg skeleton-shimmer shrink-0 border border-surface-dim"} />
                </div>
                <div className={"flex items-center gap-2 pt-0.5"}>
                  <div className={"h-5 w-16 rounded-full skeleton-shimmer"} />
                  <div className={"h-5 w-14 rounded-full skeleton-shimmer"} />
                  <div className={"h-5 w-24 rounded-full skeleton-shimmer"} />
                </div>
                <div className={"pt-2 border-t border-surface-container flex items-center justify-between gap-2"}>
                  <div className={"h-8 w-24 rounded-lg skeleton-shimmer"} />
                  <div className={"h-8 w-24 rounded-lg skeleton-shimmer"} />
                </div>
              </article>
              <article className={"w-full bg-surface-container-lowest rounded-xl p-3.5 border border-surface-dim shadow-sm flex flex-col gap-3"}>
                <div className={"flex items-start justify-between gap-3"}>
                  <div className={"flex items-start gap-3 flex-1"}>
                    <div className={"w-12 h-12 rounded-lg skeleton-shimmer shrink-0 border border-surface-dim"} />
                    <div className={"flex-1 space-y-2 pt-0.5"}>
                      <div className={"h-4 w-1/2 rounded skeleton-shimmer"} />
                      <div className={"h-3 w-2/5 rounded skeleton-shimmer"} />
                    </div>
                  </div>
                  <div className={"w-20 h-9 rounded-lg skeleton-shimmer shrink-0 border border-surface-dim"} />
                </div>
                <div className={"flex items-center gap-2 pt-0.5"}>
                  <div className={"h-5 w-12 rounded-full skeleton-shimmer"} />
                  <div className={"h-5 w-18 rounded-full skeleton-shimmer"} />
                  <div className={"h-5 w-16 rounded-full skeleton-shimmer"} />
                </div>
                <div className={"pt-2 border-t border-surface-container flex items-center justify-between gap-2"}>
                  <div className={"h-8 w-28 rounded-lg skeleton-shimmer"} />
                  <div className={"h-8 w-20 rounded-lg skeleton-shimmer"} />
                </div>
              </article>
            </div>
          </section>
        </div>
        <nav className={"absolute bottom-0 left-0 right-0 h-[72px] bg-surface-container-lowest/95 backdrop-blur-md border-t border-surface-dim z-40 flex items-center justify-between px-3"}>
          <button onClick={onPlugClick} className={"flex flex-col items-center justify-center flex-1 h-full text-primary gap-0.5 pt-1 focus:outline-none"} data-act={"explore"}>
            <span className={"material-symbols-outlined text-[23px] fill-icon"} data-icon={"explore"}>
              explore
            </span>
            <span className={"font-label-sm text-label-sm font-bold tracking-tight"}>
              Explore
            </span>
            <span className={"w-1 h-1 rounded-full bg-primary mt-0.5"} />
          </button>
          <button onClick={onPlugClick} className={"flex flex-col items-center justify-center flex-1 h-full text-on-surface-variant/75 gap-0.5 pt-1 hover:text-on-surface focus:outline-none"} data-act={"garage"}>
            <span className={"material-symbols-outlined text-[23px]"} data-icon={"garage"}>
              garage
            </span>
            <span className={"font-label-sm text-label-sm font-semibold tracking-tight"}>
              Garage
            </span>
            <span className={"w-1 h-1 rounded-full bg-transparent mt-0.5"} />
          </button>
          <div className={"flex flex-col items-center justify-center flex-1 relative h-full"}>
            <button onClick={onPlugClick} aria-label={"Log Fuel"} className={"absolute -top-5 w-13 h-13 p-3 rounded-full bg-primary hover:bg-primary-container text-on-primary shadow-lg shadow-primary/35 border-4 border-surface-container-lowest flex items-center justify-center active:scale-95 transition-transform duration-150 focus:outline-none"} data-act={"local-gas-station"} data-way-out={"primary"}>
              <span className={"material-symbols-outlined text-[24px] fill-icon"} data-icon={"local_gas_station"}>
                local_gas_station
              </span>
            </button>
            <span className={"font-label-sm text-label-sm font-bold text-primary tracking-tight mt-6"}>
              Log Fuel
            </span>
          </div>
          <button onClick={onPlugClick} className={"flex flex-col items-center justify-center flex-1 h-full text-on-surface-variant/75 gap-0.5 pt-1 hover:text-on-surface focus:outline-none"} data-act={"map-it"}>
            <span className={"material-symbols-outlined text-[23px]"} data-icon={"map"}>
              map
            </span>
            <span className={"font-label-sm text-label-sm font-semibold tracking-tight"}>
              Map It
            </span>
            <span className={"w-1 h-1 rounded-full bg-transparent mt-0.5"} />
          </button>
          <button onClick={onPlugClick} className={"flex flex-col items-center justify-center flex-1 h-full text-on-surface-variant/75 gap-0.5 pt-1 hover:text-on-surface focus:outline-none"} data-act={"account"}>
            <span className={"material-symbols-outlined text-[23px]"} data-icon={"person"}>
              person
            </span>
            <span className={"font-label-sm text-label-sm font-semibold tracking-tight"}>
              Account
            </span>
            <span className={"w-1 h-1 rounded-full bg-transparent mt-0.5"} />
          </button>
        </nav>
        <div className={"absolute bottom-1 left-1/2 -translate-x-1/2 w-32 h-1 bg-on-surface/20 rounded-full z-50 pointer-events-none"} />
      </main>
    </div>
  );
}
