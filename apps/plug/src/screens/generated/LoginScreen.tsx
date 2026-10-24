import { useEffect, useRef } from 'react';
import { onPlugClick } from '../../shell/actions';
import { bindScreen } from '../../shell/bind';


export function LoginScreen() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (ref.current) bindScreen("14-login.html", ref.current); }, []);
  return (
    <div ref={ref} data-plug-screen={"14-login.html"} className={"bg-surface font-body-md text-on-surface flex flex-col min-h-screen pt-safe pb-safe"}>
      <main className={"flex-1 flex flex-col relative w-full bg-surface"}>
        <div className={"flex flex-col w-full pb-8 px-4"}>
          <header className={"flex items-center justify-between py-3 w-full"}>
            <button onClick={onPlugClick} aria-label={"Go back"} className={"flex items-center justify-center w-12 h-12 rounded-full bg-surface-container hover:bg-surface-container-high active:scale-95 transition-all text-on-surface"} type={"button"} data-act={"arrow-back"} data-way-out={"back"}>
              <span className={"material-symbols-outlined text-[24px]"}>
                arrow_back
              </span>
            </button>
            <button onClick={onPlugClick} className={"flex items-center gap-1 px-3 py-2 rounded-full bg-surface-container text-secondary font-label-lg text-label-lg active:scale-95 transition-all"} type={"button"} data-act={"help"}>
              <span className={"material-symbols-outlined text-[18px]"}>
                help_outline
              </span>
              <span>
                Help
              </span>
            </button>
          </header>
          <section className={"mt-4 flex flex-col items-start w-full"}>
            <div className={"relative flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-primary via-secondary-container to-tertiary-fixed-dim shadow-md mb-5 group"}>
              <svg className={"w-9 h-9 text-on-primary drop-shadow-sm"} fill={"currentColor"} viewBox={"0 0 24 24"}>
                <path d={"M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm-1 4h2v3h-2V6zm0 5h2v2h-2v-2zm-3-5h2v3H8V6zm6 0h2v3h-2V6z"} />
              </svg>
              <span className={"absolute -top-1 -right-1 flex h-3.5 w-3.5"}>
                <span className={"animate-ping absolute inline-flex h-full w-full rounded-full bg-secondary-container opacity-75"} />
                <span className={"relative inline-flex rounded-full h-3.5 w-3.5 bg-primary"} />
              </span>
            </div>
            <h1 className={"font-headline-lg text-headline-lg text-on-surface tracking-tight"}>
              Welcome back
            </h1>
            <p className={"font-body-md text-body-md text-on-surface-variant mt-2 max-w-xs"}>
              Sign in to access your garage, synced odometer logs, and parish road pins.
            </p>
          </section>
          <form className={"mt-7 flex flex-col w-full"}>
            <div className={"flex items-center justify-between mb-2"}>
              <label className={"font-label-lg text-label-lg text-on-surface flex items-center gap-1.5"} htmlFor={"phone-input"}>
                <span>
                  Phone Number
                </span>
              </label>
              <span className={"inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-secondary-fixed text-on-secondary-fixed font-label-sm text-label-sm tracking-wide uppercase"}>
                <span className={"w-1.5 h-1.5 rounded-full bg-primary animate-pulse"} />
                Jamaica Mobile
              </span>
            </div>
            <div className={"relative flex items-center h-[52px] w-full rounded-xl bg-surface-container-lowest shadow-sm transition-all focus-within:shadow-md"}>
              <div className={"flex items-center gap-1.5 px-3.5 h-full bg-surface-container-low rounded-l-xl select-none"}>
                <span aria-label={"Jamaica Flag"} className={"text-lg leading-none"} role={"img"}>
                  🇯🇲
                </span>
                <span className={"font-label-lg text-label-lg text-on-surface font-bold tracking-tight"}>
                  +1 876
                </span>
              </div>
              <input autoComplete={"tel-national"} className={"flex-1 h-full px-3.5 rounded-r-xl bg-transparent font-headline-sm text-headline-sm text-on-surface placeholder:text-outline/40 focus:outline-none"} id={"phone-input"} inputMode={"numeric"} maxLength={8} placeholder={"555-0199"} required={true} type={"tel"} />
            </div>
            <div className={"flex items-start gap-1.5 mt-2.5 px-0.5"}>
              <span className={"material-symbols-outlined text-[16px] text-tertiary mt-0.5"} style={{ fontVariationSettings: "'FILL' 1" }}>
                sms
              </span>
              <p className={"font-body-sm text-body-sm text-on-surface-variant"}>
                We'll text you a 6-digit one-time code. No password needed.
              </p>
            </div>
            <button onClick={onPlugClick} className={"mt-6 flex items-center justify-center gap-2 w-full h-[52px] rounded-xl bg-primary text-on-primary font-headline-sm text-headline-sm shadow-md active:bg-primary-container active:scale-[0.99] transition-all"} id={"submit-btn"} type={"submit"} data-act={"submit-btn"} data-way-out={"primary"}>
              <span>
                Send Code
              </span>
              <span className={"material-symbols-outlined text-[20px] transition-transform group-hover:translate-x-1"}>
                arrow_forward
              </span>
            </button>
          </form>
          <div className={"relative flex items-center justify-center my-7 w-full"}>
            <div className={"w-full h-px bg-surface-container-highest"} />
            <span className={"absolute px-3 bg-surface font-label-sm text-label-sm uppercase tracking-wider text-outline font-bold"}>
              Or continue with
            </span>
          </div>
          <div className={"flex flex-col gap-3 w-full"}>
            <button onClick={onPlugClick} className={"flex items-center justify-center gap-3 w-full h-[50px] px-4 rounded-xl bg-surface-container-lowest text-on-surface font-label-lg text-label-lg shadow-sm hover:bg-surface-container-low active:scale-[0.99] transition-all"} type={"button"} data-act={"continue-with-google"} data-way-out={"primary"}>
              <svg className={"w-5 h-5"} viewBox={"0 0 24 24"}>
                <path d={"M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"} fill={"#4285F4"} />
                <path d={"M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"} fill={"#34A853"} />
                <path d={"M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"} fill={"#FBBC05"} />
                <path d={"M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"} fill={"#EA4335"} />
              </svg>
              <span>
                Continue with Google
              </span>
            </button>
            <button onClick={onPlugClick} className={"flex items-center justify-center gap-3 w-full h-[50px] px-4 rounded-xl bg-inverse-surface text-inverse-on-surface font-label-lg text-label-lg shadow-sm hover:opacity-95 active:scale-[0.99] transition-all"} type={"button"} data-act={"continue-with-apple"} data-way-out={"primary"}>
              <svg className={"w-5 h-5 fill-current"} viewBox={"0 0 24 24"}>
                <path d={"M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 6.37c.62-.75 1.04-1.8 0.92-2.85-.9.04-2 .6-2.65 1.35-.58.67-.99 1.74-.85 2.76 1 .08 2-.51 2.58-1.26z"} />
              </svg>
              <span>
                Continue with Apple
              </span>
            </button>
          </div>
          <div className={"mt-8 text-center w-full"}>
            <p className={"font-body-md text-body-md text-on-surface-variant"}>
              Don't have an account?
              <button onClick={onPlugClick} className={"font-label-lg text-label-lg text-primary hover:underline ml-1 font-bold inline-flex items-center"} type={"button"} data-act={"sign-up"}>
                Sign up
              </button>
            </p>
          </div>
          <footer className={"mt-10 mb-2 w-full flex flex-col items-center"}>
            <div className={"inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-surface-container-high text-on-surface-variant max-w-full text-center"}>
              <span className={"text-sm select-none"}>
                🇯🇲
              </span>
              <span className={"font-label-sm text-label-sm leading-tight text-on-surface"}>
                {"Built for Jamaican roads, route taxis & road trips • 100% Free"}
              </span>
            </div>
          </footer>
        </div>
      </main>
    </div>
  );
}
