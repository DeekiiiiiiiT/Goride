import { useEffect, useRef } from 'react';
import { onPlugClick } from '../../shell/actions';
import { bindScreen } from '../../shell/bind';


export function OfflineChipScreen() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (ref.current) bindScreen("15d-offline-chip.html", ref.current); }, []);
  return (
    <div ref={ref} data-plug-screen={"15d-offline-chip.html"} className={"bg-surface font-body-md text-on-surface flex flex-col min-h-screen"}>
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
                <div className={"flex items-center gap-1 px-2.5 py-1 rounded-full bg-tertiary-fixed text-on-tertiary-fixed shadow-sm active:scale-95 transition-transform cursor-pointer"}>
                  <span className={"material-symbols-outlined text-[13px] text-tertiary-container animate-pulse"}>
                    sync
                  </span>
                  <span className={"font-label-sm text-[10px] font-bold text-on-tertiary-fixed tracking-tight whitespace-nowrap"}>
                    2 logs waiting
                  </span>
                </div>
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
          <div className={"relative w-full h-[512px] bg-surface-container-low overflow-hidden cursor-grab active:cursor-grabbing"}>
            <svg className={"absolute inset-0 w-full h-full object-cover select-none pointer-events-none opacity-90"} fill={"none"} viewBox={"0 0 420 560"} xmlns={"http://www.w3.org/2000/svg"}>
              <rect fill={"#F4EDE6"} height={"560"} width={"420"} />
              <path d={"M260 40C295 40 330 65 330 110C330 145 285 160 250 150C225 142 220 95 240 60C248 45 254 40 260 40Z"} fill={"#DCECD7"} opacity={"0.6"} />
              <path d={"M40 380C65 375 110 385 115 425C120 460 85 490 50 480C25 470 20 420 30 395C33 385 36 380 40 380Z"} fill={"#DCECD7"} opacity={"0.5"} />
              <path d={"M-20 180 Q 140 210 210 260 T 440 330"} stroke={"#FFFFFF"} strokeLinecap={"round"} strokeWidth={"26"} />
              <path d={"M-20 180 Q 140 210 210 260 T 440 330"} stroke={"#E2BFB2"} strokeLinecap={"round"} strokeWidth={"12"} />
              <text fill={"#8E7166"} fontFamily={"Inter"} fontSize={"9"} fontWeight={"700"} transform={"rotate(8 70 195)"} x={"70"} y={"195"}>
                HOPE ROAD
              </text>
              <path d={"M210 -20 L 210 580"} stroke={"#FFFFFF"} strokeWidth={"24"} />
              <path d={"M210 -20 L 210 580"} stroke={"#FFDBCA"} strokeWidth={"10"} />
              <text fill={"#8E7166"} fontFamily={"Inter"} fontSize={"9"} fontWeight={"700"} transform={"rotate(90 218 90)"} x={"218"} y={"90"}>
                CONSTANT SPRING RD
              </text>
              <path d={"M210 260 L 30 520"} stroke={"#FFFFFF"} strokeWidth={"22"} />
              <path d={"M210 260 L 30 520"} stroke={"#E2BFB2"} strokeWidth={"8"} />
              <text fill={"#8E7166"} fontFamily={"Inter"} fontSize={"8"} fontWeight={"700"} transform={"rotate(-55 120 380)"} x={"120"} y={"380"}>
                HAGLEY PARK RD
              </text>
              <path d={"M210 260 L 410 470"} stroke={"#FFFFFF"} strokeWidth={"20"} />
              <path d={"M210 260 L 410 470"} stroke={"#FFDBCA"} strokeWidth={"8"} />
              <text fill={"#8E7166"} fontFamily={"Inter"} fontSize={"8"} fontWeight={"700"} transform={"rotate(45 290 355)"} x={"290"} y={"355"}>
                HALF-WAY-TREE RD
              </text>
              <circle cx={"210"} cy={"260"} fill={"#F4EDE6"} r={"28"} stroke={"#FFFFFF"} strokeWidth={"10"} />
              <circle cx={"210"} cy={"260"} fill={"#E8E1DB"} r={"20"} />
              <circle cx={"210"} cy={"260"} fill={"#CC4900"} opacity={"0.3"} r={"8"} />
              <path d={"M70 40 L 70 330"} stroke={"#FFFFFF"} strokeWidth={"7"} />
              <path d={"M340 180 L 340 500"} stroke={"#FFFFFF"} strokeWidth={"8"} />
              <path d={"M40 100 L 390 100"} stroke={"#FFFFFF"} strokeWidth={"8"} />
              <path d={"M60 410 L 380 410"} stroke={"#FFFFFF"} strokeWidth={"7"} />
              <path d={"M120 200 L 120 480"} stroke={"#FFFFFF"} strokeWidth={"6"} />
              <path d={"M30 460 L 390 460"} stroke={"#FFFFFF"} strokeWidth={"6"} />
              <circle cx={"160"} cy={"210"} opacity={"0.2"} r={"70"} stroke={"#CC4900"} strokeDasharray={"4 4"} strokeWidth={"1"} />
            </svg>
            <div className={"absolute top-[200px] left-[145px] -translate-x-1/2 -translate-y-1/2 z-20 flex flex-col items-center pointer-events-none"}>
              <div className={"relative flex items-center justify-center"}>
                <span className={"absolute w-12 h-12 rounded-full bg-primary/20 animate-ping"} />
                <span className={"absolute w-7 h-7 rounded-full bg-primary/30"} />
                <span className={"relative w-4 h-4 rounded-full bg-primary ring-2 ring-surface shadow-md"} />
              </div>
              <div className={"mt-1 px-2 py-0.5 rounded-full bg-surface-container-lowest/90 backdrop-blur-sm shadow-sm flex items-center gap-1"}>
                <span className={"w-1.5 h-1.5 rounded-full bg-primary"} />
                <span className={"font-label-sm text-[9px] text-on-surface font-bold whitespace-nowrap"}>
                  You on Hope Rd
                </span>
              </div>
            </div>
            <div className={"absolute top-[320px] left-[130px] z-20 -translate-x-1/2 -translate-y-full cursor-pointer group"}>
              <div className={"flex flex-col items-center"}>
                <div className={"px-2.5 py-1 rounded-full bg-tertiary-fixed text-on-tertiary-fixed shadow-md flex items-center gap-1 -mb-1 z-10 scale-95 ring-2 ring-tertiary-container animate-bounce"}>
                  <span className={"material-symbols-outlined text-[13px] text-tertiary-container"} style={{ fontVariationSettings: "'FILL' 1" }}>
                    star
                  </span>
                  <span className={"font-label-sm text-[10px] font-bold uppercase tracking-tight text-tertiary-container"}>
                    Best J$208.20
                  </span>
                </div>
                <div className={"px-3 py-1.5 rounded-xl bg-surface-container-lowest shadow-lg flex items-center gap-1.5 active:scale-95 transition-transform"}>
                  <span className={"w-5 h-5 rounded-md bg-secondary-container flex items-center justify-center text-on-primary font-bold text-[10px]"}>
                    F
                  </span>
                  <div className={"flex flex-col leading-none"}>
                    <span className={"font-label-sm text-[10px] font-bold text-on-surface"}>
                      Fesco Beechwood
                    </span>
                    <span className={"font-price-display text-label-sm text-primary font-bold"}>
                      J$208.20
                    </span>
                  </div>
                </div>
                <div className={"w-2.5 h-2.5 bg-surface-container-lowest rotate-45 -mt-1 shadow-sm"} />
              </div>
            </div>
            <div className={"absolute top-[230px] left-[260px] z-10 -translate-x-1/2 -translate-y-full cursor-pointer"}>
              <div className={"flex flex-col items-center active:scale-95 transition-transform"}>
                <div className={"px-2.5 py-1 rounded-xl bg-surface-container-lowest shadow-md flex items-center gap-1.5"}>
                  <span className={"w-4 h-4 rounded-full bg-error flex items-center justify-center text-on-primary text-[9px] font-bold"}>
                    ★
                  </span>
                  <span className={"font-label-sm text-[11px] font-bold text-on-surface"}>
                    Texaco
                  </span>
                  <span className={"font-price-display text-label-sm text-on-surface-variant font-bold"}>
                    J$214.50
                  </span>
                </div>
                <div className={"w-2 h-2 bg-surface-container-lowest rotate-45 -mt-1 shadow-sm"} />
              </div>
            </div>
            <div className={"absolute top-[125px] left-[110px] z-10 -translate-x-1/2 -translate-y-full cursor-pointer"}>
              <div className={"flex flex-col items-center active:scale-95 transition-transform"}>
                <div className={"px-2.5 py-1 rounded-xl bg-surface-container-lowest shadow-md flex items-center gap-1.5"}>
                  <span className={"material-symbols-outlined text-primary text-[14px]"}>
                    local_gas_station
                  </span>
                  <span className={"font-label-sm text-[11px] font-bold text-on-surface"}>
                    Cool Oasis
                  </span>
                  <span className={"font-price-display text-label-sm text-secondary font-bold"}>
                    J$209.50
                  </span>
                </div>
                <div className={"w-2 h-2 bg-surface-container-lowest rotate-45 -mt-1 shadow-sm"} />
              </div>
            </div>
            <div className={"absolute top-[160px] right-[25px] z-10 cursor-pointer"}>
              <div className={"flex flex-col items-center active:scale-95 transition-transform"}>
                <div className={"px-2 py-0.5 rounded-lg bg-surface-container-lowest shadow-sm flex items-center gap-1"}>
                  <span className={"w-2 h-2 rounded-full bg-primary"} />
                  <span className={"font-label-sm text-[10px] text-on-surface font-semibold"}>
                    TotalEnergies
                  </span>
                  <span className={"font-label-sm text-[10px] font-bold text-on-surface-variant"}>
                    217.90
                  </span>
                </div>
              </div>
            </div>
            <div className={"absolute top-[410px] left-[260px] z-10 cursor-pointer"}>
              <div className={"flex flex-col items-center active:scale-95 transition-transform"}>
                <div className={"px-2.5 py-1 rounded-xl bg-surface-container-lowest shadow-md flex items-center gap-1"}>
                  <span className={"w-3.5 h-3.5 rounded-full bg-blue-600 text-[8px] text-white flex items-center justify-center font-bold"}>
                    R
                  </span>
                  <span className={"font-label-sm text-[10px] font-bold text-on-surface"}>
                    Rubis
                  </span>
                  <span className={"font-label-sm text-[10px] text-on-surface-variant font-bold"}>
                    J$215.00
                  </span>
                </div>
              </div>
            </div>
            <div className={"absolute top-[150px] left-[280px] z-10 cursor-pointer"}>
              <div className={"w-7 h-7 rounded-full bg-surface-container-lowest shadow-md flex items-center justify-center text-tertiary active:scale-90 transition-transform"}>
                <span className={"material-symbols-outlined text-[15px]"}>
                  build
                </span>
              </div>
            </div>
            <div className={"absolute top-[350px] left-[55px] z-10 cursor-pointer"}>
              <div className={"w-7 h-7 rounded-full bg-surface-container-lowest shadow-md flex items-center justify-center text-secondary active:scale-90 transition-transform"}>
                <span className={"material-symbols-outlined text-[15px]"}>
                  tire_repair
                </span>
              </div>
            </div>
            <div className={"absolute top-[280px] right-[40px] z-10 cursor-pointer flex flex-col items-center"}>
              <div className={"px-2 py-0.5 rounded-full bg-surface-container-highest/90 text-on-surface-variant shadow-sm flex items-center gap-1 border-dashed"}>
                <span className={"material-symbols-outlined text-[12px] text-tertiary"}>
                  hourglass_top
                </span>
                <span className={"font-label-sm text-[9px] font-medium"}>
                  AutoPlugs Review
                </span>
              </div>
            </div>
            <div className={"absolute right-space-md bottom-6 z-20 flex flex-col items-center gap-space-sm pointer-events-auto"}>
              <button onClick={onPlugClick} aria-label={"Recenter Map"} className={"w-12 h-12 min-w-[48px] min-h-[48px] rounded-full bg-surface-container-lowest text-on-surface shadow-md flex items-center justify-center active:scale-95 transition-transform"} data-act={"my-location"}>
                <span className={"material-symbols-outlined text-[24px] text-primary"}>
                  my_location
                </span>
              </button>
              <button onClick={onPlugClick} className={"flex items-center gap-2 px-3.5 h-12 min-h-[48px] rounded-full bg-primary text-on-primary shadow-xl active:scale-95 transition-transform"} data-act={"map-spot"} data-way-out={"primary"}>
                <span className={"material-symbols-outlined text-[20px]"}>
                  add_location_alt
                </span>
                <span className={"font-label-lg text-label-sm font-bold tracking-wide uppercase"}>
                  + Map Spot
                </span>
              </button>
            </div>
          </div>
          <div className={"relative z-30 flex flex-col w-full -mt-4 bg-surface rounded-t-3xl shadow-2xl px-space-md pt-3 pb-8"}>
            <div className={"w-full flex justify-center py-1 cursor-grab active:cursor-grabbing"}>
              <div className={"w-12 h-1.5 rounded-full bg-surface-container-highest"} />
            </div>
            <div className={"flex items-center justify-between mt-2 mb-3"}>
              <div className={"flex items-center gap-1.5"}>
                <span className={"material-symbols-outlined text-primary text-[20px]"}>
                  near_me
                </span>
                <span className={"font-headline-sm text-headline-sm text-on-surface font-bold"}>
                  Pump Highlights
                </span>
              </div>
              <span className={"font-label-md text-label-sm text-on-surface-variant"}>
                Sorted by Lowest E-10
              </span>
            </div>
            <div className={"w-full rounded-2xl bg-surface-container-lowest p-space-md shadow-md mb-space-md relative overflow-hidden"}>
              <div className={"absolute -right-4 -bottom-4 w-24 h-24 rounded-full bg-tertiary-fixed/30 pointer-events-none blur-xl"} />
              <div className={"flex items-start justify-between gap-2"}>
                <div className={"flex items-start gap-2.5"}>
                  <div className={"w-11 h-11 rounded-xl bg-secondary-container flex items-center justify-center text-on-primary font-extrabold text-[16px] shadow-sm shrink-0"}>
                    F
                  </div>
                  <div className={"flex flex-col"}>
                    <div className={"flex items-center gap-1.5"}>
                      <span className={"font-headline-sm text-body-lg text-on-surface font-bold"}>
                        Fesco
                      </span>
                      <span className={"material-symbols-outlined text-[16px] text-emerald-600"} style={{ fontVariationSettings: "'FILL' 1" }}>
                        verified
                      </span>
                      <span className={"font-label-sm text-[10px] px-1.5 py-0.5 rounded-full bg-tertiary-fixed text-on-tertiary-fixed font-bold"}>
                        Cheapest E-10
                      </span>
                    </div>
                    <span className={"font-body-sm text-body-sm text-on-surface-variant"}>
                      Beechwood Ave, St Andrew • 0.8 km
                    </span>
                  </div>
                </div>
                <div className={"flex flex-col items-end"}>
                  <span className={"font-price-display text-price-display text-primary leading-tight font-extrabold"}>
                    J$208.20
                  </span>
                  <span className={"font-label-sm text-[10px] text-on-surface-variant font-medium"}>
                    per Litre (E-10 87)
                  </span>
                </div>
              </div>
              <div className={"flex items-center justify-between mt-3 pt-2.5 bg-surface-container-low/60 -mx-space-md px-space-md"}>
                <div className={"flex items-center gap-2"}>
                  <span className={"font-label-sm text-[11px] text-on-surface-variant flex items-center gap-1"}>
                    <span className={"material-symbols-outlined text-[14px] text-primary"}>
                      update
                    </span>
                    Verified 22m ago by Andre B.
                  </span>
                </div>
                <div className={"flex items-center gap-1.5 text-on-surface-variant"}>
                  <span className={"material-symbols-outlined text-[16px] text-secondary"}>
                    tire_repair
                  </span>
                  <span className={"material-symbols-outlined text-[16px]"}>
                    local_convenience_store
                  </span>
                  <span className={"material-symbols-outlined text-[16px]"}>
                    atm
                  </span>
                </div>
              </div>
              <div className={"grid grid-cols-2 gap-space-sm mt-3"}>
                <button onClick={onPlugClick} className={"h-11 min-h-[44px] rounded-xl bg-primary text-on-primary font-label-lg text-label-md flex items-center justify-center gap-1.5 shadow-sm active:scale-95 transition-all"} data-act={"drive-now-3m"} data-way-out={"primary"}>
                  <span className={"material-symbols-outlined text-[18px]"}>
                    directions
                  </span>
                  <span>
                    Drive Now (3m)
                  </span>
                </button>
                <button onClick={onPlugClick} className={"h-11 min-h-[44px] rounded-xl bg-surface-container-high text-on-surface font-label-lg text-label-md flex items-center justify-center gap-1.5 active:scale-95 transition-all"} data-act={"log-fill-up"}>
                  <span className={"material-symbols-outlined text-[18px] text-secondary"}>
                    add_circle
                  </span>
                  <span>
                    Log Fill-up
                  </span>
                </button>
              </div>
            </div>
            <div className={"w-full rounded-xl bg-surface-container-high p-3 mb-space-md flex items-center justify-between"}>
              <div className={"flex items-center gap-2.5"}>
                <div className={"w-9 h-9 rounded-lg bg-surface-container-lowest flex items-center justify-center text-primary shadow-sm shrink-0"}>
                  <span className={"material-symbols-outlined text-[20px]"}>
                    directions_car
                  </span>
                </div>
                <div className={"flex flex-col"}>
                  <div className={"flex items-center gap-1.5"}>
                    <span className={"font-headline-sm text-body-md text-on-surface font-bold"}>
                      2019 Toyota Roomy
                    </span>
                    <span className={"w-1.5 h-1.5 rounded-full bg-tertiary"} />
                    <span className={"font-label-sm text-[10px] text-on-surface-variant"}>
                      Fleet
                    </span>
                  </div>
                  <span className={"font-body-sm text-body-sm text-tertiary font-semibold flex items-center gap-1"}>
                    <span className={"material-symbols-outlined text-[14px]"}>
                      schedule
                    </span>
                    Oil change due in 620 km
                  </span>
                </div>
              </div>
              <a onClick={onPlugClick} className={"font-label-lg text-label-sm text-primary font-bold px-2 py-1 min-h-[40px] flex items-center"} href={"#"} data-act={"garage"}>
                Garage
              </a>
            </div>
            <div className={"flex flex-col gap-2.5 w-full"}>
              <div className={"flex items-center justify-between px-0.5"}>
                <span className={"font-label-lg text-label-md text-on-surface-variant font-bold uppercase tracking-wider"}>
                  Other Gas Plugs Nearby
                </span>
                <button onClick={onPlugClick} className={"font-label-md text-label-sm text-primary font-bold min-h-[36px] flex items-center"} data-act={"see-all-14"}>
                  See All (14)
                </button>
              </div>
              <div className={"w-full rounded-xl bg-surface-container-lowest p-3 shadow-sm flex items-center justify-between active:bg-surface-container-low transition-colors"}>
                <div className={"flex items-center gap-3"}>
                  <div className={"w-10 h-10 rounded-lg bg-surface-container flex items-center justify-center text-primary"}>
                    <span className={"material-symbols-outlined text-[20px]"}>
                      local_gas_station
                    </span>
                  </div>
                  <div className={"flex flex-col"}>
                    <div className={"flex items-center gap-1"}>
                      <span className={"font-headline-sm text-body-md text-on-surface font-bold"}>
                        Cool Oasis
                      </span>
                      <span className={"font-label-sm text-[10px] text-on-surface-variant font-normal"}>
                        • Kingsway
                      </span>
                    </div>
                    <div className={"flex items-center gap-2 mt-0.5"}>
                      <span className={"font-body-sm text-body-sm text-on-surface-variant"}>
                        1.4 km
                      </span>
                      <span className={"w-1 h-1 rounded-full bg-outline-variant"} />
                      <span className={"font-label-sm text-[10px] px-1.5 py-0.2 rounded bg-surface-container text-on-surface-variant font-medium"}>
                        Free Air
                      </span>
                      <span className={"w-1 h-1 rounded-full bg-outline-variant"} />
                      <span className={"font-label-sm text-[10px] text-emerald-600 font-bold"}>
                        Open 24/7
                      </span>
                    </div>
                  </div>
                </div>
                <div className={"flex flex-col items-end"}>
                  <span className={"font-price-display text-body-lg text-on-surface font-extrabold tabular-nums"}>
                    J$209.50
                  </span>
                  <span className={"font-label-sm text-[10px] text-on-surface-variant"}>
                    E-10 87
                  </span>
                </div>
              </div>
              <div className={"w-full rounded-xl bg-surface-container-lowest p-3 shadow-sm flex items-center justify-between active:bg-surface-container-low transition-colors"}>
                <div className={"flex items-center gap-3"}>
                  <div className={"w-10 h-10 rounded-lg bg-surface-container flex items-center justify-center text-error"}>
                    <span className={"material-symbols-outlined text-[20px]"}>
                      local_gas_station
                    </span>
                  </div>
                  <div className={"flex flex-col"}>
                    <div className={"flex items-center gap-1"}>
                      <span className={"font-headline-sm text-body-md text-on-surface font-bold"}>
                        Texaco
                      </span>
                      <span className={"font-label-sm text-[10px] text-on-surface-variant font-normal"}>
                        • Clock Tower
                      </span>
                    </div>
                    <div className={"flex items-center gap-2 mt-0.5"}>
                      <span className={"font-body-sm text-body-sm text-on-surface-variant"}>
                        0.4 km
                      </span>
                      <span className={"w-1 h-1 rounded-full bg-outline-variant"} />
                      <span className={"font-label-sm text-[10px] px-1.5 py-0.2 rounded bg-surface-container text-on-surface-variant font-medium"}>
                        ATM
                      </span>
                      <span className={"w-1 h-1 rounded-full bg-outline-variant"} />
                      <span className={"font-label-sm text-[10px] text-on-surface-variant font-medium"}>
                        Restrooms
                      </span>
                    </div>
                  </div>
                </div>
                <div className={"flex flex-col items-end"}>
                  <span className={"font-price-display text-body-lg text-on-surface font-extrabold tabular-nums"}>
                    J$214.50
                  </span>
                  <span className={"font-label-sm text-[10px] text-on-surface-variant"}>
                    E-10 87
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
