import { useEffect, useRef } from 'react';
import { onPlugClick } from '../../shell/actions';
import { bindScreen } from '../../shell/bind';


export function WelcomeScreen() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (ref.current) bindScreen("02-welcome.html", ref.current); }, []);
  return (
    <div ref={ref} data-plug-screen={"02-welcome.html"} className={"bg-surface text-on-surface antialiased flex flex-col min-h-screen"}>
      <main className={"flex-1 flex flex-col relative w-full pt-safe pb-safe bg-surface px-margin"}>
        <div className={"flex flex-col w-full pb-6 space-y-5 animate-fade-in"}>
          <header className={"flex items-center justify-between w-full pt-2"}>
            <div className={"flex items-center gap-2"}>
              <img alt={"Roam Plug Logo"} className={"w-10 h-10 object-contain rounded-lg shadow-sm"} src={"https://lh3.googleusercontent.com/aida/AEtjO1XmALotlSP9jE2bot3DOkJ9Ouv5qiEOhn6k5boTQAQyORbZ89jqFUeeYqmFsjj5bdbR2x_KtjR475faejSGjZEtHwg05XZvaKrwL6wsAA6CeMMoznwZmIopNqbNDc-PwEYvLdAiyUOxupw9hdYwSZUeE7EsllxyZLZrF4-oCp3vPr0DJHQguvKyS-XcjunCplI096YEPFDRGv51pM7SAdx6BDkUroNb7w53Cg1TdbpLtCaz5QQdeAfvjwE"} />
              <div className={"flex flex-col"}>
                <span className={"font-headline-sm text-headline-sm text-on-surface leading-none tracking-tight"}>
                  Roam Plug
                </span>
                <span className={"font-label-sm text-label-sm text-secondary font-semibold uppercase tracking-wider mt-0.5"}>
                  Motoring Co-Pilot
                </span>
              </div>
            </div>
            <div className={"flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface-container-high shadow-sm"}>
              <span className={"text-sm leading-none"}>
                🇯🇲
              </span>
              <span className={"font-label-md text-label-md text-on-surface font-bold tracking-normal"}>
                Jamaica
              </span>
            </div>
          </header>
          <div className={"relative w-full rounded-xl overflow-hidden bg-surface-container shadow-md group"}>
            <div className={"relative w-full aspect-[4/3] overflow-hidden"}>
              <div className={"w-full h-full object-cover transform transition-transform duration-700 ease-out group-hover:scale-105 bg-surface-container flex items-center justify-center text-primary"} aria-hidden={"true"}><span className={"material-symbols-outlined text-[32px]"}>image</span></div>
              <div className={"absolute inset-0 bg-gradient-to-t from-on-surface/40 via-transparent to-transparent pointer-events-none"} />
              <div className={"absolute top-3 right-3 flex items-center gap-1 px-2.5 py-1 rounded-full bg-secondary-container text-on-secondary-container shadow-md"}>
                <span className={"material-symbols-outlined text-[14px]"}>
                  local_gas_station
                </span>
                <span className={"font-label-sm text-label-sm font-bold tracking-tight"}>
                  E-10 87 Best Rates
                </span>
              </div>
            </div>
          </div>
          <div className={"flex flex-col space-y-2 text-left"}>
            <div className={"inline-flex items-center gap-1.5 text-secondary font-label-md text-label-md uppercase tracking-wider font-bold"}>
              <span className={"material-symbols-outlined text-[16px]"} style={{ fontVariationSettings: "'FILL' 1" }}>
                explore
              </span>
              Island-Wide Driver Network
            </div>
            <h1 className={"font-display-lg-mobile text-display-lg-mobile text-on-surface font-extrabold tracking-tight"}>
              Welcome to{" "}
              <span className={"text-primary-container"}>
                Roam Plug
              </span>
            </h1>
            <p className={"font-body-lg text-body-lg text-on-surface-variant leading-relaxed"}>
              Fuel prices, car care and every motoring spot in Jamaica — free.
            </p>
          </div>
          <div className={"flex items-center justify-between w-full px-4 py-3 rounded-lg bg-surface-container-low shadow-sm"}>
            <div className={"flex items-center gap-1.5"}>
              <span className={"material-symbols-outlined text-[18px] text-primary"} style={{ fontVariationSettings: "'FILL' 1" }}>
                block
              </span>
              <span className={"font-label-md text-label-md text-on-surface font-semibold"}>
                No ads
              </span>
            </div>
            <span className={"w-1 h-1 rounded-full bg-outline-variant"} />
            <div className={"flex items-center gap-1.5"}>
              <span className={"material-symbols-outlined text-[18px] text-tertiary-container"} style={{ fontVariationSettings: "'FILL' 1" }}>
                group
              </span>
              <span className={"font-label-md text-label-md text-on-surface font-semibold"}>
                Community powered
              </span>
            </div>
            <span className={"w-1 h-1 rounded-full bg-outline-variant"} />
            <div className={"flex items-center gap-1.5"}>
              <span className={"material-symbols-outlined text-[18px] text-primary-container"} style={{ fontVariationSettings: "'FILL' 1" }}>
                verified
              </span>
              <span className={"font-label-md text-label-md text-on-surface font-semibold"}>
                100% Free
              </span>
            </div>
          </div>
          <div className={"flex flex-col w-full space-y-3 pt-2"}>
            <button onClick={onPlugClick} className={"w-full min-h-[52px] px-6 py-3.5 rounded-xl bg-surface-container-lowest text-on-surface font-headline-sm text-headline-sm flex items-center justify-center gap-2 shadow-sm active:scale-[0.98] transition-all duration-150"} type={"button"} data-act={"continue-with-google"} data-way-out={"primary"}>
              Continue with Google
            </button>
            <button onClick={onPlugClick} className={"w-full min-h-[52px] px-6 py-3.5 rounded-xl bg-primary-container text-on-primary font-headline-sm text-headline-sm flex items-center justify-center gap-2 shadow-md active:scale-[0.98] transition-all duration-150"} id={"get-started-btn"} type={"button"} data-act={"get-started-btn"} data-way-out={"primary"}>
              <span>
                Get Started
              </span>
              <span className={"material-symbols-outlined text-[20px] transition-transform duration-200 group-active:translate-x-1"}>
                arrow_forward
              </span>
            </button>
            <button onClick={onPlugClick} className={"w-full min-h-[48px] px-6 py-3 rounded-xl bg-surface-container-highest text-on-surface font-label-lg text-label-lg font-bold flex items-center justify-center gap-2 hover:bg-surface-container-high active:scale-[0.98] transition-colors"} id={"explore-btn"} type={"button"} data-act={"explore-btn"}>
              <span className={"material-symbols-outlined text-[18px] text-secondary"}>
                near_me
              </span>
              <span>
                Explore without an account
              </span>
            </button>
            <div className={"flex items-center justify-center pt-1"}>
              <button onClick={onPlugClick} className={"min-h-[48px] px-4 inline-flex items-center justify-center font-label-lg text-label-lg text-on-surface-variant hover:text-on-surface active:text-primary transition-colors"} id={"login-btn"} type={"button"} data-act={"login-btn"}>
                I already have an account •
                <span className={"font-bold text-primary ml-1 underline decoration-primary-container decoration-2 underline-offset-4"}>
                  Log in
                </span>
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
