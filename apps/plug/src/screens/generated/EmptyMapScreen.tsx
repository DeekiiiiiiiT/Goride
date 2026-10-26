import { useEffect, useRef } from 'react';
import { onPlugClick } from '../../shell/actions';
import { bindScreen } from '../../shell/bind';


export function EmptyMapScreen() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (ref.current) bindScreen("15c-empty-map.html", ref.current); }, []);
  return (
    <div ref={ref} data-plug-screen={"15c-empty-map.html"} className={"bg-[#fff8f2] text-slate-800 antialiased flex justify-center min-h-screen"}>
      <div className={"w-full max-w-[390px] min-h-screen bg-[#fff8f2] flex flex-col relative pb-[84px] shadow-2xl overflow-x-hidden border-x border-[#f0e6dc]"}>
        <div className={"w-full bg-[#fceee1] border-b border-[#f3d9c2] px-4 py-2 flex items-center justify-center gap-2 text-xs font-medium text-[#9a3412] shadow-inner select-none transition-all"}>
          <span className={"material-symbols-outlined text-[17px] text-[#ea580c] animate-bounce"}>
            arrow_downward
          </span>
          <span>
            Pull down to scan for newly updated pumps
          </span>
        </div>
        <header className={"bg-[#fff8f2] px-4 pt-3 pb-2.5 flex items-center justify-between border-b border-[#ebdcd0] sticky top-0 z-30"}>
          <div className={"flex items-center gap-2.5"}>
            <div className={"w-9 h-9 rounded-xl bg-[#ea580c] flex items-center justify-center text-white shadow-sm"}>
              <span className={"material-symbols-outlined fill-1 text-[20px]"}>
                local_gas_station
              </span>
            </div>
            <div>
              <span className={"text-[12px] uppercase font-bold tracking-wider text-[#ea580c]"}>
                ROAM PLUG
              </span>
              <h1 className={"text-base font-extrabold text-slate-900 leading-none"}>
                Explore
              </h1>
            </div>
          </div>
          <div className={"flex items-center gap-2"}>
            <button onClick={onPlugClick} className={"w-9 h-9 rounded-full bg-[#faf2eb] border border-[#ebdcd0] flex items-center justify-center text-slate-700 hover:bg-[#f3e5d7] active:scale-95 transition-transform"} aria-label={"Notifications"} data-act={"notifications"}>
              <span className={"material-symbols-outlined text-[20px]"}>
                notifications
              </span>
            </button>
            <button onClick={onPlugClick} className={"w-9 h-9 rounded-full bg-[#ea580c] text-white flex items-center justify-center font-bold text-xs ring-2 ring-[#ffd8b8] shadow-sm"} aria-label={"Profile"} data-act={"tc"}>
              TC
            </button>
          </div>
        </header>
        <div className={"px-4 pt-3 pb-2 flex flex-col gap-2.5 bg-[#fff8f2]"}>
          <div className={"flex items-center justify-between"}>
            <div className={"flex items-center gap-1.5 bg-[#faf2eb] border border-[#e6d8cb] px-3 py-1.5 rounded-full text-xs font-semibold text-slate-800 shadow-sm"}>
              <span className={"material-symbols-outlined text-[#ea580c] text-[17px]"}>
                location_on
              </span>
              <span>
                Portland Parish, Jamaica
              </span>
              <span className={"material-symbols-outlined text-slate-500 text-[16px]"}>
                expand_more
              </span>
            </div>
            <div className={"flex items-center gap-1.5 text-[12px] font-medium text-slate-500 bg-[#f5ede3] px-2.5 py-1 rounded-full border border-[#e5d9cd]"}>
              <span className={"w-2 h-2 rounded-full bg-emerald-500"} />
              <span>
                GPS Ready
              </span>
            </div>
          </div>
          <div className={"relative w-full"}>
            <span className={"material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-[20px]"}>
              search
            </span>
            <input onClick={onPlugClick} type={"text"} placeholder={"Search gas stations in Portland..."} className={"w-full pl-10 pr-10 py-2.5 bg-white border border-[#ebdcd0] rounded-xl text-sm placeholder-slate-400 text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#ea580c] focus:border-transparent shadow-sm"} data-act={"input"} />
            <button onClick={onPlugClick} className={"absolute right-2.5 top-1/2 -translate-y-1/2 w-7 h-7 rounded-lg bg-[#faf2eb] text-slate-600 flex items-center justify-center hover:bg-[#f2e2d2]"} data-act={"tune"}>
              <span className={"material-symbols-outlined text-[17px]"}>
                tune
              </span>
            </button>
          </div>
          <div className={"flex items-center gap-2 overflow-x-auto pb-1 pt-0.5"}>
            <button onClick={onPlugClick} className={"px-3 py-1.5 rounded-full text-xs font-bold bg-[#ea580c] text-white flex items-center gap-1 shadow-sm whitespace-nowrap"} data-act={"fuel-e-10-ulsd"}>
              <span className={"material-symbols-outlined fill-1 text-[15px]"}>
                local_gas_station
              </span>
              <span>
                Fuel (E-10/ULSD)
              </span>
            </button>
            <button onClick={onPlugClick} className={"px-3 py-1.5 rounded-full text-xs font-semibold bg-[#faf2eb] border border-[#e2d4c7] text-slate-700 hover:bg-[#f3e5d7] flex items-center gap-1 whitespace-nowrap"} data-act={"mechanics"}>
              <span className={"material-symbols-outlined text-[15px]"}>
                build
              </span>
              <span>
                Mechanics
              </span>
            </button>
            <button onClick={onPlugClick} className={"px-3 py-1.5 rounded-full text-xs font-semibold bg-[#faf2eb] border border-[#e2d4c7] text-slate-700 hover:bg-[#f3e5d7] flex items-center gap-1 whitespace-nowrap"} data-act={"parts-stores"}>
              <span className={"material-symbols-outlined text-[15px]"}>
                settings_suggest
              </span>
              <span>
                Parts Stores
              </span>
            </button>
          </div>
        </div>
        <div className={"relative w-full h-[220px] bg-[#eef3ea] overflow-hidden border-y border-[#e2d8cd]"}>
          <svg className={"w-full h-full object-cover"} viewBox={"0 0 390 220"} fill={"none"} xmlns={"http://www.w3.org/2000/svg"}>
            <defs>
              <linearGradient id={"oceanGrad"} x1={"0%"} y1={"0%"} x2={"0%"} y2={"100%"}>
                <stop offset={"0%"} stopColor={"#dce9ee"} />
                <stop offset={"100%"} stopColor={"#cfe0e6"} />
              </linearGradient>
              <pattern id={"topoGrid"} width={"24"} height={"24"} patternUnits={"userSpaceOnUse"}>
                <path d={"M 24 0 L 0 0 0 24"} fill={"none"} stroke={"#d5dfd3"} strokeWidth={"0.5"} opacity={"0.6"} />
              </pattern>
            </defs>
            <rect width={"390"} height={"220"} fill={"url(#oceanGrad)"} />
            <path d={"M -20 180 C 30 150, 70 165, 120 145 C 170 125, 210 135, 270 110 C 330 85, 370 100, 410 75 L 410 240 L -20 240 Z"} fill={"#e7eee3"} stroke={"#bed1ba"} strokeWidth={"1.5"} />
            <rect x={"0"} y={"80"} width={"390"} height={"140"} fill={"url(#topoGrid)"} />
            <path d={"M 80 190 Q 140 150 210 165 T 320 140"} fill={"none"} stroke={"#cfdec8"} strokeWidth={"2.5"} strokeDasharray={"3 4"} />
            <path d={"M 120 210 Q 190 175 260 185 T 360 160"} fill={"none"} stroke={"#cfdec8"} strokeWidth={"2"} strokeDasharray={"2 3"} />
            <path d={"M 0 170 C 60 155, 110 148, 160 138 C 220 125, 280 115, 340 92 C 370 82, 390 78, 410 74"} fill={"none"} stroke={"#f6ca88"} strokeWidth={"4.5"} strokeLinecap={"round"} />
            <path d={"M 0 170 C 60 155, 110 148, 160 138 C 220 125, 280 115, 340 92 C 370 82, 390 78, 410 74"} fill={"none"} stroke={"#ffffff"} strokeWidth={"2"} strokeLinecap={"round"} strokeDasharray={"8 6"} />
            <path d={"M 210 128 C 215 155, 230 180, 245 220"} fill={"none"} stroke={"#ffffff"} strokeWidth={"2.5"} strokeLinecap={"round"} />
            <circle cx={"210"} cy={"128"} r={"32"} fill={"#ea580c"} opacity={"0.12"} />
            <circle cx={"210"} cy={"128"} r={"18"} fill={"#ea580c"} opacity={"0.2"} />
            <circle cx={"210"} cy={"128"} r={"7"} fill={"#ea580c"} stroke={"#ffffff"} strokeWidth={"2.5"} />
          </svg>
          <div className={"absolute top-3 right-3 flex flex-col gap-2 z-10"}>
            <button onClick={onPlugClick} className={"w-8 h-8 rounded-lg bg-white/95 backdrop-blur-sm border border-[#e0d3c5] text-slate-700 flex items-center justify-center shadow-md active:scale-95"} title={"Center Location"} data-act={"my-location"}>
              <span className={"material-symbols-outlined text-[19px] text-[#ea580c]"}>
                my_location
              </span>
            </button>
            <button onClick={onPlugClick} className={"w-8 h-8 rounded-lg bg-white/95 backdrop-blur-sm border border-[#e0d3c5] text-slate-700 flex items-center justify-center shadow-md active:scale-95"} title={"Layers"} data-act={"layers"}>
              <span className={"material-symbols-outlined text-[19px]"}>
                layers
              </span>
            </button>
          </div>
          <div className={"absolute bottom-3 left-3 bg-white/95 backdrop-blur-sm border border-[#e2d5c7] rounded-full px-3 py-1 flex items-center gap-1.5 shadow-sm"}>
            <span className={"w-2 h-2 rounded-full bg-amber-500 animate-ping"} />
            <span className={"text-[12px] font-bold text-slate-700"}>
              
            </span>
          </div>
          <div className={"absolute bottom-3 right-3"}>
            <a onClick={onPlugClick} href={"#map-it"} className={"bg-[#ea580c] hover:bg-[#c2410c] text-white text-xs font-bold px-3 py-1.5 rounded-full flex items-center gap-1 shadow-md active:scale-95 transition-transform"} data-act={"pin-station"}>
              <span className={"material-symbols-outlined text-[15px] fill-1"}>
                add_location_alt
              </span>
              <span>
                + Pin Station
              </span>
            </a>
          </div>
        </div>
        <main className={"flex-1 px-5 pt-5 pb-6 flex flex-col items-center text-center"}>
          <div className={"w-44 h-36 flex items-center justify-center relative my-1"}>
            <img src={"https://lh3.googleusercontent.com/aida/AEtjO1WJXr8vsQEfMrFJ-sadpfp_sPYt6d-aA0LPD22pdD6jC2f0RrY7pmsEcIJ1GMiT5SKaFrEtsYgc5Oy-t_EYD5CEbbglGh4-Tig5g19LyB4giWaaXI_VR-68OZYgoJ26bsEU2KEktKh3XXWf7VMeF4bgMsz9j2qgsMjT4JPvMNidjIKCq6TCNjTx7eau0Q2-K4BSOJfrqb9UEWTVFeKFEKdlnp_UuWZBMNX5tJ94oCHeuWYJrkAfOPVxpSk"} alt={"Radar scanning for gas stations with zero results"} className={"w-full h-full object-contain filter drop-shadow-sm"} />
          </div>
          <h2 className={"text-[20px] font-extrabold text-slate-900 tracking-tight mt-2 leading-snug"}>
            No verified stations near you yet
          </h2>
          <p className={"text-[13px] text-slate-600 font-normal mt-2 max-w-[310px] leading-relaxed"}>
            We haven't recorded verified Petrojam pump prices in this sector of the parish yet. Help other Jamaican drivers by pinning the first spot!
          </p>
          <div className={"w-full bg-[#faf2eb] border border-[#e8dacd] rounded-2xl p-3.5 mt-4 flex items-center gap-3 text-left shadow-sm"}>
            <div className={"w-10 h-10 rounded-xl bg-[#fff8f2] border border-[#e4d4c5] flex-shrink-0 flex items-center justify-center text-[#ea580c] shadow-xs"}>
              <span className={"material-symbols-outlined text-[22px]"}>
                sync
              </span>
            </div>
            <div className={"flex-1"}>
              <div className={"flex items-center justify-between"}>
                <span className={"text-xs font-bold text-slate-900"}>
                  Pull down to refresh
                </span>
                <span className={"text-[12px] font-bold text-[#ea580c] uppercase tracking-wider bg-[#fed7aa]/50 px-2 py-0.5 rounded-full"}>
                  LIVE RADAR
                </span>
              </div>
              <p className={"text-[12px] text-slate-500 mt-0.5"}>
                Swipe down on the map to sync newly approved community scout pins.
              </p>
            </div>
          </div>
          <div className={"w-full flex flex-col gap-2.5 mt-5"}>
            <button onClick={onPlugClick} className={"w-full py-3 px-4 rounded-xl bg-[#ea580c] hover:bg-[#c2410c] active:scale-[0.98] text-white font-bold text-sm flex items-center justify-center gap-2 shadow-md shadow-orange-500/20 transition-all"} data-act={"pin-a-gas-station-here-25-xp"}>
              <span className={"material-symbols-outlined fill-1 text-[19px]"}>
                add_location
              </span>
              <span>
                Pin a gas station here
              </span>
            </button>
            <button onClick={onPlugClick} className={"w-full py-2.5 px-4 rounded-xl bg-white border border-[#dfd2c4] hover:bg-[#faf2eb] active:scale-[0.98] text-slate-800 font-semibold text-xs flex items-center justify-center gap-1.5 shadow-sm transition-all"} data-act={"expand-radar-search-to-30-km"}>
              <span className={"material-symbols-outlined text-[17px] text-slate-600"}>
                travel_explore
              </span>
              <span>
                
              </span>
            </button>
          </div>
          <div className={"mt-4 pt-3 border-t border-[#ebdcd0] w-full flex items-center justify-center gap-1.5 text-[12px] text-slate-500 font-medium"}>
            <span className={"material-symbols-outlined text-[15px] text-emerald-600 fill-1"}>
              verified_user
            </span>
            <span>
              Every pin is reviewed before going live on the island radar
            </span>
          </div>
        </main>
        <nav className={"fixed bottom-0 w-full max-w-[390px] bg-[#fff8f2] border-t border-[#e2d5c7] flex justify-around items-center h-[72px] px-2 z-40 shadow-lg"}>
          <a onClick={onPlugClick} href={"#explore"} className={"flex flex-col items-center justify-center flex-1 h-full text-[#ea580c]"} data-act={"explore"}>
            <div className={"w-10 h-7 rounded-full bg-[#fdecdb] flex items-center justify-center mb-0.5"}>
              <span className={"material-symbols-outlined fill-1 text-[21px]"}>
                explore
              </span>
            </div>
            <span className={"text-[12px] font-bold tracking-tight"}>
              Explore
            </span>
          </a>
          <a onClick={onPlugClick} href={"#garage"} className={"flex flex-col items-center justify-center flex-1 h-full text-slate-600 hover:text-slate-900 transition-colors"} data-act={"garage"}>
            <span className={"material-symbols-outlined text-[21px] mb-0.5"}>
              garage_home
            </span>
            <span className={"text-[12px] font-medium tracking-tight"}>
              Garage
            </span>
          </a>
          <div className={"flex flex-col items-center justify-center flex-1 -mt-5 relative z-50"}>
            <button onClick={onPlugClick} className={"w-[52px] h-[52px] rounded-full bg-[#ea580c] hover:bg-[#c2410c] text-white flex flex-col items-center justify-center shadow-lg shadow-orange-600/35 border-[3px] border-[#fff8f2] active:scale-95 transition-transform"} aria-label={"Log Fuel & Odometer"} data-act={"log"}>
              <span className={"material-symbols-outlined fill-1 text-[21px] leading-none"}>
                local_gas_station
              </span>
              <span className={"text-[12px] font-extrabold uppercase tracking-tight mt-0.5"}>
                LOG
              </span>
            </button>
          </div>
          <a onClick={onPlugClick} href={"#map-it"} className={"flex flex-col items-center justify-center flex-1 h-full text-slate-600 hover:text-slate-900 transition-colors"} data-act={"map-it"}>
            <span className={"material-symbols-outlined text-[21px] mb-0.5"}>
              map
            </span>
            <span className={"text-[12px] font-medium tracking-tight"}>
              Map It
            </span>
          </a>
          <a onClick={onPlugClick} href={"#account"} className={"flex flex-col items-center justify-center flex-1 h-full text-slate-600 hover:text-slate-900 transition-colors"} data-act={"account"}>
            <span className={"material-symbols-outlined text-[21px] mb-0.5"}>
              person
            </span>
            <span className={"text-[12px] font-medium tracking-tight"}>
              Account
            </span>
          </a>
        </nav>
      </div>
    </div>
  );
}
