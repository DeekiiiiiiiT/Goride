import { useEffect, useRef } from 'react';
import { onPlugClick } from '../../shell/actions';
import { bindScreen } from '../../shell/bind';


export function FiltersScreen() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (ref.current) bindScreen("18-filters.html", ref.current); }, []);
  return (
    <div ref={ref} data-plug-screen={"18-filters.html"} className={"bg-surface font-body-md text-on-surface flex flex-col min-h-screen"}>
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
        <div className={"flex flex-col w-full relative"}>
          <div className={"relative w-full h-80 overflow-hidden select-none pointer-events-none opacity-40 filter blur-[1.5px] -mb-16"}>
            <div className={"w-full h-96 bg-surface-container flex items-center justify-center text-primary"} aria-hidden={"true"}><span className={"material-symbols-outlined text-[32px]"}>image</span></div>
            <div className={"absolute inset-0 bg-surface-container-highest/60 mix-blend-multiply"} />
          </div>
          <div className={"relative z-20 flex flex-col w-full bg-surface-container-lowest rounded-t-3xl shadow-[0_-8px_30px_rgba(28,25,23,0.18)] transition-all duration-300 ease-out"}>
            <div className={"sticky top-0 z-30 pt-3 pb-4 px-space-md bg-surface-container-lowest/95 backdrop-blur-md rounded-t-3xl border-none"}>
              <div className={"flex justify-center mb-3"}>
                <div className={"w-11 h-1.5 rounded-full bg-surface-container-highest"} />
              </div>
              <div className={"flex items-center justify-between"}>
                <div className={"flex items-center gap-space-xs"}>
                  <div className={"w-8 h-8 rounded-full bg-primary-fixed flex items-center justify-center text-primary"}>
                    <span className={"material-symbols-outlined text-[20px]"}>
                      tune
                    </span>
                  </div>
                  <h2 className={"font-headline-md text-headline-md text-on-surface"}>
                    {"Filter & Sort"}
                  </h2>
                </div>
                <button onClick={onPlugClick} className={"h-10 px-3 rounded-full flex items-center justify-center text-primary active:bg-primary-fixed/40 transition-colors font-label-lg text-label-lg font-bold"} id={"reset-filters-btn"} data-act={"reset-filters-btn"} data-way-out={"primary"}>
                  Reset All
                </button>
              </div>
              <p className={"font-body-sm text-body-sm text-on-surface-variant mt-1"}>
                Personalize fuel stations and roadside amenities across Jamaica
              </p>
            </div>
            <div className={"flex flex-col px-space-md space-y-6 pt-1 pb-4"}>
              <div className={"flex flex-col space-y-2.5"}>
                <div className={"flex items-center justify-between"}>
                  <span className={"font-label-md text-label-md text-on-surface-variant uppercase tracking-wider"}>
                    Sort Stations By
                  </span>
                  <span className={"font-label-sm text-label-sm text-primary font-bold"}>
                    3 Options
                  </span>
                </div>
                <div className={"grid grid-cols-3 gap-2"}>
                  <button onClick={onPlugClick} className={"filter-sort-pill min-h-[48px] px-2.5 py-2 rounded-xl bg-primary text-on-primary font-label-md text-label-md flex flex-col items-center justify-center text-center shadow-sm active:scale-95 transition-all"} data-sort={"cheapest"} data-act={"cheapest-price"} data-way-out={"primary"}>
                    <span className={"material-symbols-outlined text-[18px] mb-0.5"}>
                      payments
                    </span>
                    <span className={"leading-tight"}>
                      Cheapest Price
                    </span>
                  </button>
                  <button onClick={onPlugClick} className={"filter-sort-pill min-h-[48px] px-2.5 py-2 rounded-xl bg-surface-container text-on-surface font-label-md text-label-md flex flex-col items-center justify-center text-center active:scale-95 transition-all"} data-sort={"distance"} data-act={"nearest"}>
                    <span className={"material-symbols-outlined text-[18px] mb-0.5 text-on-surface-variant"}>
                      near_me
                    </span>
                    <span className={"leading-tight"}>
                      Nearest
                    </span>
                  </button>
                  <button onClick={onPlugClick} className={"filter-sort-pill min-h-[48px] px-2.5 py-2 rounded-xl bg-surface-container text-on-surface font-label-md text-label-md flex flex-col items-center justify-center text-center active:scale-95 transition-all"} data-sort={"verified"} data-act={"verified-first"}>
                    <span className={"material-symbols-outlined text-[18px] mb-0.5 text-on-surface-variant"}>
                      verified
                    </span>
                    <span className={"leading-tight"}>
                      Verified First
                    </span>
                  </button>
                </div>
              </div>
              <div className={"flex flex-col space-y-2.5"}>
                <div className={"flex items-center justify-between"}>
                  <span className={"font-label-md text-label-md text-on-surface-variant uppercase tracking-wider"}>
                    Required Fuel Grade
                  </span>
                  <span className={"font-label-sm text-label-sm text-on-surface-variant"}>
                    Tap to swap rate
                  </span>
                </div>
                <div className={"flex flex-col space-y-2"}>
                  <div className={"fuel-grade-opt flex items-center justify-between p-3 rounded-2xl bg-surface-container-low active:bg-surface-container cursor-pointer transition-all shadow-sm"}>
                    <div className={"flex items-center gap-3"}>
                      <div className={"w-10 h-10 rounded-xl bg-[#16a34a] text-on-primary flex items-center justify-center font-label-lg text-label-lg font-bold shadow-sm"}>
                        87
                      </div>
                      <div className={"flex flex-col"}>
                        <span className={"font-label-lg text-label-lg text-on-surface font-bold leading-snug"}>
                          E-10 87 Octane
                        </span>
                        <span className={"font-body-sm text-body-sm text-on-surface-variant"}>
                          Most common regular blend across Jamaica
                        </span>
                      </div>
                    </div>
                    <div className={"w-6 h-6 rounded-full bg-primary flex items-center justify-center text-on-primary shadow-sm"}>
                      <span className={"material-symbols-outlined text-[16px]"}>
                        check
                      </span>
                    </div>
                  </div>
                  <div className={"fuel-grade-opt flex items-center justify-between p-3 rounded-2xl bg-surface-container-lowest active:bg-surface-container-low cursor-pointer transition-all"}>
                    <div className={"flex items-center gap-3"}>
                      <div className={"w-10 h-10 rounded-xl bg-[#dc2626] text-on-primary flex items-center justify-center font-label-lg text-label-lg font-bold shadow-sm"}>
                        90
                      </div>
                      <div className={"flex flex-col"}>
                        <span className={"font-label-lg text-label-lg text-on-surface font-bold leading-snug"}>
                          E-10 90 Octane
                        </span>
                        <span className={"font-body-sm text-body-sm text-on-surface-variant"}>
                          High-octane premium sports/turbo spec
                        </span>
                      </div>
                    </div>
                    <div className={"w-6 h-6 rounded-full bg-surface-container-highest flex items-center justify-center text-transparent"}>
                      <span className={"material-symbols-outlined text-[16px]"}>
                        check
                      </span>
                    </div>
                  </div>
                  <div className={"fuel-grade-opt flex items-center justify-between p-3 rounded-2xl bg-surface-container-lowest active:bg-surface-container-low cursor-pointer transition-all"}>
                    <div className={"flex items-center gap-3"}>
                      <div className={"w-10 h-10 rounded-xl bg-[#1C1917] text-on-primary flex items-center justify-center font-label-md text-label-md font-bold tracking-tight shadow-sm"}>
                        ULSD
                      </div>
                      <div className={"flex flex-col"}>
                        <span className={"font-label-lg text-label-lg text-on-surface font-bold leading-snug"}>
                          Ultra Low Sulphur Diesel
                        </span>
                        <span className={"font-body-sm text-body-sm text-on-surface-variant"}>
                          {"Commercial, taxis, & pickup fleets"}
                        </span>
                      </div>
                    </div>
                    <div className={"w-6 h-6 rounded-full bg-surface-container-highest flex items-center justify-center text-transparent"}>
                      <span className={"material-symbols-outlined text-[16px]"}>
                        check
                      </span>
                    </div>
                  </div>
                </div>
              </div>
              <div className={"flex flex-col space-y-2.5"}>
                <div className={"flex items-center justify-between"}>
                  <span className={"font-label-md text-label-md text-on-surface-variant uppercase tracking-wider"}>
                    {"Stations & Brands"}
                  </span>
                  <div className={"flex items-center gap-3"}>
                    <button onClick={onPlugClick} className={"font-label-sm text-label-sm text-primary font-bold"} data-act={"select-all"}>
                      Select All
                    </button>
                    <span className={"text-surface-container-highest text-xs"}>
                      •
                    </span>
                    <button onClick={onPlugClick} className={"font-label-sm text-label-sm text-on-surface-variant"} data-act={"clear"}>
                      Clear
                    </button>
                  </div>
                </div>
                <div className={"flex flex-wrap gap-2"}>
                  <button onClick={onPlugClick} className={"min-h-[44px] px-3.5 py-2 rounded-full bg-surface-container-low text-on-surface font-label-md text-label-md flex items-center gap-2 active:scale-95 shadow-sm"} data-act={"totalenergies"}>
                    <span className={"w-3 h-3 rounded-full bg-[#e11d48]"} />
                    <span>
                      TotalEnergies
                    </span>
                    <span className={"material-symbols-outlined text-[16px] text-primary ml-0.5"}>
                      check_circle
                    </span>
                  </button>
                  <button onClick={onPlugClick} className={"min-h-[44px] px-3.5 py-2 rounded-full bg-surface-container-low text-on-surface font-label-md text-label-md flex items-center gap-2 active:scale-95 shadow-sm"} data-act={"rubis"}>
                    <span className={"w-3 h-3 rounded-full bg-[#0284c7]"} />
                    <span>
                      Rubis
                    </span>
                    <span className={"material-symbols-outlined text-[16px] text-primary ml-0.5"}>
                      check_circle
                    </span>
                  </button>
                  <button onClick={onPlugClick} className={"min-h-[44px] px-3.5 py-2 rounded-full bg-surface-container-low text-on-surface font-label-md text-label-md flex items-center gap-2 active:scale-95 shadow-sm"} data-act={"texaco"}>
                    <span className={"w-3 h-3 rounded-full bg-[#dc2626]"} />
                    <span>
                      Texaco
                    </span>
                    <span className={"material-symbols-outlined text-[16px] text-primary ml-0.5"}>
                      check_circle
                    </span>
                  </button>
                  <button onClick={onPlugClick} className={"min-h-[44px] px-3.5 py-2 rounded-full bg-secondary-fixed text-on-secondary-fixed font-label-md text-label-md flex items-center gap-2 active:scale-95 shadow-sm"} data-act={"fesco-yard-fav"}>
                    <span className={"w-3 h-3 rounded-full bg-secondary-container"} />
                    <span className={"font-bold"}>
                      Fesco
                    </span>
                    <span className={"text-[12px] px-1.5 py-0.5 rounded-full bg-primary text-on-primary font-bold"}>
                      Yard Fav
                    </span>
                    <span className={"material-symbols-outlined text-[16px] text-primary ml-0.5"}>
                      check_circle
                    </span>
                  </button>
                  <button onClick={onPlugClick} className={"min-h-[44px] px-3.5 py-2 rounded-full bg-surface-container-low text-on-surface font-label-md text-label-md flex items-center gap-2 active:scale-95 shadow-sm"} data-act={"cool-oasis"}>
                    <span className={"w-3 h-3 rounded-full bg-[#059669]"} />
                    <span>
                      Cool Oasis
                    </span>
                    <span className={"material-symbols-outlined text-[16px] text-primary ml-0.5"}>
                      check_circle
                    </span>
                  </button>
                  <button onClick={onPlugClick} className={"min-h-[44px] px-3.5 py-2 rounded-full bg-surface-container-low text-on-surface font-label-md text-label-md flex items-center gap-2 active:scale-95 shadow-sm"} data-act={"petcom"}>
                    <span className={"w-3 h-3 rounded-full bg-[#d97706]"} />
                    <span>
                      Petcom
                    </span>
                    <span className={"material-symbols-outlined text-[16px] text-primary ml-0.5"}>
                      check_circle
                    </span>
                  </button>
                  <button onClick={onPlugClick} className={"min-h-[44px] px-3.5 py-2 rounded-full bg-surface-container text-on-surface-variant font-label-md text-label-md flex items-center gap-2 active:scale-95"} data-act={"independents"}>
                    <span className={"w-3 h-3 rounded-full bg-surface-container-highest"} />
                    <span>
                      Independents
                    </span>
                  </button>
                </div>
              </div>
              <div className={"flex flex-col space-y-3 p-4 rounded-2xl bg-surface-container-low"}>
                <div className={"flex items-center justify-between"}>
                  <div className={"flex items-center gap-2"}>
                    <span className={"material-symbols-outlined text-primary text-[20px]"}>
                      explore
                    </span>
                    <span className={"font-label-md text-label-md text-on-surface uppercase tracking-wider font-bold"}>
                      Search Radius
                    </span>
                  </div>
                  <span className={"font-headline-sm text-headline-sm text-primary font-bold"}>
                    Within 5 km
                  </span>
                </div>
                <div className={"grid grid-cols-4 gap-1.5"}>
                  <button onClick={onPlugClick} className={"min-h-[44px] rounded-lg bg-surface-container-lowest text-on-surface font-label-md text-label-md flex items-center justify-center font-semibold active:scale-95"} data-act={"2-km"}>
                    2 km
                  </button>
                  <button onClick={onPlugClick} className={"min-h-[44px] rounded-lg bg-primary text-on-primary font-label-md text-label-md flex items-center justify-center font-bold shadow-sm active:scale-95"} data-act={"5-km"} data-way-out={"primary"}>
                    5 km
                  </button>
                  <button onClick={onPlugClick} className={"min-h-[44px] rounded-lg bg-surface-container-lowest text-on-surface font-label-md text-label-md flex items-center justify-center font-semibold active:scale-95"} data-act={"10-km"}>
                    10 km
                  </button>
                  <button onClick={onPlugClick} className={"min-h-[44px] rounded-lg bg-surface-container-lowest text-on-surface font-label-md text-label-md flex items-center justify-center font-semibold active:scale-95"} data-act={"25-km"}>
                    25 km
                  </button>
                </div>
                <div className={"relative w-full pt-3 pb-1"}>
                  <div className={"w-full h-2 rounded-full bg-surface-container-highest relative flex items-center"}>
                    <div className={"h-2 w-1/3 rounded-full bg-gradient-to-r from-primary to-secondary-container"} />
                    <div className={"absolute left-1/3 -ml-3.5 w-7 h-7 rounded-full bg-surface-container-lowest shadow-[0_2px_8px_rgba(0,0,0,0.2)] flex items-center justify-center cursor-pointer"}>
                      <div className={"w-3.5 h-3.5 rounded-full bg-primary"} />
                    </div>
                  </div>
                  <div className={"flex justify-between items-center mt-2.5"}>
                    <span className={"font-body-sm text-body-sm text-on-surface-variant"}>
                      {"Around Half-Way-Tree & St. Andrew"}
                    </span>
                    <button onClick={onPlugClick} className={"font-label-sm text-label-sm text-primary font-bold hover:underline"} data-act={"all-14-parishes"}>
                      All 14 Parishes
                    </button>
                  </div>
                </div>
              </div>
              <div className={"flex flex-col space-y-2.5"}>
                <div className={"flex items-center justify-between"}>
                  <span className={"font-label-md text-label-md text-on-surface-variant uppercase tracking-wider"}>
                    Station Amenities
                  </span>
                  <span className={"font-label-sm text-label-sm text-on-surface-variant"}>
                    3 Selected
                  </span>
                </div>
                <div className={"grid grid-cols-2 gap-2"}>
                  <button onClick={onPlugClick} className={"min-h-[48px] px-3 py-2.5 rounded-xl bg-surface-container-low text-on-surface font-label-md text-label-md flex items-center justify-between active:scale-95 transition-all shadow-sm"} data-act={"air-pump"}>
                    <div className={"flex items-center gap-2"}>
                      <span className={"material-symbols-outlined text-[20px] text-primary"}>
                        tire_repair
                      </span>
                      <span>
                        Air Pump
                      </span>
                    </div>
                    <span className={"material-symbols-outlined text-[18px] text-primary"}>
                      check_box
                    </span>
                  </button>
                  <button onClick={onPlugClick} className={"min-h-[48px] px-3 py-2.5 rounded-xl bg-surface-container-low text-on-surface font-label-md text-label-md flex items-center justify-between active:scale-95 transition-all shadow-sm"} data-act={"restroom"}>
                    <div className={"flex items-center gap-2"}>
                      <span className={"material-symbols-outlined text-[20px] text-primary"}>
                        wc
                      </span>
                      <span>
                        Restroom
                      </span>
                    </div>
                    <span className={"material-symbols-outlined text-[18px] text-primary"}>
                      check_box
                    </span>
                  </button>
                  <button onClick={onPlugClick} className={"min-h-[48px] px-3 py-2.5 rounded-xl bg-surface-container-low text-on-surface font-label-md text-label-md flex items-center justify-between active:scale-95 transition-all shadow-sm"} data-act={"mart-store"}>
                    <div className={"flex items-center gap-2"}>
                      <span className={"material-symbols-outlined text-[20px] text-primary"}>
                        storefront
                      </span>
                      <span>
                        Mart / Store
                      </span>
                    </div>
                    <span className={"material-symbols-outlined text-[18px] text-primary"}>
                      check_box
                    </span>
                  </button>
                  <button onClick={onPlugClick} className={"min-h-[48px] px-3 py-2.5 rounded-xl bg-surface-container-lowest text-on-surface-variant font-label-md text-label-md flex items-center justify-between active:scale-95 transition-all"} data-act={"car-wash"}>
                    <div className={"flex items-center gap-2"}>
                      <span className={"material-symbols-outlined text-[20px] text-on-surface-variant"}>
                        local_car_wash
                      </span>
                      <span>
                        Car Wash
                      </span>
                    </div>
                    <span className={"material-symbols-outlined text-[18px] text-surface-container-highest"}>
                      check_box_outline_blank
                    </span>
                  </button>
                  <button onClick={onPlugClick} className={"min-h-[48px] px-3 py-2.5 rounded-xl bg-surface-container-lowest text-on-surface-variant font-label-md text-label-md flex items-center justify-between active:scale-95 transition-all"} data-act={"ev-charging"}>
                    <div className={"flex items-center gap-2"}>
                      <span className={"material-symbols-outlined text-[20px] text-on-surface-variant"}>
                        ev_station
                      </span>
                      <span>
                        EV Charging
                      </span>
                    </div>
                    <span className={"material-symbols-outlined text-[18px] text-surface-container-highest"}>
                      check_box_outline_blank
                    </span>
                  </button>
                  <button onClick={onPlugClick} className={"min-h-[48px] px-3 py-2.5 rounded-xl bg-surface-container-lowest text-on-surface-variant font-label-md text-label-md flex items-center justify-between active:scale-95 transition-all"} data-act={"24-7-atm"}>
                    <div className={"flex items-center gap-2"}>
                      <span className={"material-symbols-outlined text-[20px] text-on-surface-variant"}>
                        atm
                      </span>
                      <span>
                        24/7 ATM
                      </span>
                    </div>
                    <span className={"material-symbols-outlined text-[18px] text-surface-container-highest"}>
                      check_box_outline_blank
                    </span>
                  </button>
                </div>
              </div>
              <div className={"flex flex-col space-y-3 pt-2"}>
                <span className={"font-label-md text-label-md text-on-surface-variant uppercase tracking-wider"}>
                  Live Station Status
                </span>
                <div className={"flex flex-col space-y-2"}>
                  <div className={"flex items-center justify-between p-3.5 rounded-2xl bg-surface-container-low"}>
                    <div className={"flex items-center gap-3"}>
                      <div className={"w-9 h-9 rounded-xl bg-[#16a34a]/15 text-[#16a34a] flex items-center justify-center"}>
                        <span className={"material-symbols-outlined text-[20px]"}>
                          schedule
                        </span>
                      </div>
                      <div className={"flex flex-col"}>
                        <span className={"font-label-lg text-label-lg text-on-surface font-semibold"}>
                          Open Now Only
                        </span>
                        <span className={"font-body-sm text-body-sm text-on-surface-variant"}>
                          Hide closed pumps and evening lockouts
                        </span>
                      </div>
                    </div>
                    <button onClick={onPlugClick} aria-label={"Toggle open now"} className={"w-13 h-7 w-12 rounded-full bg-[#16a34a] p-1 flex items-center justify-end transition-colors cursor-pointer"} data-act={"button"}>
                      <div className={"w-5 h-5 rounded-full bg-on-primary shadow-md"} />
                    </button>
                  </div>
                  <div className={"flex items-center justify-between p-3.5 rounded-2xl bg-surface-container-low"}>
                    <div className={"flex items-center gap-3"}>
                      <div className={"w-9 h-9 rounded-xl bg-primary-fixed text-primary flex items-center justify-center"}>
                        <span className={"material-symbols-outlined text-[20px]"}>
                          verified_user
                        </span>
                      </div>
                      <div className={"flex flex-col"}>
                        <span className={"font-label-lg text-label-lg text-on-surface font-semibold"}>
                          Verified Prices Only
                        </span>
                        <span className={"font-body-sm text-body-sm text-on-surface-variant"}>
                          Hides crowd reports older than 12 hrs
                        </span>
                      </div>
                    </div>
                    <button onClick={onPlugClick} aria-label={"Toggle verified only"} className={"w-13 h-7 w-12 rounded-full bg-primary p-1 flex items-center justify-end transition-colors cursor-pointer"} data-act={"button-2"} data-way-out={"primary"}>
                      <div className={"w-5 h-5 rounded-full bg-on-primary shadow-md"} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
            <div className={"sticky bottom-0 z-40 p-space-md bg-surface-container-lowest/95 backdrop-blur-xl shadow-[0_-4px_16px_rgba(28,25,23,0.06)] flex flex-col items-center gap-2"}>
              <button onClick={onPlugClick} className={"w-full min-h-[52px] h-[52px] rounded-2xl bg-gradient-to-r from-primary to-secondary-container text-on-primary font-headline-sm text-headline-sm flex items-center justify-center gap-2 shadow-[0_8px_20px_-4px_rgba(163,57,0,0.35)] active:scale-[0.98] transition-transform"} data-act={"show-24-stations"}>
                <span className={"material-symbols-outlined text-[22px]"}>
                  local_gas_station
                </span>
                <span>
                  Show 0 stations
                </span>
              </button>
              <span className={"font-body-sm text-body-sm text-on-surface-variant flex items-center gap-1 text-center"}>
                <span className={"material-symbols-outlined text-[14px] text-primary"}>
                  lock_clock
                </span>
                
              </span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
