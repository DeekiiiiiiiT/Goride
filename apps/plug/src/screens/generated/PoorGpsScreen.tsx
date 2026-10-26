import { useEffect, useRef } from 'react';
import { onPlugClick } from '../../shell/actions';
import { bindScreen } from '../../shell/bind';


export function PoorGpsScreen() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (ref.current) bindScreen("43c-poor-gps.html", ref.current); }, []);
  return (
    <div ref={ref} data-plug-screen={"43c-poor-gps.html"} className={"flex justify-center items-center min-h-screen p-0 sm:p-4 bg-stone-900"}>
      <div className={"relative w-full max-w-[390px] h-[844px] bg-[#fff8f2] flex flex-col justify-between overflow-hidden shadow-2xl rounded-[40px] border-4 border-stone-800 select-none"}>
        <header className={"absolute top-0 left-0 right-0 z-30 px-4 pt-safe flex items-center justify-between pointer-events-auto"}>
          <button onClick={onPlugClick} className={"w-10 h-10 rounded-full bg-white/90 backdrop-blur-md shadow-md flex items-center justify-center text-stone-700 active:scale-95 transition-transform border border-amber-900/10"} aria-label={"Close"} data-act={"close"} data-way-out={"back"}>
            <span className={"material-symbols-outlined text-[20px]"}>
              close
            </span>
          </button>
          <div className={"bg-white/95 backdrop-blur-md px-4 py-1.5 rounded-full shadow-md border border-amber-900/10 flex items-center gap-1.5"}>
            <span className={"text-xs font-bold text-stone-900 tracking-tight"}>
              Map It
            </span>
            <span className={"w-1 h-1 rounded-full bg-stone-400"} />
            <span className={"text-xs font-bold text-brand-500"}>
              Position Pin
            </span>
          </div>
          <button onClick={onPlugClick} className={"w-10 h-10 rounded-full bg-white/90 backdrop-blur-md shadow-md flex items-center justify-center text-stone-700 active:scale-95 transition-transform border border-amber-900/10"} aria-label={"Info"} data-act={"info"}>
            <span className={"material-symbols-outlined text-[20px]"}>
              info
            </span>
          </button>
        </header>
        <div className={"absolute top-24 left-4 right-4 z-30 pointer-events-auto"}>
          <div className={"bg-white/95 backdrop-blur-md rounded-2xl p-2.5 px-3.5 shadow-lg border border-red-200/80 flex items-center justify-between gap-2.5"}>
            <div className={"flex items-center gap-2 min-w-0"}>
              <div className={"relative flex items-center justify-center w-4 h-4 flex-shrink-0"}>
                <span className={"animate-ping absolute inline-flex h-3 w-3 rounded-full bg-red-400 opacity-75"} />
                <span className={"relative inline-flex rounded-full h-2.5 w-2.5 bg-red-600"} />
              </div>
              <div className={"flex flex-col"}>
                <div className={"flex items-center gap-1.5 leading-none"}>
                  <span className={"text-[12px] font-bold text-red-700"}>
                    {"GPS Accuracy &plusmn;86 m"}
                  </span>
                  <span className={"text-[12px] uppercase font-extrabold px-1.5 py-0.5 rounded bg-red-100 text-red-700 tracking-wider"}>
                    Too Weak
                  </span>
                </div>
                <span className={"text-[12px] text-stone-600 font-medium truncate mt-0.5"}>
                  Move to an open area
                </span>
              </div>
            </div>
            <button onClick={onPlugClick} className={"flex items-center gap-1 text-[12px] font-bold text-stone-700 bg-stone-100 hover:bg-stone-200 active:scale-95 px-2.5 py-1.5 rounded-lg transition-all border border-stone-200/60 flex-shrink-0"} data-act={"retry"}>
              <span className={"material-symbols-outlined text-[13px] text-red-600"}>
                refresh
              </span>
              <span>
                Retry
              </span>
            </button>
          </div>
        </div>
        <div className={"relative w-full h-full map-grid overflow-hidden"}>
          <svg className={"absolute inset-0 w-full h-full pointer-events-none"} xmlns={"http://www.w3.org/2000/svg"} viewBox={"0 0 390 844"} preserveAspectRatio={"none"}>
            <defs>
              <linearGradient id={"roadGradient"} x1={"0"} y1={"0"} x2={"1"} y2={"1"}>
                <stop offset={"0%"} stopColor={"#ffffff"} />
                <stop offset={"100%"} stopColor={"#fdfbf7"} />
              </linearGradient>
              <linearGradient id={"corridorGradient"} x1={"0"} y1={"0"} x2={"0"} y2={"1"}>
                <stop offset={"0%"} stopColor={"#ffe3cc"} stopOpacity={"0.9"} />
                <stop offset={"100%"} stopColor={"#ffd5b3"} stopOpacity={"0.9"} />
              </linearGradient>
            </defs>
            <rect x={"230"} y={"110"} width={"135"} height={"110"} rx={"16"} fill={"#dcfce7"} opacity={"0.8"} stroke={"#bbf7d0"} strokeWidth={"2"} />
            <text x={"297"} y={"155"} fontSize={"11"} fontWeight={"600"} fill={"#15803d"} textAnchor={"middle"} fontFamily={"Inter, sans-serif"}>
              Nelson Mandela
            </text>
            <text x={"297"} y={"170"} fontSize={"10"} fontWeight={"500"} fill={"#16a34a"} textAnchor={"middle"} fontFamily={"Inter, sans-serif"}>
              Park
            </text>
            <rect x={"25"} y={"125"} width={"120"} height={"70"} rx={"10"} fill={"#f5ede3"} stroke={"#e7dacb"} strokeWidth={"1.5"} />
            <rect x={"35"} y={"225"} width={"90"} height={"95"} rx={"12"} fill={"#f5ede3"} stroke={"#e7dacb"} strokeWidth={"1.5"} />
            <rect x={"215"} y={"250"} width={"150"} height={"110"} rx={"12"} fill={"#f5ede3"} stroke={"#e7dacb"} strokeWidth={"1.5"} />
            <rect x={"22"} y={"400"} width={"125"} height={"100"} rx={"12"} fill={"#f5ede3"} stroke={"#e7dacb"} strokeWidth={"1.5"} />
            <rect x={"225"} y={"470"} width={"145"} height={"90"} rx={"12"} fill={"#f5ede3"} stroke={"#e7dacb"} strokeWidth={"1.5"} />
            <path d={"M 0 350 L 390 330"} stroke={"#ffffff"} strokeWidth={"18"} strokeLinecap={"round"} strokeLinejoin={"round"} />
            <path d={"M 0 350 L 390 330"} stroke={"#ecd7c3"} strokeWidth={"2"} strokeLinecap={"round"} strokeLinejoin={"round"} fill={"none"} />
            <path d={"M 0 200 L 220 220"} stroke={"#ffffff"} strokeWidth={"14"} strokeLinecap={"round"} strokeLinejoin={"round"} />
            <path d={"M 230 400 L 390 410"} stroke={"#ffffff"} strokeWidth={"16"} strokeLinecap={"round"} strokeLinejoin={"round"} />
            <path d={"M -20 620 L 195 425"} stroke={"#ffffff"} strokeWidth={"26"} strokeLinecap={"round"} />
            <path d={"M -20 620 L 195 425"} stroke={"#f0ddcc"} strokeWidth={"3"} strokeLinecap={"round"} fill={"none"} />
            <path d={"M 195 0 L 195 844"} stroke={"#ffffff"} strokeWidth={"34"} strokeLinecap={"square"} />
            <path d={"M 195 0 L 195 844"} stroke={"url(#corridorGradient)"} strokeWidth={"22"} strokeLinecap={"square"} />
            <path d={"M 195 425 L 420 520"} stroke={"#ffffff"} strokeWidth={"30"} strokeLinecap={"round"} />
            <path d={"M 195 425 L 420 520"} stroke={"url(#corridorGradient)"} strokeWidth={"20"} strokeLinecap={"round"} />
            <circle cx={"195"} cy={"425"} r={"42"} fill={"#ffffff"} stroke={"#e8d3bf"} strokeWidth={"3"} />
            <circle cx={"195"} cy={"425"} r={"28"} fill={"#fef3e9"} stroke={"#fed7aa"} strokeWidth={"2"} />
            <text x={"180"} y={"195"} fontSize={"9"} fontWeight={"700"} fill={"#9a3412"} letterSpacing={"1"} transform={"rotate(-90 180 195)"}>
              
            </text>
            <text x={"180"} y={"650"} fontSize={"9"} fontWeight={"700"} fill={"#9a3412"} letterSpacing={"1"} transform={"rotate(-90 180 650)"}>
              
            </text>
            <text x={"260"} y={"475"} fontSize={"9"} fontWeight={"700"} fill={"#78350f"} letterSpacing={"0.5"} transform={"rotate(18 260 475)"}>
              {" &rarr;"}
            </text>
            <text x={"40"} y={"525"} fontSize={"8.5"} fontWeight={"600"} fill={"#8c7865"} letterSpacing={"0.5"} transform={"rotate(-40 40 525)"}>
              
            </text>
          </svg>
          <div className={"absolute top-44 left-8 pointer-events-auto opacity-75 hover:opacity-100 transition-opacity"}>
            <div className={"flex items-center gap-1.5 bg-white/90 backdrop-blur-sm px-2.5 py-1 rounded-full shadow-sm border border-stone-200"}>
              <span className={"material-symbols-outlined text-[13px] text-stone-500"}>
                build
              </span>
              <span className={"text-[12px] font-semibold text-stone-700"}>
                
              </span>
              <span className={"text-[12px] text-stone-400 font-medium"}>
                180m
              </span>
            </div>
          </div>
          <div className={"absolute top-[372px] left-[216px] pointer-events-auto opacity-75"}>
            <div className={"flex items-center gap-1 bg-amber-50/95 border border-amber-300 px-2 py-0.5 rounded-full shadow-sm"}>
              <span className={"w-1.5 h-1.5 rounded-full bg-amber-500"} />
              <span className={"text-[9.5px] font-bold text-amber-900"}>
                Total HWT (25m)
              </span>
            </div>
          </div>
          <div className={"absolute top-[480px] right-3 pointer-events-auto opacity-70"}>
            <div className={"flex items-center gap-1 bg-white/85 px-2 py-0.5 rounded-full shadow-sm border border-stone-200"}>
              <span className={"material-symbols-outlined text-[11px] text-amber-600"}>
                storefront
              </span>
              <span className={"text-[12px] font-medium text-stone-600"}>
                
              </span>
            </div>
          </div>
          <div className={"absolute top-[45%] left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center pointer-events-none z-20"}>
            <div className={"absolute w-[220px] h-[220px] rounded-full bg-red-500/15 border-2 border-dashed border-red-500/60 flex items-center justify-center accuracy-ring pointer-events-none"}>
              <div className={"w-[140px] h-[140px] rounded-full bg-red-500/10 border border-red-400/40"} />
            </div>
            <div className={"floating-tooltip -translate-y-14 z-30 mb-1"}>
              <div className={"bg-stone-900/90 backdrop-blur-md text-white text-[10.5px] font-semibold px-3 py-1.5 rounded-full shadow-lg flex items-center gap-1.5 border border-stone-700/60 whitespace-nowrap"}>
                <span className={"material-symbols-outlined text-[14px] text-red-400"}>
                  touch_app
                </span>
                <span>
                  {"Map is draggable &bull; Align pin over entry"}
                </span>
              </div>
              <div className={"w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-t-[5px] border-t-stone-900/90 mx-auto"} />
            </div>
            <div className={"relative flex flex-col items-center z-20"}>
              <div className={"w-13 h-13 rounded-2xl bg-gradient-to-br from-brand-500 to-brand-600 shadow-xl shadow-brand-500/30 p-2.5 flex items-center justify-center text-white border-2 border-white ring-4 ring-red-500/40"}>
                <span className={"material-symbols-outlined text-[24px] fill text-white"}>
                  local_gas_station
                </span>
              </div>
              <div className={"w-1 h-3.5 bg-brand-600 rounded-b"} />
              <div className={"relative -mt-0.5 flex items-center justify-center"}>
                <span className={"w-4 h-4 rounded-full bg-red-600/30 animate-ping absolute"} />
                <span className={"w-3.5 h-3.5 rounded-full bg-white border-2 border-red-600 shadow-md"} />
                <span className={"w-1.5 h-1.5 rounded-full bg-red-600 absolute"} />
              </div>
              <div className={"w-8 h-2 bg-stone-900/25 rounded-full blur-[1.5px] mt-0.5"} />
            </div>
          </div>
          <div className={"absolute bottom-60 right-4 z-20 pointer-events-auto"}>
            <button onClick={onPlugClick} className={"w-11 h-11 rounded-full bg-white shadow-lg border border-stone-200 flex items-center justify-center text-stone-700 hover:text-brand-500 active:scale-95 transition-all"} title={"Recenter Location"} aria-label={"Recenter Location"} data-act={"gps-not-fixed"}>
              <span className={"material-symbols-outlined text-[20px] text-red-600"}>
                gps_not_fixed
              </span>
            </button>
          </div>
        </div>
        <div className={"relative z-30 bg-white/98 backdrop-blur-md rounded-t-[28px] shadow-[0_-8px_30px_rgba(0,0,0,0.12)] border-t border-brand-100 px-5 pt-3 pb-3 pointer-events-auto"}>
          <div className={"w-10 h-1 bg-stone-300 rounded-full mx-auto mb-3"} />
          <div className={"bg-red-50/90 border border-red-200 rounded-2xl p-3 mb-3 flex items-start gap-3"}>
            <div className={"w-9 h-9 rounded-xl bg-red-100 flex items-center justify-center flex-shrink-0 text-red-600 mt-0.5"}>
              <span className={"material-symbols-outlined text-[20px]"}>
                fmd_bad
              </span>
            </div>
            <div className={"flex-1 min-w-0"}>
              <div className={"flex items-center justify-between"}>
                <h4 className={"text-xs font-bold text-red-900 tracking-tight"}>
                  Signal Too Weak to Verify
                </h4>
                <span className={"text-[12px] font-extrabold text-red-700 bg-red-100/90 px-1.5 py-0.5 rounded"}>
                  {"&plusmn;86 m"}
                </span>
              </div>
              <p className={"text-[12px] text-red-800 font-medium leading-relaxed mt-0.5"}>
                Roam Plug requires accuracy under
                <span className={"font-bold"}>
                  {"&plusmn;20 m"}
                </span>
                to prevent inaccurate pins on Jamaican roads.
              </p>
              <div className={"flex items-center gap-1.5 mt-1.5 pt-1.5 border-t border-red-200/70 text-[10.5px] font-semibold text-stone-700"}>
                <span className={"material-symbols-outlined text-[13px] text-brand-600"}>
                  directions_walk
                </span>
                <span>
                  Move to an open area away from tall concrete walls.
                </span>
              </div>
            </div>
          </div>
          <div className={"flex items-center gap-2 bg-stone-50 border border-stone-200/80 rounded-xl px-3 py-2 mb-3"}>
            <span className={"material-symbols-outlined text-[17px] text-stone-500"}>
              location_on
            </span>
            <div className={"flex-1 min-w-0"}>
              <p className={"text-[11.5px] font-bold text-stone-800 truncate"}>
              </p>
              <p className={"text-[12px] text-stone-500 truncate"}>
                {"Half-Way-Tree, Kingston 10 &bull; St. Andrew"}
              </p>
            </div>
            <span className={"text-[12px] font-bold text-amber-700 bg-amber-100/80 px-2 py-0.5 rounded-full whitespace-nowrap"}>
              Unverified
            </span>
          </div>
          <button onClick={onPlugClick} disabled={true} className={"w-full h-12 rounded-xl bg-stone-200 text-stone-400 font-bold text-[13.5px] flex items-center justify-center gap-2 cursor-not-allowed shadow-none border border-stone-300/60 transition-colors"} aria-disabled={"true"} data-act={"confirm-location-signal-too-weak"} title={"Waiting for a better GPS fix"}>
            <span className={"material-symbols-outlined text-[17px]"}>
              lock
            </span>
            <span>
              Confirm Location (Signal Too Weak)
            </span>
          </button>
          <p className={"text-center text-[12px] text-stone-500 mt-2 font-medium"}>
            GPS Lock:
            <span className={"font-semibold text-stone-700"}>
              3/12 Satellites
            </span>
            {"&bull; Waiting for HDOP resolution..."}
          </p>
        </div>
        <nav className={"relative z-30 bg-white border-t border-stone-200 px-3 py-2 flex items-center justify-around"}>
          <button onClick={onPlugClick} className={"flex flex-col items-center justify-center flex-1 py-1 text-stone-500 hover:text-stone-800 active:scale-95 transition-transform"} aria-label={"Explore"} data-act={"explore"}>
            <span className={"material-symbols-outlined text-[21px]"}>
              explore
            </span>
            <span className={"text-[12px] font-medium tracking-tight mt-0.5"}>
              Explore
            </span>
          </button>
          <button onClick={onPlugClick} className={"flex flex-col items-center justify-center flex-1 py-1 text-stone-500 hover:text-stone-800 active:scale-95 transition-transform"} aria-label={"Garage"} data-act={"garage"}>
            <span className={"material-symbols-outlined text-[21px]"}>
              directions_car
            </span>
            <span className={"text-[12px] font-medium tracking-tight mt-0.5"}>
              Garage
            </span>
          </button>
          <div className={"relative flex flex-col items-center justify-center flex-1 -mt-5"}>
            <button onClick={onPlugClick} className={"w-13 h-13 rounded-full bg-gradient-to-tr from-brand-600 to-brand-500 text-white shadow-lg shadow-brand-500/35 flex flex-col items-center justify-center border-2 border-white active:scale-90 transition-transform"} aria-label={"Log Fuel"} data-act={"log"}>
              <span className={"material-symbols-outlined text-[20px] fill"}>
                local_gas_station
              </span>
              <span className={"text-[12px] font-black uppercase tracking-wider leading-none mt-0.5"}>
                LOG
              </span>
            </button>
          </div>
          <button onClick={onPlugClick} className={"flex flex-col items-center justify-center flex-1 py-1 text-brand-500 active:scale-95 transition-transform"} aria-label={"Map It"} data-act={"map-it"}>
            <span className={"material-symbols-outlined text-[21px] fill"}>
              map
            </span>
            <span className={"text-[12px] font-bold tracking-tight mt-0.5"}>
              Map It
            </span>
          </button>
          <button onClick={onPlugClick} className={"flex flex-col items-center justify-center flex-1 py-1 text-stone-500 hover:text-stone-800 active:scale-95 transition-transform"} aria-label={"Account"} data-act={"account"}>
            <span className={"material-symbols-outlined text-[21px]"}>
              person
            </span>
            <span className={"text-[12px] font-medium tracking-tight mt-0.5"}>
              Account
            </span>
          </button>
        </nav>
      </div>
    </div>
  );
}
