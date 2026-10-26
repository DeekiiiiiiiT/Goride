import { useEffect, useRef } from 'react';
import { onPlugClick } from '../../shell/actions';
import { bindScreen } from '../../shell/bind';


export function EmptySearchScreen() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (ref.current) bindScreen("49b-empty-search.html", ref.current); }, []);
  return (
    <div ref={ref} data-plug-screen={"49b-empty-search.html"} className={"bg-surface-container-high text-on-surface antialiased min-h-screen flex justify-center selection:bg-primary selection:text-on-primary"}>
      <div className={"w-full max-w-[390px] bg-background min-h-screen relative flex flex-col shadow-2xl overflow-x-hidden border-x border-outline-variant/30"}>
        <header className={"sticky top-0 z-40 bg-surface/95 backdrop-blur-md px-4 pt-3 pb-2.5"}>
          <div className={"flex items-center justify-between gap-2.5 mb-2.5"}>
            <button onClick={onPlugClick} aria-label={"Go Back"} className={"w-10 h-10 -ml-1.5 rounded-full flex items-center justify-center text-on-surface hover:bg-surface-container active:scale-95 transition-all"} type={"button"} data-act={"arrow-back"} data-way-out={"back"}>
              <span className={"material-symbols-outlined text-[24px]"}>
                arrow_back
              </span>
            </button>
            <div className={"flex-1 relative flex items-center"}>
              <span className={"material-symbols-outlined absolute left-3 text-on-surface-variant text-[20px] pointer-events-none"}>
                search
              </span>
              <input onClick={onPlugClick} className={"w-full h-11 pl-9 pr-9 bg-surface-container-lowest text-on-surface text-body-md font-body-md rounded-xl border border-outline/30 focus:border-primary-container focus:ring-2 focus:ring-primary-container/20 transition-all outline-none"} id={"station-search-input"} placeholder={"Search stations, roads, brands..."} type={"text"} defaultValue={"zzznone"} data-act={"station-search-input"} />
              <button onClick={onPlugClick} aria-label={"Clear search input"} className={"absolute right-2.5 w-6 h-6 rounded-full bg-surface-container-highest text-on-surface-variant hover:text-on-surface flex items-center justify-center active:scale-90 transition-transform"} id={"clear-input-btn"} type={"button"} data-act={"clear-input-btn"} data-way-out={"back"}>
                <span className={"material-symbols-outlined text-[16px]"}>
                  close
                </span>
              </button>
            </div>
            <button onClick={onPlugClick} aria-label={"Tune Search Filters"} className={"w-10 h-10 rounded-xl bg-surface-container-lowest border border-outline-variant/50 flex items-center justify-center text-primary hover:bg-surface-container-low active:scale-95 transition-all"} type={"button"} data-act={"tune"}>
              <span className={"material-symbols-outlined text-[20px]"}>
                tune
              </span>
            </button>
          </div>
          <div className={"flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1 -mx-4 px-4"}>
            <button onClick={onPlugClick} className={"flex-shrink-0 h-8 px-3 rounded-full bg-on-surface text-surface text-label-md font-label-md flex items-center gap-1 shadow-sm active:scale-95 transition-all"} type={"button"} data-act={"kingston-st-andrew"}>
              <span>
                {"Kingston & St. Andrew"}
              </span>
              <span className={"material-symbols-outlined text-[16px]"}>
                arrow_drop_down
              </span>
            </button>
            <div className={"flex-shrink-0 h-8 px-2.5 rounded-full bg-surface-container-lowest border border-outline-variant/60 flex items-center gap-1.5 shadow-sm"}>
              <span className={"w-2 h-2 rounded-full bg-[#16a34a]"} />
              <span className={"text-on-surface text-label-md font-label-md"}>
                E-10 87
              </span>
            </div>
            <button onClick={onPlugClick} className={"flex-shrink-0 h-8 px-3 rounded-full bg-surface-container-lowest border border-outline-variant/60 text-on-surface-variant text-label-md font-label-md flex items-center gap-1 hover:border-primary/40 active:scale-95 transition-all"} type={"button"} data-act={"verified-only"}>
              <span className={"material-symbols-outlined text-[16px] text-primary"} style={{ fontVariationSettings: "'FILL' 1" }}>
                verified
              </span>
              <span>
                Verified Only
              </span>
            </button>
          </div>
        </header>
        <main className={"flex-1 flex flex-col px-4 pt-4 pb-24"}>
          <div className={"bg-surface-container-lowest rounded-2xl p-6 border border-outline-variant/40 shadow-[0_2px_4px_-1px_rgba(28,25,23,0.04),0_4px_6px_-2px_rgba(28,25,23,0.02)] flex flex-col items-center text-center"}>
            <div className={"relative w-44 h-44 mb-3 flex items-center justify-center"}>
              <div className={"absolute inset-0 rounded-full border border-dashed border-outline-variant/80"} />
              <div className={"absolute inset-4 rounded-full border border-primary/20 bg-surface-container-low/40"} />
              <div className={"absolute inset-9 rounded-full border border-dashed border-primary/50 animate-spin"} style={{ animationDuration: "22s" }} />
              <div className={"absolute top-1 w-0.5 h-3 bg-outline/40"} />
              <div className={"absolute bottom-1 w-0.5 h-3 bg-outline/40"} />
              <div className={"absolute left-1 h-0.5 w-3 bg-outline/40"} />
              <div className={"absolute right-1 h-0.5 w-3 bg-outline/40"} />
              <div className={"absolute top-7 left-10 w-2.5 h-2.5 rounded-full bg-secondary-fixed-dim/90"} />
              <div className={"absolute bottom-10 right-9 w-2 h-2 rounded-full bg-outline/40"} />
              <div className={"relative z-10 w-16 h-16 rounded-full bg-gradient-to-tr from-primary to-secondary-container text-on-primary flex items-center justify-center shadow-[0_8px_20px_-4px_rgba(234,88,12,0.35)]"}>
                <span className={"material-symbols-outlined text-[32px]"} style={{ fontVariationSettings: "'FILL' 1" }}>
                  local_gas_station
                </span>
              </div>
            </div>
            <h1 className={"text-headline-md font-headline-md text-on-surface tracking-tight mb-1"}>
              No stations match
            </h1>
            <p className={"text-body-md font-body-md text-on-surface-variant max-w-[260px] mb-5"}>
              Try another name or clear the search
            </p>
            <button onClick={onPlugClick} className={"w-full max-w-[240px] h-12 bg-[#ea580c] hover:bg-[#c2410c] active:scale-[0.98] text-white text-label-lg font-label-lg rounded-xl shadow-[0_4px_12px_rgba(234,88,12,0.25)] flex items-center justify-center gap-2 transition-all"} id={"clear-search-action"} type={"button"} data-act={"clear-search-action"}>
              <span className={"material-symbols-outlined text-[20px]"}>
                refresh
              </span>
              <span>
                Clear search
              </span>
            </button>
            <div className={"mt-4 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface-container text-on-surface-variant text-label-sm font-label-sm border border-outline-variant/40"}>
              <span>
                Searched:
              </span>
              <span className={"font-bold text-primary font-mono tracking-tight"}>
                "zzznone"
              </span>
              <span className={"text-[12px] text-outline"}>
                • 0 results in KSA
              </span>
            </div>
          </div>
          <section className={"mt-5"}>
            <div className={"flex items-center justify-between mb-2.5 px-1"}>
              <h2 className={"text-label-md font-label-md text-on-surface-variant uppercase tracking-wider"}>
                Try searching for
              </h2>
              <span className={"text-label-sm font-label-sm text-primary font-bold"}>
                14 Parishes
              </span>
            </div>
            <div className={"grid grid-cols-3 gap-2"}>
              <button onClick={onPlugClick} className={"h-10 px-2 rounded-xl bg-surface-container-lowest border border-outline-variant/60 hover:border-primary/50 text-on-surface text-label-md font-label-md flex items-center justify-center gap-1 shadow-sm active:scale-95 transition-all"} type={"button"} data-act={"totalenergies"}>
                <span className={"w-1.5 h-1.5 rounded-full bg-[#dc2626]"} />
                <span className={"truncate"}>
                  TotalEnergies
                </span>
              </button>
              <button onClick={onPlugClick} className={"h-10 px-2 rounded-xl bg-surface-container-lowest border border-outline-variant/60 hover:border-primary/50 text-on-surface text-label-md font-label-md flex items-center justify-center gap-1 shadow-sm active:scale-95 transition-all"} type={"button"} data-act={"rubis"}>
                <span className={"w-1.5 h-1.5 rounded-full bg-[#ea580c]"} />
                <span className={"truncate"}>
                  Rubis
                </span>
              </button>
              <button onClick={onPlugClick} className={"h-10 px-2 rounded-xl bg-surface-container-lowest border border-outline-variant/60 hover:border-primary/50 text-on-surface text-label-md font-label-md flex items-center justify-center gap-1 shadow-sm active:scale-95 transition-all"} type={"button"} data-act={"texaco"}>
                <span className={"w-1.5 h-1.5 rounded-full bg-[#dc2626]"} />
                <span className={"truncate"}>
                  Texaco
                </span>
              </button>
              <button onClick={onPlugClick} className={"h-10 px-2 rounded-xl bg-surface-container-lowest border border-outline-variant/60 hover:border-primary/50 text-on-surface text-label-md font-label-md flex items-center justify-center gap-1 shadow-sm active:scale-95 transition-all"} type={"button"} data-act={"petrojam"}>
                <span className={"w-1.5 h-1.5 rounded-full bg-[#16a34a]"} />
                <span className={"truncate"}>
                  Petrojam
                </span>
              </button>
              <button onClick={onPlugClick} className={"h-10 px-2 rounded-xl bg-surface-container-lowest border border-outline-variant/60 hover:border-primary/50 text-on-surface text-label-md font-label-md flex items-center justify-center gap-1 shadow-sm active:scale-95 transition-all"} type={"button"} data-act={"half-way-tree"}>
                <span className={"material-symbols-outlined text-[14px] text-tertiary"}>
                  near_me
                </span>
                <span className={"truncate"}>
                  Half-Way-Tree
                </span>
              </button>
            </div>
          </section>
          <section className={"mt-4"}>
            <a onClick={onPlugClick} className={"block bg-gradient-to-r from-surface-container to-surface-container-low border border-outline-variant/70 rounded-2xl p-3.5 shadow-sm active:scale-[0.99] transition-transform"} href={"#"} data-act={"can-t-find-your-local-pump-pin-a-missing-station"}>
              <div className={"flex items-center gap-3"}>
                <div className={"w-11 h-11 rounded-xl bg-tertiary-fixed-dim/30 border border-tertiary/20 flex items-center justify-center text-tertiary flex-shrink-0"}>
                  <span className={"material-symbols-outlined text-[24px]"}>
                    add_location_alt
                  </span>
                </div>
                <div className={"flex-1 min-w-0"}>
                  <div className={"flex items-center gap-1.5"}>
                    <span className={"text-label-md font-label-md text-on-surface font-bold truncate"}>
                      Can't find your local pump?
                    </span>
                  </div>
                  <p className={"text-body-sm font-body-sm text-on-surface-variant flex items-center gap-1 mt-0.5"}>
                    <span>
                      Pin a missing station
                    </span>
                    <span className={"inline-flex items-center px-1.5 py-0.2 rounded bg-tertiary text-on-tertiary font-bold text-[12px] tracking-wide"}>
                      
                    </span>
                  </p>
                </div>
                <span className={"material-symbols-outlined text-outline text-[20px] flex-shrink-0"}>
                  chevron_right
                </span>
              </div>
            </a>
          </section>
          <div className={"mt-4 px-3 py-2.5 rounded-xl bg-surface-container/60 border border-outline-variant/30 flex items-center justify-between text-on-surface-variant"}>
            <div className={"flex items-center gap-2"}>
              <span className={"material-symbols-outlined text-[18px] text-primary"}>
                local_shipping
              </span>
              <span className={"text-body-sm font-body-sm"}>
                
              </span>
            </div>
            <span className={"text-label-sm font-label-sm font-bold text-on-surface"}>
              JMD Tabular
            </span>
          </div>
        </main>
        <nav className={"fixed bottom-0 left-0 right-0 z-50 bg-surface/90 backdrop-blur-md shadow-[0_-4px_12px_rgba(28,25,23,0.04)] max-w-[390px] mx-auto flex justify-around items-center h-16 px-2 pb-safe border-t-0"}>
          <button onClick={onPlugClick} className={"flex flex-col items-center justify-center text-primary font-bold min-h-[48px] min-w-[48px] active:scale-95 transition-transform duration-150"} type={"button"} data-act={"fuel"}>
            <span className={"material-symbols-outlined text-[22px]"} style={{ fontVariationSettings: "'FILL' 1" }}>
              local_gas_station
            </span>
            <span className={"text-label-sm font-label-sm mt-0.5"}>
              Fuel
            </span>
          </button>
          <button onClick={onPlugClick} className={"flex flex-col items-center justify-center text-on-surface-variant hover:text-primary min-h-[48px] min-w-[48px] active:scale-95 transition-transform duration-150"} type={"button"} data-act={"map"}>
            <span className={"material-symbols-outlined text-[22px]"}>
              map
            </span>
            <span className={"text-label-sm font-label-sm mt-0.5"}>
              Map
            </span>
          </button>
          <button onClick={onPlugClick} aria-label={"Log Fuel Stop"} className={"-mt-4 w-12 h-12 rounded-full bg-gradient-to-tr from-primary to-secondary-container text-white flex items-center justify-center shadow-[0_8px_20px_-4px_rgba(234,88,12,0.35)] active:scale-90 transition-transform"} type={"button"} data-act={"add"}>
            <span className={"material-symbols-outlined text-[24px]"}>
              add
            </span>
          </button>
          <button onClick={onPlugClick} className={"flex flex-col items-center justify-center text-on-surface-variant hover:text-primary min-h-[48px] min-w-[48px] active:scale-95 transition-transform duration-150"} type={"button"} data-act={"trips"}>
            <span className={"material-symbols-outlined text-[22px]"}>
              route
            </span>
            <span className={"text-label-sm font-label-sm mt-0.5"}>
              Trips
            </span>
          </button>
          <button onClick={onPlugClick} className={"flex flex-col items-center justify-center text-on-surface-variant hover:text-primary min-h-[48px] min-w-[48px] active:scale-95 transition-transform duration-150"} type={"button"} data-act={"profile"}>
            <span className={"material-symbols-outlined text-[22px]"}>
              person
            </span>
            <span className={"text-label-sm font-label-sm mt-0.5"}>
              Profile
            </span>
          </button>
        </nav>
      </div>
    </div>
  );
}
