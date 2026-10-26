import { useEffect, useRef } from 'react';
import { onPlugClick } from '../../shell/actions';
import { bindScreen } from '../../shell/bind';


export function PartsCategoriesScreen() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (ref.current) bindScreen("38-parts-categories.html", ref.current); }, []);
  return (
    <div ref={ref} data-plug-screen={"38-parts-categories.html"} className={"bg-surface font-body-md text-on-surface flex flex-col min-h-screen"}>
      <header className={"fixed top-0 w-full z-50 pt-safe bg-surface/80 backdrop-blur-xl shadow-[0_1px_8px_rgba(0,0,0,0.04)]"}>
        <div className={"h-16 px-gutter flex items-center justify-between gap-space-sm"}>
          <div className={"flex items-center gap-space-sm min-w-0"}>
            <button onClick={onPlugClick} aria-label={"Go back"} className={"w-12 h-12 rounded-full flex items-center justify-center text-on-surface hover:bg-surface-container-high transition-colors active:scale-95"} data-act={"arrow-back"} data-way-out={"back"}>
              <span className={"material-symbols-outlined text-[24px]"}>
                arrow_back
              </span>
            </button>
            <div className={"flex flex-col min-w-0"}>
              <h1 className={"font-headline-sm text-headline-sm text-on-surface truncate"}>
                Parts For My Car Categories
              </h1>
              <span className={"font-label-md text-label-md text-on-surface-variant truncate"} data-slot={"car"}>
                Add a car</span>
            </div>
          </div>
          <div className={"flex items-center gap-space-xs"}>
            <div className={"w-8 h-8 rounded-full bg-primary flex items-center justify-center"}>
              <span className={"material-symbols-outlined text-on-primary text-[18px]"}>
                person
              </span>
            </div>
          </div>
        </div>
      </header>
      <main className={"flex-1 flex flex-col relative w-full px-gutter pt-16 pb-safe bg-surface"}>
        <div className={"flex flex-col w-full pb-8"}>
          <div className={"mb-4"}>
            <div className={"relative flex items-center"}>
              <div className={"absolute left-3.5 flex items-center pointer-events-none text-on-surface-variant"}>
                <span className={"material-symbols-outlined text-[22px]"}>
                  search
                </span>
              </div>
              <input onClick={onPlugClick} className={"w-full h-12 pl-11 pr-10 rounded-xl bg-surface-container-lowest font-body-md text-body-md text-on-surface placeholder:text-outline shadow-sm focus:outline-none focus:bg-surface-container-lowest focus:ring-0 active:bg-surface-container-lowest transition-all"} id={"parts-search-input"} placeholder={"Search part"} type={"search"} data-act={"parts-search-input"} />
              <button onClick={onPlugClick} aria-label={"Clear search"} className={"absolute right-3 w-8 h-8 flex items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-high transition-colors"} id={"clear-search-btn"} type={"button"} data-act={"clear-search-btn"} data-way-out={"back"}>
                <span className={"material-symbols-outlined text-[18px]"}>
                  close
                </span>
              </button>
            </div>
          </div>
          <div className={"mb-6"}>
            <div className={"flex items-center justify-between mb-3"}>
              <div className={"flex items-center gap-2"}>
                <span className={"material-symbols-outlined text-primary text-[20px]"}>
                  category
                </span>
                <h2 className={"font-headline-sm text-headline-sm text-on-surface"}>
                  Browse by Category
                </h2>
              </div>
              <span className={"font-label-md text-label-md text-on-surface-variant"}>
                10 Sectors
              </span>
            </div>
            <div className={"grid grid-cols-2 gap-3"}>
              <a onClick={onPlugClick} className={"bg-surface-container-lowest hover:bg-surface-container active:scale-[0.98] transition-all p-3.5 rounded-xl shadow-sm flex flex-col justify-between min-h-[120px] group"} href={"#"} data-act={"filters-oil-air-cabin-fuel"}>
                <div className={"flex items-center justify-between"}>
                  <div className={"w-10 h-10 rounded-lg bg-surface-container flex items-center justify-center group-hover:bg-primary-fixed transition-colors"}>
                    <span className={"material-symbols-outlined text-primary text-[24px]"}>
                      filter_alt
                    </span>
                  </div>
                  <span className={"material-symbols-outlined text-outline-variant group-hover:text-primary text-[18px]"}>
                    chevron_right
                  </span>
                </div>
                <div className={"mt-2 min-w-0"}>
                  <h3 className={"font-label-lg text-label-lg text-on-surface font-bold group-hover:text-primary transition-colors"}>
                    Filters
                  </h3>
                  <p className={"font-body-sm text-body-sm text-on-surface-variant truncate mt-0.5"}>
                    Oil, Air, Cabin, Fuel
                  </p>
                </div>
              </a>
              <a onClick={onPlugClick} className={"bg-surface-container-lowest hover:bg-surface-container active:scale-[0.98] transition-all p-3.5 rounded-xl shadow-sm flex flex-col justify-between min-h-[120px] group"} href={"#"} data-act={"brakes-pads-rotors-shoes-fluid"}>
                <div className={"flex items-center justify-between"}>
                  <div className={"w-10 h-10 rounded-lg bg-surface-container flex items-center justify-center group-hover:bg-primary-fixed transition-colors"}>
                    <span className={"material-symbols-outlined text-primary text-[24px]"}>
                      do_not_disturb_on
                    </span>
                  </div>
                  <span className={"material-symbols-outlined text-outline-variant group-hover:text-primary text-[18px]"}>
                    chevron_right
                  </span>
                </div>
                <div className={"mt-2 min-w-0"}>
                  <h3 className={"font-label-lg text-label-lg text-on-surface font-bold group-hover:text-primary transition-colors"}>
                    Brakes
                  </h3>
                  <p className={"font-body-sm text-body-sm text-on-surface-variant truncate mt-0.5"}>
                    Pads, Rotors, Shoes, Fluid
                  </p>
                </div>
              </a>
              <a onClick={onPlugClick} className={"bg-surface-container-lowest hover:bg-surface-container active:scale-[0.98] transition-all p-3.5 rounded-xl shadow-sm flex flex-col justify-between min-h-[120px] group"} href={"#"} data-act={"engine-belts-mounts-plugs"}>
                <div className={"flex items-center justify-between"}>
                  <div className={"w-10 h-10 rounded-lg bg-surface-container flex items-center justify-center group-hover:bg-primary-fixed transition-colors"}>
                    <span className={"material-symbols-outlined text-primary text-[24px]"}>
                      engineering
                    </span>
                  </div>
                  <span className={"material-symbols-outlined text-outline-variant group-hover:text-primary text-[18px]"}>
                    chevron_right
                  </span>
                </div>
                <div className={"mt-2 min-w-0"}>
                  <h3 className={"font-label-lg text-label-lg text-on-surface font-bold group-hover:text-primary transition-colors"}>
                    Engine
                  </h3>
                  <p className={"font-body-sm text-body-sm text-on-surface-variant truncate mt-0.5"}>
                    Belts, Mounts, Plugs
                  </p>
                </div>
              </a>
              <a onClick={onPlugClick} className={"bg-surface-container-lowest hover:bg-surface-container active:scale-[0.98] transition-all p-3.5 rounded-xl shadow-sm flex flex-col justify-between min-h-[120px] group"} href={"#"} data-act={"suspension-shocks-bushings-links"}>
                <div className={"flex items-center justify-between"}>
                  <div className={"w-10 h-10 rounded-lg bg-surface-container flex items-center justify-center group-hover:bg-primary-fixed transition-colors"}>
                    <span className={"material-symbols-outlined text-primary text-[24px]"}>
                      swap_vertical_circle
                    </span>
                  </div>
                  <span className={"material-symbols-outlined text-outline-variant group-hover:text-primary text-[18px]"}>
                    chevron_right
                  </span>
                </div>
                <div className={"mt-2 min-w-0"}>
                  <h3 className={"font-label-lg text-label-lg text-on-surface font-bold group-hover:text-primary transition-colors"}>
                    Suspension
                  </h3>
                  <p className={"font-body-sm text-body-sm text-on-surface-variant truncate mt-0.5"}>
                    Shocks, Bushings, Links
                  </p>
                </div>
              </a>
              <a onClick={onPlugClick} className={"bg-surface-container-lowest hover:bg-surface-container active:scale-[0.98] transition-all p-3.5 rounded-xl shadow-sm flex flex-col justify-between min-h-[120px] group"} href={"#"} data-act={"electrical-sensors-alternator-fuses"}>
                <div className={"flex items-center justify-between"}>
                  <div className={"w-10 h-10 rounded-lg bg-surface-container flex items-center justify-center group-hover:bg-primary-fixed transition-colors"}>
                    <span className={"material-symbols-outlined text-primary text-[24px]"}>
                      flash_on
                    </span>
                  </div>
                  <span className={"material-symbols-outlined text-outline-variant group-hover:text-primary text-[18px]"}>
                    chevron_right
                  </span>
                </div>
                <div className={"mt-2 min-w-0"}>
                  <h3 className={"font-label-lg text-label-lg text-on-surface font-bold group-hover:text-primary transition-colors"}>
                    Electrical
                  </h3>
                  <p className={"font-body-sm text-body-sm text-on-surface-variant truncate mt-0.5"}>
                    Sensors, Alternator, Fuses
                  </p>
                </div>
              </a>
              <a onClick={onPlugClick} className={"bg-surface-container-lowest hover:bg-surface-container active:scale-[0.98] transition-all p-3.5 rounded-xl shadow-sm flex flex-col justify-between min-h-[120px] group"} href={"#"} data-act={"cooling-radiator-pump-coolant"}>
                <div className={"flex items-center justify-between"}>
                  <div className={"w-10 h-10 rounded-lg bg-surface-container flex items-center justify-center group-hover:bg-primary-fixed transition-colors"}>
                    <span className={"material-symbols-outlined text-primary text-[24px]"}>
                      ac_unit
                    </span>
                  </div>
                  <span className={"material-symbols-outlined text-outline-variant group-hover:text-primary text-[18px]"}>
                    chevron_right
                  </span>
                </div>
                <div className={"mt-2 min-w-0"}>
                  <h3 className={"font-label-lg text-label-lg text-on-surface font-bold group-hover:text-primary transition-colors"}>
                    Cooling
                  </h3>
                  <p className={"font-body-sm text-body-sm text-on-surface-variant truncate mt-0.5"}>
                    Radiator, Pump, Coolant
                  </p>
                </div>
              </a>
              <a onClick={onPlugClick} className={"bg-surface-container-lowest hover:bg-surface-container active:scale-[0.98] transition-all p-3.5 rounded-xl shadow-sm flex flex-col justify-between min-h-[120px] group"} href={"#"} data-act={"belts-serpentine-accessory"}>
                <div className={"flex items-center justify-between"}>
                  <div className={"w-10 h-10 rounded-lg bg-surface-container flex items-center justify-center group-hover:bg-primary-fixed transition-colors"}>
                    <span className={"material-symbols-outlined text-primary text-[24px]"}>
                      cached
                    </span>
                  </div>
                  <span className={"material-symbols-outlined text-outline-variant group-hover:text-primary text-[18px]"}>
                    chevron_right
                  </span>
                </div>
                <div className={"mt-2 min-w-0"}>
                  <h3 className={"font-label-lg text-label-lg text-on-surface font-bold group-hover:text-primary transition-colors"}>
                    Belts
                  </h3>
                  <p className={"font-body-sm text-body-sm text-on-surface-variant truncate mt-0.5"}>
                    Serpentine, Accessory
                  </p>
                </div>
              </a>
              <a onClick={onPlugClick} className={"bg-surface-container-lowest hover:bg-surface-container active:scale-[0.98] transition-all p-3.5 rounded-xl shadow-sm flex flex-col justify-between min-h-[120px] group"} href={"#"} data-act={"lighting-led-bulbs-fog-lamps"}>
                <div className={"flex items-center justify-between"}>
                  <div className={"w-10 h-10 rounded-lg bg-surface-container flex items-center justify-center group-hover:bg-primary-fixed transition-colors"}>
                    <span className={"material-symbols-outlined text-primary text-[24px]"}>
                      highlight
                    </span>
                  </div>
                  <span className={"material-symbols-outlined text-outline-variant group-hover:text-primary text-[18px]"}>
                    chevron_right
                  </span>
                </div>
                <div className={"mt-2 min-w-0"}>
                  <h3 className={"font-label-lg text-label-lg text-on-surface font-bold group-hover:text-primary transition-colors"}>
                    Lighting
                  </h3>
                  <p className={"font-body-sm text-body-sm text-on-surface-variant truncate mt-0.5"}>
                    LED Bulbs, Fog Lamps
                  </p>
                </div>
              </a>
              <a onClick={onPlugClick} className={"bg-surface-container-lowest hover:bg-surface-container active:scale-[0.98] transition-all p-3.5 rounded-xl shadow-sm flex flex-col justify-between min-h-[120px] group"} href={"#"} data-act={"wipers-hybrid-20-14-rear"}>
                <div className={"flex items-center justify-between"}>
                  <div className={"w-10 h-10 rounded-lg bg-surface-container flex items-center justify-center group-hover:bg-primary-fixed transition-colors"}>
                    <span className={"material-symbols-outlined text-primary text-[24px]"}>
                      water_drop
                    </span>
                  </div>
                  <span className={"material-symbols-outlined text-outline-variant group-hover:text-primary text-[18px]"}>
                    chevron_right
                  </span>
                </div>
                <div className={"mt-2 min-w-0"}>
                  <h3 className={"font-label-lg text-label-lg text-on-surface font-bold group-hover:text-primary transition-colors"}>
                    Wipers
                  </h3>
                  <p className={"font-body-sm text-body-sm text-on-surface-variant truncate mt-0.5"}>
                    Hybrid 20"/14", Rear
                  </p>
                </div>
              </a>
              <a onClick={onPlugClick} className={"bg-surface-container-lowest hover:bg-surface-container active:scale-[0.98] transition-all p-3.5 rounded-xl shadow-sm flex flex-col justify-between min-h-[120px] group"} href={"#"} data-act={"fluids-0w-20-cvt-tc-dot4"}>
                <div className={"flex items-center justify-between"}>
                  <div className={"w-10 h-10 rounded-lg bg-surface-container flex items-center justify-center group-hover:bg-primary-fixed transition-colors"}>
                    <span className={"material-symbols-outlined text-primary text-[24px]"}>
                      science
                    </span>
                  </div>
                  <span className={"material-symbols-outlined text-outline-variant group-hover:text-primary text-[18px]"}>
                    chevron_right
                  </span>
                </div>
                <div className={"mt-2 min-w-0"}>
                  <h3 className={"font-label-lg text-label-lg text-on-surface font-bold group-hover:text-primary transition-colors"}>
                    Fluids
                  </h3>
                  <p className={"font-body-sm text-body-sm text-on-surface-variant truncate mt-0.5"}>
                    0W-20, CVT TC, DOT4
                  </p>
                </div>
              </a>
            </div>
          </div>
          <div className={"bg-surface-container rounded-xl p-space-md shadow-sm flex flex-col gap-space-sm"}>
            <h3 className={"font-headline-sm text-headline-sm text-on-surface"}>
              Looking for a store?
            </h3>
            <p className={"font-body-sm text-body-sm text-on-surface-variant"}>
              Approved parts stores show on the map.
            </p>
            <button onClick={onPlugClick} className={"w-full min-h-12 rounded-lg bg-primary text-on-primary font-label-lg text-label-lg flex items-center justify-center gap-space-sm"} data-act={"parts-stores"} data-way-out={"primary"}>
              Parts stores
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
