import { useEffect, useRef } from 'react';
import { onPlugClick } from '../../shell/actions';
import { bindScreen } from '../../shell/bind';


export function FuelSpendScreen() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (ref.current) bindScreen("35-fuel-spend.html", ref.current); }, []);
  return (
    <div ref={ref} data-plug-screen={"35-fuel-spend.html"} className={"bg-surface font-body-md text-on-surface min-h-screen flex flex-col antialiased selection:bg-primary/20 selection:text-primary"}>
      <header className={"fixed top-0 w-full z-50 bg-surface/85 backdrop-blur-xl shadow-[0_1px_8px_rgba(28,25,23,0.04)] pt-safe"}>
        <div className={"h-16 px-space-sm flex items-center justify-between"}>
          <div className={"flex items-center gap-space-xs"}>
            <button onClick={onPlugClick} aria-label={"Go Back"} className={"w-11 h-11 flex items-center justify-center rounded-full text-on-surface hover:text-primary hover:bg-surface-container active:scale-95 transition-all"} data-act={"arrow-back"} data-way-out={"back"}>
              <span className={"material-symbols-outlined text-[24px]"}>
                arrow_back
              </span>
            </button>
            <h1 className={"font-headline-md text-headline-md text-on-surface tracking-tight font-headline-md line-clamp-1"}>
              {"Fuel Spend & Mileage"}
            </h1>
          </div>
          <div className={"flex items-center gap-space-xs"}>
            <button onClick={onPlugClick} aria-label={"Share Vehicle"} className={"w-11 h-11 flex items-center justify-center rounded-full text-on-surface-variant hover:text-primary hover:bg-surface-container active:scale-95 transition-all"} data-act={"share"}>
              <span className={"material-symbols-outlined text-[22px]"}>
                share
              </span>
            </button>
            <button onClick={onPlugClick} aria-label={"More Options"} className={"w-11 h-11 flex items-center justify-center rounded-full text-on-surface-variant hover:text-primary hover:bg-surface-container active:scale-95 transition-all"} data-act={"more-vert"}>
              <span className={"material-symbols-outlined text-[22px]"}>
                more_vert
              </span>
            </button>
            <div className={"w-8 h-8 rounded-full bg-primary flex items-center justify-center ml-space-xs shadow-sm"}>
              <span className={"material-symbols-outlined text-on-primary text-[18px]"}>
                person
              </span>
            </div>
          </div>
        </div>
      </header>
      <main className={"flex-1 w-full bg-surface pt-16 pb-safe"}>
        <div className={"flex flex-col w-full"}>
          <div className={"px-space-md py-space-sm flex items-center justify-between"}>
            <div className={"flex items-center gap-space-sm min-w-0"}>
              <div className={"w-8 h-8 rounded-full bg-secondary-fixed flex items-center justify-center shrink-0"}>
                <span className={"material-symbols-outlined text-on-secondary-fixed text-[18px]"}>
                  directions_car
                </span>
              </div>
              <div className={"min-w-0"}>
                <p className={"font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider"}>
                  Active Ride
                </p>
                <p className={"font-headline-sm text-headline-sm text-on-surface truncate"} data-slot={"car"}>
                  Add a car<span className={"text-primary font-label-md"}>
                    
                  </span>
                </p>
              </div>
            </div>
            <div className={"flex items-center gap-space-xs bg-surface-container-high px-space-sm py-1 rounded-full shrink-0"}>
              <span className={"w-2 h-2 rounded-full bg-secondary-container animate-pulse"} />
              <span className={"font-label-sm text-label-sm text-on-surface-variant font-bold"}>
                St. Andrew
              </span>
            </div>
          </div>
          <div className={"px-space-md py-space-xs overflow-x-auto"}>
            <div className={"flex items-center gap-space-xs p-1 bg-surface-container rounded-full min-w-max"}>
              <button onClick={onPlugClick} className={"period-btn px-space-md py-2 rounded-full font-label-md text-label-md text-on-surface-variant transition-all hover:text-on-surface active:scale-95"} type={"button"} data-act={"this-week"}>
                This week
              </button>
              <button onClick={onPlugClick} className={"period-btn px-space-md py-2 rounded-full font-label-md text-label-md bg-primary text-on-primary shadow-sm transition-all active:scale-95"} type={"button"} data-act={"this-month"} data-way-out={"primary"}>
                This month
              </button>
              <button onClick={onPlugClick} className={"period-btn px-space-md py-2 rounded-full font-label-md text-label-md text-on-surface-variant transition-all hover:text-on-surface active:scale-95"} type={"button"} data-act={"3-months"}>
                3 months
              </button>
              <button onClick={onPlugClick} className={"period-btn px-space-md py-2 rounded-full font-label-md text-label-md text-on-surface-variant transition-all hover:text-on-surface active:scale-95"} type={"button"} data-act={"year"}>
                Year
              </button>
            </div>
          </div>
          <div className={"p-space-md flex flex-col gap-space-lg"}>
            <div className={"relative overflow-hidden rounded-xl bg-gradient-to-br from-primary-container via-secondary-container to-secondary text-on-primary-container p-space-lg shadow-md"}>
              <div className={"absolute -right-12 -top-12 w-44 h-44 rounded-full bg-surface-container-lowest/10 pointer-events-none blur-xl"} />
              <div className={"absolute right-6 bottom-[-20px] w-28 h-28 rounded-full bg-tertiary-fixed/20 pointer-events-none blur-lg"} />
              <div className={"relative z-10 flex flex-col gap-space-sm"}>
                <div className={"flex items-center justify-between"}>
                  <span className={"font-label-md text-label-md tracking-wider uppercase opacity-90"}>
                    Total Fuel Spend
                  </span>
                  <span className={"inline-flex items-center gap-1 bg-surface-container-lowest/20 px-2 py-0.5 rounded-full font-label-sm text-label-sm"}>
                    <span className={"material-symbols-outlined text-[13px]"}>
                      bolt
                    </span>
                    
                  </span>
                </div>
                <div className={"flex items-baseline gap-space-xs mt-1"}>
                  <span className={"font-headline-md text-headline-md opacity-85"}>
                    J$
                  </span>
                  <h2 className={"font-display-lg-mobile text-display-lg-mobile font-extrabold tracking-tight"} data-slot={"spend"}>
                    No fuel spend yet
                  </h2>
                </div>
                <div className={"flex flex-wrap items-center gap-space-xs pt-space-xs"}>
                  <div className={"inline-flex items-center gap-1 bg-surface-container-lowest text-primary font-label-md text-label-md px-space-sm py-1 rounded-full shadow-sm"}>
                    <span className={"material-symbols-outlined text-[16px]"}>
                      trending_down
                    </span>
                    <span>
                      
                    </span>
                  </div>
                  <div className={"inline-flex items-center gap-1 bg-surface-container-lowest/25 font-label-sm text-label-sm px-space-sm py-1 rounded-full backdrop-blur-sm"}>
                    <span className={"material-symbols-outlined text-[14px]"}>
                      local_fire_department
                    </span>
                    <span>
                      
                    </span>
                  </div>
                </div>
              </div>
            </div>
            <div>
              <div className={"flex items-center justify-between mb-space-sm"}>
                <h3 className={"font-headline-sm text-headline-sm text-on-surface"}>
                  Efficiency Pulse
                </h3>
                <span className={"font-label-sm text-label-sm text-on-surface-variant font-bold uppercase tracking-wider"}>
                  Metrics
                </span>
              </div>
              <div className={"grid grid-cols-2 gap-space-sm"}>
                <div className={"bg-surface-container-lowest rounded-xl p-space-md shadow-sm flex flex-col justify-between"}>
                  <div className={"flex items-center justify-between"}>
                    <span className={"font-label-sm text-label-sm text-on-surface-variant uppercase font-semibold"}>
                      Litres Burned
                    </span>
                    <div className={"w-7 h-7 rounded-full bg-surface-container flex items-center justify-center"}>
                      <span className={"material-symbols-outlined text-primary text-[16px]"}>
                        local_gas_station
                      </span>
                    </div>
                  </div>
                  <div className={"mt-space-sm"}>
                    <p className={"font-headline-md text-headline-md text-on-surface"}>
                      86.0
                      <span className={"font-label-md text-label-md text-on-surface-variant"}>
                        L
                      </span>
                    </p>
                    <p className={"font-body-sm text-body-sm text-on-surface-variant mt-0.5"}>
                      4 fuel fill-ups
                    </p>
                  </div>
                </div>
                <div className={"bg-surface-container-lowest rounded-xl p-space-md shadow-sm flex flex-col justify-between"}>
                  <div className={"flex items-center justify-between"}>
                    <span className={"font-label-sm text-label-sm text-on-surface-variant uppercase font-semibold"}>
                      Distance
                    </span>
                    <div className={"w-7 h-7 rounded-full bg-surface-container flex items-center justify-center"}>
                      <span className={"material-symbols-outlined text-primary text-[16px]"}>
                        add_road
                      </span>
                    </div>
                  </div>
                  <div className={"mt-space-sm"}>
                    <p className={"font-headline-md text-headline-md text-on-surface"}>
                      1,220
                      <span className={"font-label-md text-label-md text-on-surface-variant"}>
                        km
                      </span>
                    </p>
                    <p className={"font-body-sm text-body-sm text-on-surface-variant mt-0.5"}>
                      
                    </p>
                  </div>
                </div>
                <div className={"bg-surface-container-lowest rounded-xl p-space-md shadow-sm flex flex-col justify-between"}>
                  <div className={"flex items-center justify-between"}>
                    <span className={"font-label-sm text-label-sm text-on-surface-variant uppercase font-semibold"}>
                      Avg Price / L
                    </span>
                    <div className={"w-7 h-7 rounded-full bg-surface-container flex items-center justify-center"}>
                      <span className={"material-symbols-outlined text-primary text-[16px]"}>
                        sell
                      </span>
                    </div>
                  </div>
                  <div className={"mt-space-sm"}>
                    <p className={"font-headline-sm text-headline-sm text-on-surface"}>
                      J$ 214.53
                    </p>
                    <span className={"inline-block mt-0.5 px-1.5 py-0.5 rounded bg-surface-container-high text-on-surface font-label-sm text-label-sm"}>
                      E-10 87 Blend
                    </span>
                  </div>
                </div>
                <div className={"bg-surface-container-lowest rounded-xl p-space-md shadow-sm flex flex-col justify-between"}>
                  <div className={"flex items-center justify-between"}>
                    <span className={"font-label-sm text-label-sm text-on-surface-variant uppercase font-semibold"}>
                      Cost per Km
                    </span>
                    <div className={"w-7 h-7 rounded-full bg-surface-container flex items-center justify-center"}>
                      <span className={"material-symbols-outlined text-primary text-[16px]"}>
                        savings
                      </span>
                    </div>
                  </div>
                  <div className={"mt-space-sm"}>
                    <p className={"font-headline-sm text-headline-sm text-on-surface"}>
                      J$ 15.12
                    </p>
                    <p className={"font-body-sm text-body-sm text-primary font-semibold mt-0.5"}>
                      Top 15% island-wide
                    </p>
                  </div>
                </div>
              </div>
            </div>
            <div className={"bg-surface-container-lowest rounded-xl p-space-md shadow-sm flex flex-col gap-space-md"}>
              <div className={"flex items-center justify-between"}>
                <div>
                  <h4 className={"font-headline-sm text-headline-sm text-on-surface"}>
                    Spend by Week
                  </h4>
                  <p className={"font-body-sm text-body-sm text-on-surface-variant"}>
                    Weekly gas spend overview for October
                  </p>
                </div>
                <div className={"text-right"}>
                  <span className={"font-label-sm text-label-sm px-2 py-1 rounded bg-secondary-fixed text-on-secondary-fixed font-bold"}>
                    Peak: W3
                  </span>
                </div>
              </div>
              <div className={"pt-space-sm"}>
                <div className={"h-44 w-full flex items-end justify-between gap-3 px-2 pb-2"}>
                  <div className={"flex-1 flex flex-col items-center gap-1 group"}>
                    <span className={"font-label-sm text-label-sm text-on-surface-variant group-hover:text-primary transition-colors"}>
                      J$4.8k
                    </span>
                    <div className={"w-full bg-surface-container rounded-t-lg relative flex items-end justify-center overflow-hidden h-36"}>
                      <div className={"w-full bg-secondary-container rounded-t-lg transition-all duration-500 ease-out"} style={{ height: "72%" }} />
                    </div>
                    <span className={"font-label-md text-label-md text-on-surface-variant mt-1"}>
                      W1
                    </span>
                  </div>
                  <div className={"flex-1 flex flex-col items-center gap-1 group"}>
                    <span className={"font-label-sm text-label-sm text-on-surface-variant group-hover:text-primary transition-colors"}>
                      J$4.2k
                    </span>
                    <div className={"w-full bg-surface-container rounded-t-lg relative flex items-end justify-center overflow-hidden h-36"}>
                      <div className={"w-full bg-secondary-container rounded-t-lg transition-all duration-500 ease-out"} style={{ height: "62%" }} />
                    </div>
                    <span className={"font-label-md text-label-md text-on-surface-variant mt-1"}>
                      W2
                    </span>
                  </div>
                  <div className={"flex-1 flex flex-col items-center gap-1 group"}>
                    <div className={"flex items-center gap-0.5 bg-primary text-on-primary px-1.5 py-0.5 rounded-full shadow-sm"}>
                      <span className={"font-label-sm text-label-sm font-bold"}>
                        J$5.2k
                      </span>
                    </div>
                    <div className={"w-full bg-surface-container rounded-t-lg relative flex items-end justify-center overflow-hidden h-36"}>
                      <div className={"w-full bg-gradient-to-t from-secondary to-primary rounded-t-lg transition-all duration-500 ease-out"} style={{ height: "94%" }}>
                        <div className={"w-full h-1.5 bg-tertiary-fixed rounded-t"} />
                      </div>
                    </div>
                    <span className={"font-label-md text-label-md text-primary font-bold mt-1"}>
                      W3
                    </span>
                  </div>
                  <div className={"flex-1 flex flex-col items-center gap-1 group"}>
                    <span className={"font-label-sm text-label-sm text-on-surface-variant group-hover:text-primary transition-colors"}>
                      J$4.3k
                    </span>
                    <div className={"w-full bg-surface-container rounded-t-lg relative flex items-end justify-center overflow-hidden h-36"}>
                      <div className={"w-full bg-secondary-container rounded-t-lg transition-all duration-500 ease-out"} style={{ height: "64%" }} />
                    </div>
                    <span className={"font-label-md text-label-md text-on-surface-variant mt-1"}>
                      W4
                    </span>
                  </div>
                </div>
                <div className={"flex items-center justify-between text-on-surface-variant font-label-sm text-label-sm px-2 pt-2 bg-surface-container-low rounded-lg mt-2"}>
                  <span>
                    Total: 4 Transactions
                  </span>
                  <span className={"font-semibold text-primary"}>
                    Avg: J$ 4,612.50 / week
                  </span>
                </div>
              </div>
            </div>
            <div className={"bg-surface-container-lowest rounded-xl p-space-md shadow-sm flex flex-col gap-space-sm"}>
              <div className={"flex items-center justify-between"}>
                <div>
                  <h4 className={"font-headline-sm text-headline-sm text-on-surface"}>
                    Efficiency Trend (km/L)
                  </h4>
                  <p className={"font-body-sm text-body-sm text-on-surface-variant"}>
                    Toyota Roomy 1.0L Turbo CVT
                  </p>
                </div>
                <div className={"flex items-center gap-1 bg-surface-container px-2 py-1 rounded-full"}>
                  <span className={"w-2 h-2 rounded-full bg-tertiary"} />
                  <span className={"font-label-sm text-label-sm text-on-surface"}>
                    Target: 13.4 km/L
                  </span>
                </div>
              </div>
              <div className={"relative w-full pt-space-xs"}>
                <svg aria-label={"Fuel efficiency line chart"} className={"w-full h-36 overflow-visible"} viewBox={"0 0 340 140"}>
                  <line stroke={"#936f00"} strokeDasharray={"4 4"} strokeOpacity={"0.6"} strokeWidth={"1.5"} x1={"16"} x2={"324"} y1={"86"} y2={"86"} />
                  <text className={"font-label-sm text-[12px] font-semibold"} fill={"#755800"} x={"20"} y={"80"}>
                    Parish Avg (13.4 km/L)
                  </text>
                  <defs>
                    <linearGradient id={"efficiencyGlow"} x1={"0"} x2={"0"} y1={"0"} y2={"1"}>
                      <stop offset={"0%"} stopColor={"#cc4900"} stopOpacity={"0.32"} />
                      <stop offset={"100%"} stopColor={"#cc4900"} stopOpacity={"0.0"} />
                    </linearGradient>
                  </defs>
                  <polygon fill={"url(#efficiencyGlow)"} points={"24,105 108,98 200,32 300,42 300,126 24,126"} />
                  <polyline fill={"none"} points={"24,105 108,98 200,32 300,42"} stroke={"#a33900"} strokeLinecap={"round"} strokeLinejoin={"round"} strokeWidth={"3"} />
                  <circle cx={"24"} cy={"105"} fill={"#ffffff"} r={"4.5"} stroke={"#a33900"} strokeWidth={"2.5"} />
                  <text className={"font-label-sm text-[12px]"} fill={"#5a4138"} textAnchor={"middle"} x={"24"} y={"125"}>
                    14.0
                  </text>
                  <circle cx={"108"} cy={"98"} fill={"#ffffff"} r={"4.5"} stroke={"#a33900"} strokeWidth={"2.5"} />
                  <text className={"font-label-sm text-[12px]"} fill={"#5a4138"} textAnchor={"middle"} x={"108"} y={"125"}>
                    13.9
                  </text>
                  <circle cx={"200"} cy={"32"} fill={"#a33900"} r={"5"} stroke={"#ffdbce"} strokeWidth={"2"} />
                  <text className={"font-label-md text-[12px] font-bold"} fill={"#a33900"} textAnchor={"middle"} x={"200"} y={"22"}>
                    14.4 ★
                  </text>
                  <circle cx={"300"} cy={"42"} fill={"#ffffff"} r={"4.5"} stroke={"#a33900"} strokeWidth={"2.5"} />
                  <text className={"font-label-sm text-[12px]"} fill={"#5a4138"} textAnchor={"middle"} x={"300"} y={"28"}>
                    14.2
                  </text>
                </svg>
                <div className={"flex items-center justify-between text-on-surface-variant font-label-sm text-label-sm px-2 pt-1"}>
                  <span>
                    02 Oct
                  </span>
                  <span>
                    10 Oct
                  </span>
                  <span>
                    17 Oct
                  </span>
                  <span>
                    24 Oct
                  </span>
                </div>
              </div>
            </div>
            <div className={"flex flex-col gap-space-sm"}>
              <div className={"flex items-center justify-between"}>
                <h3 className={"font-headline-sm text-headline-sm text-on-surface"}>
                  October Fuel Logs
                </h3>
                <span className={"font-label-md text-label-md text-primary font-semibold"}>
                  4 entries
                </span>
              </div>
              <div className={"flex flex-col gap-space-xs"}>
                <div className={"bg-surface-container-lowest rounded-xl p-space-md shadow-sm flex flex-col gap-space-xs transition-transform active:scale-[0.99]"}>
                  <div className={"flex items-start justify-between"}>
                    <div className={"flex items-center gap-space-sm"}>
                      <div className={"w-10 h-10 rounded-full bg-secondary-fixed flex items-center justify-center shrink-0"}>
                        <span className={"material-symbols-outlined text-secondary text-[22px]"}>
                          local_gas_station
                        </span>
                      </div>
                      <div>
                        <div className={"flex items-center gap-1.5"}>
                          <h4 className={"font-headline-sm text-headline-sm text-on-surface"}>
                            Texaco Barbican
                          </h4>
                          <span className={"w-1.5 h-1.5 rounded-full bg-primary shrink-0"} />
                          <span className={"font-label-sm text-label-sm px-1.5 py-0.5 rounded bg-surface-container text-on-surface-variant"}>
                            E-10 87
                          </span>
                        </div>
                        <p className={"font-body-sm text-body-sm text-on-surface-variant"}>
                          24 Oct • Kingston 6
                        </p>
                      </div>
                    </div>
                    <div className={"text-right"}>
                      <p className={"font-price-display text-price-display text-on-surface font-bold"}>
                        J$ 4,290
                      </p>
                      <span className={"font-label-sm text-label-sm text-on-surface-variant"}>
                        J$ 214.50 / L
                      </span>
                    </div>
                  </div>
                  <div className={"flex items-center justify-between pt-space-xs text-on-surface-variant font-label-md text-label-md bg-surface-container-low px-space-sm py-1.5 rounded-lg"}>
                    <span className={"flex items-center gap-1"}>
                      <span className={"material-symbols-outlined text-[16px] text-primary"}>
                        opacity
                      </span>
                      20.0 L
                    </span>
                    <span className={"flex items-center gap-1 font-semibold text-on-surface"}>
                      <span className={"material-symbols-outlined text-[16px] text-secondary"}>
                        speed
                      </span>
                      14.2 km/L
                    </span>
                  </div>
                </div>
                <div className={"bg-surface-container-lowest rounded-xl p-space-md shadow-sm flex flex-col gap-space-xs transition-transform active:scale-[0.99]"}>
                  <div className={"flex items-start justify-between"}>
                    <div className={"flex items-center gap-space-sm"}>
                      <div className={"w-10 h-10 rounded-full bg-primary-fixed flex items-center justify-center shrink-0"}>
                        <span className={"material-symbols-outlined text-primary text-[22px]"}>
                          local_gas_station
                        </span>
                      </div>
                      <div>
                        <div className={"flex items-center gap-1.5"}>
                          <h4 className={"font-headline-sm text-headline-sm text-on-surface"}>
                            Rubis Hope Road
                          </h4>
                          <span className={"w-1.5 h-1.5 rounded-full bg-primary shrink-0"} />
                          <span className={"font-label-sm text-label-sm px-1.5 py-0.5 rounded bg-surface-container text-on-surface-variant"}>
                            E-10 87
                          </span>
                        </div>
                        <p className={"font-body-sm text-body-sm text-on-surface-variant"}>
                          17 Oct • St. Andrew
                        </p>
                      </div>
                    </div>
                    <div className={"text-right"}>
                      <p className={"font-price-display text-price-display text-on-surface font-bold"}>
                        J$ 5,160
                      </p>
                      <span className={"font-label-sm text-label-sm text-on-surface-variant"}>
                        J$ 215.00 / L
                      </span>
                    </div>
                  </div>
                  <div className={"flex items-center justify-between pt-space-xs text-on-surface-variant font-label-md text-label-md bg-surface-container-low px-space-sm py-1.5 rounded-lg"}>
                    <span className={"flex items-center gap-1"}>
                      <span className={"material-symbols-outlined text-[16px] text-primary"}>
                        opacity
                      </span>
                      24.0 L
                    </span>
                    <span className={"flex items-center gap-1 font-semibold text-primary"}>
                      <span className={"material-symbols-outlined text-[16px]"}>
                        military_tech
                      </span>
                      14.4 km/L (Best)
                    </span>
                  </div>
                </div>
                <div className={"bg-surface-container-lowest rounded-xl p-space-md shadow-sm flex flex-col gap-space-xs transition-transform active:scale-[0.99]"}>
                  <div className={"flex items-start justify-between"}>
                    <div className={"flex items-center gap-space-sm"}>
                      <div className={"w-10 h-10 rounded-full bg-secondary-fixed flex items-center justify-center shrink-0"}>
                        <span className={"material-symbols-outlined text-secondary text-[22px]"}>
                          local_gas_station
                        </span>
                      </div>
                      <div>
                        <div className={"flex items-center gap-1.5"}>
                          <h4 className={"font-headline-sm text-headline-sm text-on-surface"}>
                            Total Half-Way-Tree
                          </h4>
                          <span className={"w-1.5 h-1.5 rounded-full bg-primary shrink-0"} />
                          <span className={"font-label-sm text-label-sm px-1.5 py-0.5 rounded bg-surface-container text-on-surface-variant"}>
                            E-10 87
                          </span>
                        </div>
                        <p className={"font-body-sm text-body-sm text-on-surface-variant"}>
                          10 Oct • Kingston 10
                        </p>
                      </div>
                    </div>
                    <div className={"text-right"}>
                      <p className={"font-price-display text-price-display text-on-surface font-bold"}>
                        J$ 4,200
                      </p>
                      <span className={"font-label-sm text-label-sm text-on-surface-variant"}>
                        J$ 215.38 / L
                      </span>
                    </div>
                  </div>
                  <div className={"flex items-center justify-between pt-space-xs text-on-surface-variant font-label-md text-label-md bg-surface-container-low px-space-sm py-1.5 rounded-lg"}>
                    <span className={"flex items-center gap-1"}>
                      <span className={"material-symbols-outlined text-[16px] text-primary"}>
                        opacity
                      </span>
                      19.5 L
                    </span>
                    <span className={"flex items-center gap-1 font-semibold text-on-surface"}>
                      <span className={"material-symbols-outlined text-[16px] text-secondary"}>
                        speed
                      </span>
                      13.9 km/L
                    </span>
                  </div>
                </div>
                <div className={"bg-surface-container-lowest rounded-xl p-space-md shadow-sm flex flex-col gap-space-xs transition-transform active:scale-[0.99]"}>
                  <div className={"flex items-start justify-between"}>
                    <div className={"flex items-center gap-space-sm"}>
                      <div className={"w-10 h-10 rounded-full bg-tertiary-fixed flex items-center justify-center shrink-0"}>
                        <span className={"material-symbols-outlined text-tertiary text-[22px]"}>
                          local_gas_station
                        </span>
                      </div>
                      <div>
                        <div className={"flex items-center gap-1.5"}>
                          <h4 className={"font-headline-sm text-headline-sm text-on-surface"}>
                            Petcom Dunrobin
                          </h4>
                          <span className={"w-1.5 h-1.5 rounded-full bg-primary shrink-0"} />
                          <span className={"font-label-sm text-label-sm px-1.5 py-0.5 rounded bg-surface-container text-on-surface-variant"}>
                            E-10 87
                          </span>
                        </div>
                        <p className={"font-body-sm text-body-sm text-on-surface-variant"}>
                          02 Oct • St. Andrew
                        </p>
                      </div>
                    </div>
                    <div className={"text-right"}>
                      <p className={"font-price-display text-price-display text-on-surface font-bold"}>
                        J$ 4,800
                      </p>
                      <span className={"font-label-sm text-label-sm text-on-surface-variant"}>
                        J$ 213.33 / L
                      </span>
                    </div>
                  </div>
                  <div className={"flex items-center justify-between pt-space-xs text-on-surface-variant font-label-md text-label-md bg-surface-container-low px-space-sm py-1.5 rounded-lg"}>
                    <span className={"flex items-center gap-1"}>
                      <span className={"material-symbols-outlined text-[16px] text-primary"}>
                        opacity
                      </span>
                      22.5 L
                    </span>
                    <span className={"flex items-center gap-1 font-semibold text-on-surface"}>
                      <span className={"material-symbols-outlined text-[16px] text-secondary"}>
                        speed
                      </span>
                      14.0 km/L
                    </span>
                  </div>
                </div>
              </div>
            </div>
            <div className={"pt-space-xs pb-space-lg flex flex-col gap-space-sm"}>
              <button onClick={onPlugClick} className={"w-full h-12 rounded-xl bg-primary text-on-primary font-label-lg text-label-lg flex items-center justify-center gap-space-xs shadow-md active:bg-secondary transition-all active:scale-[0.98]"} type={"button"} data-act={"log-fuel"} data-way-out={"primary"}>
                <span className={"material-symbols-outlined text-[20px]"}>
                  add_circle
                </span>
                <span>
                  + Log Fuel
                </span>
              </button>
              <button onClick={onPlugClick} className={"w-full h-12 rounded-xl bg-surface-container text-on-surface font-label-lg text-label-lg flex items-center justify-center gap-space-xs active:bg-surface-container-high transition-all active:scale-[0.98]"} type={"button"} data-act={"export-fuel-report-csv-pdf"}>
                <span className={"material-symbols-outlined text-[20px] text-on-surface-variant"}>
                  file_download
                </span>
                <span>
                  Export Fuel Report (CSV/PDF)
                </span>
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
