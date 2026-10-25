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
            <button onClick={onPlugClick} className={"w-full bg-surface-container hover:bg-surface-container-high transition-colors rounded-xl p-space-md shadow-sm flex items-center justify-between text-left active:scale-[0.99] group"} type={"button"} data-act={"2019-toyota-roomy-8241-hy-1kr-fe-turbo-jdm-impor"}>
              <div className={"flex items-center gap-space-sm min-w-0"}>
                <div className={"w-11 h-11 rounded-lg bg-primary-fixed flex items-center justify-center shrink-0"}>
                  <span className={"material-symbols-outlined text-on-primary-fixed text-[24px]"}>
                    directions_car
                  </span>
                </div>
                <div className={"flex flex-col min-w-0"}>
                  <div className={"flex items-center gap-1.5"}>
                    <span className={"font-headline-sm text-headline-sm text-on-surface truncate"} data-slot={"car"}>
                      Add a car</span>
                    <span className={"material-symbols-outlined text-primary text-[20px] transition-transform group-hover:translate-y-0.5"}>
                      expand_more
                    </span>
                  </div>
                  <div className={"flex items-center gap-2 mt-0.5 text-on-surface-variant font-label-md text-label-md flex-wrap"}>
                    <span className={"bg-surface-container-highest px-1.5 py-0.5 rounded text-on-surface font-semibold"}>
                      
                    </span>
                    <span>
                      1KR-FE Turbo
                    </span>
                    <span className={"text-secondary font-medium"}>
                      JDM Import (M900A)
                    </span>
                  </div>
                </div>
              </div>
              <div className={"shrink-0 pl-2"}>
                <span className={"font-label-sm text-label-sm text-primary uppercase tracking-wider font-bold bg-primary-fixed/60 px-2 py-1 rounded-full"}>
                  Active
                </span>
              </div>
            </button>
          </div>
          <div className={"mb-4"}>
            <div className={"relative flex items-center"}>
              <div className={"absolute left-3.5 flex items-center pointer-events-none text-on-surface-variant"}>
                <span className={"material-symbols-outlined text-[22px]"}>
                  search
                </span>
              </div>
              <input onClick={onPlugClick} className={"w-full h-12 pl-11 pr-10 rounded-xl bg-surface-container-lowest font-body-md text-body-md text-on-surface placeholder:text-outline shadow-sm focus:outline-none focus:bg-surface-container-lowest focus:ring-0 active:bg-surface-container-lowest transition-all"} id={"parts-search-input"} placeholder={"Search part (e.g. brake pads, 04465-B1170)..."} type={"search"} data-act={"parts-search-input"} />
              <button onClick={onPlugClick} aria-label={"Clear search"} className={"absolute right-3 w-8 h-8 flex items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-high transition-colors"} id={"clear-search-btn"} type={"button"} data-act={"clear-search-btn"} data-way-out={"back"}>
                <span className={"material-symbols-outlined text-[18px]"}>
                  close
                </span>
              </button>
            </div>
          </div>
          <div className={"mb-5 bg-gradient-to-r from-primary-container via-secondary-container to-tertiary-container text-on-primary p-space-md rounded-xl shadow-md relative overflow-hidden"}>
            <div className={"absolute -right-4 -bottom-4 w-28 h-28 opacity-15 pointer-events-none"}>
              <span className={"material-symbols-outlined text-[120px]"}>
                verified_user
              </span>
            </div>
            <div className={"relative z-10"}>
              <div className={"flex items-center gap-1.5 mb-1"}>
                <span className={"material-symbols-outlined text-tertiary-fixed text-[20px]"} style={{ fontVariationSettings: "'FILL' 1" }}>
                  electric_bolt
                </span>
                <h2 className={"font-headline-sm text-headline-sm text-on-primary"}>
                  {"JDM & Caribbean Fitment Match"}
                </h2>
              </div>
              <p className={"font-body-sm text-body-sm text-on-primary/95 pr-6 leading-relaxed"}>
                {"We auto-cross-reference your JDM Roomy chassis with sister Daihatsu Thor & Subaru Justy codes stocked right here in Jamaican auto supply warehouses."}
              </p>
            </div>
          </div>
          <div className={"mb-6"}>
            <div className={"flex items-center justify-between mb-2.5"}>
              <div className={"flex items-center gap-2"}>
                <span className={"material-symbols-outlined text-primary text-[20px]"}>
                  auto_fix_high
                </span>
                <h2 className={"font-headline-sm text-headline-sm text-on-surface"}>
                  Common for Your Roomy
                </h2>
              </div>
              <span className={"font-label-md text-label-md text-secondary font-semibold"}>
                1KR-FE Specs
              </span>
            </div>
            <div className={"flex gap-3 overflow-x-auto pb-2 -mx-gutter px-gutter no-scrollbar scroll-smooth"}>
              <div className={"shrink-0 w-60 bg-surface-container-lowest rounded-xl p-space-sm shadow-sm flex flex-col justify-between"}>
                <div>
                  <div className={"flex items-center justify-between mb-2"}>
                    <div className={"w-8 h-8 rounded-lg bg-error-container text-on-error-container flex items-center justify-center"}>
                      <span className={"material-symbols-outlined text-[20px]"}>
                        oil_barrel
                      </span>
                    </div>
                    <span className={"font-label-sm text-label-sm px-2 py-0.5 rounded-full bg-error-container text-on-error-container font-bold"}>
                      Due Soon
                    </span>
                  </div>
                  <h3 className={"font-label-lg text-label-lg text-on-surface font-semibold"}>
                    Oil Filter
                  </h3>
                  <p className={"font-body-sm text-body-sm text-on-surface-variant mt-0.5"}>
                    OEM: 04152-40060
                  </p>
                  <p className={"font-label-sm text-label-sm text-secondary font-medium mt-1"}>
                    Cross-fit: Daihatsu Thor
                  </p>
                </div>
                <div className={"pt-3 mt-2"}>
                  <a onClick={onPlugClick} className={"inline-flex items-center gap-1 font-label-md text-label-md text-primary font-bold hover:text-primary-container"} href={"#"} data-act={"view-fits"}>
                    View fits
                    <span className={"material-symbols-outlined text-[16px]"}>
                      arrow_forward
                    </span>
                  </a>
                </div>
              </div>
              <div className={"shrink-0 w-60 bg-surface-container-lowest rounded-xl p-space-sm shadow-sm flex flex-col justify-between"}>
                <div>
                  <div className={"flex items-center justify-between mb-2"}>
                    <div className={"w-8 h-8 rounded-lg bg-secondary-fixed text-on-secondary-fixed flex items-center justify-center"}>
                      <span className={"material-symbols-outlined text-[20px]"}>
                        air
                      </span>
                    </div>
                    <span className={"font-label-sm text-label-sm px-2 py-0.5 rounded-full bg-surface-container-highest text-on-surface font-semibold"}>
                      Kingston Dust Spec
                    </span>
                  </div>
                  <h3 className={"font-label-lg text-label-lg text-on-surface font-semibold"}>
                    Air Filter
                  </h3>
                  <p className={"font-body-sm text-body-sm text-on-surface-variant mt-0.5"}>
                    High-flow pleated element
                  </p>
                  <p className={"font-label-sm text-label-sm text-secondary font-medium mt-1"}>
                    OEM: 17801-B1020
                  </p>
                </div>
                <div className={"pt-3 mt-2"}>
                  <a onClick={onPlugClick} className={"inline-flex items-center gap-1 font-label-md text-label-md text-primary font-bold hover:text-primary-container"} href={"#"} data-act={"view-fits-2"}>
                    View fits
                    <span className={"material-symbols-outlined text-[16px]"}>
                      arrow_forward
                    </span>
                  </a>
                </div>
              </div>
              <div className={"shrink-0 w-60 bg-surface-container-lowest rounded-xl p-space-sm shadow-sm flex flex-col justify-between"}>
                <div>
                  <div className={"flex items-center justify-between mb-2"}>
                    <div className={"w-8 h-8 rounded-lg bg-tertiary-fixed text-on-tertiary-fixed flex items-center justify-center"}>
                      <span className={"material-symbols-outlined text-[20px]"}>
                        bolt
                      </span>
                    </div>
                    <span className={"font-label-sm text-label-sm px-2 py-0.5 rounded-full bg-tertiary-fixed text-on-tertiary-fixed font-semibold"}>
                      Turbo Spec
                    </span>
                  </div>
                  <h3 className={"font-label-lg text-label-lg text-on-surface font-semibold"}>
                    Spark Plugs (Set of 3)
                  </h3>
                  <p className={"font-body-sm text-body-sm text-on-surface-variant mt-0.5"}>
                    NGK Iridium ILKR7D8
                  </p>
                  <p className={"font-label-sm text-label-sm text-secondary font-medium mt-1"}>
                    Pre-gapped 0.8mm
                  </p>
                </div>
                <div className={"pt-3 mt-2"}>
                  <a onClick={onPlugClick} className={"inline-flex items-center gap-1 font-label-md text-label-md text-primary font-bold hover:text-primary-container"} href={"#"} data-act={"view-fits-3"}>
                    View fits
                    <span className={"material-symbols-outlined text-[16px]"}>
                      arrow_forward
                    </span>
                  </a>
                </div>
              </div>
              <div className={"shrink-0 w-60 bg-surface-container-lowest rounded-xl p-space-sm shadow-sm flex flex-col justify-between"}>
                <div>
                  <div className={"flex items-center justify-between mb-2"}>
                    <div className={"w-8 h-8 rounded-lg bg-primary-fixed text-on-primary-fixed flex items-center justify-center"}>
                      <span className={"material-symbols-outlined text-[20px]"}>
                        trip_origin
                      </span>
                    </div>
                    <span className={"font-label-sm text-label-sm px-2 py-0.5 rounded-full bg-surface-container-highest text-on-surface font-semibold"}>
                      Hill Grade
                    </span>
                  </div>
                  <h3 className={"font-label-lg text-label-lg text-on-surface font-semibold"}>
                    Front Brake Pads
                  </h3>
                  <p className={"font-body-sm text-body-sm text-on-surface-variant mt-0.5"}>
                    Ceramic anti-fade series
                  </p>
                  <p className={"font-label-sm text-label-sm text-secondary font-medium mt-1"}>
                    OEM: 04465-B1170
                  </p>
                </div>
                <div className={"pt-3 mt-2"}>
                  <a onClick={onPlugClick} className={"inline-flex items-center gap-1 font-label-md text-label-md text-primary font-bold hover:text-primary-container"} href={"#"} data-act={"view-fits-4"}>
                    View fits
                    <span className={"material-symbols-outlined text-[16px]"}>
                      arrow_forward
                    </span>
                  </a>
                </div>
              </div>
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
          <div className={"bg-surface-container rounded-xl p-space-md shadow-sm"}>
            <div className={"flex items-start gap-space-sm"}>
              <div className={"w-10 h-10 rounded-full bg-secondary-fixed text-on-secondary-fixed flex items-center justify-center shrink-0"}>
                <span className={"material-symbols-outlined text-[22px]"}>
                  contact_support
                </span>
              </div>
              <div className={"flex-1 min-w-0"}>
                <h3 className={"font-headline-sm text-headline-sm text-on-surface"}>
                  Looking for an uncommon part?
                </h3>
                <p className={"font-body-sm text-body-sm text-on-surface-variant mt-1 leading-relaxed"}>
                  Need a rear hub bearing, turbo actuator, or JDM quarter glass? Tap into verified Jamaican auto suppliers and peer parts finders across the island.
                </p>
                <div className={"flex flex-col gap-2 mt-3.5"}>
                  <a onClick={onPlugClick} className={"w-full h-12 bg-primary text-on-primary rounded-xl font-label-lg text-label-lg flex items-center justify-center gap-2 active:bg-secondary transition-all shadow-sm"} href={"#"} data-act={"ask-parish-auto-parts-group"} data-way-out={"primary"}>
                    <span className={"material-symbols-outlined text-[20px]"}>
                      groups
                    </span>
                    Ask Parish Auto Parts Group
                  </a>
                  <a onClick={onPlugClick} className={"w-full h-12 bg-surface-container-lowest text-secondary rounded-xl font-label-lg text-label-lg flex items-center justify-center gap-2 hover:bg-surface-container-high transition-colors"} href={"#"} data-act={"browse-14-parish-store-directory"}>
                    <span className={"material-symbols-outlined text-[20px]"}>
                      store
                    </span>
                    Browse 14-Parish Store Directory
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
