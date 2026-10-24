import { useEffect, useRef } from 'react';
import { onPlugClick } from '../../shell/actions';
import { bindScreen } from '../../shell/bind';


export function TollsScreen() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (ref.current) bindScreen("48-tolls.html", ref.current); }, []);
  return (
    <div ref={ref} data-plug-screen={"48-tolls.html"} className={"bg-surface font-body-md text-on-surface flex flex-col min-h-screen"}>
      <header className={"fixed top-0 w-full z-50 pt-safe bg-surface/80 backdrop-blur-xl shadow-[0_1px_8px_rgba(0,0,0,0.04)]"}>
        <div className={"h-16 px-gutter flex items-center justify-between"}>
          <div className={"flex items-center gap-space-sm min-w-0 pr-space-sm"}>
            <button onClick={onPlugClick} aria-label={"Go back"} className={"w-12 h-12 flex-shrink-0 flex items-center justify-center rounded-full text-on-surface hover:bg-surface-container active:bg-surface-container-high transition-colors"} type={"button"} data-act={"arrow-back"} data-way-out={"back"}>
              <span className={"material-symbols-outlined text-[24px]"}>
                arrow_back
              </span>
            </button>
            <h1 className={"font-headline-sm text-headline-sm text-on-surface tracking-tight truncate"}>
              Highway Tolls
            </h1>
          </div>
          <div className={"flex items-center gap-space-xs flex-shrink-0"}>
            <button onClick={onPlugClick} aria-label={"Toll Rates & Info"} className={"w-12 h-12 flex items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container active:bg-surface-container-high transition-colors"} type={"button"} data-act={"info"}>
              <span className={"material-symbols-outlined text-[22px]"}>
                info
              </span>
            </button>
          </div>
        </div>
      </header>
      <main className={"flex flex-col relative w-full pt-16 bg-surface min-h-screen pb-safe"}>
        <div className={"flex flex-col w-full pb-28"}>
          <div className={"px-gutter pt-space-md flex flex-col gap-space-sm"}>
            <div className={"flex items-center justify-between flex-wrap gap-space-xs"}>
              <span className={"inline-flex items-center gap-1.5 px-space-sm py-0.5 rounded-full bg-primary-fixed text-on-primary-fixed-variant font-label-md text-label-md font-semibold"}>
                <span className={"material-symbols-outlined text-[16px] text-primary"} style={{ fontVariationSettings: "'FILL' 1" }}>
                  toll
                </span>
                Official Rates • Highway 2000
              </span>
              <div className={"flex items-center gap-1 text-secondary font-label-sm text-label-sm font-semibold"}>
                <span className={"material-symbols-outlined text-[15px]"} style={{ fontVariationSettings: "'FILL' 1" }}>
                  verified
                </span>
                <span>
                  Gazetted 1 Nov 2024
                </span>
              </div>
            </div>
            <div className={"bg-surface-container-low rounded-xl p-space-md flex items-start gap-space-sm shadow-sm"}>
              <span className={"material-symbols-outlined text-secondary text-[22px] mt-0.5 flex-shrink-0"}>
                info
              </span>
              <div className={"flex flex-col"}>
                <p className={"font-body-md text-body-md text-on-surface"}>
                  <strong className={"font-semibold text-on-surface"}>
                    {"T-Tag, Card & Cash lanes open 24/7."}
                  </strong>
                  Exact Jamaican dollar change substantially reduces queue times at toll booths.
                </p>
              </div>
            </div>
            <div className={"flex items-center justify-between px-space-md py-space-sm rounded-xl bg-surface-container shadow-sm"}>
              <div className={"flex items-center gap-space-sm min-w-0"}>
                <span className={"material-symbols-outlined text-primary text-[20px]"} style={{ fontVariationSettings: "'FILL' 1" }}>
                  directions_car
                </span>
                <span className={"font-label-md text-label-md text-on-surface truncate"}>
                  Linked Garage Vehicle:
                  <strong>
                    2019 Toyota Roomy (Class 1)
                  </strong>
                </span>
              </div>
              <span className={"font-label-sm text-label-sm uppercase px-2 py-0.5 rounded bg-surface-container-lowest text-primary font-bold"}>
                Auto-Set
              </span>
            </div>
          </div>
          <div className={"px-gutter mt-space-lg flex flex-col gap-space-sm"}>
            <div className={"flex items-center justify-between"}>
              <h2 className={"font-headline-sm text-headline-sm text-on-surface"}>
                Select Vehicle Class
              </h2>
              <button onClick={onPlugClick} className={"font-label-md text-label-md text-primary font-semibold flex items-center gap-1"} type={"button"} data-act={"class-specs"}>
                <span>
                  Class Specs
                </span>
                <span className={"material-symbols-outlined text-[16px]"}>
                  help
                </span>
              </button>
            </div>
            <div className={"grid grid-cols-3 gap-space-xs"} id={"vehicle-class-grid"}>
              <button onClick={onPlugClick} className={"flex flex-col items-start p-space-sm rounded-xl bg-primary text-on-primary shadow-md transition-all text-left"} id={"class-btn-1"} type={"button"} data-act={"class-btn-1"} data-way-out={"primary"}>
                <div className={"flex items-center justify-between w-full"}>
                  <span className={"material-symbols-outlined text-[20px]"}>
                    directions_car
                  </span>
                  <span className={"w-2 h-2 rounded-full bg-white"} />
                </div>
                <span className={"font-headline-sm text-headline-sm mt-1 leading-tight"}>
                  Class 1
                </span>
                <span className={"font-label-sm text-label-sm opacity-90 line-clamp-2 mt-0.5"}>
                  Cars, Minivans, Small Pickups
                </span>
              </button>
              <button onClick={onPlugClick} className={"flex flex-col items-start p-space-sm rounded-xl bg-surface-container-low text-on-surface hover:bg-surface-container transition-all text-left shadow-sm"} id={"class-btn-2"} type={"button"} data-act={"class-btn-2"}>
                <div className={"flex items-center justify-between w-full"}>
                  <span className={"material-symbols-outlined text-[20px] text-on-surface-variant"}>
                    airport_shuttle
                  </span>
                  <span className={"w-2 h-2 rounded-full bg-transparent"} />
                </div>
                <span className={"font-headline-sm text-headline-sm mt-1 leading-tight"}>
                  Class 2
                </span>
                <span className={"font-label-sm text-label-sm text-on-surface-variant line-clamp-2 mt-0.5"}>
                  {"SUVs > 1.7m, Light Trucks"}
                </span>
              </button>
              <button onClick={onPlugClick} className={"flex flex-col items-start p-space-sm rounded-xl bg-surface-container-low text-on-surface hover:bg-surface-container transition-all text-left shadow-sm"} id={"class-btn-3"} type={"button"} data-act={"class-btn-3"}>
                <div className={"flex items-center justify-between w-full"}>
                  <span className={"material-symbols-outlined text-[20px] text-on-surface-variant"}>
                    local_shipping
                  </span>
                  <span className={"w-2 h-2 rounded-full bg-transparent"} />
                </div>
                <span className={"font-headline-sm text-headline-sm mt-1 leading-tight"}>
                  Class 3
                </span>
                <span className={"font-label-sm text-label-sm text-on-surface-variant line-clamp-2 mt-0.5"}>
                  Heavy Trucks, Large Buses
                </span>
              </button>
            </div>
          </div>
          <div className={"px-gutter mt-space-lg"}>
            <div className={"bg-surface-container-lowest rounded-xl p-space-md shadow-md flex flex-col gap-space-md"}>
              <div className={"flex items-center justify-between"}>
                <div className={"flex items-center gap-space-xs"}>
                  <span className={"material-symbols-outlined text-primary text-[24px]"} style={{ fontVariationSettings: "'FILL' 1" }}>
                    calculate
                  </span>
                  <h2 className={"font-headline-sm text-headline-sm text-on-surface"}>
                    Route Toll Calculator
                  </h2>
                </div>
                <span className={"font-label-md text-label-md px-2 py-0.5 rounded-full bg-primary-fixed text-on-primary-fixed-variant font-semibold"}>
                  T1 • T2 Corridors
                </span>
              </div>
              <div className={"flex flex-col gap-space-sm relative"}>
                <div className={"flex items-center gap-space-sm bg-surface-container-low px-space-md py-space-sm rounded-xl"}>
                  <span className={"material-symbols-outlined text-primary text-[20px]"}>
                    trip_origin
                  </span>
                  <div className={"flex flex-col flex-1 min-w-0"}>
                    <span className={"font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider"}>
                      Starting Interchange
                    </span>
                    <select className={"bg-transparent font-label-lg text-label-lg text-on-surface font-semibold focus:outline-none appearance-none pr-4 cursor-pointer"} id={"origin-select"}>
                      <option value={"may_pen"}>
                        May Pen (Clarendon Interchange)
                      </option>
                      <option value={"freetown"}>
                        Freetown / Sandy Bay
                      </option>
                      <option value={"old_harbour"}>
                        Old Harbour Ramp
                      </option>
                      <option value={"spanish_town"}>
                        Spanish Town Plaza
                      </option>
                      <option value={"portmore"}>
                        Portmore Causeway
                      </option>
                      <option value={"caymanas"}>
                        Caymanas Interchange
                      </option>
                      <option value={"mammee_bay"}>
                        Mammee Bay (Ocho Rios)
                      </option>
                    </select>
                  </div>
                  <span className={"material-symbols-outlined text-on-surface-variant text-[20px] pointer-events-none"}>
                    expand_more
                  </span>
                </div>
                <button onClick={onPlugClick} aria-label={"Swap Route Endpoints"} className={"absolute right-4 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-primary text-on-primary flex items-center justify-center shadow-lg hover:scale-105 active:scale-95 transition-transform z-10"} type={"button"} data-act={"swap-vert"} data-way-out={"primary"}>
                  <span className={"material-symbols-outlined text-[18px]"}>
                    swap_vert
                  </span>
                </button>
                <div className={"flex items-center gap-space-sm bg-surface-container-low px-space-md py-space-sm rounded-xl"}>
                  <span className={"material-symbols-outlined text-secondary text-[20px]"}>
                    location_on
                  </span>
                  <div className={"flex flex-col flex-1 min-w-0"}>
                    <span className={"font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider"}>
                      Destination Interchange
                    </span>
                    <select className={"bg-transparent font-label-lg text-label-lg text-on-surface font-semibold focus:outline-none appearance-none pr-4 cursor-pointer"} id={"dest-select"}>
                      <option selected={true} value={"mandela"}>
                        Kingston / Mandela Highway
                      </option>
                      <option value={"may_pen"}>
                        May Pen (Clarendon)
                      </option>
                      <option value={"spanish_town"}>
                        Spanish Town
                      </option>
                      <option value={"portmore"}>
                        Marcus Garvey / Portmore
                      </option>
                      <option value={"mammee_bay"}>
                        Mammee Bay (Ocho Rios)
                      </option>
                    </select>
                  </div>
                  <span className={"material-symbols-outlined text-on-surface-variant text-[20px] pointer-events-none"}>
                    expand_more
                  </span>
                </div>
              </div>
              <div className={"flex items-center gap-1.5 py-1 px-space-sm rounded-lg bg-surface-container text-on-surface-variant font-label-sm text-label-sm overflow-x-auto whitespace-nowrap"}>
                <span className={"material-symbols-outlined text-[16px] text-primary"}>
                  route
                </span>
                <span className={"font-semibold text-on-surface"}>
                  Route Waypoints:
                </span>
                <span id={"route-path-text"}>
                  May Pen → Freetown → Vineyards Plaza → Mandela
                </span>
              </div>
              <div className={"bg-primary text-on-primary rounded-xl p-space-md flex flex-col gap-space-sm shadow-md relative overflow-hidden"}>
                <div className={"absolute -right-12 -top-12 w-32 h-32 rounded-full bg-white/10 blur-xl pointer-events-none"} />
                <div className={"flex items-baseline justify-between"}>
                  <div className={"flex flex-col"}>
                    <span className={"font-label-md text-label-md uppercase tracking-wider text-primary-fixed-dim font-bold"}>
                      Estimated One-Way Toll
                    </span>
                    <div className={"flex items-baseline gap-1 mt-0.5"}>
                      <span className={"font-display-lg-mobile text-display-lg-mobile font-extrabold"} id={"calc-single-rate"}>
                        J$ 720
                      </span>
                      <span className={"font-label-sm text-label-sm opacity-90"}>
                        JMD
                      </span>
                    </div>
                  </div>
                  <div className={"text-right flex flex-col items-end"}>
                    <span className={"font-label-sm text-label-sm text-primary-fixed-dim uppercase tracking-wider font-semibold"}>
                      Round Trip
                    </span>
                    <span className={"font-headline-sm text-headline-sm font-bold"} id={"calc-round-rate"}>
                      J$ 1,440
                    </span>
                  </div>
                </div>
                <div className={"pt-space-xs flex items-center justify-between text-on-primary"}>
                  <div className={"flex items-center gap-1 font-label-md text-label-md"}>
                    <span className={"material-symbols-outlined text-[18px]"}>
                      timer
                    </span>
                    <span id={"calc-time-saved font-semibold"}>
                      Saves ~45 mins vs Old Road
                    </span>
                  </div>
                  <div className={"flex items-center gap-1 font-label-md text-label-md opacity-90"}>
                    <span className={"material-symbols-outlined text-[18px]"}>
                      speed
                    </span>
                    <span>
                      34.2 km Bypass
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className={"px-gutter mt-space-xl flex flex-col gap-space-md"}>
            <div className={"flex items-center justify-between"}>
              <div className={"flex flex-col"}>
                <div className={"flex items-center gap-2"}>
                  <span className={"w-3 h-3 rounded-full bg-primary"} />
                  <h2 className={"font-headline-sm text-headline-sm text-on-surface"}>
                    Highway 2000 East-West
                  </h2>
                </div>
                <p className={"font-label-md text-label-md text-on-surface-variant"}>
                  {"T1 Corridor • Kingston to May Pen & Mandeville"}
                </p>
              </div>
              <span className={"font-label-sm text-label-sm font-bold px-2 py-1 rounded bg-surface-container-high text-on-surface"}>
                4 Plazas
              </span>
            </div>
            <div className={"flex flex-col gap-space-sm"}>
              <div className={"bg-surface-container-lowest rounded-xl p-space-md shadow-sm flex flex-col gap-space-xs"}>
                <div className={"flex items-center justify-between"}>
                  <div className={"flex items-center gap-space-xs"}>
                    <span className={"material-symbols-outlined text-primary text-[20px]"}>
                      toll
                    </span>
                    <h3 className={"font-headline-sm text-headline-sm text-on-surface"}>
                      Vineyards Toll Plaza
                    </h3>
                  </div>
                  <span className={"font-price-display text-price-display text-primary font-bold"} data-toll={"vineyards"}>
                    J$ 650
                  </span>
                </div>
                <div className={"flex items-center gap-space-sm text-on-surface-variant font-label-md text-label-md"}>
                  <span className={"flex items-center gap-1"}>
                    <span className={"material-symbols-outlined text-[16px] text-secondary"}>
                      sync_alt
                    </span>
                    {"Eastbound & Westbound"}
                  </span>
                  <span>
                    •
                  </span>
                  <span className={"text-primary font-semibold"}>
                    24/7 T-Tag Lanes
                  </span>
                </div>
                <p className={"font-body-sm text-body-sm text-on-surface-variant"}>
                  {"Between Old Harbour & Spanish Town trunk. Heavy morning commuter route."}
                </p>
              </div>
              <div className={"bg-surface-container-lowest rounded-xl p-space-md shadow-sm flex flex-col gap-space-xs"}>
                <div className={"flex items-center justify-between"}>
                  <div className={"flex items-center gap-space-xs"}>
                    <span className={"material-symbols-outlined text-primary text-[20px]"}>
                      toll
                    </span>
                    <h3 className={"font-headline-sm text-headline-sm text-on-surface"}>
                      Spanish Town Toll Plaza
                    </h3>
                  </div>
                  <span className={"font-price-display text-price-display text-primary font-bold"} data-toll={"spanish_town"}>
                    J$ 260
                  </span>
                </div>
                <div className={"flex items-center gap-space-sm text-on-surface-variant font-label-md text-label-md"}>
                  <span className={"flex items-center gap-1"}>
                    <span className={"material-symbols-outlined text-[16px] text-secondary"}>
                      call_merge
                    </span>
                    Off-ramp / On-ramp
                  </span>
                  <span>
                    •
                  </span>
                  <span>
                    Dual Lanes
                  </span>
                </div>
                <p className={"font-body-sm text-body-sm text-on-surface-variant"}>
                  Mandela Highway connection. Smooth automated tags available.
                </p>
              </div>
              <div className={"bg-surface-container-lowest rounded-xl p-space-md shadow-sm flex flex-col gap-space-xs"}>
                <div className={"flex items-center justify-between"}>
                  <div className={"flex items-center gap-space-xs"}>
                    <span className={"material-symbols-outlined text-primary text-[20px]"}>
                      toll
                    </span>
                    <h3 className={"font-headline-sm text-headline-sm text-on-surface"}>
                      May Pen Toll Plaza
                    </h3>
                  </div>
                  <span className={"font-price-display text-price-display text-primary font-bold"} data-toll={"may_pen"}>
                    J$ 340
                  </span>
                </div>
                <div className={"flex items-center gap-space-sm text-on-surface-variant font-label-md text-label-md"}>
                  <span className={"flex items-center gap-1"}>
                    <span className={"material-symbols-outlined text-[16px] text-secondary"}>
                      swap_horiz
                    </span>
                    Eastbound / Westbound
                  </span>
                  <span>
                    •
                  </span>
                  <span>
                    {"Cash & Card"}
                  </span>
                </div>
                <p className={"font-body-sm text-body-sm text-on-surface-variant"}>
                  {"Rio Cobre & Clarendon transit gate. Quick clearance during midday."}
                </p>
              </div>
              <div className={"bg-surface-container-lowest rounded-xl p-space-md shadow-sm flex flex-col gap-space-xs"}>
                <div className={"flex items-center justify-between"}>
                  <div className={"flex items-center gap-space-xs"}>
                    <span className={"material-symbols-outlined text-primary text-[20px]"}>
                      toll
                    </span>
                    <h3 className={"font-headline-sm text-headline-sm text-on-surface"}>
                      Portmore Toll Plaza
                    </h3>
                  </div>
                  <span className={"font-price-display text-price-display text-primary font-bold"} data-toll={"portmore"}>
                    J$ 380
                  </span>
                </div>
                <div className={"flex items-center gap-space-sm text-on-surface-variant font-label-md text-label-md"}>
                  <span className={"flex items-center gap-1"}>
                    <span className={"material-symbols-outlined text-[16px] text-secondary"}>
                      video_file
                    </span>
                    Portmore Causeway
                  </span>
                  <span>
                    •
                  </span>
                  <span className={"text-error font-semibold"}>
                    Peak Delay ~15m
                  </span>
                </div>
                <p className={"font-body-sm text-body-sm text-on-surface-variant"}>
                  {"Direct link to Marcus Garvey Drive & Downtown Kingston waterfront."}
                </p>
              </div>
            </div>
          </div>
          <div className={"px-gutter mt-space-xl flex flex-col gap-space-md"}>
            <div className={"flex items-center justify-between"}>
              <div className={"flex flex-col"}>
                <div className={"flex items-center gap-2"}>
                  <span className={"w-3 h-3 rounded-full bg-secondary"} />
                  <h2 className={"font-headline-sm text-headline-sm text-on-surface"}>
                    Edward Seaga Highway
                  </h2>
                </div>
                <p className={"font-label-md text-label-md text-on-surface-variant"}>
                  Highway 2000 North-South • Caymanas to Mammee Bay
                </p>
              </div>
              <span className={"font-label-sm text-label-sm font-bold px-2 py-1 rounded bg-surface-container-high text-on-surface"}>
                4 Plazas
              </span>
            </div>
            <div className={"flex flex-col gap-space-sm"}>
              <div className={"bg-surface-container-lowest rounded-xl p-space-md shadow-sm flex flex-col gap-space-xs"}>
                <div className={"flex items-center justify-between"}>
                  <div className={"flex items-center gap-space-xs"}>
                    <span className={"material-symbols-outlined text-secondary text-[20px]"}>
                      toll
                    </span>
                    <h3 className={"font-headline-sm text-headline-sm text-on-surface"}>
                      Caymanas Toll Plaza
                    </h3>
                  </div>
                  <span className={"font-price-display text-price-display text-secondary font-bold"} data-toll={"caymanas"}>
                    J$ 310
                  </span>
                </div>
                <div className={"flex items-center gap-space-sm text-on-surface-variant font-label-md text-label-md"}>
                  <span>
                    Southbound Entry / Exit
                  </span>
                  <span>
                    •
                  </span>
                  <span>
                    Mandela Bypass
                  </span>
                </div>
                <p className={"font-body-sm text-body-sm text-on-surface-variant"}>
                  Southern gateway joining St. Catherine to the North Coast corridor.
                </p>
              </div>
              <div className={"bg-surface-container-lowest rounded-xl p-space-md shadow-sm flex flex-col gap-space-xs"}>
                <div className={"flex items-center justify-between"}>
                  <div className={"flex items-center gap-space-xs"}>
                    <span className={"material-symbols-outlined text-secondary text-[20px]"}>
                      toll
                    </span>
                    <h3 className={"font-headline-sm text-headline-sm text-on-surface"}>
                      Unity Valley Toll Plaza
                    </h3>
                  </div>
                  <span className={"font-price-display text-price-display text-secondary font-bold"} data-toll={"unity_valley"}>
                    J$ 1,050
                  </span>
                </div>
                <div className={"flex items-center gap-space-sm text-on-surface-variant font-label-md text-label-md"}>
                  <span>
                    Main Trunk through Moneague
                  </span>
                  <span>
                    •
                  </span>
                  <span>
                    High Elevation
                  </span>
                </div>
                <p className={"font-body-sm text-body-sm text-on-surface-variant"}>
                  {"Bypasses Mount Rosser & Faith’s Pen. Steep gradients; monitor engine temp."}
                </p>
              </div>
              <div className={"bg-surface-container-lowest rounded-xl p-space-md shadow-sm flex flex-col gap-space-xs"}>
                <div className={"flex items-center justify-between"}>
                  <div className={"flex items-center gap-space-xs"}>
                    <span className={"material-symbols-outlined text-secondary text-[20px]"}>
                      toll
                    </span>
                    <h3 className={"font-headline-sm text-headline-sm text-on-surface"}>
                      Lydford Toll Plaza
                    </h3>
                  </div>
                  <span className={"font-price-display text-price-display text-secondary font-bold"} data-toll={"lydford"}>
                    J$ 680
                  </span>
                </div>
                <div className={"flex items-center gap-space-sm text-on-surface-variant font-label-md text-label-md"}>
                  <span>
                    Golden Grove Interchange
                  </span>
                  <span>
                    •
                  </span>
                  <span>
                    Northbound / Southbound
                  </span>
                </div>
                <p className={"font-body-sm text-body-sm text-on-surface-variant"}>
                  {"Turn-off for Walkers Wood, Fern Gully & St. Ann inland routes."}
                </p>
              </div>
              <div className={"bg-surface-container-lowest rounded-xl p-space-md shadow-sm flex flex-col gap-space-xs"}>
                <div className={"flex items-center justify-between"}>
                  <div className={"flex items-center gap-space-xs"}>
                    <span className={"material-symbols-outlined text-secondary text-[20px]"}>
                      toll
                    </span>
                    <h3 className={"font-headline-sm text-headline-sm text-on-surface"}>
                      Mammee Bay (Ocho Rios)
                    </h3>
                  </div>
                  <span className={"font-price-display text-price-display text-secondary font-bold"} data-toll={"mammee_bay"}>
                    J$ 1,450
                  </span>
                </div>
                <div className={"flex items-center gap-space-sm text-on-surface-variant font-label-md text-label-md"}>
                  <span>
                    Northern Coastal Terminal
                  </span>
                  <span>
                    •
                  </span>
                  <span className={"text-secondary font-semibold"}>
                    Full Caymanas Run: J$ 2,850
                  </span>
                </div>
                <p className={"font-body-sm text-body-sm text-on-surface-variant"}>
                  {"Direct express access to North Coast Highway A1 towards Ocho Rios & Montego Bay."}
                </p>
              </div>
            </div>
          </div>
          <div className={"px-gutter mt-space-xl flex flex-col gap-space-sm"}>
            <div className={"bg-surface-container-low rounded-xl p-space-md shadow-sm flex items-start gap-space-sm"}>
              <div className={"w-10 h-10 rounded-full bg-primary-fixed flex items-center justify-center flex-shrink-0 text-primary"}>
                <span className={"material-symbols-outlined text-[22px]"}>
                  contactless
                </span>
              </div>
              <div className={"flex flex-col"}>
                <div className={"flex items-center gap-2"}>
                  <h3 className={"font-label-lg text-label-lg font-bold text-on-surface"}>
                    T-Tag Transponder Discount
                  </h3>
                  <span className={"px-1.5 py-0.5 rounded text-[10px] font-bold bg-secondary-fixed text-on-secondary-fixed"}>
                    SAVE 10%
                  </span>
                </div>
                <p className={"font-body-sm text-body-sm text-on-surface-variant mt-1"}>
                  Save 10% on frequent commutes with registered TransJamaica T-Tag or South Coast Tag. Direct Roam Plug account balance sync coming in the next update.
                </p>
              </div>
            </div>
            <div className={"bg-surface-container-highest rounded-xl p-space-md shadow-sm flex items-center justify-between gap-space-sm"}>
              <div className={"flex items-center gap-space-sm min-w-0"}>
                <span className={"material-symbols-outlined text-error text-[26px] flex-shrink-0"}>
                  emergency
                </span>
                <div className={"flex flex-col min-w-0"}>
                  <span className={"font-label-lg text-label-lg font-bold text-on-surface truncate"}>
                    Highway 2000 Free Assistance
                  </span>
                  <span className={"font-body-sm text-body-sm text-on-surface-variant truncate"}>
                    Free breakdown towing to the nearest safe exit
                  </span>
                </div>
              </div>
              <a onClick={onPlugClick} className={"flex-shrink-0 flex items-center gap-1 px-3 py-2 rounded-lg bg-surface-container-lowest text-on-surface font-label-md text-label-md font-bold shadow-sm active:scale-95 transition-transform"} href={"tel:8884292000"} data-act={"888-429-2000"}>
                <span className={"material-symbols-outlined text-[18px] text-error"}>
                  call
                </span>
                <span>
                  888-429-2000
                </span>
              </a>
            </div>
          </div>
          <div className={"fixed bottom-0 left-0 right-0 z-40 bg-surface/90 backdrop-blur-xl px-gutter py-space-sm shadow-xl flex items-center gap-space-sm"}>
            <button onClick={onPlugClick} className={"flex-1 h-12 rounded-xl bg-surface-container text-on-surface font-label-lg text-label-lg font-semibold flex items-center justify-center gap-1.5 shadow-sm active:bg-surface-container-high transition-colors"} type={"button"} data-act={"rate-sheet-pdf"}>
              <span className={"material-symbols-outlined text-[20px] text-on-surface-variant"}>
                download
              </span>
              <span className={"truncate"}>
                Rate Sheet (PDF)
              </span>
            </button>
            <button onClick={onPlugClick} className={"flex-1 h-12 rounded-xl bg-primary text-on-primary font-label-lg text-label-lg font-bold flex items-center justify-center gap-1.5 shadow-md active:bg-primary-container transition-colors"} type={"button"} data-act={"add-toll-to-fuel-plan"} data-way-out={"primary"}>
              <span className={"material-symbols-outlined text-[20px]"}>
                add_road
              </span>
              <span className={"truncate"}>
                Add Toll to Fuel Plan
              </span>
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
