import { useEffect, useRef } from 'react';
import { onPlugClick } from '../../shell/actions';
import { bindScreen } from '../../shell/bind';


export function ProfileScreen() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (ref.current) bindScreen("06-profile.html", ref.current); }, []);
  return (
    <div ref={ref} data-plug-screen={"06-profile.html"} className={"bg-surface text-on-surface antialiased flex flex-col min-h-screen"}>
      <main className={"flex-1 flex flex-col relative w-full pt-safe pb-safe bg-surface px-margin"}>
        <div className={"flex flex-col w-full pb-8"}>
          <div className={"flex items-center justify-between py-3"}>
            <div className={"flex items-center gap-2"}>
              <button onClick={onPlugClick} aria-label={"Go back"} className={"w-10 h-10 rounded-full flex items-center justify-center bg-surface-container text-on-surface hover:bg-surface-container-high transition-colors active:scale-95"} type={"button"} data-act={"arrow-back"} data-way-out={"back"}>
                <span className={"material-symbols-outlined text-base"}>
                  arrow_back
                </span>
              </button>
              <span className={"font-label-md text-label-md uppercase tracking-wider text-on-surface-variant font-bold"}>
                Step 3 of 3
              </span>
            </div>
            <div className={"px-3 py-1 rounded-full bg-secondary-fixed text-on-secondary-fixed font-label-sm text-label-sm font-extrabold tracking-wide uppercase shadow-sm"}>
              Final Step
            </div>
          </div>
          <div className={"w-full bg-surface-container h-1.5 rounded-full overflow-hidden mb-4"}>
            <div className={"bg-primary h-full w-full rounded-full transition-all duration-500"} />
          </div>
          <div className={"mb-5"}>
            <div className={"inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-tertiary-fixed text-on-tertiary-fixed font-label-sm text-label-sm font-bold uppercase mb-2"}>
              <span className={"material-symbols-outlined text-[14px]"}>
                local_gas_station
              </span>
              Roam Plug Co-Pilot
            </div>
            <h1 className={"font-headline-lg text-headline-lg font-extrabold text-on-surface tracking-tight"}>
              Set up your profile
            </h1>
            <p className={"font-body-md text-body-md text-on-surface-variant mt-1.5 leading-relaxed"}>
              Personalize your motoring experience and how you appear to other island drivers when sharing fuel rates and road watches.
            </p>
          </div>
          <div className={"flex flex-col items-center justify-center my-2 p-4 rounded-xl bg-surface-container-low shadow-sm"}>
            <div className={"relative group cursor-pointer"} id={"avatar-container"}>
              <div className={"w-24 h-24 rounded-full p-1 bg-gradient-to-tr from-primary via-secondary-container to-tertiary-fixed shadow-md flex items-center justify-center"}>
                <div className={"w-full h-full rounded-full bg-surface-container-lowest flex flex-col items-center justify-center overflow-hidden relative"}>
                  <span className={"material-symbols-outlined text-4xl text-on-surface-variant/40 select-none"}>
                    person
                  </span>
                  <div className={"absolute inset-0 bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity"} />
                </div>
              </div>
              <div className={"absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-primary text-on-primary flex items-center justify-center shadow-md active:scale-90 transition-transform"}>
                <span className={"material-symbols-outlined text-[17px]"}>
                  photo_camera
                </span>
              </div>
            </div>
            <div className={"mt-2.5 text-center"}>
              <span className={"font-label-lg text-label-lg font-bold text-on-surface block"}>
                Add photo (Optional)
              </span>
              <span className={"font-body-sm text-body-sm text-primary font-semibold flex items-center justify-center gap-1 mt-0.5"}>
                <span className={"material-symbols-outlined text-[14px]"}>
                  touch_app
                </span>
                Tap to upload
              </span>
            </div>
          </div>
          <div className={"flex flex-col gap-4 mt-2"}>
            <div className={"flex flex-col gap-1.5"}>
              <div className={"flex items-center justify-between"}>
                <label className={"font-label-lg text-label-lg font-bold text-on-surface"} htmlFor={"first-name-input"}>
                  First Name
                </label>
                <span className={"font-label-sm text-label-sm text-on-surface-variant font-medium"}>
                  Required
                </span>
              </div>
              <div className={"relative flex items-center"}>
                <div className={"absolute left-3.5 flex items-center pointer-events-none text-on-surface-variant"}>
                  <span className={"material-symbols-outlined text-lg"}>
                    badge
                  </span>
                </div>
                <input className={"w-full h-12 pl-11 pr-4 bg-surface-container-lowest text-on-surface rounded-xl font-body-lg text-body-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-primary transition-all"} id={"first-name-input"} placeholder={"e.g. Andre"} type={"text"} defaultValue={""} />
              </div>
            </div>
            <div className={"flex flex-col gap-1.5"}>
              <div className={"flex items-center justify-between"}>
                <label className={"font-label-lg text-label-lg font-bold text-on-surface"} htmlFor={"display-name-input"}>
                  Display Name
                </label>
                <div className={"flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-label-sm text-label-sm font-semibold"}>
                  <span className={"material-symbols-outlined text-[13px]"}>
                    check_circle
                  </span>
                  <span>
                    Available
                  </span>
                </div>
              </div>
              <p className={"font-body-sm text-body-sm text-on-surface-variant"}>
                Shown on your map pins, speed alerts, and verified fuel price updates.
              </p>
              <div className={"relative flex items-center"}>
                <div className={"absolute left-3.5 flex items-center pointer-events-none text-on-surface-variant"}>
                  <span className={"material-symbols-outlined text-lg"}>
                    alternate_email
                  </span>
                </div>
                <input className={"w-full h-12 pl-11 pr-11 bg-surface-container-lowest text-on-surface rounded-xl font-body-lg text-body-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-primary transition-all"} id={"display-name-input"} placeholder={"e.g. "} type={"text"} defaultValue={""} />
                <div className={"absolute right-3.5 flex items-center pointer-events-none text-emerald-600"}>
                  <span className={"material-symbols-outlined text-xl"}>
                    check
                  </span>
                </div>
              </div>
            </div>
            <div className={"flex flex-col gap-1.5"}>
              <div className={"flex items-center justify-between"}>
                <label className={"font-label-lg text-label-lg font-bold text-on-surface"} htmlFor={"parish-select-btn"}>
                  Home Parish
                </label>
                <span className={"px-2 py-0.5 rounded-full bg-surface-container-highest text-on-surface-variant font-label-sm text-label-sm font-bold"}>
                  14 Parishes
                </span>
              </div>
              <p className={"font-body-sm text-body-sm text-on-surface-variant"}>
                Used to prioritize local gas station rates, Petrojam updates, and parish road alerts.
              </p>
              <button onClick={onPlugClick} className={"w-full h-12 px-3.5 bg-surface-container-lowest text-on-surface rounded-xl shadow-sm flex items-center justify-between active:scale-[0.99] transition-all focus:outline-none focus:ring-2 focus:ring-primary"} id={"parish-select-btn"} type={"button"} data-act={"parish-select-btn"}>
                <div className={"flex items-center gap-2.5"}>
                  <span className={"material-symbols-outlined text-primary text-xl"}>
                    location_on
                  </span>
                  <span className={"font-body-lg text-body-lg font-semibold text-on-surface"} id={"selected-parish-name"}>
                    St. Catherine
                  </span>
                  <span className={"px-2 py-0.5 rounded bg-surface-container text-on-surface-variant font-label-sm text-label-sm"}>
                    Primary Route
                  </span>
                </div>
                <span className={"material-symbols-outlined text-on-surface-variant transition-transform duration-200"} id={"parish-chevron"}>
                  expand_more
                </span>
              </button>
              <div className={"hidden flex-col gap-2 mt-2 p-3 bg-surface-container-lowest rounded-xl shadow-md"} id={"parish-menu"}>
                <div className={"flex items-center justify-between pb-2"}>
                  <span className={"font-label-md text-label-md font-bold text-on-surface"}>
                    Select your base parish:
                  </span>
                  <span className={"font-label-sm text-label-sm text-primary font-bold"}>
                    Auto-detects GPS
                  </span>
                </div>
                <div className={"grid grid-cols-2 gap-1.5 max-h-48 overflow-y-auto pr-1"}>
                  <button onClick={onPlugClick} className={"text-left px-3 py-2 rounded-lg font-body-sm text-body-sm hover:bg-surface-container text-on-surface"} type={"button"} data-act={"kingston"}>
                    Kingston
                  </button>
                  <button onClick={onPlugClick} className={"text-left px-3 py-2 rounded-lg font-body-sm text-body-sm hover:bg-surface-container text-on-surface"} type={"button"} data-act={"st-andrew"}>
                    St. Andrew
                  </button>
                  <button onClick={onPlugClick} className={"text-left px-3 py-2 rounded-lg font-body-sm text-body-sm hover:bg-surface-container text-on-surface"} type={"button"} data-act={"st-thomas"}>
                    St. Thomas
                  </button>
                  <button onClick={onPlugClick} className={"text-left px-3 py-2 rounded-lg font-body-sm text-body-sm hover:bg-surface-container text-on-surface"} type={"button"} data-act={"portland"}>
                    Portland
                  </button>
                  <button onClick={onPlugClick} className={"text-left px-3 py-2 rounded-lg font-body-sm text-body-sm hover:bg-surface-container text-on-surface"} type={"button"} data-act={"st-mary"}>
                    St. Mary
                  </button>
                  <button onClick={onPlugClick} className={"text-left px-3 py-2 rounded-lg font-body-sm text-body-sm hover:bg-surface-container text-on-surface"} type={"button"} data-act={"st-ann"}>
                    St. Ann
                  </button>
                  <button onClick={onPlugClick} className={"text-left px-3 py-2 rounded-lg font-body-sm text-body-sm hover:bg-surface-container text-on-surface"} type={"button"} data-act={"trelawny"}>
                    Trelawny
                  </button>
                  <button onClick={onPlugClick} className={"text-left px-3 py-2 rounded-lg font-body-sm text-body-sm hover:bg-surface-container text-on-surface"} type={"button"} data-act={"st-james"}>
                    St. James
                  </button>
                  <button onClick={onPlugClick} className={"text-left px-3 py-2 rounded-lg font-body-sm text-body-sm hover:bg-surface-container text-on-surface"} type={"button"} data-act={"hanover"}>
                    Hanover
                  </button>
                  <button onClick={onPlugClick} className={"text-left px-3 py-2 rounded-lg font-body-sm text-body-sm hover:bg-surface-container text-on-surface"} type={"button"} data-act={"westmoreland"}>
                    Westmoreland
                  </button>
                  <button onClick={onPlugClick} className={"text-left px-3 py-2 rounded-lg font-body-sm text-body-sm hover:bg-surface-container text-on-surface"} type={"button"} data-act={"st-elizabeth"}>
                    St. Elizabeth
                  </button>
                  <button onClick={onPlugClick} className={"text-left px-3 py-2 rounded-lg font-body-sm text-body-sm hover:bg-surface-container text-on-surface"} type={"button"} data-act={"manchester"}>
                    Manchester
                  </button>
                  <button onClick={onPlugClick} className={"text-left px-3 py-2 rounded-lg font-body-sm text-body-sm hover:bg-surface-container text-on-surface"} type={"button"} data-act={"clarendon"}>
                    Clarendon
                  </button>
                  <button onClick={onPlugClick} className={"text-left px-3 py-2 rounded-lg font-body-sm text-body-sm font-bold bg-primary-fixed text-on-primary-fixed"} type={"button"} data-act={"st-catherine"} data-way-out={"primary"}>
                    St. Catherine ✓
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div className={"mt-5 p-3.5 rounded-xl bg-surface-container-high flex items-start gap-3"}>
            <div className={"w-8 h-8 rounded-lg bg-tertiary-fixed text-on-tertiary-fixed flex items-center justify-center shrink-0 mt-0.5"}>
              <span className={"material-symbols-outlined text-lg"}>
                local_taxi
              </span>
            </div>
            <div className={"flex-1"}>
              <h2 className={"font-headline-sm text-headline-sm text-on-surface"}>
                Island Driver Perks
              </h2>
              <p className={"font-body-sm text-body-sm text-on-surface-variant mt-0.5"}>
                {"Contribute to live E-10 87, E-10 90 & ULSD price pins to unlock parish toll badges & fuel discount partner perks."}
              </p>
            </div>
          </div>
          <div className={"flex items-center gap-2.5 mt-5 px-1 py-1 text-on-surface-variant"}>
            <span className={"material-symbols-outlined text-primary shrink-0 text-lg"}>
              verified_user
            </span>
            <p className={"font-body-sm text-body-sm leading-tight text-on-surface-variant"}>
              Your phone number stays strictly private. Only your
              <span className={"font-bold text-on-surface"}>
                Display Name
              </span>
              is seen on community fuel pins.
            </p>
          </div>
          <div className={"mt-6 mb-2"}>
            <button onClick={onPlugClick} className={"w-full h-14 rounded-xl bg-primary text-on-primary font-headline-sm text-headline-sm font-bold flex items-center justify-center gap-2 shadow-lg hover:bg-primary-container active:scale-[0.98] transition-all"} id={"submit-btn"} type={"button"} data-act={"submit-btn"} data-way-out={"primary"}>
              <span>
                Complete Setup
              </span>
              <span className={"material-symbols-outlined text-xl"}>
                arrow_forward
              </span>
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
