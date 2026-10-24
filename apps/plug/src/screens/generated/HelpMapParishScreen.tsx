import { useEffect, useRef } from 'react';
import { onPlugClick } from '../../shell/actions';
import { bindScreen } from '../../shell/bind';


export function HelpMapParishScreen() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (ref.current) bindScreen("47-help-map-parish.html", ref.current); }, []);
  return (
    <div ref={ref} data-plug-screen={"47-help-map-parish.html"} className={"bg-surface font-body-md text-on-surface flex flex-col min-h-screen"}>
      <header className={"fixed top-0 w-full z-50 pt-safe bg-surface/80 backdrop-blur-xl shadow-[0_1px_8px_rgba(0,0,0,0.04)]"}>
        <div className={"h-16 px-gutter flex items-center justify-between"}>
          <div className={"flex items-center gap-space-sm min-w-0 pr-space-sm"}>
            <button onClick={onPlugClick} aria-label={"Go back"} className={"w-12 h-12 flex-shrink-0 flex items-center justify-center rounded-full text-on-surface hover:bg-surface-container active:bg-surface-container-high transition-colors"} type={"button"} data-act={"arrow-back"} data-way-out={"back"}>
              <span className={"material-symbols-outlined text-[24px]"}>
                arrow_back
              </span>
            </button>
            <h1 className={"font-headline-sm text-headline-sm text-on-surface tracking-tight truncate"}>
              Help Map Your Parish
            </h1>
          </div>
          <div className={"flex items-center gap-space-xs flex-shrink-0"}>
            <button onClick={onPlugClick} aria-label={"Help & Guidelines"} className={"w-12 h-12 flex items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container active:bg-surface-container-high transition-colors"} type={"button"} data-act={"help-outline"}>
              <span className={"material-symbols-outlined text-[22px]"}>
                help_outline
              </span>
            </button>
          </div>
        </div>
      </header>
      <main className={"flex flex-col relative w-full pt-16 bg-surface min-h-screen pb-safe"}>
        <div className={"flex flex-col w-full pb-24"}>
          <div className={"px-gutter pt-space-md pb-space-lg"}>
            <div className={"flex items-center gap-space-xs text-primary mb-space-xs"}>
              <span className={"material-symbols-outlined text-[18px]"}>
                explore
              </span>
              <span className={"font-label-md text-label-md uppercase tracking-wider"}>
                Road Scout Mission
              </span>
            </div>
            <h2 className={"font-headline-lg text-headline-lg text-on-surface tracking-tight mb-space-xs"}>
              Help Map Your Parish
            </h2>
            <p className={"font-body-md text-body-md text-on-surface-variant leading-relaxed mb-space-md"}>
              Join fellow Jamaican Road Scouts in filling missing fuel stops, tyre shops, and trusted roadside mechanics across all 14 parishes.
            </p>
            <div className={"bg-surface-container rounded-xl p-space-sm shadow-sm flex flex-col gap-space-xs"}>
              <div className={"flex items-center justify-between"}>
                <span className={"font-label-md text-label-md text-on-surface-variant flex items-center gap-1"}>
                  <span className={"w-2 h-2 rounded-full bg-secondary"} />
                  Islandwide Coverage
                </span>
                <span className={"font-headline-sm text-headline-sm text-secondary font-bold"}>
                  54%
                </span>
              </div>
              <div className={"w-full bg-surface-container-highest rounded-full h-2 overflow-hidden"}>
                <div className={"bg-primary h-full rounded-full"} style={{ width: "54%" }} />
              </div>
              <div className={"flex items-center justify-between pt-1 font-label-sm text-label-sm text-on-surface-variant"}>
                <span className={"flex items-center gap-1"}>
                  <span className={"material-symbols-outlined text-[14px] text-primary"}>
                    priority_high
                  </span>
                  7 Parishes Critical
                </span>
                <span className={"bg-primary-fixed text-on-primary-fixed-variant px-2 py-0.5 rounded-full font-bold"}>
                  +50 XP In Priority Zones
                </span>
              </div>
            </div>
          </div>
          <div className={"px-gutter mb-space-lg"}>
            <div className={"bg-surface-container-lowest rounded-2xl p-space-md shadow-sm"}>
              <div className={"flex items-center justify-between mb-space-sm"}>
                <div>
                  <h3 className={"font-headline-sm text-headline-sm text-on-surface"}>
                    Parish Grid Shading
                  </h3>
                  <p className={"font-body-sm text-body-sm text-on-surface-variant"}>
                    Tap a parish region to inspect gaps
                  </p>
                </div>
                <span className={"material-symbols-outlined text-primary text-[24px]"}>
                  satellite_alt
                </span>
              </div>
              <div className={"relative w-full overflow-hidden rounded-xl bg-surface-container-low p-2"}>
                <svg className={"w-full h-auto drop-shadow-sm select-none"} viewBox={"0 0 540 220"} xmlns={"http://www.w3.org/2000/svg"}>
                  <defs>
                    <linearGradient id={"heroGradient"} x1={"0%"} x2={"100%"} y1={"0%"} y2={"100%"}>
                      <stop offset={"0%"} stopColor={"#fd761a"} stopOpacity={"0.25"} />
                      <stop offset={"100%"} stopColor={"#755800"} stopOpacity={"0.1"} />
                    </linearGradient>
                    <pattern height={"16"} id={"gridPattern"} patternUnits={"userSpaceOnUse"} width={"16"}>
                      <path d={"M 16 0 L 0 0 0 16"} fill={"none"} stroke={"#e8e1db"} strokeWidth={"0.75"} />
                    </pattern>
                  </defs>
                  <rect fill={"url(#gridPattern)"} height={"100%"} rx={"8"} width={"100%"} />
                  <polygon className={"cursor-pointer transition-colors hover:opacity-80"} fill={"#ffdf9a"} id={"parish-hanover"} points={"25,55 68,48 72,82 32,84"} />
                  <text className={"font-label-sm text-[8px] fill-[#5a4300] font-bold"} x={"40"} y={"68"}>
                    HAN
                  </text>
                  <polygon className={"cursor-pointer transition-colors hover:opacity-80"} fill={"#ffdf9a"} id={"parish-westmoreland"} points={"20,85 73,83 95,118 35,124 15,102"} />
                  <text className={"font-label-sm text-[9px] fill-[#5a4300] font-bold"} x={"38"} y={"106"}>
                    WEST
                  </text>
                  <polygon className={"cursor-pointer transition-colors hover:opacity-80"} fill={"#ffdf9a"} id={"parish-stjames"} points={"69,47 114,44 118,92 74,82"} />
                  <text className={"font-label-sm text-[8px] fill-[#5a4300] font-bold"} x={"82"} y={"70"}>
                    ST. JAM
                  </text>
                  <polygon className={"cursor-pointer transition-colors hover:opacity-80"} fill={"#ffdf9a"} id={"parish-trelawny"} points={"115,44 172,42 168,102 119,92"} />
                  <text className={"font-label-sm text-[9px] fill-[#5a4300] font-bold"} x={"130"} y={"74"}>
                    TRELAWNY
                  </text>
                  <polygon className={"cursor-pointer transition-colors hover:opacity-80"} fill={"#ffdbce"} id={"parish-stelizabeth"} points={"74,84 120,93 148,150 96,152 72,122"} />
                  <text className={"font-label-sm text-[9px] fill-[#7f2b00] font-extrabold"} x={"94"} y={"122"}>
                    ST. ELIZ
                  </text>
                  <polygon className={"cursor-pointer transition-colors hover:opacity-80"} fill={"#ffb599"} id={"parish-manchester"} points={"121,94 170,103 178,156 148,151"} />
                  <text className={"font-label-sm text-[9px] fill-[#7f2b00] font-extrabold"} x={"135"} y={"128"}>
                    MANCH
                  </text>
                  <polygon className={"cursor-pointer transition-colors hover:opacity-80"} fill={"#ffdf9a"} id={"parish-stann"} points={"173,42 260,40 248,98 169,102"} />
                  <text className={"font-label-sm text-[10px] fill-[#5a4300] font-bold"} x={"202"} y={"72"}>
                    ST. ANN
                  </text>
                  <polygon className={"cursor-pointer transition-colors hover:opacity-80"} fill={"#ffdbce"} id={"parish-clarendon"} points={"171,104 235,99 238,172 179,157"} />
                  <text className={"font-label-sm text-[9px] fill-[#7f2b00] font-bold"} x={"190"} y={"134"}>
                    CLAR
                  </text>
                  <polygon className={"cursor-pointer transition-colors hover:opacity-80"} fill={"#ffdf9a"} id={"parish-stmary"} points={"261,40 338,58 318,102 249,97"} />
                  <text className={"font-label-sm text-[9px] fill-[#5a4300] font-bold"} x={"278"} y={"72"}>
                    ST. MARY
                  </text>
                  <polygon className={"cursor-pointer transition-colors hover:opacity-80"} fill={"#ffdf9a"} id={"parish-stcatherine"} points={"236,99 308,103 298,162 239,171"} />
                  <text className={"font-label-sm text-[9px] fill-[#5a4300] font-bold"} x={"254"} y={"132"}>
                    ST. CATH
                  </text>
                  <polygon className={"cursor-pointer transition-colors hover:opacity-80"} fill={"#bbf7d0"} id={"parish-standrew"} points={"309,104 365,108 358,154 299,161"} />
                  <text className={"font-label-sm text-[8px] fill-[#14532d] font-extrabold"} x={"318"} y={"128"}>
                    ST. ANDREW
                  </text>
                  <circle cx={"332"} cy={"146"} fill={"#22c55e"} r={"10"} />
                  <text className={"font-label-sm text-[7px] fill-white font-extrabold"} x={"325"} y={"149"}>
                    KGN
                  </text>
                  <polygon className={"cursor-pointer transition-colors hover:opacity-80"} fill={"#ffb599"} id={"parish-portland"} points={"339,59 428,102 384,138 319,103"} />
                  <text className={"font-label-sm text-[9px] fill-[#7f2b00] font-extrabold"} x={"358"} y={"96"}>
                    PORTLAND
                  </text>
                  <polygon className={"cursor-pointer transition-colors hover:opacity-80"} fill={"#ffdbce"} id={"parish-stthomas"} points={"366,110 442,126 432,152 359,153"} />
                  <text className={"font-label-sm text-[8px] fill-[#7f2b00] font-bold"} x={"382"} y={"138"}>
                    ST. THOM
                  </text>
                  <g transform={"translate(148, 114)"}>
                    <circle className={"animate-ping"} cx={"0"} cy={"0"} fill={"#ea580c"} opacity={"0.3"} r={"7"} />
                    <circle cx={"0"} cy={"0"} fill={"#a33900"} r={"4"} />
                  </g>
                  <g transform={"translate(376, 96)"}>
                    <circle className={"animate-ping"} cx={"0"} cy={"0"} fill={"#ea580c"} opacity={"0.3"} r={"7"} />
                    <circle cx={"0"} cy={"0"} fill={"#a33900"} r={"4"} />
                  </g>
                </svg>
              </div>
              <div className={"flex items-center justify-between gap-1 mt-space-md pt-space-xs"}>
                <div className={"flex items-center gap-1.5"}>
                  <span className={"w-3 h-3 rounded-full bg-[#22c55e]"} />
                  <span className={"font-label-sm text-label-sm text-on-surface"}>
                    {">70% Well Mapped"}
                  </span>
                </div>
                <div className={"flex items-center gap-1.5"}>
                  <span className={"w-3 h-3 rounded-full bg-[#f7be1d]"} />
                  <span className={"font-label-sm text-label-sm text-on-surface"}>
                    40-70% Moderate
                  </span>
                </div>
                <div className={"flex items-center gap-1.5"}>
                  <span className={"w-3 h-3 rounded-full bg-primary-container"} />
                  <span className={"font-label-sm text-label-sm text-on-surface"}>
                    {"<40% Critical"}
                  </span>
                </div>
              </div>
            </div>
          </div>
          <div className={"px-gutter mb-space-lg"}>
            <div className={"bg-surface-container-lowest rounded-2xl p-space-md shadow-sm relative overflow-hidden"}>
              <div className={"flex items-center justify-between mb-space-sm"}>
                <div className={"flex items-center gap-2"}>
                  <span className={"px-2.5 py-1 rounded-full bg-primary text-on-primary font-label-sm text-label-sm font-bold flex items-center gap-1"}>
                    <span className={"material-symbols-outlined text-[14px]"}>
                      local_fire_department
                    </span>
                    PRIORITY SPOTLIGHT
                  </span>
                  <span className={"font-label-md text-label-md text-secondary font-bold"}>
                    Manchester
                  </span>
                </div>
                <span className={"font-label-sm text-label-sm text-on-surface-variant font-bold"}>
                  34% Mapped
                </span>
              </div>
              <h3 className={"font-headline-sm text-headline-sm text-on-surface tracking-tight mb-1"}>
                Places we urgently need in Manchester
              </h3>
              <p className={"font-body-sm text-body-sm text-on-surface-variant mb-space-md flex items-center gap-1"}>
                <span className={"material-symbols-outlined text-[16px] text-primary"}>
                  pin_drop
                </span>
                {"Mandeville & Christiana Transit Corridors"}
              </p>
              <div className={"flex flex-col gap-space-sm mb-space-md"}>
                <div className={"bg-surface-container rounded-xl p-space-sm flex items-start justify-between gap-space-sm"}>
                  <div className={"flex items-start gap-space-sm min-w-0"}>
                    <div className={"w-9 h-9 rounded-lg bg-surface-container-highest flex items-center justify-center flex-shrink-0 text-primary"}>
                      <span className={"material-symbols-outlined text-[20px]"}>
                        build
                      </span>
                    </div>
                    <div className={"min-w-0"}>
                      <div className={"flex items-center gap-2"}>
                        <h4 className={"font-label-lg text-label-lg text-on-surface truncate"}>
                          Auto Parts Stores
                        </h4>
                        <span className={"bg-secondary-fixed text-on-secondary-fixed font-label-sm text-label-sm px-1.5 py-0.2 rounded font-bold"}>
                          +50 XP
                        </span>
                      </div>
                      <p className={"font-body-sm text-body-sm text-on-surface-variant"}>
                        {"Japanese import spares & Daihatsu supplies"}
                      </p>
                    </div>
                  </div>
                  <button onClick={onPlugClick} className={"w-8 h-8 rounded-full bg-surface-container-highest flex items-center justify-center text-primary flex-shrink-0 hover:bg-primary hover:text-on-primary transition-colors"} type={"button"} data-act={"add-location"} data-way-out={"primary"}>
                    <span className={"material-symbols-outlined text-[18px]"}>
                      add_location
                    </span>
                  </button>
                </div>
                <div className={"bg-surface-container rounded-xl p-space-sm flex items-start justify-between gap-space-sm"}>
                  <div className={"flex items-start gap-space-sm min-w-0"}>
                    <div className={"w-9 h-9 rounded-lg bg-surface-container-highest flex items-center justify-center flex-shrink-0 text-primary"}>
                      <span className={"material-symbols-outlined text-[20px]"}>
                        car_repair
                      </span>
                    </div>
                    <div className={"min-w-0"}>
                      <div className={"flex items-center gap-2"}>
                        <h4 className={"font-label-lg text-label-lg text-on-surface truncate"}>
                          Spur Tree Mechanics
                        </h4>
                        <span className={"bg-secondary-fixed text-on-secondary-fixed font-label-sm text-label-sm px-1.5 py-0.2 rounded font-bold"}>
                          +50 XP
                        </span>
                      </div>
                      <p className={"font-body-sm text-body-sm text-on-surface-variant"}>
                        {"Brake pad, radiator & overheat recovery spots"}
                      </p>
                    </div>
                  </div>
                  <button onClick={onPlugClick} className={"w-8 h-8 rounded-full bg-surface-container-highest flex items-center justify-center text-primary flex-shrink-0 hover:bg-primary hover:text-on-primary transition-colors"} type={"button"} data-act={"add-location-2"} data-way-out={"primary"}>
                    <span className={"material-symbols-outlined text-[18px]"}>
                      add_location
                    </span>
                  </button>
                </div>
                <div className={"bg-surface-container rounded-xl p-space-sm flex items-start justify-between gap-space-sm"}>
                  <div className={"flex items-start gap-space-sm min-w-0"}>
                    <div className={"w-9 h-9 rounded-lg bg-surface-container-highest flex items-center justify-center flex-shrink-0 text-primary"}>
                      <span className={"material-symbols-outlined text-[20px]"}>
                        air
                      </span>
                    </div>
                    <div className={"min-w-0"}>
                      <div className={"flex items-center gap-2"}>
                        <h4 className={"font-label-lg text-label-lg text-on-surface truncate"}>
                          24/7 Working Air Pumps
                        </h4>
                        <span className={"bg-surface-container-highest text-on-surface font-label-sm text-label-sm px-1.5 py-0.2 rounded font-bold"}>
                          +30 XP
                        </span>
                      </div>
                      <p className={"font-body-sm text-body-sm text-on-surface-variant"}>
                        Functional gauges along A2 Main Road
                      </p>
                    </div>
                  </div>
                  <button onClick={onPlugClick} className={"w-8 h-8 rounded-full bg-surface-container-highest flex items-center justify-center text-primary flex-shrink-0 hover:bg-primary hover:text-on-primary transition-colors"} type={"button"} data-act={"add-location-3"} data-way-out={"primary"}>
                    <span className={"material-symbols-outlined text-[18px]"}>
                      add_location
                    </span>
                  </button>
                </div>
              </div>
              <button onClick={onPlugClick} className={"w-full h-12 bg-primary text-on-primary rounded-xl font-label-lg text-label-lg font-bold flex items-center justify-center gap-2 shadow-sm active:bg-secondary transition-colors"} type={"button"} data-act={"map-manchester-gaps-now"} data-way-out={"primary"}>
                <span>
                  Map Manchester Gaps Now
                </span>
                <span className={"material-symbols-outlined text-[18px]"}>
                  arrow_forward
                </span>
              </button>
            </div>
          </div>
          <div className={"px-gutter mb-space-lg"}>
            <div className={"flex items-center justify-between mb-space-sm"}>
              <h3 className={"font-headline-sm text-headline-sm text-on-surface"}>
                Parish Coverage
              </h3>
              <div className={"flex items-center bg-surface-container rounded-lg p-0.5 text-on-surface-variant"}>
                <button onClick={onPlugClick} className={"px-2.5 py-1 rounded-md bg-surface-container-lowest font-label-sm text-label-sm text-primary font-bold shadow-sm"} id={"filter-need"} type={"button"} data-act={"filter-need"}>
                  Highest Need
                </button>
                <button onClick={onPlugClick} className={"px-2.5 py-1 rounded-md font-label-sm text-label-sm text-on-surface-variant"} id={"filter-covered"} type={"button"} data-act={"filter-covered"}>
                  Mapped %
                </button>
              </div>
            </div>
            <div className={"flex flex-col gap-space-sm"}>
              <div className={"bg-surface-container-lowest rounded-xl p-space-sm shadow-sm flex flex-col gap-space-xs"}>
                <div className={"flex items-center justify-between"}>
                  <div className={"flex items-center gap-2"}>
                    <span className={"font-label-lg text-label-lg text-on-surface font-bold"}>
                      Portland
                    </span>
                    <span className={"bg-error-container text-on-error-container font-label-sm text-label-sm px-1.5 py-0.2 rounded font-bold"}>
                      Critical
                    </span>
                  </div>
                  <div className={"flex items-center gap-1.5"}>
                    <span className={"font-label-sm text-label-sm bg-primary-fixed text-on-primary-fixed-variant px-1.5 py-0.2 rounded font-bold"}>
                      +50 XP
                    </span>
                    <span className={"font-headline-sm text-headline-sm text-error font-bold"}>
                      22%
                    </span>
                  </div>
                </div>
                <div className={"w-full bg-surface-container-highest rounded-full h-1.5 overflow-hidden"}>
                  <div className={"bg-error h-full rounded-full"} style={{ width: "22%" }} />
                </div>
                <div className={"flex items-center justify-between text-on-surface-variant font-body-sm text-body-sm pt-0.5"}>
                  <span className={"truncate"}>
                    {"Missing: Port Antonio fuel, air compressors & Long Bay tyre spots"}
                  </span>
                  <button onClick={onPlugClick} className={"text-primary font-label-md text-label-md flex-shrink-0 ml-2 font-bold"} type={"button"} data-act={"map"}>
                    Map
                  </button>
                </div>
              </div>
              <div className={"bg-surface-container-lowest rounded-xl p-space-sm shadow-sm flex flex-col gap-space-xs"}>
                <div className={"flex items-center justify-between"}>
                  <div className={"flex items-center gap-2"}>
                    <span className={"font-label-lg text-label-lg text-on-surface font-bold"}>
                      Manchester
                    </span>
                    <span className={"bg-primary-fixed text-on-primary-fixed-variant font-label-sm text-label-sm px-1.5 py-0.2 rounded font-bold"}>
                      High Need
                    </span>
                  </div>
                  <div className={"flex items-center gap-1.5"}>
                    <span className={"font-label-sm text-label-sm bg-primary-fixed text-on-primary-fixed-variant px-1.5 py-0.2 rounded font-bold"}>
                      +50 XP
                    </span>
                    <span className={"font-headline-sm text-headline-sm text-primary font-bold"}>
                      34%
                    </span>
                  </div>
                </div>
                <div className={"w-full bg-surface-container-highest rounded-full h-1.5 overflow-hidden"}>
                  <div className={"bg-primary h-full rounded-full"} style={{ width: "34%" }} />
                </div>
                <div className={"flex items-center justify-between text-on-surface-variant font-body-sm text-body-sm pt-0.5"}>
                  <span className={"truncate"}>
                    {"Missing: Auto parts stores & diagnostic bays in Mandeville"}
                  </span>
                  <button onClick={onPlugClick} className={"text-primary font-label-md text-label-md flex-shrink-0 ml-2 font-bold"} type={"button"} data-act={"map-2"}>
                    Map
                  </button>
                </div>
              </div>
              <div className={"bg-surface-container-lowest rounded-xl p-space-sm shadow-sm flex flex-col gap-space-xs"}>
                <div className={"flex items-center justify-between"}>
                  <div className={"flex items-center gap-2"}>
                    <span className={"font-label-lg text-label-lg text-on-surface font-bold"}>
                      St. Elizabeth
                    </span>
                    <span className={"bg-primary-fixed text-on-primary-fixed-variant font-label-sm text-label-sm px-1.5 py-0.2 rounded font-bold"}>
                      High Need
                    </span>
                  </div>
                  <div className={"flex items-center gap-1.5"}>
                    <span className={"font-label-sm text-label-sm bg-primary-fixed text-on-primary-fixed-variant px-1.5 py-0.2 rounded font-bold"}>
                      +50 XP
                    </span>
                    <span className={"font-headline-sm text-headline-sm text-primary font-bold"}>
                      38%
                    </span>
                  </div>
                </div>
                <div className={"w-full bg-surface-container-highest rounded-full h-1.5 overflow-hidden"}>
                  <div className={"bg-primary h-full rounded-full"} style={{ width: "38%" }} />
                </div>
                <div className={"flex items-center justify-between text-on-surface-variant font-body-sm text-body-sm pt-0.5"}>
                  <span className={"truncate"}>
                    {"Missing: Tyre vulcanizing & E-10 pumps in Junction & Black River"}
                  </span>
                  <button onClick={onPlugClick} className={"text-primary font-label-md text-label-md flex-shrink-0 ml-2 font-bold"} type={"button"} data-act={"map-3"}>
                    Map
                  </button>
                </div>
              </div>
              <div className={"bg-surface-container-lowest rounded-xl p-space-sm shadow-sm flex flex-col gap-space-xs"}>
                <div className={"flex items-center justify-between"}>
                  <div className={"flex items-center gap-2"}>
                    <span className={"font-label-lg text-label-lg text-on-surface font-bold"}>
                      Trelawny
                    </span>
                    <span className={"bg-surface-container text-on-surface-variant font-label-sm text-label-sm px-1.5 py-0.2 rounded font-bold"}>
                      Moderate
                    </span>
                  </div>
                  <span className={"font-headline-sm text-headline-sm text-on-surface font-bold"}>
                    44%
                  </span>
                </div>
                <div className={"w-full bg-surface-container-highest rounded-full h-1.5 overflow-hidden"}>
                  <div className={"bg-secondary-container h-full rounded-full"} style={{ width: "44%" }} />
                </div>
                <div className={"flex items-center justify-between text-on-surface-variant font-body-sm text-body-sm pt-0.5"}>
                  <span className={"truncate"}>
                    {"Missing: Falmouth highway bypass mechanics & late-night diesel"}
                  </span>
                  <button onClick={onPlugClick} className={"text-primary font-label-md text-label-md flex-shrink-0 ml-2 font-bold"} type={"button"} data-act={"map-4"}>
                    Map
                  </button>
                </div>
              </div>
              <div className={"bg-surface-container-lowest rounded-xl p-space-sm shadow-sm flex flex-col gap-space-xs"}>
                <div className={"flex items-center justify-between"}>
                  <div className={"flex items-center gap-2"}>
                    <span className={"font-label-lg text-label-lg text-on-surface font-bold"}>
                      Westmoreland
                    </span>
                    <span className={"bg-surface-container text-on-surface-variant font-label-sm text-label-sm px-1.5 py-0.2 rounded font-bold"}>
                      Moderate
                    </span>
                  </div>
                  <span className={"font-headline-sm text-headline-sm text-on-surface font-bold"}>
                    49%
                  </span>
                </div>
                <div className={"w-full bg-surface-container-highest rounded-full h-1.5 overflow-hidden"}>
                  <div className={"bg-secondary-container h-full rounded-full"} style={{ width: "49%" }} />
                </div>
                <div className={"flex items-center justify-between text-on-surface-variant font-body-sm text-body-sm pt-0.5"}>
                  <span className={"truncate"}>
                    {"Missing: Savanna-la-Mar & Negril strip 24hr tyre spots"}
                  </span>
                  <button onClick={onPlugClick} className={"text-primary font-label-md text-label-md flex-shrink-0 ml-2 font-bold"} type={"button"} data-act={"map-5"}>
                    Map
                  </button>
                </div>
              </div>
              <div className={"bg-surface-container-lowest rounded-xl p-space-sm shadow-sm flex flex-col gap-space-xs"}>
                <div className={"flex items-center justify-between"}>
                  <div className={"flex items-center gap-2"}>
                    <span className={"font-label-lg text-label-lg text-on-surface font-bold"}>
                      St. Ann
                    </span>
                    <span className={"bg-tertiary-fixed text-on-tertiary-fixed-variant font-label-sm text-label-sm px-1.5 py-0.2 rounded font-bold"}>
                      On Track
                    </span>
                  </div>
                  <span className={"font-headline-sm text-headline-sm text-on-surface font-bold"}>
                    51%
                  </span>
                </div>
                <div className={"w-full bg-surface-container-highest rounded-full h-1.5 overflow-hidden"}>
                  <div className={"bg-tertiary h-full rounded-full"} style={{ width: "51%" }} />
                </div>
                <div className={"flex items-center justify-between text-on-surface-variant font-body-sm text-body-sm pt-0.5"}>
                  <span className={"truncate"}>
                    {"Missing: Golden Grove corridor amenities & car wash bays"}
                  </span>
                  <button onClick={onPlugClick} className={"text-primary font-label-md text-label-md flex-shrink-0 ml-2 font-bold"} type={"button"} data-act={"map-6"}>
                    Map
                  </button>
                </div>
              </div>
              <div className={"bg-surface-container-lowest rounded-xl p-space-sm shadow-sm flex flex-col gap-space-xs"}>
                <div className={"flex items-center justify-between"}>
                  <div className={"flex items-center gap-2"}>
                    <span className={"font-label-lg text-label-lg text-on-surface font-bold"}>
                      St. Catherine
                    </span>
                    <span className={"bg-surface-container-high text-on-surface font-label-sm text-label-sm px-1.5 py-0.2 rounded font-bold"}>
                      Good
                    </span>
                  </div>
                  <span className={"font-headline-sm text-headline-sm text-on-surface font-bold"}>
                    62%
                  </span>
                </div>
                <div className={"w-full bg-surface-container-highest rounded-full h-1.5 overflow-hidden"}>
                  <div className={"bg-tertiary-fixed-dim h-full rounded-full"} style={{ width: "62%" }} />
                </div>
                <div className={"flex items-center justify-between text-on-surface-variant font-body-sm text-body-sm pt-0.5"}>
                  <span className={"truncate"}>
                    {"Missing: Bog Walk Gorge bypass recovery & Old Harbour parts"}
                  </span>
                  <button onClick={onPlugClick} className={"text-primary font-label-md text-label-md flex-shrink-0 ml-2 font-bold"} type={"button"} data-act={"map-7"}>
                    Map
                  </button>
                </div>
              </div>
              <div className={"bg-surface-container-lowest rounded-xl p-space-sm shadow-sm flex flex-col gap-space-xs"}>
                <div className={"flex items-center justify-between"}>
                  <div className={"flex items-center gap-2"}>
                    <span className={"font-label-lg text-label-lg text-on-surface font-bold"}>
                      {"Kingston & St. Andrew"}
                    </span>
                    <span className={"bg-[#bbf7d0] text-[#14532d] font-label-sm text-label-sm px-1.5 py-0.2 rounded font-bold"}>
                      Well Mapped
                    </span>
                  </div>
                  <span className={"font-headline-sm text-headline-sm text-[#14532d] font-bold"}>
                    88%
                  </span>
                </div>
                <div className={"w-full bg-surface-container-highest rounded-full h-1.5 overflow-hidden"}>
                  <div className={"bg-[#22c55e] h-full rounded-full"} style={{ width: "88%" }} />
                </div>
                <div className={"flex items-center justify-between text-on-surface-variant font-body-sm text-body-sm pt-0.5"}>
                  <span className={"truncate"}>
                    Active community • Verifying pump prices in Constant Spring
                  </span>
                  <span className={"material-symbols-outlined text-[#22c55e] text-[18px]"}>
                    verified
                  </span>
                </div>
              </div>
            </div>
          </div>
          <div className={"px-gutter mb-space-lg"}>
            <div className={"bg-surface-container rounded-2xl p-space-md flex items-start gap-space-md shadow-sm"}>
              <div className={"w-12 h-12 rounded-xl bg-primary text-on-primary flex items-center justify-center flex-shrink-0 shadow-sm"}>
                <span className={"material-symbols-outlined text-[26px]"}>
                  military_tech
                </span>
              </div>
              <div className={"flex flex-col min-w-0"}>
                <h4 className={"font-label-lg text-label-lg text-on-surface font-bold mb-0.5"}>
                  Road Scout Impact
                </h4>
                <p className={"font-body-sm text-body-sm text-on-surface-variant leading-relaxed"}>
                  Every verified pin helps over
                  <strong className={"text-on-surface"}>
                    120,000 daily commuters
                  </strong>
                  navigate safer routes, avoid stranded night breakdowns on steep hills, and find accurate pump rates.
                </p>
              </div>
            </div>
          </div>
          <div className={"fixed bottom-0 left-0 right-0 z-40 bg-surface/95 backdrop-blur-md p-gutter pb-safe shadow-[0_-4px_20px_rgba(0,0,0,0.06)] flex flex-col gap-2"}>
            <button onClick={onPlugClick} className={"w-full h-14 bg-primary text-on-primary rounded-xl font-label-lg text-label-lg font-bold flex items-center justify-center gap-2 shadow-lg active:bg-secondary transition-transform active:scale-[0.99]"} type={"button"} data-act={"start-mapping-a-place"} data-way-out={"primary"}>
              <span className={"material-symbols-outlined text-[24px]"}>
                add_location_alt
              </span>
              <span>
                + Start Mapping A Place
              </span>
            </button>
            <button onClick={onPlugClick} className={"w-full py-1.5 text-center font-label-md text-label-md text-on-surface-variant hover:text-primary transition-colors flex items-center justify-center gap-1"} type={"button"} data-act={"view-my-contributions-3-pins-added-140-xp"}>
              <span className={"material-symbols-outlined text-[16px]"}>
                history_edu
              </span>
              <span>
                View My Contributions (3 Pins Added • 140 XP)
              </span>
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
