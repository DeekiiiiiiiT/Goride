import { useEffect, useRef } from 'react';
import { onPlugClick } from '../../shell/actions';
import { bindScreen } from '../../shell/bind';


export function SignupPhoneScreen() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (ref.current) bindScreen("04-signup-phone.html", ref.current); }, []);
  return (
    <div ref={ref} data-plug-screen={"04-signup-phone.html"} className={"bg-surface text-on-surface antialiased flex flex-col min-h-screen"}>
      <main className={"flex-1 flex flex-col relative w-full pt-safe pb-safe bg-surface px-margin"}>
        <div className={"flex flex-col w-full pb-space-xl"}>
          <header className={"flex items-center justify-between w-full py-space-sm mb-space-sm"}>
            <button onClick={onPlugClick} aria-label={"Go back"} className={"flex items-center justify-center w-12 h-12 rounded-full bg-surface-container active:bg-surface-container-highest transition-colors shadow-sm"} type={"button"} data-act={"arrow-back"} data-way-out={"back"}>
              <span className={"material-symbols-outlined text-on-surface text-[22px]"}>
                arrow_back
              </span>
            </button>
            <div className={"flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface-container-high"}>
              <span className={"material-symbols-outlined text-primary text-[18px]"} style={{ fontVariationSettings: "'FILL' 1" }}>
                local_gas_station
              </span>
              <span className={"font-label-md text-label-md tracking-wide text-on-surface uppercase font-extrabold"}>
                Roam Plug
              </span>
            </div>
            <div className={"w-12 h-12 opacity-0 pointer-events-none"} />
          </header>
          <div className={"w-full bg-surface-container-low p-space-md rounded-2xl mb-space-md shadow-sm"}>
            <div className={"flex items-center justify-between mb-2"}>
              <div className={"flex items-center gap-1.5"}>
                <span className={"inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary text-on-primary font-label-sm text-label-sm font-bold"}>
                  1
                </span>
                <span className={"font-label-md text-label-md text-on-surface font-semibold"}>
                  Phone Sign Up
                </span>
              </div>
              <span className={"font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant font-bold"}>
                Step 1 of 3
              </span>
            </div>
            <div className={"flex items-center gap-2 w-full"}>
              <div className={"h-2 flex-1 rounded-full bg-primary transition-all duration-300"} />
              <div className={"h-2 flex-1 rounded-full bg-surface-container-highest"} />
              <div className={"h-2 flex-1 rounded-full bg-surface-container-highest"} />
            </div>
            <div className={"flex justify-between items-center mt-2 px-0.5"}>
              <span className={"font-label-sm text-label-sm text-primary font-bold"}>
                1. Phone
              </span>
              <span className={"font-label-sm text-label-sm text-on-surface-variant"}>
                2. Verify
              </span>
              <span className={"font-label-sm text-label-sm text-on-surface-variant"}>
                3. Profile
              </span>
            </div>
          </div>
          <section className={"mb-space-lg"}>
            <h1 className={"font-headline-lg text-headline-lg text-on-surface tracking-tight mb-2"}>
              Create your account
            </h1>
            <p className={"font-body-md text-body-md text-on-surface-variant leading-relaxed"}>
              Join thousands of Jamaican drivers tracking fuel, car maintenance, and mapping our roads across all 14 parishes.
            </p>
          </section>
          <div className={"bg-surface-container-lowest rounded-2xl p-space-md shadow-sm flex flex-col gap-space-md mb-space-md"}>
            <div className={"flex flex-col gap-2"}>
              <div className={"flex justify-between items-center"}>
                <label className={"font-label-lg text-label-lg text-on-surface font-bold"} htmlFor={"phone-input"}>
                  Phone Number
                </label>
                <span className={"font-label-sm text-label-sm text-primary font-bold bg-primary-fixed px-2 py-0.5 rounded-full text-on-primary-fixed"}>
                  JA Mobile
                </span>
              </div>
              <div className={"flex items-center gap-2"}>
                <div className={"flex items-center gap-2 px-3 py-3 rounded-xl bg-surface-container-high h-[52px] select-none shrink-0 shadow-sm"} title={"Jamaica (+1 876)"}>
                  <svg aria-hidden={"true"} className={"w-6 h-4 rounded-sm shadow-xs"} viewBox={"0 0 600 300"}>
                    <rect fill={"#000000"} height={"300"} width={"600"} />
                    <polygon fill={"#007730"} points={"0,0 300,150 0,300"} />
                    <polygon fill={"#007730"} points={"600,0 300,150 600,300"} />
                    <polygon fill={"#fed100"} points={"0,0 300,150 600,0"} />
                    <polygon fill={"#fed100"} points={"0,300 300,150 600,300"} />
                    <line stroke={"#fed100"} strokeWidth={"48"} x1={"0"} x2={"600"} y1={"0"} y2={"300"} />
                    <line stroke={"#fed100"} strokeWidth={"48"} x1={"600"} x2={"0"} y1={"0"} y2={"300"} />
                  </svg>
                  <span className={"font-headline-sm text-headline-sm text-on-surface font-bold"}>
                    +1 876
                  </span>
                </div>
                <div className={"relative flex-1"}>
                  <input className={"w-full h-[52px] px-4 rounded-xl bg-surface-container-low text-on-surface font-headline-sm text-headline-sm tracking-wide placeholder:text-on-surface-variant/40 focus:outline-none focus:bg-surface-container-lowest focus:ring-0 transition-all"} id={"phone-input"} maxLength={8} placeholder={"555-0199"} type={"tel"} />
                  <button onClick={onPlugClick} aria-label={"Clear input"} className={"absolute right-3 top-1/2 -translate-y-1/2 hidden text-on-surface-variant/60 hover:text-on-surface p-1"} id={"clear-phone"} type={"button"} data-act={"clear-phone"}>
                    <span className={"material-symbols-outlined text-[18px]"}>
                      cancel
                    </span>
                  </button>
                </div>
              </div>
              <div className={"flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-surface-container-low mt-1"}>
                <span className={"material-symbols-outlined text-secondary text-[16px] shrink-0"}>
                  sms
                </span>
                <span className={"font-label-sm text-label-sm text-on-surface-variant font-medium"}>
                  We'll send an SMS code to verify. Free standard rates apply.
                </span>
              </div>
            </div>
            <label className={"flex items-start gap-3 cursor-pointer select-none group mt-1"}>
              <div className={"relative flex items-center justify-center w-6 h-6 rounded-lg bg-primary mt-0.5 shrink-0 transition-transform active:scale-90 shadow-xs"}>
                <input defaultChecked={true} className={"sr-only peer"} id={"terms-checkbox"} type={"checkbox"} />
                <span className={"material-symbols-outlined text-on-primary text-[18px] select-none pointer-events-none"}>
                  check
                </span>
              </div>
              <span className={"font-body-sm text-body-sm text-on-surface-variant leading-tight"}>
                I agree to Roam Plug's
                <span className={"text-primary font-semibold underline decoration-primary/40 underline-offset-2"}>
                  Terms of Service
                </span>
                and
                <span className={"text-primary font-semibold underline decoration-primary/40 underline-offset-2"}>
                  Privacy Policy
                </span>
                . Offline sync and parish road guidelines apply.
              </span>
            </label>
            <button onClick={onPlugClick} className={"w-full min-h-[52px] px-6 rounded-xl bg-primary active:bg-secondary-container text-on-primary flex items-center justify-center gap-2 font-headline-sm text-headline-sm font-bold shadow-md transition-all duration-200 transform active:scale-[0.99]"} id={"submit-btn"} type={"button"} data-act={"submit-btn"} data-way-out={"primary"}>
              <span>
                Continue
              </span>
              <span className={"material-symbols-outlined text-[20px] transition-transform group-hover:translate-x-1"}>
                arrow_forward
              </span>
            </button>
          </div>
          <div className={"w-full rounded-2xl overflow-hidden bg-surface-container-low mb-space-md shadow-sm relative"}>
            <div className={"w-full h-24 bg-surface-container flex items-center justify-center text-primary"} aria-hidden={"true"}><span className={"material-symbols-outlined text-[32px]"}>image</span></div>
            <div className={"p-3 bg-surface-container-high/90 flex items-center justify-between"}>
              <div className={"flex items-center gap-2"}>
                <span className={"material-symbols-outlined text-secondary text-[20px]"} style={{ fontVariationSettings: "'FILL' 1" }}>
                  speed
                </span>
                <span className={"font-label-md text-label-md font-semibold text-on-surface"}>
                  Community Road Updates
                </span>
              </div>
              <span className={"font-label-sm text-label-sm font-bold bg-surface-container-lowest text-on-surface px-2 py-0.5 rounded-full shadow-xs"}>
                {"Live in Kingston & MoBay"}
              </span>
            </div>
          </div>
          <div className={"flex items-center gap-3 my-2 px-2"}>
            <div className={"h-0.5 flex-1 bg-surface-container-highest rounded-full"} />
            <span className={"font-label-sm text-label-sm uppercase tracking-widest text-on-surface-variant font-bold px-1"}>
              or sign in with
            </span>
            <div className={"h-0.5 flex-1 bg-surface-container-highest rounded-full"} />
          </div>
          <div className={"flex flex-col gap-2.5 mt-space-sm mb-space-md"}>
            <button onClick={onPlugClick} className={"w-full min-h-[48px] px-4 rounded-xl bg-surface-container-lowest active:bg-surface-container text-on-surface flex items-center justify-center gap-3 font-label-lg text-label-lg font-bold shadow-sm transition-colors"} type={"button"} data-act={"continue-with-google"} data-way-out={"primary"}>
              <svg aria-hidden={"true"} className={"w-5 h-5 shrink-0"} viewBox={"0 0 24 24"}>
                <path d={"M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"} fill={"#4285F4"} />
                <path d={"M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"} fill={"#34A853"} />
                <path d={"M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"} fill={"#FBBC05"} />
                <path d={"M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"} fill={"#EA4335"} />
              </svg>
              <span>
                Continue with Google
              </span>
            </button>
            <button onClick={onPlugClick} className={"w-full min-h-[48px] px-4 rounded-xl bg-inverse-surface active:bg-on-surface text-inverse-on-surface flex items-center justify-center gap-3 font-label-lg text-label-lg font-bold shadow-sm transition-colors"} type={"button"} data-act={"continue-with-apple"} data-way-out={"primary"}>
              <svg aria-hidden={"true"} className={"w-5 h-5 shrink-0 fill-current"} viewBox={"0 0 170 170"}>
                <path d={"M150.37 130.25c-2.45 5.66-5.35 10.87-8.71 15.66-4.58 6.53-8.33 11.05-11.22 13.56-4.48 4.12-9.28 6.23-14.42 6.35-3.69 0-8.14-1.05-13.32-3.18-5.19-2.12-9.97-3.17-14.34-3.17-4.58 0-9.49 1.05-14.75 3.17-5.26 2.13-9.5 3.24-12.74 3.35-4.35.13-9.16-1.9-14.42-6.08-3.7-3.05-7.7-7.85-12-14.42-6.01-9.17-10.85-19.78-14.5-31.84-3.66-12.06-5.5-23.75-5.5-35.08 0-14.75 3.82-27.18 11.45-37.3 7.64-10.12 17.39-15.29 29.27-15.52 4.58 0 9.8 1.25 15.66 3.75 5.86 2.5 9.74 3.79 11.64 3.87 1.63 0 5.64-1.34 12.03-4.02 6.38-2.69 11.75-3.85 16.11-3.48 12.22.95 22.09 5.56 29.6 13.84-10.89 6.6-16.22 15.73-16 27.38.28 9.5 4.02 17.48 11.22 23.95 7.2 6.47 15.76 10.1 25.68 10.9-2.29 6.84-4.89 13.75-7.8 20.73zM119.22 33.15c0-7.23 2.65-13.97 7.95-20.22 5.3-6.26 11.83-10.51 19.59-12.76.38 2.05.57 3.87.57 5.48 0 7.37-2.73 14.34-8.19 20.91-5.46 6.57-12.08 10.73-19.86 12.49-.07-2.02-.06-3.99-.06-5.9z"} />
              </svg>
              <span>
                Continue with Apple
              </span>
            </button>
          </div>
          <footer className={"mt-auto pt-2 flex flex-col items-center gap-1.5 text-center"}>
            <div className={"flex items-center justify-center gap-2 flex-wrap"}>
              <span className={"inline-flex items-center gap-1 font-label-sm text-label-sm font-semibold text-on-surface-variant"}>
                <span className={"material-symbols-outlined text-[14px] text-tertiary"}>
                  check_circle
                </span>
                100% Free
              </span>
              <span className={"text-on-surface-variant/40"}>
                •
              </span>
              <span className={"inline-flex items-center gap-1 font-label-sm text-label-sm font-semibold text-on-surface-variant"}>
                <span className={"material-symbols-outlined text-[14px] text-tertiary"}>
                  credit_card_off
                </span>
                No card needed
              </span>
              <span className={"text-on-surface-variant/40"}>
                •
              </span>
              <span className={"inline-flex items-center gap-1 font-label-sm text-label-sm font-semibold text-on-surface-variant"}>
                <span className={"material-symbols-outlined text-[14px] text-primary"}>
                  group
                </span>
                Driver powered
              </span>
            </div>
            <span className={"font-label-sm text-label-sm text-on-surface-variant/70"}>
              Built for Jamaican roads, taxis, and road trips.
            </span>
          </footer>
        </div>
      </main>
    </div>
  );
}
