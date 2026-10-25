import { useEffect, useRef } from 'react';
import { onPlugClick } from '../../shell/actions';
import { bindScreen } from '../../shell/bind';


export function MechanicScreen() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (ref.current) bindScreen("21-mechanic.html", ref.current); }, []);
  return (
    <div ref={ref} data-plug-screen={"21-mechanic.html"} className={"min-h-full bg-surface text-on-surface antialiased flex flex-col font-body-md text-body-md"}>
      <header className={"fixed top-0 inset-x-0 z-50 bg-surface/85 backdrop-blur-xl shadow-[0_1px_8px_rgba(0,0,0,0.04)] pt-safe"}>
        <div className={"h-16 px-gutter-sm flex items-center justify-between gap-space-sm"}>
          <div className={"flex items-center min-w-0"}>
            <button onClick={onPlugClick} aria-label={"Go back"} className={"min-w-[48px] min-h-[48px] rounded-full flex items-center justify-center text-on-surface hover:text-primary active:bg-surface-container transition-colors"} data-act={"arrow-back"} data-way-out={"back"}>
              <span className={"material-symbols-outlined text-[24px]"}>
                arrow_back
              </span>
            </button>
            <h1 className={"font-headline-sm text-headline-sm text-on-surface truncate ml-1"}>
              Station Details
            </h1>
          </div>
          <div className={"flex items-center gap-space-xs"}>
            <button onClick={onPlugClick} aria-label={"Share location"} className={"min-w-[48px] min-h-[48px] rounded-full flex items-center justify-center text-on-surface-variant hover:text-primary active:bg-surface-container transition-colors"} data-act={"share"}>
              <span className={"material-symbols-outlined text-[22px]"}>
                share
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
      <main className={"flex-1 w-full bg-surface pt-16 pb-28"}>
        <div className={"flex flex-col w-full pb-6"}>
          <div className={"relative w-full h-56 bg-surface-container-high overflow-hidden shadow-sm"}>
            <div className={"w-full h-full bg-surface-container flex items-center justify-center text-primary"} aria-hidden={"true"}><span className={"material-symbols-outlined text-[32px]"}>image</span></div>
            <div className={"absolute inset-0 bg-gradient-to-t from-on-background/80 via-on-background/30 to-transparent"} />
            <div className={"absolute bottom-3 left-4 right-4 flex items-center justify-between gap-2"}>
              <div className={"flex items-center gap-1.5 bg-surface-container-lowest/95 backdrop-blur-md px-2.5 py-1 rounded-full shadow-sm"}>
                <span className={"w-2.5 h-2.5 rounded-full bg-emerald-600 animate-pulse"} />
                <span className={"font-label-md text-label-md text-on-surface font-bold tracking-tight"}>
                  Open Now
                </span>
                <span className={"text-on-surface-variant text-label-sm"}>
                  • Until 6:00 PM
                </span>
              </div>
              <div className={"flex items-center gap-1 bg-primary px-2.5 py-1 rounded-full text-on-primary shadow-sm"}>
                <span className={"material-symbols-outlined text-[16px]"} style={{ fontVariationSettings: "'FILL' 1" }}>
                  verified
                </span>
                <span className={"font-label-sm text-label-sm uppercase tracking-wider font-bold"}>
                  Roam Verified
                </span>
              </div>
            </div>
          </div>
          <div className={"px-margin flex flex-col gap-5 mt-4"}>
            <div className={"bg-surface-container-lowest rounded-xl p-4 shadow-sm flex flex-col gap-3"}>
              <div className={"flex items-start justify-between gap-2"}>
                <div className={"flex-1 min-w-0"}>
                  <div className={"flex items-center gap-1.5 text-secondary font-label-md text-label-md font-bold uppercase tracking-wider mb-0.5"}>
                    <span className={"material-symbols-outlined text-[16px]"}>
                      build_circle
                    </span>
                    <span>
                      Independent Specialist
                    </span>
                  </div>
                  <h1 className={"font-headline-md text-headline-md text-on-surface leading-tight"}>
                    
                  </h1>
                  <p className={"font-body-sm text-body-sm text-on-surface-variant flex items-center gap-1 mt-1"}>
                    <span className={"material-symbols-outlined text-[16px] text-primary"}>
                      location_on
                    </span>
                    <span>
                      14 Dunrobin Avenue, Kingston 10, St. Andrew
                    </span>
                  </p>
                </div>
              </div>
              <div className={"grid grid-cols-2 gap-2 pt-2 bg-surface-container-low p-2.5 rounded-lg text-on-surface"}>
                <div className={"flex flex-col min-w-0"}>
                  <span className={"font-label-sm text-label-sm text-on-surface-variant uppercase"}>
                    Plus Code
                  </span>
                  <span className={"font-label-md text-label-md font-bold text-on-surface truncate"}>
                    7GPH+3C Kingston
                  </span>
                </div>
                <div className={"flex flex-col min-w-0"}>
                  <span className={"font-label-sm text-label-sm text-on-surface-variant uppercase"}>
                    Operating Parish
                  </span>
                  <span className={"font-label-md text-label-md font-bold text-on-surface"}>
                    St. Andrew
                  </span>
                </div>
              </div>
              <div className={"flex items-start gap-2.5 text-on-surface-variant bg-surface rounded-lg p-2.5"}>
                <span className={"material-symbols-outlined text-[20px] text-primary shrink-0 mt-0.5"}>
                  schedule
                </span>
                <div className={"flex flex-col text-body-sm font-body-sm leading-snug"}>
                  <span className={"font-label-md text-label-md text-on-surface font-semibold"}>
                    Working Hours
                  </span>
                  <span>
                    Mon - Fri: 8:00 AM - 6:00 PM
                  </span>
                  <span>
                    Sat: 8:00 AM - 3:00 PM • Sun: Closed
                  </span>
                </div>
              </div>
              <div className={"grid grid-cols-2 gap-3 pt-1"}>
                <a onClick={onPlugClick} className={"min-h-[48px] rounded-xl bg-primary text-on-primary flex items-center justify-center gap-2 font-label-lg text-label-lg font-bold shadow-md active:bg-primary-container transition-colors"} href={"tel:+18769310855"} data-act={"call-mechanic"} data-way-out={"primary"}>
                  <span className={"material-symbols-outlined text-[20px]"} style={{ fontVariationSettings: "'FILL' 1" }}>
                    call
                  </span>
                  <span>
                    Call Mechanic
                  </span>
                </a>
                <button onClick={onPlugClick} className={"min-h-[48px] rounded-xl bg-secondary-container text-on-secondary-container flex items-center justify-center gap-2 font-label-lg text-label-lg font-bold shadow-sm active:opacity-90 transition-opacity"} id={"directionsBtn"} data-act={"directionsBtn"}>
                  <span className={"material-symbols-outlined text-[20px]"}>
                    directions
                  </span>
                  <span>
                    Directions
                  </span>
                </button>
              </div>
              <div className={"flex items-center gap-2 pt-1 px-1"}>
                <span className={"material-symbols-outlined text-[18px] text-tertiary-container"} style={{ fontVariationSettings: "'FILL' 1" }}>
                  thumb_up
                </span>
                <p className={"font-body-sm text-body-sm text-on-surface-variant"}>
                  Recommended by
                  <strong className={"text-on-surface font-semibold"}>
                    23 St. Andrew drivers
                  </strong>
                  {"& route taxi operators"}
                </p>
              </div>
            </div>
            <div className={"flex flex-col gap-2"}>
              <div className={"flex items-center justify-between"}>
                <h2 className={"font-headline-sm text-headline-sm text-on-surface"}>
                  Workshop Floor
                </h2>
                <span className={"font-label-md text-label-md text-primary font-bold"}>
                  4 Photos
                </span>
              </div>
              <div className={"flex gap-2.5 overflow-x-auto pb-1 -mx-margin px-margin no-scrollbar scroll-smooth"}>
                <div className={"flex-shrink-0 w-44 flex flex-col gap-1.5"}>
                  <div className={"w-44 h-28 rounded-xl bg-surface-container overflow-hidden shadow-sm"}>
                    <div className={"w-full h-full bg-surface-container flex items-center justify-center text-primary"} aria-hidden={"true"}><span className={"material-symbols-outlined text-[32px]"}>image</span></div>
                  </div>
                  <span className={"font-label-sm text-label-sm text-on-surface font-semibold truncate"}>
                    Lifting Bay (3 Ramps)
                  </span>
                </div>
                <div className={"flex-shrink-0 w-44 flex flex-col gap-1.5"}>
                  <div className={"w-44 h-28 rounded-xl bg-surface-container overflow-hidden shadow-sm"}>
                    <div className={"w-full h-full bg-surface-container flex items-center justify-center text-primary"} aria-hidden={"true"}><span className={"material-symbols-outlined text-[32px]"}>image</span></div>
                  </div>
                  <span className={"font-label-sm text-label-sm text-on-surface font-semibold truncate"}>
                    OBD-II Diagnostic Hub
                  </span>
                </div>
                <div className={"flex-shrink-0 w-44 flex flex-col gap-1.5"}>
                  <div className={"w-44 h-28 rounded-xl bg-surface-container overflow-hidden shadow-sm"}>
                    <div className={"w-full h-full bg-surface-container flex items-center justify-center text-primary"} aria-hidden={"true"}><span className={"material-symbols-outlined text-[32px]"}>image</span></div>
                  </div>
                  <span className={"font-label-sm text-label-sm text-on-surface font-semibold truncate"}>
                    {"Brake & Rotor Lathe"}
                  </span>
                </div>
                <div className={"flex-shrink-0 w-44 flex flex-col gap-1.5"}>
                  <div className={"w-44 h-28 rounded-xl bg-surface-container overflow-hidden shadow-sm"}>
                    <div className={"w-full h-full bg-surface-container flex items-center justify-center text-primary"} aria-hidden={"true"}><span className={"material-symbols-outlined text-[32px]"}>image</span></div>
                  </div>
                  <span className={"font-label-sm text-label-sm text-on-surface font-semibold truncate"}>
                    Customer Lounge (A/C)
                  </span>
                </div>
              </div>
            </div>
            <div className={"relative overflow-hidden bg-gradient-to-br from-tertiary-fixed via-secondary-fixed to-surface-container-low rounded-xl p-4 shadow-sm"}>
              <div className={"relative z-10 flex items-start gap-3"}>
                <div className={"w-10 h-10 rounded-full bg-secondary text-on-secondary flex items-center justify-center shrink-0 shadow-sm"}>
                  <span className={"material-symbols-outlined text-[22px]"}>
                    calendar_clock
                  </span>
                </div>
                <div className={"flex-1 flex flex-col gap-1"}>
                  <div className={"flex items-center gap-2"}>
                    <span className={"font-label-sm text-label-sm uppercase tracking-wider font-extrabold text-secondary"}>
                      In Development
                    </span>
                    <span className={"w-1.5 h-1.5 rounded-full bg-secondary"} />
                    <span className={"font-label-sm text-label-sm text-on-surface-variant font-medium"}>
                      Plug Garage
                    </span>
                  </div>
                  <h3 className={"font-headline-sm text-headline-sm text-on-surface font-bold"}>
                    Booking Is Coming Soon!
                  </h3>
                  <p className={"font-body-sm text-body-sm text-on-surface leading-relaxed"}>
                    Soon you’ll be able to reserve service slots directly, sync maintenance receipts to your digital logbook, and receive instant parish parts quotes right here.
                  </p>
                  <div className={"pt-2"}>
                    <button onClick={onPlugClick} className={"min-h-[48px] px-4 py-2 bg-on-surface text-surface rounded-lg font-label-md text-label-md font-bold flex items-center gap-1.5 active:bg-primary transition-colors"} id={"notifyBtn"} data-act={"notifyBtn"} data-way-out={"primary"}>
                      <span className={"material-symbols-outlined text-[18px]"}>
                        notifications_active
                      </span>
                      <span>
                        Get Notified on Launch
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
            <div className={"flex flex-col gap-3"}>
              <div className={"flex items-center justify-between"}>
                <h2 className={"font-headline-sm text-headline-sm text-on-surface"}>
                  Services Offered
                </h2>
                <span className={"font-label-sm text-label-sm text-on-surface-variant font-medium"}>
                  8 Certified Areas
                </span>
              </div>
              <div className={"grid grid-cols-2 gap-2.5"}>
                <div className={"bg-surface-container-lowest p-3 rounded-xl shadow-sm flex items-start gap-2.5"}>
                  <div className={"w-8 h-8 rounded-lg bg-surface-container-high flex items-center justify-center shrink-0 text-primary"}>
                    <span className={"material-symbols-outlined text-[20px]"}>
                      oil_barrel
                    </span>
                  </div>
                  <div className={"flex flex-col min-w-0"}>
                    <span className={"font-label-md text-label-md font-bold text-on-surface leading-tight"}>
                      {"Oil Change & Filter"}
                    </span>
                    <span className={"font-body-sm text-body-sm text-on-surface-variant truncate"}>
                      {"Full synthetic & blend"}
                    </span>
                  </div>
                </div>
                <div className={"bg-surface-container-lowest p-3 rounded-xl shadow-sm flex items-start gap-2.5"}>
                  <div className={"w-8 h-8 rounded-lg bg-surface-container-high flex items-center justify-center shrink-0 text-primary"}>
                    <span className={"material-symbols-outlined text-[20px]"}>
                      disc_full
                    </span>
                  </div>
                  <div className={"flex flex-col min-w-0"}>
                    <span className={"font-label-md text-label-md font-bold text-on-surface leading-tight"}>
                      {"Brakes & Rotors"}
                    </span>
                    <span className={"font-body-sm text-body-sm text-on-surface-variant truncate"}>
                      Pads, skimming, lines
                    </span>
                  </div>
                </div>
                <div className={"bg-surface-container-lowest p-3 rounded-xl shadow-sm flex items-start gap-2.5"}>
                  <div className={"w-8 h-8 rounded-lg bg-surface-container-high flex items-center justify-center shrink-0 text-primary"}>
                    <span className={"material-symbols-outlined text-[20px]"}>
                      compress
                    </span>
                  </div>
                  <div className={"flex flex-col min-w-0"}>
                    <span className={"font-label-md text-label-md font-bold text-on-surface leading-tight"}>
                      {"Suspension & Bushings"}
                    </span>
                    <span className={"font-body-sm text-body-sm text-on-surface-variant truncate"}>
                      Rough road durability
                    </span>
                  </div>
                </div>
                <div className={"bg-surface-container-lowest p-3 rounded-xl shadow-sm flex items-start gap-2.5"}>
                  <div className={"w-8 h-8 rounded-lg bg-surface-container-high flex items-center justify-center shrink-0 text-primary"}>
                    <span className={"material-symbols-outlined text-[20px]"}>
                      terminal
                    </span>
                  </div>
                  <div className={"flex flex-col min-w-0"}>
                    <span className={"font-label-md text-label-md font-bold text-on-surface leading-tight"}>
                      Engine Diagnostics
                    </span>
                    <span className={"font-body-sm text-body-sm text-on-surface-variant truncate"}>
                      OBD-II check engine
                    </span>
                  </div>
                </div>
                <div className={"bg-surface-container-lowest p-3 rounded-xl shadow-sm flex items-start gap-2.5"}>
                  <div className={"w-8 h-8 rounded-lg bg-surface-container-high flex items-center justify-center shrink-0 text-primary"}>
                    <span className={"material-symbols-outlined text-[20px]"}>
                      tire_repair
                    </span>
                  </div>
                  <div className={"flex flex-col min-w-0"}>
                    <span className={"font-label-md text-label-md font-bold text-on-surface leading-tight"}>
                      {"Tyres & Balancing"}
                    </span>
                    <span className={"font-body-sm text-body-sm text-on-surface-variant truncate"}>
                      {"Rotation & puncture"}
                    </span>
                  </div>
                </div>
                <div className={"bg-surface-container-lowest p-3 rounded-xl shadow-sm flex items-start gap-2.5"}>
                  <div className={"w-8 h-8 rounded-lg bg-surface-container-high flex items-center justify-center shrink-0 text-primary"}>
                    <span className={"material-symbols-outlined text-[20px]"}>
                      mode_fan
                    </span>
                  </div>
                  <div className={"flex flex-col min-w-0"}>
                    <span className={"font-label-md text-label-md font-bold text-on-surface leading-tight"}>
                      {"A/C Regas & Chill"}
                    </span>
                    <span className={"font-body-sm text-body-sm text-on-surface-variant truncate"}>
                      Compressor, leak check
                    </span>
                  </div>
                </div>
                <div className={"bg-surface-container-lowest p-3 rounded-xl shadow-sm flex items-start gap-2.5"}>
                  <div className={"w-8 h-8 rounded-lg bg-surface-container-high flex items-center justify-center shrink-0 text-primary"}>
                    <span className={"material-symbols-outlined text-[20px]"}>
                      sync_alt
                    </span>
                  </div>
                  <div className={"flex flex-col min-w-0"}>
                    <span className={"font-label-md text-label-md font-bold text-on-surface leading-tight"}>
                      Wheel Alignment
                    </span>
                    <span className={"font-body-sm text-body-sm text-on-surface-variant truncate"}>
                      Laser precision spec
                    </span>
                  </div>
                </div>
                <div className={"bg-surface-container-lowest p-3 rounded-xl shadow-sm flex items-start gap-2.5"}>
                  <div className={"w-8 h-8 rounded-lg bg-surface-container-high flex items-center justify-center shrink-0 text-primary"}>
                    <span className={"material-symbols-outlined text-[20px]"}>
                      format_paint
                    </span>
                  </div>
                  <div className={"flex flex-col min-w-0"}>
                    <span className={"font-label-md text-label-md font-bold text-on-surface leading-tight"}>
                      {"Body & Touch-up"}
                    </span>
                    <span className={"font-body-sm text-body-sm text-on-surface-variant truncate"}>
                      {"Scratch repair & dents"}
                    </span>
                  </div>
                </div>
              </div>
            </div>
            <div className={"flex flex-col gap-2.5"}>
              <div className={"flex items-center justify-between"}>
                <h2 className={"font-headline-sm text-headline-sm text-on-surface"}>
                  Makes They Work On
                </h2>
                <span className={"font-label-sm text-label-sm text-on-surface-variant"}>
                  OEM Diagnostic Cables
                </span>
              </div>
              <div className={"flex flex-wrap gap-2"}>
                <span className={"px-3 py-1.5 rounded-full bg-surface-container font-label-md text-label-md font-bold text-on-surface flex items-center gap-1.5 shadow-sm"}>
                  <span className={"material-symbols-outlined text-[16px] text-primary"}>
                    directions_car
                  </span>
                  Toyota
                </span>
                <span className={"px-3 py-1.5 rounded-full bg-surface-container font-label-md text-label-md font-bold text-on-surface flex items-center gap-1.5 shadow-sm"}>
                  <span className={"material-symbols-outlined text-[16px] text-primary"}>
                    directions_car
                  </span>
                  Honda
                </span>
                <span className={"px-3 py-1.5 rounded-full bg-surface-container font-label-md text-label-md font-bold text-on-surface flex items-center gap-1.5 shadow-sm"}>
                  <span className={"material-symbols-outlined text-[16px] text-primary"}>
                    directions_car
                  </span>
                  Nissan
                </span>
                <span className={"px-3 py-1.5 rounded-full bg-surface-container font-label-md text-label-md font-bold text-on-surface flex items-center gap-1.5 shadow-sm"}>
                  <span className={"material-symbols-outlined text-[16px] text-primary"}>
                    directions_car
                  </span>
                  Suzuki
                </span>
                <span className={"px-3 py-1.5 rounded-full bg-surface-container font-label-md text-label-md font-bold text-on-surface flex items-center gap-1.5 shadow-sm"}>
                  <span className={"material-symbols-outlined text-[16px] text-primary"}>
                    directions_car
                  </span>
                  Mazda
                </span>
                <span className={"px-3 py-1.5 rounded-full bg-surface-container font-label-md text-label-md font-bold text-on-surface flex items-center gap-1.5 shadow-sm"}>
                  <span className={"material-symbols-outlined text-[16px] text-primary"}>
                    directions_car
                  </span>
                  Subaru
                </span>
                <span className={"px-3 py-1.5 rounded-full bg-surface-container font-label-md text-label-md font-bold text-on-surface flex items-center gap-1.5 shadow-sm"}>
                  <span className={"material-symbols-outlined text-[16px] text-primary"}>
                    directions_car
                  </span>
                  Hyundai
                </span>
                <span className={"px-3 py-1.5 rounded-full bg-secondary-fixed text-on-secondary-fixed font-label-md text-label-md font-bold flex items-center gap-1.5 shadow-sm"}>
                  <span className={"material-symbols-outlined text-[16px]"}>
                    local_taxi
                  </span>
                  {"Commercial Taxis & Pickups"}
                </span>
              </div>
            </div>
            <div className={"flex flex-col gap-2"}>
              <h2 className={"font-headline-sm text-headline-sm text-on-surface"}>
                {"Location & Access"}
              </h2>
              <div className={"w-full h-40 bg-surface-container rounded-xl shadow-sm bg-cover bg-center overflow-hidden relative"} data-location={"14 Dunrobin Avenue, Kingston 10, Jamaica"} style={{  }}>
                <div className={"absolute bottom-2 left-2 right-2 bg-surface-container-lowest/90 backdrop-blur-md rounded-lg p-2.5 flex items-center justify-between"}>
                  <div className={"flex flex-col min-w-0"}>
                    <span className={"font-label-md text-label-md font-bold text-on-surface truncate"}>
                      {"Dunrobin Ave & Constant Spring Rd"}
                    </span>
                    <span className={"font-body-sm text-body-sm text-on-surface-variant truncate"}>
                      Opposite Dunrobin Plaza • Easy turning
                    </span>
                  </div>
                  <span className={"material-symbols-outlined text-[20px] text-primary shrink-0"}>
                    turn_right
                  </span>
                </div>
              </div>
            </div>
            <div className={"bg-surface-container-low rounded-xl p-3 flex items-center justify-between gap-3 text-on-surface-variant mt-1"}>
              <button onClick={onPlugClick} className={"flex-1 min-h-[48px] px-2 rounded-lg flex items-center justify-center gap-1.5 hover:text-on-surface active:bg-surface-container transition-colors"} id={"suggestEditBtn"} data-act={"suggestEditBtn"}>
                <span className={"material-symbols-outlined text-[18px]"}>
                  edit_note
                </span>
                <span className={"font-label-md text-label-md font-semibold"}>
                  Suggest an edit
                </span>
              </button>
              <div className={"w-px h-6 bg-outline-variant"} />
              <button onClick={onPlugClick} className={"flex-1 min-h-[48px] px-2 rounded-lg flex items-center justify-center gap-1.5 hover:text-error active:bg-surface-container transition-colors"} id={"reportClosedBtn"} data-act={"reportClosedBtn"}>
                <span className={"material-symbols-outlined text-[18px]"}>
                  report_problem
                </span>
                <span className={"font-label-md text-label-md font-semibold text-error"}>
                  Report closed
                </span>
              </button>
            </div>
            <div className={"fixed bottom-20 left-4 right-4 bg-inverse-surface text-inverse-on-surface p-3.5 rounded-xl shadow-lg flex items-center justify-between opacity-0 pointer-events-none transition-all duration-300 z-50"} id={"toastNotification"}>
              <div className={"flex items-center gap-2.5"}>
                <span className={"material-symbols-outlined text-[20px] text-tertiary-fixed-dim"} id={"toastIcon"}>
                  check_circle
                </span>
                <span className={"font-label-md text-label-md font-medium"} id={"toastMessage"}>
                  Notification saved!
                </span>
              </div>
              <button onClick={onPlugClick} className={"min-w-[48px] min-h-[48px] flex items-center justify-center text-inverse-on-surface hover:text-tertiary-fixed-dim"} data-act={"close"} data-way-out={"back"}>
                <span className={"material-symbols-outlined text-[18px]"}>
                  close
                </span>
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
