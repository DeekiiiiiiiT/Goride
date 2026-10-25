import { useEffect, useRef } from 'react';
import { onPlugClick } from '../../shell/actions';
import { bindScreen } from '../../shell/bind';


export function StationListScreen() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (ref.current) bindScreen("17-station-list.html", ref.current); }, []);
  return (
    <div ref={ref} data-plug-screen={"17-station-list.html"} className={"bg-surface font-body-md text-on-surface flex flex-col min-h-screen"}>
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
        <p className={"px-4 pt-2 text-center text-xs font-semibold text-on-surface-variant"}>
          Pull to refresh
        </p>
        <div className={"flex flex-col w-full"}>
          <section className={"px-margin pt-space-xs pb-space-sm flex flex-col gap-space-xs"}>
            <div className={"flex items-center justify-between"}>
              <button onClick={onPlugClick} aria-label={"Select Parish Location"} className={"inline-flex items-center gap-1.5 h-12 px-space-sm -ml-2 rounded-xl text-on-surface hover:bg-surface-container active:bg-surface-container-high transition-colors"} type={"button"} data-act={"half-way-tree-st-andrew"}>
                <span className={"material-symbols-outlined text-primary text-[20px]"} style={{ fontVariationSettings: "'FILL' 1" }}>
                  location_on
                </span>
                <span className={"font-headline-sm text-headline-sm font-bold tracking-tight"}>
                  Half-Way-Tree, St Andrew
                </span>
                <span className={"material-symbols-outlined text-on-surface-variant text-[20px]"}>
                  keyboard_arrow_down
                </span>
              </button>
              <div className={"flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface-container text-on-surface-variant shadow-sm"}>
                <span className={"w-2 h-2 rounded-full bg-secondary-container animate-pulse"} />
                <span className={"font-label-sm text-label-sm uppercase tracking-wider font-bold text-secondary"}>
                  Live Radar
                </span>
              </div>
            </div>
          </section>
          <section className={"px-margin pb-space-sm flex items-center gap-space-sm"}>
            <div className={"flex-1 flex p-1 bg-surface-container-high rounded-xl shadow-inner"} role={"tablist"}>
              <button onClick={onPlugClick} aria-selected={"false"} className={"flex-1 h-10 rounded-lg flex items-center justify-center gap-1.5 font-label-lg text-label-lg text-on-surface-variant hover:text-on-surface transition-all"} role={"tab"} type={"button"} data-act={"map"}>
                <span className={"material-symbols-outlined text-[18px]"}>
                  map
                </span>
                <span>
                  Map
                </span>
              </button>
              <button onClick={onPlugClick} aria-selected={"true"} className={"flex-1 h-10 rounded-lg bg-surface-container-lowest text-primary shadow-sm flex items-center justify-center gap-1.5 font-label-lg text-label-lg font-bold transition-all"} role={"tab"} type={"button"} data-act={"list"}>
                <span className={"material-symbols-outlined text-[18px]"}>
                  format_list_bulleted
                </span>
                <span>
                  List
                </span>
              </button>
            </div>
            <button onClick={onPlugClick} aria-label={"Filter Fuel Stations"} className={"relative min-w-[48px] h-12 px-space-md rounded-xl bg-surface-container flex items-center justify-center gap-2 text-on-surface active:bg-surface-container-highest transition-colors shadow-sm"} type={"button"} data-act={"filters-3"}>
              <span className={"material-symbols-outlined text-[20px] text-primary"}>
                tune
              </span>
              <span className={"font-label-lg text-label-lg font-semibold"}>
                Filters
              </span>
              <span className={"w-5 h-5 rounded-full bg-primary text-on-primary font-label-sm text-[12px] flex items-center justify-center leading-none font-bold"}>
                3
              </span>
            </button>
          </section>
          <section className={"w-full pb-space-sm overflow-x-auto no-scrollbar"}>
            <div className={"flex items-center gap-space-sm px-margin min-w-max"}>
              <button onClick={onPlugClick} className={"flex items-center gap-2.5 h-12 px-space-md rounded-full bg-primary text-on-primary shadow-md active:scale-95 transition-transform"} type={"button"} data-act={"e-10-87-parish-avg-j-208-20"} data-way-out={"primary"}>
                <div className={"px-2 py-0.5 rounded-full bg-surface-container-lowest text-primary font-label-sm text-label-sm font-bold"}>
                  E-10 87
                </div>
                <div className={"flex flex-col text-left"}>
                  <span className={"font-label-sm text-[12px] text-primary-fixed uppercase tracking-tight leading-none"}>
                    Parish Avg
                  </span>
                  <span className={"font-label-lg text-label-lg font-bold leading-none"}>
                    J$208.20
                  </span>
                </div>
                <span className={"material-symbols-outlined text-[18px] text-on-primary"}>
                  check_circle
                </span>
              </button>
              <button onClick={onPlugClick} className={"flex items-center gap-2.5 h-12 px-space-md rounded-full bg-surface-container text-on-surface hover:bg-surface-container-high active:scale-95 transition-all shadow-sm"} type={"button"} data-act={"e-10-90-parish-avg-j-216-40"}>
                <div className={"px-2 py-0.5 rounded-full bg-error text-on-error font-label-sm text-label-sm font-bold"}>
                  E-10 90
                </div>
                <div className={"flex flex-col text-left"}>
                  <span className={"font-label-sm text-[12px] text-on-surface-variant uppercase tracking-tight leading-none"}>
                    Parish Avg
                  </span>
                  <span className={"font-label-lg text-label-lg font-bold leading-none text-on-surface"}>
                    J$216.40
                  </span>
                </div>
              </button>
              <button onClick={onPlugClick} className={"flex items-center gap-2.5 h-12 px-space-md rounded-full bg-surface-container text-on-surface hover:bg-surface-container-high active:scale-95 transition-all shadow-sm"} type={"button"} data-act={"ulsd-parish-avg-j-219-00"}>
                <div className={"px-2 py-0.5 rounded-full bg-inverse-surface text-inverse-on-surface font-label-sm text-label-sm font-bold"}>
                  ULSD
                </div>
                <div className={"flex flex-col text-left"}>
                  <span className={"font-label-sm text-[12px] text-on-surface-variant uppercase tracking-tight leading-none"}>
                    Parish Avg
                  </span>
                  <span className={"font-label-lg text-label-lg font-bold leading-none text-on-surface"}>
                    J$219.00
                  </span>
                </div>
              </button>
            </div>
          </section>
          <section className={"px-margin py-space-xs flex items-center justify-between text-on-surface-variant font-label-sm text-label-sm"}>
            <div className={"flex items-center gap-1.5"}>
              <span className={"material-symbols-outlined text-[16px] text-tertiary"}>
                swap_vert
              </span>
              <span className={"text-on-surface"}>
                Sort:
              </span>
              <button onClick={onPlugClick} className={"font-bold text-primary underline underline-offset-4 decoration-primary/40 flex items-center"} type={"button"} data-act={"cheapest-first"}>
                Cheapest First
                <span className={"material-symbols-outlined text-[14px]"}>
                  expand_more
                </span>
              </button>
            </div>
            <div className={"flex items-center gap-1 text-on-surface-variant"}>
              <span className={"material-symbols-outlined text-[14px] text-secondary"}>
                update
              </span>
              <span>
                Petrojam sync 18m ago
              </span>
            </div>
          </section>
          <main className={"px-margin pt-space-xs flex flex-col gap-space-md"}>
            <div className={"flex items-center justify-between"}>
              <h2 className={"font-headline-sm text-headline-sm text-on-surface font-bold"}>
                18 Stations in St Andrew
              </h2>
              <span className={"font-label-sm text-label-sm text-on-surface-variant"}>
                Radius: 5 km
              </span>
            </div>
            <article className={"relative flex flex-col bg-surface-container-lowest rounded-xl p-space-md shadow-md overflow-hidden transition-all active:scale-[0.99]"}>
              <div className={"absolute top-0 right-0 bg-tertiary-fixed text-on-tertiary-fixed px-3 py-1 rounded-bl-xl flex items-center gap-1 shadow-sm"}>
                <span className={"material-symbols-outlined text-[14px]"} style={{ fontVariationSettings: "'FILL' 1" }}>
                  star
                </span>
                <span className={"font-label-sm text-[12px] font-bold tracking-wider uppercase"}>
                  Cheapest in Parish
                </span>
              </div>
              <div className={"flex items-start gap-3 pt-1"}>
                <div className={"w-12 h-12 rounded-xl bg-secondary-container text-on-primary flex items-center justify-center font-display-lg-mobile text-[16px] font-extrabold shadow-sm flex-shrink-0"}>
                  FS
                </div>
                <div className={"flex flex-col min-w-0 pr-24"}>
                  <div className={"flex items-center gap-1.5"}>
                    <h3 className={"font-headline-sm text-headline-sm font-bold text-on-surface truncate"}>
                      Fesco Beechwood
                    </h3>
                    <span className={"material-symbols-outlined text-primary text-[18px]"} style={{ fontVariationSettings: "'FILL' 1" }} title={"Community Verified"}>
                      verified
                    </span>
                  </div>
                  <p className={"font-body-sm text-body-sm text-on-surface-variant truncate"}>
                    0.8 km • Beechwood Ave, Kingston 5
                  </p>
                </div>
              </div>
              <div className={"mt-space-sm p-space-sm bg-surface-container-low rounded-xl flex items-baseline justify-between"}>
                <div className={"flex flex-col"}>
                  <span className={"font-label-sm text-label-sm text-primary font-bold uppercase tracking-wide"}>
                    E-10 87 Grade
                  </span>
                  <div className={"flex items-baseline gap-1"}>
                    <span className={"font-price-display text-price-display text-on-surface font-black"}>
                      J$208.20
                    </span>
                    <span className={"font-label-md text-label-md text-on-surface-variant"}>
                      / Litre
                    </span>
                  </div>
                </div>
                <div className={"text-right flex flex-col items-end"}>
                  <div className={"flex items-center gap-1 text-[#15803d]"}>
                    <span className={"material-symbols-outlined text-[14px]"} style={{ fontVariationSettings: "'FILL' 1" }}>
                      check_circle
                    </span>
                    <span className={"font-label-sm text-label-sm font-semibold"}>
                      Verified 22m ago
                    </span>
                  </div>
                  <span className={"font-body-sm text-[12px] text-on-surface-variant"}>
                    by Andre B.
                  </span>
                </div>
              </div>
              <div className={"mt-space-sm flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5"}>
                <span className={"inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-surface-container text-on-surface font-label-sm text-label-sm"}>
                  <span className={"material-symbols-outlined text-[14px]"}>
                    air
                  </span>
                  Free Air
                </span>
                <span className={"inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-surface-container text-on-surface font-label-sm text-label-sm"}>
                  <span className={"material-symbols-outlined text-[14px]"}>
                    wc
                  </span>
                  Restroom
                </span>
                <span className={"inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-surface-container text-on-surface font-label-sm text-label-sm"}>
                  <span className={"material-symbols-outlined text-[14px]"}>
                    storefront
                  </span>
                  Minimart
                </span>
                <span className={"inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-surface-container text-on-surface font-label-sm text-label-sm"}>
                  <span className={"material-symbols-outlined text-[14px]"}>
                    atm
                  </span>
                  NCB ATM
                </span>
              </div>
              <div className={"mt-space-md pt-space-xs flex items-center gap-space-sm"}>
                <button onClick={onPlugClick} className={"flex-1 h-12 rounded-xl bg-primary text-on-primary font-label-lg text-label-lg font-bold flex items-center justify-center gap-2 shadow-sm active:bg-on-primary-fixed-variant transition-colors"} type={"button"} data-act={"directions-3-min"} data-way-out={"primary"}>
                  <span className={"material-symbols-outlined text-[20px]"}>
                    directions
                  </span>
                  <span>
                    Directions (3 min)
                  </span>
                </button>
                <button onClick={onPlugClick} aria-label={"Log new price for Fesco"} className={"min-w-[48px] h-12 px-space-md rounded-xl bg-surface-container text-secondary font-label-lg text-label-lg font-bold flex items-center justify-center gap-1 active:bg-surface-container-high transition-colors"} type={"button"} data-act={"log"}>
                  <span className={"material-symbols-outlined text-[18px]"}>
                    add_circle
                  </span>
                  <span>
                    Log
                  </span>
                </button>
              </div>
            </article>
            <article className={"flex flex-col bg-surface-container-lowest rounded-xl p-space-md shadow-sm transition-all active:scale-[0.99]"}>
              <div className={"flex items-start justify-between gap-3"}>
                <div className={"flex items-start gap-3 min-w-0"}>
                  <div className={"w-12 h-12 rounded-xl bg-tertiary-fixed text-on-tertiary-fixed flex items-center justify-center font-display-lg-mobile text-[16px] font-extrabold shadow-sm flex-shrink-0"}>
                    CO
                  </div>
                  <div className={"flex flex-col min-w-0"}>
                    <div className={"flex items-center gap-1.5"}>
                      <h3 className={"font-headline-sm text-headline-sm font-bold text-on-surface truncate"}>
                        Cool Oasis Kingsway
                      </h3>
                      <span className={"material-symbols-outlined text-primary text-[18px]"} style={{ fontVariationSettings: "'FILL' 1" }}>
                        verified
                      </span>
                    </div>
                    <p className={"font-body-sm text-body-sm text-on-surface-variant truncate"}>
                      1.4 km • Kingsway, St Andrew
                    </p>
                  </div>
                </div>
              </div>
              <div className={"mt-space-sm p-space-sm bg-surface-container-low rounded-xl flex items-baseline justify-between"}>
                <div className={"flex flex-col"}>
                  <span className={"font-label-sm text-label-sm text-on-surface-variant font-medium"}>
                    E-10 87 Grade
                  </span>
                  <div className={"flex items-baseline gap-1"}>
                    <span className={"font-price-display text-price-display text-on-surface font-black"}>
                      J$209.50
                    </span>
                    <span className={"font-label-md text-label-md text-on-surface-variant"}>
                      / L
                    </span>
                  </div>
                </div>
                <div className={"text-right"}>
                  <span className={"inline-flex items-center gap-1 text-on-surface-variant font-label-sm text-label-sm"}>
                    <span className={"material-symbols-outlined text-[14px]"}>
                      schedule
                    </span>
                    Updated 1h ago
                  </span>
                </div>
              </div>
              <div className={"mt-space-sm flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5"}>
                <span className={"inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-surface-container text-on-surface font-label-sm text-label-sm"}>
                  <span className={"material-symbols-outlined text-[14px]"}>
                    local_car_wash
                  </span>
                  Car Wash
                </span>
                <span className={"inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-surface-container text-on-surface font-label-sm text-label-sm"}>
                  <span className={"material-symbols-outlined text-[14px]"}>
                    air
                  </span>
                  Air Pump
                </span>
                <span className={"inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-surface-container text-on-surface font-label-sm text-label-sm"}>
                  <span className={"material-symbols-outlined text-[14px]"}>
                    nest_clock_farsight_analog
                  </span>
                  24/7
                </span>
              </div>
              <div className={"mt-space-md pt-space-xs flex items-center gap-space-sm"}>
                <button onClick={onPlugClick} className={"w-full h-12 rounded-xl bg-primary text-on-primary font-label-lg text-label-lg font-bold flex items-center justify-center gap-2 shadow-sm active:bg-on-primary-fixed-variant transition-colors"} type={"button"} data-act={"directions-5-min"} data-way-out={"primary"}>
                  <span className={"material-symbols-outlined text-[20px]"}>
                    directions
                  </span>
                  <span>
                    Directions (5 min)
                  </span>
                </button>
              </div>
            </article>
            <article className={"flex flex-col bg-surface-container-lowest rounded-xl p-space-md shadow-sm transition-all active:scale-[0.99]"}>
              <div className={"flex items-start justify-between gap-3"}>
                <div className={"flex items-start gap-3 min-w-0"}>
                  <div className={"w-12 h-12 rounded-xl bg-error text-on-error flex items-center justify-center font-display-lg-mobile text-[16px] font-extrabold shadow-sm flex-shrink-0"}>
                    TX
                  </div>
                  <div className={"flex flex-col min-w-0"}>
                    <div className={"flex items-center gap-1.5"}>
                      <h3 className={"font-headline-sm text-headline-sm font-bold text-on-surface truncate"}>
                        Texaco Clock Tower
                      </h3>
                      <span className={"material-symbols-outlined text-primary text-[18px]"} style={{ fontVariationSettings: "'FILL' 1" }}>
                        verified
                      </span>
                    </div>
                    <p className={"font-body-sm text-body-sm text-on-surface-variant truncate"}>
                      0.4 km • Half-Way-Tree Rd
                    </p>
                  </div>
                </div>
              </div>
              <div className={"mt-space-sm p-space-sm bg-surface-container-low rounded-xl flex items-baseline justify-between"}>
                <div className={"flex flex-col"}>
                  <span className={"font-label-sm text-label-sm text-on-surface-variant font-medium"}>
                    E-10 87 Grade
                  </span>
                  <div className={"flex items-baseline gap-1"}>
                    <span className={"font-price-display text-price-display text-on-surface font-black"}>
                      J$214.50
                    </span>
                    <span className={"font-label-md text-label-md text-on-surface-variant"}>
                      / L
                    </span>
                  </div>
                </div>
                <div className={"text-right"}>
                  <span className={"inline-flex items-center gap-1 text-on-surface-variant font-label-sm text-label-sm"}>
                    <span className={"material-symbols-outlined text-[14px]"}>
                      schedule
                    </span>
                    Updated 3h ago
                  </span>
                </div>
              </div>
              <div className={"mt-space-sm flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5"}>
                <span className={"inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-surface-container text-on-surface font-label-sm text-label-sm"}>
                  <span className={"material-symbols-outlined text-[14px]"}>
                    storefront
                  </span>
                  Star Mart
                </span>
                <span className={"inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-surface-container text-on-surface font-label-sm text-label-sm"}>
                  <span className={"material-symbols-outlined text-[14px]"}>
                    atm
                  </span>
                  ATM
                </span>
                <span className={"inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-surface-container text-on-surface font-label-sm text-label-sm"}>
                  <span className={"material-symbols-outlined text-[14px]"}>
                    wc
                  </span>
                  Restroom
                </span>
              </div>
              <div className={"mt-space-md pt-space-xs flex items-center gap-space-sm"}>
                <button onClick={onPlugClick} className={"w-full h-12 rounded-xl bg-primary text-on-primary font-label-lg text-label-lg font-bold flex items-center justify-center gap-2 shadow-sm active:bg-on-primary-fixed-variant transition-colors"} type={"button"} data-act={"directions-2-min"} data-way-out={"primary"}>
                  <span className={"material-symbols-outlined text-[20px]"}>
                    directions
                  </span>
                  <span>
                    Directions (2 min)
                  </span>
                </button>
              </div>
            </article>
            <article className={"flex flex-col bg-surface-container-lowest rounded-xl p-space-md shadow-sm transition-all active:scale-[0.99]"}>
              <div className={"flex items-start justify-between gap-3"}>
                <div className={"flex items-start gap-3 min-w-0"}>
                  <div className={"w-12 h-12 rounded-xl bg-surface-container-highest text-on-surface flex items-center justify-center font-display-lg-mobile text-[16px] font-extrabold shadow-sm flex-shrink-0"}>
                    TE
                  </div>
                  <div className={"flex flex-col min-w-0"}>
                    <h3 className={"font-headline-sm text-headline-sm font-bold text-on-surface truncate"}>
                      Total Constant Spring
                    </h3>
                    <p className={"font-body-sm text-body-sm text-on-surface-variant truncate"}>
                      1.6 km • Constant Spring Rd
                    </p>
                  </div>
                </div>
              </div>
              <div className={"mt-space-sm p-space-sm bg-surface-container-low rounded-xl flex items-baseline justify-between"}>
                <div className={"flex flex-col"}>
                  <span className={"font-label-sm text-label-sm text-on-surface-variant font-medium"}>
                    E-10 87 Grade
                  </span>
                  <div className={"flex items-baseline gap-1"}>
                    <span className={"font-price-display text-price-display text-on-surface font-black"}>
                      J$217.90
                    </span>
                    <span className={"font-label-md text-label-md text-on-surface-variant"}>
                      / L
                    </span>
                  </div>
                </div>
                <div className={"text-right flex flex-col items-end"}>
                  <span className={"inline-flex items-center gap-1 text-on-surface-variant font-label-sm text-label-sm"}>
                    <span className={"material-symbols-outlined text-[14px]"}>
                      history
                    </span>
                    5h ago
                  </span>
                  <span className={"px-2 py-0.5 rounded bg-surface-container-highest text-on-surface-variant font-label-sm text-[12px] font-medium tracking-tight"}>
                    Unconfirmed Driver Report
                  </span>
                </div>
              </div>
              <div className={"mt-space-sm flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5"}>
                <span className={"inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-surface-container text-on-surface font-label-sm text-label-sm"}>
                  <span className={"material-symbols-outlined text-[14px]"}>
                    coffee
                  </span>
                  Bonjour Cafe
                </span>
                <span className={"inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-surface-container text-on-surface font-label-sm text-label-sm"}>
                  <span className={"material-symbols-outlined text-[14px]"}>
                    air
                  </span>
                  Free Air
                </span>
                <span className={"inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-surface-container text-on-surface font-label-sm text-label-sm"}>
                  <span className={"material-symbols-outlined text-[14px]"}>
                    ev_station
                  </span>
                  EV Fast
                </span>
              </div>
              <div className={"mt-space-md pt-space-xs flex items-center gap-space-sm"}>
                <button onClick={onPlugClick} className={"w-full h-12 rounded-xl bg-primary text-on-primary font-label-lg text-label-lg font-bold flex items-center justify-center gap-2 shadow-sm active:bg-on-primary-fixed-variant transition-colors"} type={"button"} data-act={"directions-6-min"} data-way-out={"primary"}>
                  <span className={"material-symbols-outlined text-[20px]"}>
                    directions
                  </span>
                  <span>
                    Directions (6 min)
                  </span>
                </button>
              </div>
            </article>
            <article className={"flex flex-col bg-surface-container-lowest rounded-xl p-space-md shadow-sm transition-all active:scale-[0.99]"}>
              <div className={"flex items-start justify-between gap-3"}>
                <div className={"flex items-start gap-3 min-w-0"}>
                  <div className={"w-12 h-12 rounded-xl bg-inverse-primary text-on-primary-fixed flex items-center justify-center font-display-lg-mobile text-[16px] font-extrabold shadow-sm flex-shrink-0"}>
                    RB
                  </div>
                  <div className={"flex flex-col min-w-0"}>
                    <h3 className={"font-headline-sm text-headline-sm font-bold text-on-surface truncate"}>
                      Rubis Dunrobin
                    </h3>
                    <p className={"font-body-sm text-body-sm text-on-surface-variant truncate"}>
                      2.1 km • Dunrobin Ave
                    </p>
                  </div>
                </div>
              </div>
              <div className={"mt-space-sm p-space-sm bg-surface-container-low rounded-xl flex items-baseline justify-between"}>
                <div className={"flex flex-col"}>
                  <span className={"font-label-sm text-label-sm text-on-surface-variant font-medium"}>
                    E-10 87 Grade
                  </span>
                  <div className={"flex items-baseline gap-1"}>
                    <span className={"font-price-display text-price-display text-on-surface font-black"}>
                      J$215.20
                    </span>
                    <span className={"font-label-md text-label-md text-on-surface-variant"}>
                      / L
                    </span>
                  </div>
                </div>
                <div className={"text-right"}>
                  <span className={"inline-flex items-center gap-1 text-on-surface-variant font-label-sm text-label-sm"}>
                    <span className={"material-symbols-outlined text-[14px]"}>
                      calendar_today
                    </span>
                    Updated yesterday
                  </span>
                </div>
              </div>
              <div className={"mt-space-sm flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5"}>
                <span className={"inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-surface-container text-on-surface font-label-sm text-label-sm"}>
                  <span className={"material-symbols-outlined text-[14px]"}>
                    air
                  </span>
                  Air
                </span>
                <span className={"inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-surface-container text-on-surface font-label-sm text-label-sm"}>
                  <span className={"material-symbols-outlined text-[14px]"}>
                    shopping_bag
                  </span>
                  Ultra Shop
                </span>
              </div>
              <div className={"mt-space-md pt-space-xs flex items-center gap-space-sm"}>
                <button onClick={onPlugClick} className={"w-full h-12 rounded-xl bg-primary text-on-primary font-label-lg text-label-lg font-bold flex items-center justify-center gap-2 shadow-sm active:bg-on-primary-fixed-variant transition-colors"} type={"button"} data-act={"directions-7-min"} data-way-out={"primary"}>
                  <span className={"material-symbols-outlined text-[20px]"}>
                    directions
                  </span>
                  <span>
                    Directions (7 min)
                  </span>
                </button>
              </div>
            </article>
            <div className={"p-space-md rounded-xl bg-surface-container flex items-center gap-3"}>
              <div className={"w-10 h-10 rounded-full bg-tertiary-fixed text-on-tertiary-fixed flex items-center justify-center flex-shrink-0"}>
                <span className={"material-symbols-outlined text-[20px]"}>
                  lightbulb
                </span>
              </div>
              <div className={"flex flex-col min-w-0"}>
                <span className={"font-label-sm text-label-sm font-bold uppercase tracking-wider text-secondary"}>
                  Roam Driver Tip
                </span>
                <p className={"font-body-sm text-body-sm text-on-surface"}>
                  Prices in Half-Way-Tree drop on Thursday mornings following weekly Petrojam changes. Keep tracking!
                </p>
              </div>
            </div>
          </main>
        </div>
      </main>
    </div>
  );
}
