import { useEffect, useRef } from 'react';
import { onPlugClick } from '../../shell/actions';
import { bindScreen } from '../../shell/bind';


export function LogServiceScreen() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (ref.current) bindScreen("33-log-service.html", ref.current); }, []);
  return (
    <div ref={ref} data-plug-screen={"33-log-service.html"} className={"bg-surface font-body-md text-on-surface flex flex-col min-h-screen"}>
      <header className={"fixed top-0 w-full z-50 pt-safe bg-surface/80 backdrop-blur-xl shadow-[0_1px_8px_rgba(0,0,0,0.04)]"}>
        <div className={"h-16 px-gutter flex items-center justify-between gap-space-sm"}>
          <div className={"flex items-center gap-space-sm min-w-0"}>
            <button onClick={onPlugClick} aria-label={"Go back"} className={"w-12 h-12 rounded-full flex items-center justify-center text-on-surface hover:bg-surface-container-high transition-colors active:scale-95"} data-act={"arrow-back"} data-way-out={"back"}>
              <span className={"material-symbols-outlined text-[24px]"}>
                arrow_back
              </span>
            </button>
            <div className={"flex flex-col min-w-0"}>
              <h1 className={"font-headline-sm text-headline-sm text-on-surface truncate"}>
                Log Service
              </h1>
              <span className={"font-label-md text-label-md text-on-surface-variant truncate"}>
                2019 Toyota Roomy
              </span>
            </div>
          </div>
          <div className={"flex items-center gap-space-xs"}>
            <div className={"w-8 h-8 rounded-full bg-primary flex items-center justify-center"}>
              <span className={"material-symbols-outlined text-on-primary text-[18px]"}>
                person
              </span>
            </div>
          </div>
        </div>
      </header>
      <main className={"flex-1 flex flex-col relative w-full px-gutter pt-16 pb-safe bg-surface"}>
        <div className={"flex flex-col w-full pb-8"}>
          <div className={"mt-2 mb-4 p-space-md rounded-xl bg-surface-container flex items-center justify-between shadow-sm"}>
            <div className={"flex items-center gap-space-sm min-w-0"}>
              <div className={"w-10 h-10 rounded-lg bg-primary-fixed flex items-center justify-center flex-shrink-0"}>
                <span className={"material-symbols-outlined text-primary text-[22px]"} style={{ fontVariationSettings: "'FILL' 1" }}>
                  directions_car
                </span>
              </div>
              <div className={"flex flex-col min-w-0"}>
                <span className={"font-label-sm text-label-sm text-primary uppercase tracking-wider font-bold"}>
                  Active Vehicle
                </span>
                <div className={"flex items-center gap-1.5 truncate"}>
                  <span className={"font-headline-sm text-headline-sm text-on-surface truncate"}>
                    2019 Toyota Roomy
                  </span>
                  <span className={"bg-surface-container-highest px-2 py-0.5 rounded text-on-surface-variant font-label-md text-label-md font-semibold flex-shrink-0"}>
                    8241-HY
                  </span>
                </div>
              </div>
            </div>
            <div className={"flex flex-col items-end flex-shrink-0 pl-2"}>
              <span className={"inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-label-sm text-label-sm"}>
                <span className={"w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse"} />
                Up to date
              </span>
            </div>
          </div>
          <form className={"flex flex-col gap-space-lg"} id={"serviceLogForm"}>
            <div className={"flex flex-col gap-space-sm"}>
              <div className={"flex items-center justify-between"}>
                <label className={"font-label-lg text-label-lg text-on-surface flex items-center gap-1.5"}>
                  <span className={"material-symbols-outlined text-primary text-[18px]"}>
                    build_circle
                  </span>
                  Service Performed
                </label>
                <span className={"font-label-sm text-label-sm text-on-surface-variant"}>
                  Tap to toggle
                </span>
              </div>
              <div className={"flex flex-wrap gap-2"} id={"chipsContainer"}>
                <button onClick={onPlugClick} className={"chip active-chip h-10 px-3.5 rounded-full bg-primary text-on-primary font-label-md text-label-md flex items-center gap-1.5 shadow-sm active:scale-95 transition-transform"} data-selected={"true"} type={"button"} data-act={"engine-oil-filter"} data-way-out={"primary"}>
                  <span className={"material-symbols-outlined text-[16px] leading-none check-icon"}>
                    check
                  </span>
                  <span>
                    {"Engine Oil & Filter"}
                  </span>
                </button>
                <button onClick={onPlugClick} className={"chip active-chip h-10 px-3.5 rounded-full bg-primary text-on-primary font-label-md text-label-md flex items-center gap-1.5 shadow-sm active:scale-95 transition-transform"} data-selected={"true"} type={"button"} data-act={"multi-point-inspection"} data-way-out={"primary"}>
                  <span className={"material-symbols-outlined text-[16px] leading-none check-icon"}>
                    check
                  </span>
                  <span>
                    Multi-point Inspection
                  </span>
                </button>
                <button onClick={onPlugClick} className={"chip h-10 px-3.5 rounded-full bg-surface-container-high text-on-surface-variant font-label-md text-label-md flex items-center gap-1.5 active:scale-95 transition-transform"} data-selected={"false"} type={"button"} data-act={"brake-pads"}>
                  <span className={"material-symbols-outlined text-[16px] leading-none check-icon hidden"}>
                    check
                  </span>
                  <span>
                    Brake Pads
                  </span>
                </button>
                <button onClick={onPlugClick} className={"chip h-10 px-3.5 rounded-full bg-surface-container-high text-on-surface-variant font-label-md text-label-md flex items-center gap-1.5 active:scale-95 transition-transform"} data-selected={"false"} type={"button"} data-act={"air-filter"}>
                  <span className={"material-symbols-outlined text-[16px] leading-none check-icon hidden"}>
                    check
                  </span>
                  <span>
                    Air Filter
                  </span>
                </button>
                <button onClick={onPlugClick} className={"chip h-10 px-3.5 rounded-full bg-surface-container-high text-on-surface-variant font-label-md text-label-md flex items-center gap-1.5 active:scale-95 transition-transform"} data-selected={"false"} type={"button"} data-act={"tyre-rotation"}>
                  <span className={"material-symbols-outlined text-[16px] leading-none check-icon hidden"}>
                    check
                  </span>
                  <span>
                    Tyre Rotation
                  </span>
                </button>
                <button onClick={onPlugClick} className={"chip h-10 px-3.5 rounded-full bg-surface-container-high text-on-surface-variant font-label-md text-label-md flex items-center gap-1.5 active:scale-95 transition-transform"} data-selected={"false"} type={"button"} data-act={"transmission-fluid"}>
                  <span className={"material-symbols-outlined text-[16px] leading-none check-icon hidden"}>
                    check
                  </span>
                  <span>
                    Transmission Fluid
                  </span>
                </button>
                <button onClick={onPlugClick} className={"chip h-10 px-3.5 rounded-full bg-surface-container-high text-on-surface-variant font-label-md text-label-md flex items-center gap-1.5 active:scale-95 transition-transform"} data-selected={"false"} type={"button"} data-act={"battery"}>
                  <span className={"material-symbols-outlined text-[16px] leading-none check-icon hidden"}>
                    check
                  </span>
                  <span>
                    Battery
                  </span>
                </button>
                <button onClick={onPlugClick} className={"h-10 px-3.5 rounded-full bg-surface-container-highest text-primary font-label-md text-label-md flex items-center gap-1 shadow-sm active:scale-95 transition-transform"} type={"button"} data-act={"custom-service"}>
                  <span className={"material-symbols-outlined text-[18px]"}>
                    add
                  </span>
                  <span>
                    Custom Service
                  </span>
                </button>
              </div>
            </div>
            <div className={"grid grid-cols-1 sm:grid-cols-2 gap-space-md"}>
              <div className={"flex flex-col gap-space-xs"}>
                <label className={"font-label-lg text-label-lg text-on-surface flex items-center justify-between"} htmlFor={"odometerInput"}>
                  <span className={"flex items-center gap-1.5"}>
                    <span className={"material-symbols-outlined text-primary text-[18px]"}>
                      speed
                    </span>
                    Odometer Reading
                  </span>
                  <button onClick={onPlugClick} className={"text-secondary font-label-sm text-label-sm flex items-center gap-0.5 active:opacity-75"} type={"button"} data-act={"sync-cluster"}>
                    <span className={"material-symbols-outlined text-[14px]"}>
                      sync
                    </span>
                    Sync cluster
                  </button>
                </label>
                <div className={"relative flex items-center"}>
                  <input className={"w-full h-12 px-4 pr-11 rounded-xl bg-surface-container-lowest font-headline-sm text-headline-sm text-on-surface focus:outline-none focus:bg-surface-container-low shadow-sm"} id={"odometerInput"} type={"text"} defaultValue={"84,612 km"} />
                  <div className={"absolute right-3 text-on-surface-variant pointer-events-none flex items-center"}>
                    <span className={"material-symbols-outlined text-[20px]"}>
                      edit
                    </span>
                  </div>
                </div>
                <p className={"font-body-sm text-body-sm text-on-surface-variant"}>
                  Last known was 79,400 km in May
                </p>
              </div>
              <div className={"flex flex-col gap-space-xs"}>
                <label className={"font-label-lg text-label-lg text-on-surface flex items-center gap-1.5"} htmlFor={"dateInput"}>
                  <span className={"material-symbols-outlined text-primary text-[18px]"}>
                    event
                  </span>
                  Date of Service
                </label>
                <div className={"relative flex items-center"}>
                  <input className={"w-full h-12 px-4 pr-11 rounded-xl bg-surface-container-lowest font-body-lg text-body-lg text-on-surface focus:outline-none focus:bg-surface-container-low shadow-sm"} id={"dateInput"} type={"text"} defaultValue={"Today, 24 Oct 2024"} />
                  <div className={"absolute right-3 text-primary pointer-events-none flex items-center"}>
                    <span className={"material-symbols-outlined text-[22px]"}>
                      calendar_month
                    </span>
                  </div>
                </div>
                <p className={"font-body-sm text-body-sm text-on-surface-variant"}>
                  Scheduled reset baseline date
                </p>
              </div>
            </div>
            <div className={"flex flex-col gap-space-sm"}>
              <label className={"font-label-lg text-label-lg text-on-surface flex items-center gap-1.5"}>
                <span className={"material-symbols-outlined text-primary text-[18px]"}>
                  location_on
                </span>
                Where was it done?
              </label>
              <div className={"p-1 rounded-xl bg-surface-container-high flex items-center gap-1"}>
                <button onClick={onPlugClick} className={"flex-1 min-h-[44px] rounded-lg bg-surface-container-lowest shadow-sm flex items-center justify-center gap-1.5 font-label-md text-label-md text-on-surface transition-all"} id={"btnShop"} type={"button"} data-act={"btnShop"}>
                  <span className={"material-symbols-outlined text-[18px] text-primary"}>
                    verified
                  </span>
                  Mechanic Shop
                </button>
                <button onClick={onPlugClick} className={"flex-1 min-h-[44px] rounded-lg text-on-surface-variant flex items-center justify-center gap-1.5 font-label-md text-label-md transition-all"} id={"btnDiy"} type={"button"} data-act={"btnDiy"}>
                  <span className={"material-symbols-outlined text-[18px]"}>
                    home_repair_service
                  </span>
                  Did it myself (DIY)
                </button>
              </div>
              <div className={"p-space-md rounded-xl bg-surface-container-lowest shadow-sm flex items-start justify-between gap-space-sm transition-all"} id={"shopSelectorCard"}>
                <div className={"flex items-start gap-3 min-w-0"}>
                  <div className={"w-10 h-10 rounded-lg bg-surface-container-highest flex items-center justify-center text-primary flex-shrink-0 mt-0.5"}>
                    <span className={"material-symbols-outlined text-[22px]"}>
                      garage
                    </span>
                  </div>
                  <div className={"flex flex-col min-w-0"}>
                    <div className={"flex items-center gap-1.5"}>
                      <span className={"font-headline-sm text-headline-sm text-on-surface truncate"}>
                        Precision Auto Works
                      </span>
                      <span className={"inline-flex items-center text-emerald-600 flex-shrink-0"} title={"Verified Workshop"}>
                        <span className={"material-symbols-outlined text-[18px]"} style={{ fontVariationSettings: "'FILL' 1" }}>
                          check_circle
                        </span>
                      </span>
                    </div>
                    <span className={"font-body-sm text-body-sm text-on-surface-variant truncate"}>
                      14 Dunrobin Ave, St. Andrew (Kingston 10)
                    </span>
                    <div className={"mt-2 flex items-center gap-2"}>
                      <span className={"px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-label-sm text-label-sm font-semibold"}>
                        Authorized Partner
                      </span>
                      <span className={"font-label-sm text-label-sm text-on-surface-variant"}>
                        4.9 ★ (128 reviews)
                      </span>
                    </div>
                  </div>
                </div>
                <button onClick={onPlugClick} className={"text-secondary font-label-md text-label-md font-semibold hover:underline flex-shrink-0 pt-0.5"} type={"button"} data-act={"change"}>
                  Change
                </button>
              </div>
              <div className={"hidden p-space-md rounded-xl bg-surface-container-lowest shadow-sm flex items-center gap-3"} id={"diyInfoContainer"}>
                <div className={"w-10 h-10 rounded-lg bg-secondary-fixed flex items-center justify-center text-on-secondary-fixed flex-shrink-0"}>
                  <span className={"material-symbols-outlined text-[20px]"}>
                    handyman
                  </span>
                </div>
                <div className={"flex flex-col"}>
                  <span className={"font-label-lg text-label-lg text-on-surface"}>
                    DIY Log Mode Active
                  </span>
                  <span className={"font-body-sm text-body-sm text-on-surface-variant"}>
                    Your garage diary will record this as self-performed maintenance.
                  </span>
                </div>
              </div>
            </div>
            <div className={"flex flex-col gap-space-xs"}>
              <div className={"flex items-center justify-between"}>
                <label className={"font-label-lg text-label-lg text-on-surface flex items-center gap-1.5"} htmlFor={"costInput"}>
                  <span className={"material-symbols-outlined text-primary text-[18px]"}>
                    payments
                  </span>
                  Total Cost
                </label>
                <span className={"font-label-sm text-label-sm px-2 py-0.5 rounded-full bg-surface-container text-on-surface-variant flex items-center gap-1"}>
                  <span className={"material-symbols-outlined text-[13px]"}>
                    lock
                  </span>
                  Private
                </span>
              </div>
              <div className={"relative flex items-center"}>
                <div className={"absolute left-4 font-headline-sm text-headline-sm text-primary font-bold"}>
                  J$
                </div>
                <input className={"w-full h-12 pl-12 pr-4 rounded-xl bg-surface-container-lowest font-headline-sm text-headline-sm text-on-surface focus:outline-none focus:bg-surface-container-low shadow-sm"} id={"costInput"} placeholder={"0.00"} type={"text"} defaultValue={"12,500"} />
              </div>
              <p className={"font-body-sm text-body-sm text-on-surface-variant flex items-center gap-1 mt-0.5"}>
                <span className={"material-symbols-outlined text-[15px] text-tertiary"}>
                  info
                </span>
                Kept private to your personal garage records. Used for expense analytics.
              </p>
            </div>
            <div className={"flex flex-col gap-space-xs"}>
              <div className={"flex items-center justify-between"}>
                <label className={"font-label-lg text-label-lg text-on-surface flex items-center gap-1.5"} htmlFor={"serviceNotes"}>
                  <span className={"material-symbols-outlined text-primary text-[18px]"}>
                    description
                  </span>
                  {"Notes & Parts Used"}
                </label>
                <span className={"font-label-sm text-label-sm text-on-surface-variant"}>
                  Optional
                </span>
              </div>
              <textarea className={"w-full p-3.5 rounded-xl bg-surface-container-lowest font-body-md text-body-md text-on-surface placeholder:text-outline focus:outline-none focus:bg-surface-container-low shadow-sm resize-none"} id={"serviceNotes"} placeholder={"e.g. Used Castrol Edge 5W-30 (4L) + OEM Toyota filter from Mario's Auto Parts. Inspected front brake pad wear at 70%."} rows={3} />
            </div>
            <div className={"flex flex-col gap-space-xs"}>
              <div className={"flex items-center justify-between"}>
                <label className={"font-label-lg text-label-lg text-on-surface flex items-center gap-1.5"}>
                  <span className={"material-symbols-outlined text-primary text-[18px]"}>
                    receipt_long
                  </span>
                  Attach Receipt or Photo
                </label>
                <span className={"font-label-sm text-label-sm text-on-surface-variant"}>
                  Max 5MB
                </span>
              </div>
              <div className={"p-space-md rounded-2xl bg-surface-container-lowest shadow-sm flex flex-col gap-3"}>
                <div className={"flex items-center gap-3"}>
                  <div className={"relative w-16 h-16 rounded-xl overflow-hidden bg-surface-container-high flex-shrink-0 group"}>
                    <img className={"w-full h-full object-cover"} data-alt={"A close-up photograph of an official Jamaican automotive repair invoice on branded receipt paper with clear Jamaican dollar breakdowns, stamped and verified under warm indoor workshop light."} src={"https://lh3.googleusercontent.com/aida-public/AB6AXuBkyNeYkXGbAbKD_-LSKE-5Eb9lceGaLGrOLt7cw1UKYTvNCaTK4wALAty3KSju5WCuzAlxIsYtPTYxwJZn7_QnR0jaxJepllVZF-drGRswLBgeAmJx6PNoQsFLIUTPlXOlUJCTgrUO3F__oSuv3D6cpI_kA4QiyAJRS5mikpMRO3EgqQ3FH2MW-SIcKc6O3CEdGfk8fYoL6GOqRyzr1m6zUi-L07m-mBRBlKFDZFJinARosZhu0Hct"} />
                    <div className={"absolute inset-0 bg-on-surface/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"}>
                      <span className={"material-symbols-outlined text-surface-container-lowest text-[18px]"}>
                        zoom_in
                      </span>
                    </div>
                  </div>
                  <div className={"flex flex-col min-w-0 flex-1"}>
                    <span className={"font-label-lg text-label-lg text-on-surface truncate"}>
                      Invoice_Dunrobin_8241.jpg
                    </span>
                    <span className={"font-body-sm text-body-sm text-on-surface-variant"}>
                      1.4 MB • Uploaded
                    </span>
                    <div className={"mt-1 flex items-center gap-2"}>
                      <button onClick={onPlugClick} className={"font-label-sm text-label-sm text-secondary hover:underline flex items-center gap-0.5"} type={"button"} data-act={"replace"}>
                        <span className={"material-symbols-outlined text-[13px]"}>
                          refresh
                        </span>
                        Replace
                      </button>
                      <button onClick={onPlugClick} className={"font-label-sm text-label-sm text-error hover:underline flex items-center gap-0.5"} type={"button"} data-act={"remove"}>
                        <span className={"material-symbols-outlined text-[13px]"}>
                          delete
                        </span>
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
                <button onClick={onPlugClick} className={"w-full py-2.5 px-4 rounded-xl bg-surface-container-low active:bg-surface-container flex items-center justify-center gap-2 text-on-surface-variant hover:text-primary transition-colors"} type={"button"} data-act={"snap-additional-invoice-or-oil-sticker"}>
                  <span className={"material-symbols-outlined text-[20px] text-primary"}>
                    add_a_photo
                  </span>
                  <span className={"font-label-md text-label-md font-semibold"}>
                    Snap additional invoice or oil sticker
                  </span>
                </button>
              </div>
            </div>
            <div className={"p-space-md rounded-xl bg-gradient-to-r from-primary-fixed/60 via-secondary-fixed/40 to-tertiary-fixed/40 flex items-start gap-3 shadow-sm"}>
              <div className={"w-8 h-8 rounded-full bg-primary flex items-center justify-center text-on-primary flex-shrink-0 mt-0.5"}>
                <span className={"material-symbols-outlined text-[18px]"}>
                  update
                </span>
              </div>
              <div className={"flex flex-col"}>
                <span className={"font-label-lg text-label-lg text-on-surface font-bold"}>
                  Upcoming Interval Calibration
                </span>
                <p className={"font-body-sm text-body-sm text-on-surface-variant mt-0.5"}>
                  Saving resets the oil cycle countdown to
                  <span className={"font-bold text-on-surface"}>
                    5,000 km
                  </span>
                  or
                  <span className={"font-bold text-on-surface"}>
                    90 days
                  </span>
                  , recalculating your next service for late January 2025.
                </p>
              </div>
            </div>
            <div className={"flex flex-col gap-space-xs mt-2"}>
              <button onClick={onPlugClick} className={"w-full min-h-[52px] rounded-xl bg-primary text-on-primary font-headline-sm text-headline-sm flex items-center justify-center gap-2 shadow-lg shadow-primary/20 active:scale-[0.98] transition-all"} id={"saveBtn"} type={"submit"} data-act={"saveBtn"} data-way-out={"primary"}>
                <span className={"material-symbols-outlined text-[22px]"}>
                  check_circle
                </span>
                <span>
                  Save Service Log
                </span>
              </button>
              <div className={"text-center px-4 py-2"}>
                <p className={"font-body-sm text-body-sm text-on-surface-variant"}>
                  Automatically updates your maintenance schedule and resets service countdowns.
                </p>
              </div>
            </div>
          </form>
          <div className={"hidden fixed inset-0 z-50 bg-on-surface/50 backdrop-blur-sm flex items-end justify-center"} id={"shopModal"}>
            <div className={"w-full max-w-lg bg-surface-container-lowest rounded-t-2xl p-space-lg flex flex-col gap-4 max-h-[707px] overflow-y-auto"}>
              <div className={"flex items-center justify-between pb-2"}>
                <div className={"flex items-center gap-2"}>
                  <span className={"material-symbols-outlined text-primary"}>
                    local_gas_station
                  </span>
                  <h3 className={"font-headline-sm text-headline-sm text-on-surface"}>
                    Select Workshop
                  </h3>
                </div>
                <button onClick={onPlugClick} className={"w-8 h-8 rounded-full bg-surface-container flex items-center justify-center text-on-surface-variant"} type={"button"} data-act={"close"} data-way-out={"back"}>
                  <span className={"material-symbols-outlined text-[18px]"}>
                    close
                  </span>
                </button>
              </div>
              <div className={"flex flex-col gap-2"}>
                <button onClick={onPlugClick} className={"p-3 text-left rounded-xl bg-surface-container-low hover:bg-surface-container flex flex-col"} type={"button"} data-act={"precision-auto-works-14-dunrobin-ave-st-andrew-a"}>
                  <span className={"font-label-lg text-label-lg text-on-surface font-semibold"}>
                    Precision Auto Works
                  </span>
                  <span className={"font-body-sm text-body-sm text-on-surface-variant"}>
                    14 Dunrobin Ave, St. Andrew (Authorized)
                  </span>
                </button>
                <button onClick={onPlugClick} className={"p-3 text-left rounded-xl bg-surface-container-low hover:bg-surface-container flex flex-col"} type={"button"} data-act={"motor-sales-service-ltd-half-way-tree-road-kings"}>
                  <span className={"font-label-lg text-label-lg text-on-surface font-semibold"}>
                    {"Motor Sales & Service Ltd"}
                  </span>
                  <span className={"font-body-sm text-body-sm text-on-surface-variant"}>
                    Half-Way-Tree Road, Kingston 5
                  </span>
                </button>
                <button onClick={onPlugClick} className={"p-3 text-left rounded-xl bg-surface-container-low hover:bg-surface-container flex flex-col"} type={"button"} data-act={"bogue-lube-tyre-centre-alice-eldemire-dr-montego"}>
                  <span className={"font-label-lg text-label-lg text-on-surface font-semibold"}>
                    {"Bogue Lube & Tyre Centre"}
                  </span>
                  <span className={"font-body-sm text-body-sm text-on-surface-variant"}>
                    Alice Eldemire Dr, Montego Bay
                  </span>
                </button>
              </div>
            </div>
          </div>
          <div className={"fixed bottom-6 left-4 right-4 z-50 pointer-events-none transform translate-y-24 opacity-0 transition-all duration-300 flex justify-center"} id={"toastNotification"}>
            <div className={"bg-inverse-surface text-inverse-on-surface px-5 py-3 rounded-full shadow-2xl flex items-center gap-2 font-label-md text-label-md"}>
              <span className={"material-symbols-outlined text-emerald-400 text-[20px]"}>
                task_alt
              </span>
              <span id={"toastMsg"}>
                Service log successfully saved!
              </span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
