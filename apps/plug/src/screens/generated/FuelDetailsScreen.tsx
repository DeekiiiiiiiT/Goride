import { useEffect, useRef } from 'react';
import { onPlugClick } from '../../shell/actions';
import { bindScreen } from '../../shell/bind';


export function FuelDetailsScreen() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (ref.current) bindScreen("26-fuel-details.html", ref.current); }, []);
  return (
    <div ref={ref} data-plug-screen={"26-fuel-details.html"} className={"bg-surface font-body-md text-on-surface flex flex-col min-h-screen"}>
      <header className={"fixed top-0 w-full z-50 pt-safe bg-surface/85 backdrop-blur-xl shadow-[0_1px_8px_rgba(0,0,0,0.04)]"}>
        <div className={"h-16 px-margin flex items-center justify-between"}>
          <div className={"flex items-center gap-space-sm"}>
            <button onClick={onPlugClick} aria-label={"Back"} className={"w-11 h-11 min-h-[44px] min-w-[44px] flex items-center justify-center text-on-surface hover:text-primary rounded-full active:bg-surface-container transition-colors"} data-act={"arrow-back"} data-way-out={"back"}>
              <span className={"material-symbols-outlined text-[24px]"}>
                arrow_back
              </span>
            </button>
            <h1 className={"font-headline-sm text-headline-sm text-on-surface tracking-tight line-clamp-1"}>
              Log Fuel Step 2 Fuel Details
            </h1>
          </div>
          <div className={"flex items-center gap-space-xs"}>
            <button onClick={onPlugClick} aria-label={"Cancel or Close"} className={"w-11 h-11 min-h-[44px] min-w-[44px] rounded-full flex items-center justify-center text-on-surface-variant hover:text-primary transition-colors"} data-act={"close"} data-way-out={"back"}>
              <span className={"material-symbols-outlined text-[22px]"}>
                close
              </span>
            </button>
          </div>
        </div>
      </header>
      <main className={"flex flex-col relative w-full pt-16 bg-surface flex-1"}>
        <div className={"flex flex-col w-full pb-safe"}>
          <div className={"px-margin pt-space-sm pb-space-xs flex items-center justify-between"}>
            <div className={"flex items-center gap-space-xs"}>
              <span className={"w-6 h-6 rounded-full bg-primary text-on-primary font-label-sm text-label-sm flex items-center justify-center"}>
                2
              </span>
              <span className={"font-label-lg text-label-lg text-on-surface"}>
                {"Fuel & Volume Details"}
              </span>
            </div>
            <span className={"font-label-md text-label-md text-on-surface-variant font-medium"}>
              Final Step
            </span>
          </div>
          <div className={"px-margin flex gap-space-xs my-space-xs"}>
            <div className={"h-1.5 flex-1 rounded-full bg-primary"} />
            <div className={"h-1.5 flex-1 rounded-full bg-primary"} />
            <div className={"h-1.5 flex-1 rounded-full bg-surface-container-high"} />
          </div>
          <div className={"px-margin py-space-sm flex flex-col gap-space-md"}>
            <div className={"flex flex-col gap-space-xs"}>
              <div className={"bg-surface-container-lowest rounded-xl p-space-md shadow-sm transition-all duration-200"} id={"verified-station-card"}>
                <div className={"flex items-start justify-between gap-space-sm"}>
                  <div className={"flex items-start gap-space-sm min-w-0"}>
                    <div className={"w-11 h-11 rounded-xl bg-primary-fixed flex items-center justify-center shrink-0 text-primary"}>
                      <span className={"material-symbols-outlined text-[24px]"} style={{ fontVariationSettings: "'FILL' 1" }}>
                        local_gas_station
                      </span>
                    </div>
                    <div className={"min-w-0 flex flex-col"}>
                      <div className={"flex items-center gap-space-xs flex-wrap"}>
                        <span className={"font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant"}>
                          GPS Match
                        </span>
                        <span className={"inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-green-100 text-green-800 font-label-sm text-label-sm font-semibold"}>
                          <span className={"material-symbols-outlined text-[14px]"}>
                            verified
                          </span>
                          Verified Station
                        </span>
                      </div>
                      <p className={"font-headline-sm text-headline-sm text-on-surface truncate mt-0.5 max-w-full"} data-slot={"receipt-station"}>
                        
                      </p>
                      <p className={"font-label-sm text-label-sm text-on-surface-variant truncate max-w-full"}>
                        Matched by GPS
                      </p>
                      <p className={"font-body-sm text-body-sm text-on-surface-variant flex items-center gap-1 mt-0.5"}>
                        <span className={"material-symbols-outlined text-[15px] text-primary"}>
                          location_on
                        </span>
                        
                      </p>
                    </div>
                  </div>
                  <button onClick={onPlugClick} className={"px-3 py-2 min-h-[44px] min-w-[44px] rounded-lg bg-surface-container hover:bg-surface-container-high text-primary font-label-lg text-label-lg font-bold shrink-0 transition-colors"} id={"toggle-station-btn"} type={"button"} data-act={"toggle-station-btn"}>
                    Change
                  </button>
                </div>
              </div>
              <div className={"hidden bg-surface-container-low rounded-xl p-space-md shadow-sm transition-all duration-200"} id={"unverified-station-card"}>
                <div className={"flex items-start justify-between gap-space-sm"}>
                  <div className={"flex items-start gap-space-sm min-w-0"}>
                    <div className={"w-11 h-11 rounded-xl bg-surface-container-highest flex items-center justify-center shrink-0 text-on-surface-variant"}>
                      <span className={"material-symbols-outlined text-[24px]"}>
                        add_location_alt
                      </span>
                    </div>
                    <div className={"min-w-0 flex flex-col"}>
                      <div className={"flex items-center gap-space-xs"}>
                        <span className={"inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface-variant text-on-surface-variant font-label-sm text-label-sm font-semibold"}>
                          <span className={"material-symbols-outlined text-[13px]"}>
                            group_work
                          </span>
                          Community Discovery
                        </span>
                      </div>
                      <p className={"font-headline-sm text-headline-sm text-on-surface mt-0.5"}>
                        New station detected
                      </p>
                      <p className={"font-body-sm text-body-sm text-on-surface-variant mt-0.5"}>
                        {"We'll pin this spot for island community review across Kingston & St. Andrew."}
                      </p>
                    </div>
                  </div>
                  <button onClick={onPlugClick} className={"px-3 py-2 min-h-[44px] min-w-[44px] rounded-lg bg-surface-container-highest text-primary font-label-lg text-label-lg font-bold shrink-0"} id={"reset-station-btn"} type={"button"} data-act={"reset-station-btn"}>
                    Reset
                  </button>
                </div>
              </div>
            </div>
            <div className={"bg-surface-container-lowest rounded-xl p-space-md shadow-sm flex flex-col gap-space-sm"} data-grade-locked={"1"}>
              <div className={"flex items-center justify-between"}>
                <label className={"font-label-lg text-label-lg text-on-surface flex items-center gap-1.5"}>
                  <span>
                    Fuel Grade Dispensed
                  </span>
                  <span className={"material-symbols-outlined text-[16px] text-secondary"} title={"Matched to your car's engine requirements"}>
                    verified
                  </span>
                </label>
                <span className={"font-label-sm text-label-sm bg-secondary-fixed text-on-secondary-fixed font-bold px-2 py-0.5 rounded-full"}>
                  AUTO-LOCKED
                </span>
              </div>
              <div className={"bg-surface-container-low rounded-xl p-space-md flex flex-col gap-space-sm relative"}>
                <div className={"flex items-center justify-between"}>
                  <div className={"flex items-center gap-space-sm"}>
                    <span className={"bg-[#16a34a] text-surface-container-lowest font-headline-sm text-headline-sm px-3 py-1 rounded-lg tracking-wide shadow-sm"} data-slot={"locked-grade-badge"}>
                      E-10 87
                    </span>
                    <div className={"flex flex-col"}>
                      <span className={"font-label-lg text-label-lg text-on-surface font-bold"} data-slot={"locked-grade-title"}>
                        Unleaded Regular
                      </span>
                      <span className={"font-body-sm text-body-sm text-on-surface-variant flex items-center gap-1"}>
                        <span className={"material-symbols-outlined text-[14px] text-outline"}>
                          lock
                        </span>
                        Vehicle default choice
                      </span>
                    </div>
                  </div>
                  <button onClick={onPlugClick} className={"text-secondary font-label-md text-label-md min-h-[44px] flex items-center justify-center underline-offset-2 hover:underline"} id={"toggle-grades-btn"} type={"button"} data-act={"toggle-grades-btn"}>
                    Change
                  </button>
                </div>
                <div className={"flex items-start gap-2 bg-surface-container-lowest p-space-sm rounded-lg"}>
                  <span className={"material-symbols-outlined text-[18px] text-secondary shrink-0 mt-0.5"}>
                    directions_car
                  </span>
                  <p className={"font-body-sm text-body-sm text-on-surface-variant"} data-slot={"locked-grade-callout"}>
                    From your car — this grade is the usual pick for this vehicle.
                  </p>
                </div>
              </div>
              <div className={"flex flex-col gap-space-xs mt-space-xs"} id={"grades-tray"} data-plug-grades={"1"} data-grade-tray={"1"}>
                <span className={"font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider"}>
                  Available Island Octanes
                </span>
                <div className={"grid grid-cols-3 gap-2"} id={"grade-selector"}>
                  <button onClick={onPlugClick} className={"flex flex-col items-center justify-center py-2.5 px-1.5 rounded-xl bg-primary-container text-on-primary-container shadow-sm min-h-[52px] text-center"} data-grade={"e10_87"} data-plug-grade={"e10_87"} type={"button"} data-act={"e-10-87"}>
                    <span className={"font-label-lg text-label-lg font-bold leading-none"}>
                      E-10 87
                    </span>
                    <span className={"font-label-sm text-label-sm opacity-90 mt-1"} data-grade-hint={"e10_87"}>
                      Recommended
                    </span>
                  </button>
                  <button onClick={onPlugClick} className={"flex flex-col items-center justify-center py-2.5 px-1.5 rounded-xl bg-surface-container text-on-surface hover:bg-surface-container-high transition-colors min-h-[52px] text-center"} data-grade={"e10_90"} data-plug-grade={"e10_90"} type={"button"} data-act={"e-10-90"}>
                    <span className={"font-label-lg text-label-lg font-bold leading-none"}>
                      E-10 90
                    </span>
                    <span className={"font-label-sm text-label-sm text-on-surface-variant mt-1"}>
                      Super Premium
                    </span>
                  </button>
                  <button onClick={onPlugClick} className={"flex flex-col items-center justify-center py-2.5 px-1.5 rounded-xl bg-surface-container text-on-surface hover:bg-surface-container-high transition-colors min-h-[52px] text-center"} data-grade={"diesel"} data-plug-grade={"diesel"} type={"button"} data-act={"ulsd"}>
                    <span className={"font-label-lg text-label-lg font-bold leading-none"}>
                      ULSD
                    </span>
                    <span className={"font-label-sm text-label-sm text-on-surface-variant mt-1"}>
                      Ultra Low Sulfur
                    </span>
                  </button>
                </div>
                <div className={"mt-space-xs bg-tertiary-fixed/30 rounded-xl p-space-sm flex items-start gap-space-sm"}>
                  <span className={"material-symbols-outlined text-tertiary text-[20px] shrink-0 mt-0.5"}>
                    info
                  </span>
                  <p className={"font-body-sm text-body-sm text-on-tertiary-fixed leading-tight"} data-slot={"grade-mismatch-note"}>
                    Your car normally runs on E-10 87. Choosing another grade will flag a quick verification before pushing rates to the Roam Plug island map.
                  </p>
                </div>
              </div>
            </div>
            <div className={"bg-surface-container-lowest rounded-xl p-space-md shadow-sm flex flex-col gap-space-md"}>
              <div className={"grid grid-cols-2 gap-space-md"}>
                <div className={"flex flex-col gap-1 min-w-0"}>
                  <label className={"font-label-md text-label-md text-on-surface-variant font-medium flex items-center gap-1"} htmlFor={"amount-input"}>
                    <span className={"material-symbols-outlined text-[16px] text-primary"}>
                      payments
                    </span>
                    Amount Paid
                  </label>
                  <div className={"bg-surface-container-low rounded-xl px-space-sm py-2.5 flex items-center focus-within:bg-surface-container-high transition-colors min-h-[48px]"}>
                    <span className={"font-headline-sm text-headline-sm font-bold text-primary mr-1 select-none"}>
                      J$
                    </span>
                    <input className={"w-full bg-transparent font-price-display text-price-display text-on-surface focus:outline-none tracking-tight font-bold"} id={"amount-input"} inputMode={"decimal"} step={10} type={"number"} defaultValue={""} />
                  </div>
                  <span className={"font-label-sm text-label-sm text-on-surface-variant pl-1"}>
                    Pump total with GCT
                  </span>
                </div>
                <div className={"flex flex-col gap-1 min-w-0"}>
                  <label className={"font-label-md text-label-md text-on-surface-variant font-medium flex items-center gap-1"} htmlFor={"litres-input"}>
                    <span className={"material-symbols-outlined text-[16px] text-secondary"}>
                      water_drop
                    </span>
                    Volume
                  </label>
                  <div className={"bg-surface-container-low rounded-xl px-space-sm py-2.5 flex items-center focus-within:bg-surface-container-high transition-colors min-h-[48px]"}>
                    <input className={"w-full bg-transparent font-price-display text-price-display text-on-surface focus:outline-none tracking-tight font-bold text-right pr-1"} id={"litres-input"} inputMode={"decimal"} step={"0.01"} type={"number"} defaultValue={""} />
                    <span className={"font-headline-sm text-headline-sm font-bold text-on-surface-variant select-none"}>
                      L
                    </span>
                  </div>
                  <span className={"font-label-sm text-label-sm text-on-surface-variant text-right pr-1"}>
                    Total dispensed
                  </span>
                </div>
              </div>
              <div className={"bg-secondary-fixed/50 rounded-xl p-space-sm flex items-center justify-between"}>
                <div className={"flex items-center gap-space-xs"}>
                  <div className={"w-8 h-8 rounded-lg bg-secondary-container text-on-secondary-container flex items-center justify-center shrink-0"}>
                    <span className={"material-symbols-outlined text-[20px]"}>
                      calculate
                    </span>
                  </div>
                  <div>
                    <span className={"font-label-sm text-label-sm text-on-secondary-container font-semibold uppercase tracking-wider block"}>
                      Computed Rate
                    </span>
                    <span className={"font-body-sm text-body-sm text-on-surface-variant block"} id={"rate-formula"}>
                      Not entered yet
                    </span>
                  </div>
                </div>
                <div className={"text-right"}>
                  <div className={"font-headline-sm text-headline-sm font-bold text-secondary"} id={"rate-display"}>
                     / L
                  </div>
                  <span className={"font-label-sm text-label-sm text-green-700 font-semibold block"}>
                    • 
                  </span>
                </div>
              </div>
            </div>
            <div className={"bg-surface-container-lowest rounded-xl p-space-md shadow-sm flex flex-col gap-space-xs"}>
              <div className={"flex items-center justify-between"}>
                <div className={"flex items-center gap-space-sm"}>
                  <div className={"w-10 h-10 rounded-xl bg-surface-container-high flex items-center justify-center text-primary shrink-0"}>
                    <span className={"material-symbols-outlined text-[22px]"}>
                      speed
                    </span>
                  </div>
                  <div>
                    <label className={"font-headline-sm text-headline-sm text-on-surface block leading-tight cursor-pointer"} htmlFor={"tank-toggle"}>
                      Filled the tank
                    </label>
                    <span className={"font-label-sm text-label-sm text-secondary font-semibold uppercase tracking-wide"}>
                      High accuracy log
                    </span>
                  </div>
                </div>
                <label className={"relative inline-flex items-center cursor-pointer min-h-[48px] min-w-[48px] justify-center"}>
                  <input defaultChecked={true} className={"sr-only peer"} id={"tank-toggle"} type={"checkbox"} />
                  <div className={"w-12 h-7 bg-surface-container-highest peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[12px] after:left-[4px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"} />
                </label>
              </div>
              <div className={"bg-surface-container-low rounded-lg p-space-sm flex items-start gap-space-xs mt-1"}>
                <span className={"material-symbols-outlined text-[18px] text-tertiary shrink-0 mt-0.5"}>
                  tips_and_updates
                </span>
                <p className={"font-body-sm text-body-sm text-on-surface-variant leading-snug"}>
                  Helps Roam Plug calculate exact
                  <strong className={"text-on-surface"}>
                    km/L efficiency
                  </strong>
                  for your Roomy across Kingston stop-and-go climbs.
                </p>
              </div>
            </div>
            <div className={"bg-surface-container-lowest rounded-xl p-space-md shadow-sm flex flex-col gap-space-sm"}>
              <div className={"flex items-center justify-between"}>
                <div className={"flex items-center gap-space-xs text-on-surface"}>
                  <span className={"material-symbols-outlined text-[20px] text-on-surface-variant"}>
                    calendar_today
                  </span>
                  <span className={"font-label-lg text-label-lg font-bold"}>
                    Fill time
                  </span>
                </div>
                <span className={"font-body-sm text-body-sm text-on-surface-variant"}>
                  Recorded when you save
                </span>
              </div>
              <div className={"pt-space-xs"}>
                <label className={"font-label-md text-label-md text-on-surface-variant mb-1.5 block"}>
                  Receipt Verification (Optional)
                </label>
                <div className={"bg-surface-container-low hover:bg-surface-container rounded-xl p-space-md cursor-pointer transition-colors flex items-center justify-between"} id={"receipt-upload-box"}>
                  <div className={"flex items-center gap-space-sm"}>
                    <div className={"w-10 h-10 rounded-xl bg-surface-container-highest flex items-center justify-center text-primary"}>
                      <span className={"material-symbols-outlined text-[22px]"}>
                        receipt_long
                      </span>
                    </div>
                    <div>
                      <p className={"font-label-lg text-label-lg font-bold text-on-surface"}>
                        Snap Pump Slip
                      </p>
                      <p className={"font-body-sm text-body-sm text-on-surface-variant"}>
                        Auto-verifies your entry on the Plug leaderboard
                      </p>
                    </div>
                  </div>
                  <span className={"material-symbols-outlined text-[22px] text-primary"}>
                    add_a_photo
                  </span>
                </div>
              </div>
            </div>
            <div className={"pt-space-xs pb-space-lg flex flex-col gap-space-xs"}>
              <button onClick={onPlugClick} className={"w-full min-h-[48px] py-3.5 px-space-lg rounded-xl bg-primary text-on-primary font-headline-sm text-headline-sm font-bold shadow-md hover:bg-primary-container active:scale-[0.99] transition-all flex items-center justify-center gap-space-xs"} id={"save-log-btn"} type={"button"} data-act={"save-log-btn"} data-way-out={"primary"}>
                <span className={"material-symbols-outlined text-[22px]"}>
                  save
                </span>
                <span>
                  Save Fuel Log
                </span>
              </button>
              <p className={"font-label-sm text-label-sm text-center text-on-surface-variant"}>
                Logged data contributes to islandwide real-time fuel tracking • Jamaica Road Safety Compliant
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
