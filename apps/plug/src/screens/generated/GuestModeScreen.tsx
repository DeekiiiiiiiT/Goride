import { useEffect, useRef } from 'react';
import { onPlugClick } from '../../shell/actions';
import { bindScreen } from '../../shell/bind';


export function GuestModeScreen() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (ref.current) bindScreen("16-guest-mode.html", ref.current); }, []);
  return (
    <div ref={ref} data-plug-screen={"16-guest-mode.html"} className={"bg-surface font-body-md text-on-surface flex flex-col min-h-screen"}>
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
        <div className={"flex flex-col w-full relative"}>
          <section className={"px-space-md pt-space-sm pb-space-xs flex flex-col gap-space-sm z-30"}>
            <div className={"flex items-center justify-between gap-space-sm"}>
              <button onClick={onPlugClick} aria-label={"Change current location"} className={"flex items-center gap-1.5 bg-surface-container px-3 py-1.5 rounded-full shadow-sm active:scale-95 transition-transform text-left"} type={"button"} data-act={"half-way-tree-st-andrew"}>
                <span className={"material-symbols-outlined text-primary text-[18px]"}>
                  location_on
                </span>
                <span className={"font-label-md text-label-md text-on-surface truncate max-w-[190px]"}>
                  Half-Way-Tree, St Andrew
                </span>
                <span className={"material-symbols-outlined text-on-surface-variant text-[16px]"}>
                  expand_more
                </span>
              </button>
              <div className={"flex items-center gap-space-xs"}>
                <div className={"flex items-center gap-1.5 bg-surface-container-low px-2.5 py-1 rounded-full shadow-sm"}>
                  <span className={"relative flex h-2 w-2"}>
                    <span className={"animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75"} />
                    <span className={"relative inline-flex rounded-full h-2 w-2 bg-emerald-600"} />
                  </span>
                  <span className={"font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant font-bold"}>
                    Live Plugs
                  </span>
                </div>
                <button onClick={onPlugClick} aria-label={"Sign in to Roam Plug"} className={"flex items-center gap-1 bg-primary-fixed text-on-primary-fixed font-label-md text-label-md px-2.5 py-1 rounded-full active:scale-95 transition-transform"} type={"button"} data-act={"sign-in"} data-way-out={"primary"}>
                  <span className={"material-symbols-outlined text-[16px]"}>
                    lock_open
                  </span>
                  <span>
                    Sign In
                  </span>
                </button>
              </div>
            </div>
            <div className={"relative flex items-center"}>
              <div className={"absolute left-3.5 flex items-center pointer-events-none text-on-surface-variant"}>
                <span className={"material-symbols-outlined text-[20px]"}>
                  search
                </span>
              </div>
              <input onClick={onPlugClick} className={"w-full h-12 pl-10 pr-12 rounded-xl bg-surface-container-lowest text-on-surface font-body-md text-body-md placeholder:text-on-surface-variant/70 shadow-sm focus:outline-none"} placeholder={"Search stations, parts stores, mechanics..."} type={"text"} data-act={"input"} />
              <button onClick={onPlugClick} aria-label={"Filter results"} className={"absolute right-2 w-8 h-8 rounded-lg bg-surface-container flex items-center justify-center text-on-surface-variant active:bg-surface-container-high transition-colors"} type={"button"} data-act={"tune"}>
                <span className={"material-symbols-outlined text-[18px]"}>
                  tune
                </span>
              </button>
            </div>
          </section>
          <section className={"w-full overflow-x-auto no-scrollbar py-space-xs px-space-md z-30"}>
            <div className={"flex items-center gap-2 min-w-max"}>
              <button onClick={onPlugClick} className={"flex items-center gap-1.5 h-9 px-3.5 rounded-full bg-primary text-on-primary font-label-md text-label-md shadow-sm active:scale-95 transition-transform"} type={"button"} data-act={"fuel-e-10-ulsd"} data-way-out={"primary"}>
                <span className={"text-base leading-none"}>
                  ⛽
                </span>
                <span>
                  Fuel (E-10/ULSD)
                </span>
              </button>
              <button onClick={onPlugClick} className={"flex items-center gap-1.5 h-9 px-3.5 rounded-full bg-surface-container text-on-surface-variant font-label-md text-label-md shadow-sm active:scale-95 transition-transform"} type={"button"} data-act={"mechanics"}>
                <span className={"text-base leading-none"}>
                  🔧
                </span>
                <span>
                  Mechanics
                </span>
              </button>
              <button onClick={onPlugClick} className={"flex items-center gap-1.5 h-9 px-3.5 rounded-full bg-surface-container text-on-surface-variant font-label-md text-label-md shadow-sm active:scale-95 transition-transform"} type={"button"} data-act={"parts-stores"}>
                <span className={"text-base leading-none"}>
                  ⚙️
                </span>
                <span>
                  Parts Stores
                </span>
              </button>
              <button onClick={onPlugClick} className={"flex items-center gap-1.5 h-9 px-3.5 rounded-full bg-surface-container text-on-surface-variant font-label-md text-label-md shadow-sm active:scale-95 transition-transform"} type={"button"} data-act={"air-pump"}>
                <span className={"text-base leading-none"}>
                  🛞
                </span>
                <span>
                  Air Pump
                </span>
              </button>
              <button onClick={onPlugClick} className={"flex items-center gap-1.5 h-9 px-3.5 rounded-full bg-surface-container text-on-surface-variant font-label-md text-label-md shadow-sm active:scale-95 transition-transform"} type={"button"} data-act={"restrooms"}>
                <span className={"text-base leading-none"}>
                  🚻
                </span>
                <span>
                  Restrooms
                </span>
              </button>
              <button onClick={onPlugClick} className={"flex items-center gap-1.5 h-9 px-3.5 rounded-full bg-surface-container text-on-surface-variant font-label-md text-label-md shadow-sm active:scale-95 transition-transform"} type={"button"} data-act={"car-wash"}>
                <span className={"text-base leading-none"}>
                  🚿
                </span>
                <span>
                  Car Wash
                </span>
              </button>
              <button onClick={onPlugClick} className={"flex items-center gap-1.5 h-9 px-3.5 rounded-full bg-surface-container text-on-surface-variant font-label-md text-label-md shadow-sm active:scale-95 transition-transform"} type={"button"} data-act={"ev-charge"}>
                <span className={"text-base leading-none"}>
                  🔌
                </span>
                <span>
                  EV Charge
                </span>
              </button>
            </div>
          </section>
          <section className={"relative w-full h-[330px] overflow-hidden bg-surface-container-high my-space-xs"}>
            <div className={"w-full h-full bg-cover bg-center"} data-location={"Half-Way-Tree Clock Tower, Kingston, Jamaica"} style={{ backgroundImage: "url('https://lh3.googleusercontent.com/aida-public/AB6AXuBHwwz2hF8SYQMOre2ARUUEoQrj7KHpAOWIXTNRhIsjWinHO7y-HMemiuEVdbGLT01ElXQGi32BQMbqvpHPgcOlULJ-_mSqMaU2hDW7dmsftlnVi1PnIxzzq27JH_XczNoWtC6o9Yd3BM003-RemRBhid4R934VcL5XQsfewcvvw5dnYZUNgVHF3HjbuBCzWqrqXh3ORQ6KvcH1WaOORV3AWh_rgN9uP-_yDLtm_t1mqkcT9bVrj-rq')" }} />
            <div className={"absolute inset-0 bg-gradient-to-b from-surface/60 via-transparent to-surface/90 pointer-events-none"} />
            <div className={"absolute top-4 left-6 pointer-events-none"}>
              <span className={"px-2 py-0.5 rounded bg-surface/90 text-on-surface-variant font-label-sm text-[9px] font-bold tracking-wider shadow-sm uppercase"}>
                Hope Rd
              </span>
            </div>
            <div className={"absolute top-12 right-8 pointer-events-none"}>
              <span className={"px-2 py-0.5 rounded bg-surface/90 text-on-surface-variant font-label-sm text-[9px] font-bold tracking-wider shadow-sm uppercase"}>
                Constant Spring Rd
              </span>
            </div>
            <div className={"absolute bottom-16 left-12 pointer-events-none"}>
              <span className={"px-2 py-0.5 rounded bg-surface/90 text-on-surface-variant font-label-sm text-[9px] font-bold tracking-wider shadow-sm uppercase"}>
                HWT Roundabout
              </span>
            </div>
            <div className={"absolute top-16 left-1/4 -translate-x-1/2 flex flex-col items-center cursor-pointer group active:scale-95 transition-transform"}>
              <div className={"flex items-center gap-1 bg-tertiary-container text-on-tertiary-container px-2.5 py-1 rounded-full shadow-lg animate-bounce"}>
                <span className={"material-symbols-outlined text-[14px] text-tertiary-fixed"}>
                  star
                </span>
                <span className={"font-headline-sm text-label-md font-bold tracking-tight"}>
                  J$208.20
                </span>
              </div>
              <div className={"bg-surface-container-lowest px-2 py-0.5 rounded-md shadow-sm text-on-surface font-label-sm text-[10px] font-bold mt-0.5"}>
                Fesco Beechwood
              </div>
              <div className={"w-2 h-2 bg-tertiary-container rotate-45 -mt-1 shadow-sm"} />
            </div>
            <div className={"absolute top-28 right-12 flex flex-col items-center cursor-pointer group active:scale-95 transition-transform"}>
              <div className={"flex items-center gap-1 bg-surface-container-lowest text-on-surface px-2 py-1 rounded-full shadow-md"}>
                <span className={"font-label-md text-label-md font-bold"}>
                  J$209.50
                </span>
              </div>
              <div className={"bg-surface-container-lowest px-1.5 py-0.5 rounded shadow-sm text-on-surface-variant font-label-sm text-[9px] mt-0.5"}>
                Cool Oasis
              </div>
              <div className={"w-1.5 h-1.5 bg-surface-container-lowest rotate-45 -mt-1"} />
            </div>
            <div className={"absolute bottom-20 left-1/3 flex flex-col items-center cursor-pointer group active:scale-95 transition-transform"}>
              <div className={"flex items-center gap-1 bg-surface-container-lowest text-on-surface px-2 py-1 rounded-full shadow-md"}>
                <span className={"font-label-md text-label-md font-bold"}>
                  J$214.50
                </span>
              </div>
              <div className={"bg-surface-container-lowest px-1.5 py-0.5 rounded shadow-sm text-on-surface-variant font-label-sm text-[9px] mt-0.5"}>
                Texaco
              </div>
              <div className={"w-1.5 h-1.5 bg-surface-container-lowest rotate-45 -mt-1"} />
            </div>
            <div className={"absolute top-8 right-1/3 flex items-center justify-center w-7 h-7 rounded-full bg-secondary text-on-secondary shadow-md cursor-pointer"}>
              <span className={"material-symbols-outlined text-[16px]"}>
                build
              </span>
            </div>
            <div className={"absolute bottom-24 right-20 flex items-center justify-center w-7 h-7 rounded-full bg-surface-container-highest text-on-surface shadow-md cursor-pointer"}>
              <span className={"material-symbols-outlined text-[16px]"}>
                air
              </span>
            </div>
            <div className={"absolute bottom-4 right-4 flex flex-col gap-2 z-20"}>
              <button onClick={onPlugClick} aria-label={"Recenter Map"} className={"w-10 h-10 rounded-full bg-surface-container-lowest text-on-surface shadow-md flex items-center justify-center active:bg-surface-container transition-colors"} type={"button"} data-act={"my-location"}>
                <span className={"material-symbols-outlined text-[20px]"}>
                  my_location
                </span>
              </button>
              <button onClick={onPlugClick} aria-label={"Toggle Satellite / Traffic"} className={"w-10 h-10 rounded-full bg-surface-container-lowest text-on-surface shadow-md flex items-center justify-center active:bg-surface-container transition-colors"} type={"button"} data-act={"layers"}>
                <span className={"material-symbols-outlined text-[20px]"}>
                  layers
                </span>
              </button>
            </div>
          </section>
          <section className={"flex flex-col gap-space-md px-space-md -mt-4 relative z-30 bg-surface rounded-t-3xl pt-3 pb-8 shadow-xl"}>
            <div className={"w-12 h-1.5 rounded-full bg-surface-container-highest mx-auto"} />
            <div className={"relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary-container via-secondary to-primary p-space-md text-on-primary shadow-md"}>
              <div className={"absolute -right-6 -bottom-6 w-32 h-32 rounded-full bg-tertiary-fixed/20 pointer-events-none blur-xl"} />
              <div className={"relative z-10 flex flex-col gap-2"}>
                <div className={"flex items-center justify-between"}>
                  <span className={"inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-on-primary/20 backdrop-blur-sm font-label-sm text-label-sm uppercase tracking-wider text-on-primary font-bold"}>
                    <span className={"material-symbols-outlined text-[14px]"}>
                      stars
                    </span>
                    Driver Co-Pilot
                  </span>
                  <span className={"font-label-sm text-label-sm text-primary-fixed"}>
                    Guest Mode
                  </span>
                </div>
                <h2 className={"font-headline-sm text-headline-sm text-on-primary font-bold leading-snug"}>
                  Track your car's maintenance for free
                </h2>
                <p className={"font-body-md text-body-md text-primary-fixed font-normal leading-relaxed"}>
                  {"Log fuel stops, get Jamaican fitness & oil change reminders, and never miss statutory road service."}
                </p>
                <div className={"pt-2 flex items-center gap-3"}>
                  <button onClick={onPlugClick} className={"h-11 px-5 rounded-xl bg-surface-container-lowest text-primary font-label-lg text-label-lg font-bold shadow-md active:scale-95 transition-transform flex items-center gap-2"} type={"button"} data-act={"create-free-account"}>
                    <span>
                      Create free account
                    </span>
                    <span className={"material-symbols-outlined text-[18px]"}>
                      arrow_forward
                    </span>
                  </button>
                  <button onClick={onPlugClick} className={"font-label-md text-label-md text-primary-fixed underline decoration-primary-fixed/60 font-semibold py-2"} type={"button"} data-act={"sign-in-2"}>
                    Sign In
                  </button>
                </div>
              </div>
            </div>
            <div className={"flex items-center justify-between pt-1"}>
              <div className={"flex items-center gap-2"}>
                <span className={"flex h-2.5 w-2.5 rounded-full bg-tertiary-container"} />
                <h3 className={"font-headline-sm text-headline-sm text-on-surface font-bold"}>
                  Cheapest E-10 87 Near You
                </h3>
              </div>
              <span className={"font-label-md text-label-md text-secondary font-bold"}>
                St Andrew Hub
              </span>
            </div>
            <article className={"flex flex-col bg-surface-container-lowest rounded-2xl p-space-md shadow-sm gap-space-sm relative overflow-hidden"}>
              <div className={"absolute top-0 right-0 bg-tertiary-fixed text-on-tertiary-fixed px-3 py-1 rounded-bl-xl font-label-sm text-label-sm font-bold flex items-center gap-1 shadow-sm"}>
                <span className={"material-symbols-outlined text-[14px]"}>
                  local_fire_department
                </span>
                <span>
                  Cheapest E-10
                </span>
              </div>
              <div className={"flex items-start gap-3 pr-24"}>
                <div className={"w-12 h-12 rounded-xl bg-primary-fixed flex items-center justify-center text-on-primary-fixed font-headline-sm text-headline-sm font-bold shadow-inner flex-shrink-0"}>
                  F
                </div>
                <div className={"flex flex-col min-w-0"}>
                  <div className={"flex items-center gap-1.5"}>
                    <h4 className={"font-headline-sm text-headline-sm text-on-surface font-bold truncate"}>
                      Fesco Beechwood
                    </h4>
                    <span className={"material-symbols-outlined text-emerald-600 text-[18px]"} title={"Community Verified"}>
                      verified
                    </span>
                  </div>
                  <span className={"font-body-sm text-body-sm text-on-surface-variant"}>
                    Beechwood Ave, Kingston 5 • 0.8 km
                  </span>
                </div>
              </div>
              <div className={"flex items-end justify-between bg-surface-container-low p-3 rounded-xl"}>
                <div className={"flex flex-col"}>
                  <span className={"font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant font-bold"}>
                    E-10 87 Octane
                  </span>
                  <div className={"flex items-baseline gap-1 mt-0.5"}>
                    <span className={"font-price-display text-price-display text-on-surface font-black"}>
                      J$208.20
                    </span>
                    <span className={"font-label-sm text-label-sm text-on-surface-variant"}>
                      / Litre
                    </span>
                  </div>
                </div>
                <div className={"flex items-center gap-1 text-on-surface-variant font-body-sm text-body-sm"}>
                  <span className={"material-symbols-outlined text-[16px] text-emerald-600"}>
                    check_circle
                  </span>
                  <span>
                    Verified 22m ago by Andre B.
                  </span>
                </div>
              </div>
              <div className={"grid grid-cols-2 gap-2.5 pt-1"}>
                <button onClick={onPlugClick} className={"h-12 rounded-xl bg-primary text-on-primary font-label-lg text-label-lg font-bold flex items-center justify-center gap-2 shadow-sm active:bg-secondary-container transition-colors"} type={"button"} data-act={"drive-now-3m"} data-way-out={"primary"}>
                  <span className={"material-symbols-outlined text-[20px]"}>
                    directions
                  </span>
                  <span>
                    Drive Now (3m)
                  </span>
                </button>
                <button onClick={onPlugClick} className={"h-12 rounded-xl bg-surface-container text-on-surface-variant font-label-lg text-label-lg font-semibold flex items-center justify-center gap-1.5 active:bg-surface-container-high transition-colors"} type={"button"} data-act={"sign-in-to-log"}>
                  <span className={"material-symbols-outlined text-[18px]"}>
                    lock
                  </span>
                  <span>
                    Sign in to log
                  </span>
                </button>
              </div>
            </article>
            <div className={"flex items-center justify-between pt-2"}>
              <h3 className={"font-headline-sm text-headline-sm text-on-surface font-bold"}>
                Other Gas Plugs Nearby
              </h3>
              <span className={"font-label-md text-label-md text-on-surface-variant"}>
                Updated in real-time
              </span>
            </div>
            <article className={"flex flex-col bg-surface-container-lowest rounded-2xl p-space-md shadow-sm gap-2 active:bg-surface-container-low transition-colors cursor-pointer"}>
              <div className={"flex items-start justify-between"}>
                <div className={"flex items-start gap-3"}>
                  <div className={"w-10 h-10 rounded-xl bg-surface-container-highest flex items-center justify-center text-primary font-headline-sm text-headline-sm font-bold flex-shrink-0"}>
                    C
                  </div>
                  <div className={"flex flex-col"}>
                    <h4 className={"font-headline-sm text-label-lg text-on-surface font-bold"}>
                      Cool Oasis • Kingsway
                    </h4>
                    <div className={"flex items-center gap-2 mt-0.5"}>
                      <span className={"font-body-sm text-body-sm text-on-surface-variant"}>
                        1.4 km away
                      </span>
                      <span className={"text-on-surface-variant text-[10px]"}>
                        •
                      </span>
                      <span className={"font-label-sm text-label-sm text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded"}>
                        Free Air
                      </span>
                      <span className={"font-label-sm text-label-sm text-on-surface-variant"}>
                        24/7
                      </span>
                    </div>
                  </div>
                </div>
                <div className={"flex flex-col items-end"}>
                  <span className={"font-headline-sm text-label-lg font-bold text-on-surface"}>
                    J$209.50
                  </span>
                  <span className={"font-label-sm text-label-sm text-on-surface-variant"}>
                    E-10 87
                  </span>
                </div>
              </div>
            </article>
            <article className={"flex flex-col bg-surface-container-lowest rounded-2xl p-space-md shadow-sm gap-2 active:bg-surface-container-low transition-colors cursor-pointer"}>
              <div className={"flex items-start justify-between"}>
                <div className={"flex items-start gap-3"}>
                  <div className={"w-10 h-10 rounded-xl bg-error-container flex items-center justify-center text-error font-headline-sm text-headline-sm font-bold flex-shrink-0"}>
                    T
                  </div>
                  <div className={"flex flex-col"}>
                    <h4 className={"font-headline-sm text-label-lg text-on-surface font-bold"}>
                      Texaco • Clock Tower Roundabout
                    </h4>
                    <div className={"flex items-center gap-2 mt-0.5"}>
                      <span className={"font-body-sm text-body-sm text-on-surface-variant"}>
                        0.4 km away
                      </span>
                      <span className={"text-on-surface-variant text-[10px]"}>
                        •
                      </span>
                      <span className={"font-label-sm text-label-sm text-on-surface-variant bg-surface-container px-2 py-0.5 rounded"}>
                        ATM
                      </span>
                      <span className={"font-label-sm text-label-sm text-on-surface-variant"}>
                        Restrooms
                      </span>
                    </div>
                  </div>
                </div>
                <div className={"flex flex-col items-end"}>
                  <span className={"font-headline-sm text-label-lg font-bold text-on-surface"}>
                    J$214.50
                  </span>
                  <span className={"font-label-sm text-label-sm text-on-surface-variant"}>
                    E-10 87
                  </span>
                </div>
              </div>
            </article>
            <div className={"flex items-center gap-3 bg-surface-container p-space-md rounded-2xl text-on-surface-variant"}>
              <span className={"material-symbols-outlined text-primary text-[24px]"}>
                lightbulb
              </span>
              <p className={"font-body-sm text-body-sm leading-relaxed"}>
                <strong className={"text-on-surface"}>
                  Did you know?
                </strong>
                Gas rates update every Thursday from Petrojam. Community plugs keep prices accurate island-wide!
              </p>
            </div>
          </section>
          <aside className={"fixed bottom-20 right-4 z-40"}>
            <button onClick={onPlugClick} aria-label={"Sign in to Pin Spot"} className={"flex items-center gap-2 h-12 px-4 rounded-full bg-primary text-on-primary shadow-xl active:scale-95 transition-transform"} type={"button"} data-act={"map-spot"} data-way-out={"primary"}>
              <span className={"material-symbols-outlined text-[20px]"}>
                add_location_alt
              </span>
              <span className={"font-label-lg text-label-lg font-bold tracking-tight"}>
                + MAP SPOT
              </span>
              <span className={"w-5 h-5 rounded-full bg-on-primary/20 flex items-center justify-center"}>
                <span className={"material-symbols-outlined text-[13px] text-on-primary"}>
                  lock
                </span>
              </span>
            </button>
          </aside>
          <dialog className={"fixed inset-0 w-full h-full bg-inverse-surface/60 backdrop-blur-sm z-50 p-space-md m-0 border-0 flex items-end justify-center opacity-0 pointer-events-none transition-opacity duration-200"} id={"guest-conversion-modal"}>
            <div className={"w-full max-w-sm bg-surface-container-lowest rounded-3xl p-space-lg flex flex-col gap-space-md shadow-2xl relative"}>
              <button onClick={onPlugClick} aria-label={"Close dialog"} className={"absolute top-4 right-4 w-9 h-9 rounded-full bg-surface-container flex items-center justify-center text-on-surface-variant"} type={"button"} data-act={"close"} data-way-out={"back"}>
                <span className={"material-symbols-outlined text-[20px]"}>
                  close
                </span>
              </button>
              <div className={"w-12 h-12 rounded-2xl bg-primary-fixed flex items-center justify-center text-primary"}>
                <span className={"material-symbols-outlined text-[26px]"}>
                  car_repair
                </span>
              </div>
              <div className={"flex flex-col gap-1"}>
                <h3 className={"font-headline-md text-headline-md text-on-surface font-extrabold"}>
                  Join Roam Plug Jamaica
                </h3>
                <p className={"font-body-md text-body-md text-on-surface-variant leading-relaxed"}>
                  Create an account to pin price updates, unlock Jamaican fitness reminders, and customize your vehicle garage.
                </p>
              </div>
              <div className={"flex flex-col gap-2.5 pt-2"}>
                <button onClick={onPlugClick} className={"w-full h-12 rounded-xl bg-primary text-on-primary font-label-lg text-label-lg font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform shadow-md"} type={"button"} data-act={"sign-up-with-phone"} data-way-out={"primary"}>
                  <span className={"material-symbols-outlined text-[20px]"}>
                    person_add
                  </span>
                  <span>
                    Sign Up with Phone
                  </span>
                </button>
                <button onClick={onPlugClick} className={"w-full h-12 rounded-xl bg-surface-container text-on-surface font-label-lg text-label-lg font-semibold flex items-center justify-center gap-2 active:bg-surface-container-high transition-colors"} type={"button"} data-act={"continue-with-google"} data-way-out={"primary"}>
                  <span>
                    Continue with Google
                  </span>
                </button>
              </div>
              <p className={"font-label-sm text-label-sm text-center text-on-surface-variant/80"}>
                By continuing you support the Jamaican motoring community.
              </p>
            </div>
          </dialog>
        </div>
      </main>
    </div>
  );
}
