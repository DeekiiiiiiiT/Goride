import { useEffect, useRef } from 'react';
import { bindScreen } from '../../shell/bind';


export function SplashScreen() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (ref.current) bindScreen("01-splash.html", ref.current); }, []);
  return (
    <div ref={ref} data-plug-screen={"01-splash.html"} className={"bg-surface text-on-surface antialiased flex flex-col min-h-screen"}>
      <div className={"w-full pt-safe px-margin select-none"}>
        <div className={"flex justify-between items-center pt-space-xs text-on-surface"}>
          <span className={"font-label-md text-label-md font-semibold tracking-tight"}>
            9:41
          </span>
          <div className={"flex items-center gap-1.5"}>
            <span className={"material-symbols-outlined text-[16px] leading-none"}>
              signal_cellular_alt
            </span>
            <span className={"material-symbols-outlined text-[16px] leading-none"}>
              wifi
            </span>
            <span className={"material-symbols-outlined text-[18px] leading-none"}>
              battery_full
            </span>
          </div>
        </div>
      </div>
      <main className={"flex-1 flex flex-col relative w-full pb-safe bg-surface px-margin"}>
        <div className={"flex flex-col w-full items-center justify-between min-h-[calc(100vh-6rem)] py-space-lg select-none relative overflow-hidden"}>
          <div className={"absolute inset-0 pointer-events-none opacity-25 flex items-center justify-center"}>
            <svg className={"w-full h-full"} fill={"none"} viewBox={"0 0 400 700"} xmlns={"http://www.w3.org/2000/svg"}>
              <path d={"M-50 180C50 130 180 250 240 190C300 130 360 160 450 110"} stroke={"#cc4900"} strokeDasharray={"6 8"} strokeWidth={"1.5"} />
              <path d={"M-40 320C70 270 120 410 260 360C360 320 380 430 460 390"} opacity={"0.6"} stroke={"#cc4900"} strokeWidth={"2"} />
              <path d={"M-20 480C110 430 170 560 290 510C370 470 410 570 470 530"} stroke={"#cc4900"} strokeDasharray={"4 6"} strokeWidth={"1.5"} />
              <circle cx={"240"} cy={"190"} fill={"#a33900"} r={"4"} />
              <circle cx={"260"} cy={"360"} fill={"#cc4900"} r={"5"} />
              <circle cx={"290"} cy={"510"} fill={"#a33900"} r={"4"} />
            </svg>
          </div>
          <div className={"z-10 pt-space-md flex flex-col items-center"}>
            <div className={"inline-flex items-center gap-1.5 px-space-md py-space-xs rounded-full bg-surface-container-high shadow-sm"}>
              <span className={"material-symbols-outlined text-[14px] text-primary"} style={{ fontVariationSettings: "'FILL' 1" }}>
                local_gas_station
              </span>
              <span className={"font-label-sm text-label-sm text-on-surface uppercase tracking-wider font-semibold"}>
                Jamaica's Live Road Feed
              </span>
            </div>
          </div>
          <div className={"z-10 flex flex-col items-center justify-center text-center px-gutter max-w-sm my-auto"}>
            <div className={"relative group cursor-pointer mb-space-lg transform transition-transform active:scale-95 duration-200"}>
              <div className={"absolute -inset-2 rounded-full bg-gradient-to-tr from-[#ea580c] to-[#eab308] opacity-25 blur-xl"} />
              <div className={"relative w-28 h-28 rounded-3xl bg-gradient-to-br from-[#ea580c] to-[#eab308] shadow-2xl flex items-center justify-center p-space-sm transform rotate-1 hover:rotate-0 transition-transform"}>
                <div className={"w-full h-full rounded-2xl flex items-center justify-center relative"}>
                  <svg className={"w-16 h-16 text-white drop-shadow-md"} fill={"none"} viewBox={"0 0 48 48"} xmlns={"http://www.w3.org/2000/svg"}>
                    <path d={"M19 6V13M29 6V13"} stroke={"currentColor"} strokeLinecap={"round"} strokeWidth={"3.5"} />
                    <path d={"M24 13C17.3726 13 12 18.3726 12 25C12 32.5 21.5 42 24 44C26.5 42 36 32.5 36 25C36 18.3726 30.6274 13 24 13Z"} fill={"currentColor"} />
                    <path d={"M21 21L27 27M27 21L21 27"} opacity={"0.95"} stroke={"#ea580c"} strokeLinecap={"round"} strokeWidth={"2.5"} />
                    <circle cx={"24"} cy={"24"} fill={"white"} r={"5"} />
                    <path d={"M24 21.5V26.5"} stroke={"#ea580c"} strokeLinecap={"round"} strokeWidth={"2"} />
                  </svg>
                </div>
              </div>
            </div>
            <div className={"flex flex-col items-center gap-space-xs"}>
              <div className={"flex items-center gap-2"}>
                <h1 className={"font-display-lg-mobile text-display-lg-mobile text-on-surface tracking-tight font-extrabold uppercase"}>
                  Roam Plug
                </h1>
              </div>
              <span className={"font-label-md text-label-md tracking-widest text-primary uppercase font-bold px-space-sm py-0.5 rounded bg-primary-fixed text-on-primary-fixed"}>
                Jamaica Motoring
              </span>
            </div>
            <p className={"mt-space-md font-body-md text-body-md text-on-surface-variant max-w-[260px] leading-relaxed"}>
              {"Plugged into every road in Jamaica. Real gas prices, taxi routes & alerts."}
            </p>
            <div className={"mt-space-lg inline-flex items-center gap-2 px-space-md py-space-sm rounded-full bg-surface-container shadow-sm"}>
              <span className={"w-2 h-2 rounded-full bg-[#16a34a] animate-pulse"} />
              <span className={"font-label-md text-label-md text-on-surface font-semibold"}>
                Across 14 Parishes
              </span>
              <span className={"text-outline-variant font-label-md"}>
                •
              </span>
              <span className={"font-label-md text-label-md text-primary font-bold"}>
                100% Free
              </span>
            </div>
          </div>
          <div className={"z-10 w-full max-w-xs flex flex-col items-center gap-space-sm pb-space-sm"}>
            <div className={"w-full bg-surface-container-highest rounded-full h-1.5 overflow-hidden relative"}>
              <div className={"h-full bg-gradient-to-r from-primary to-secondary-container rounded-full transition-all duration-300 w-1/3 animate-pulse"} id={"loading-bar"} />
            </div>
            <div className={"w-full flex items-center justify-between font-label-sm text-label-sm text-on-surface-variant px-space-xs pt-1"}>
              <span className={"flex items-center gap-1 font-semibold"}>
                <span className={"material-symbols-outlined text-[13px] text-primary"}>
                  sensors
                </span>
                Syncing island rates
              </span>
              <span className={"font-bold tracking-tight"}>
                v1.0 Kingston, JM
              </span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
