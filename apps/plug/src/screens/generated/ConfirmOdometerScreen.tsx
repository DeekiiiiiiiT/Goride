import { useEffect, useRef } from 'react';
import { onPlugClick } from '../../shell/actions';
import { bindScreen } from '../../shell/bind';


export function ConfirmOdometerScreen() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (ref.current) bindScreen("25-confirm-odometer.html", ref.current); }, []);
  return (
    <div ref={ref} data-plug-screen={"25-confirm-odometer.html"} className={"bg-surface font-body-md text-on-surface flex flex-col min-h-screen"}>
      <header className={"fixed top-0 w-full z-50 pt-safe bg-surface/85 backdrop-blur-xl shadow-[0_1px_8px_rgba(0,0,0,0.04)]"}>
        <div className={"h-16 px-margin flex items-center justify-between"}>
          <div className={"flex items-center gap-space-sm"}>
            <button onClick={onPlugClick} aria-label={"Back"} className={"w-11 h-11 min-h-[44px] min-w-[44px] flex items-center justify-center text-on-surface hover:text-primary rounded-full active:bg-surface-container transition-colors"} data-act={"arrow-back"} data-way-out={"back"}>
              <span className={"material-symbols-outlined text-[24px]"}>
                arrow_back
              </span>
            </button>
            <h1 className={"font-headline-sm text-headline-sm text-on-surface tracking-tight line-clamp-1"}>
              Log Fuel Confirm Odometer
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
          <div className={"flex flex-col gap-space-md px-margin pt-space-sm pb-28"}>
            <div className={"flex items-center justify-between p-space-md bg-surface-container rounded-xl shadow-sm"}>
              <div className={"flex items-center gap-space-sm min-w-0"}>
                <div className={"w-12 h-12 rounded-lg bg-surface-container-highest flex items-center justify-center text-primary flex-shrink-0"}>
                  <span className={"material-symbols-outlined text-[28px]"} style={{ fontVariationSettings: "'FILL' 1" }}>
                    directions_car
                  </span>
                </div>
                <div className={"flex flex-col min-w-0"}>
                  <div className={"flex items-center gap-space-xs"}>
                    <span className={"font-headline-sm text-headline-sm text-on-surface truncate"}>
                      2019 Toyota Roomy
                    </span>
                    <span className={"inline-flex items-center px-1.5 py-0.5 rounded-full bg-secondary-container text-on-secondary-container font-label-sm text-label-sm uppercase tracking-wider"}>
                      Route Taxi
                    </span>
                  </div>
                  <div className={"flex items-center gap-2 mt-0.5"}>
                    <span className={"font-label-md text-label-md px-2 py-0.5 rounded bg-surface-container-lowest text-on-surface font-semibold tracking-wider"}>
                      8241-HY
                    </span>
                    <span className={"text-on-surface-variant font-body-sm text-body-sm flex items-center gap-1"}>
                      <span className={"w-1.5 h-1.5 rounded-full bg-tertiary"} />
                      Kingston • St. Andrew
                    </span>
                  </div>
                </div>
              </div>
              <button onClick={onPlugClick} aria-label={"Switch vehicle"} className={"w-9 h-9 flex items-center justify-center rounded-full text-on-surface-variant hover:text-primary active:bg-surface-container-high transition-colors"} type={"button"} data-act={"swap-horiz"}>
                <span className={"material-symbols-outlined text-[20px]"}>
                  swap_horiz
                </span>
              </button>
            </div>
            <div className={"flex flex-col gap-space-xs p-space-md bg-surface-container-lowest rounded-xl shadow-sm"}>
              <div className={"flex items-center justify-between"}>
                <div className={"flex items-center gap-1.5 text-on-surface-variant"}>
                  <span className={"material-symbols-outlined text-[18px]"}>
                    crop_free
                  </span>
                  <span className={"font-label-md text-label-md uppercase tracking-wider"}>
                    Captured Cluster Snapshot
                  </span>
                </div>
                <span className={"inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-surface-container text-on-surface font-label-sm text-label-sm"}>
                  <span className={"w-2 h-2 rounded-full bg-primary animate-pulse"} />
                  AI OCR Scan
                </span>
              </div>
              <div className={"relative w-full h-32 rounded-lg overflow-hidden bg-inverse-surface mt-1 shadow-inner flex items-center justify-center"}>
                <img className={"w-full h-full object-cover opacity-85"} data-alt={"Close-up macro shot of a Japanese compact car backlit digital LCD odometer showing high-contrast illuminated black digits reading 084612 km on an amber illuminated dashboard instrument panel with subtle dust textures and sharp focus in warm sunlight."} src={"https://lh3.googleusercontent.com/aida-public/AB6AXuD23viHIAK2sxOQ6tPWYrZHwbuhxb-kWiSHnzgX7yFFCoLBRq5E_PdSTM1WlXS_ZWpy6vqh0yKd-cV_d101oQGYYI0of457f6nUpH9olFgUB9C-SAK4AcupwZ0Ns6wofyfDGw_0VMug-2ZxTe_rGwGnLniIE_kq4STgGniEN4JbctAN9XfTjlFsCmPT8Py-lEDBCzx_nkfGs37_VT_JGsc9G77mJPJHwHEsY46YXS3PEk5mIExKcXKf"} />
                <div className={"absolute inset-0 bg-gradient-to-t from-inverse-surface/80 via-transparent to-inverse-surface/30"} />
                <div className={"absolute inset-x-8 inset-y-4 rounded bg-primary/10 flex items-center justify-between px-4"}>
                  <div className={"w-2.5 h-2.5 -top-1 -left-1 absolute bg-secondary-container rounded-sm"} />
                  <div className={"w-2.5 h-2.5 -top-1 -right-1 absolute bg-secondary-container rounded-sm"} />
                  <div className={"w-2.5 h-2.5 -bottom-1 -left-1 absolute bg-secondary-container rounded-sm"} />
                  <div className={"w-2.5 h-2.5 -bottom-1 -right-1 absolute bg-secondary-container rounded-sm"} />
                  <span className={"text-on-primary font-label-sm text-label-sm uppercase bg-inverse-surface/85 px-1.5 py-0.5 rounded shadow"}>
                    Reading Verified
                  </span>
                  <span className={"material-symbols-outlined text-secondary-fixed text-[18px]"}>
                    verified
                  </span>
                </div>
              </div>
            </div>
            <div className={"flex flex-col p-space-md bg-surface-container-lowest rounded-xl shadow-sm gap-space-md"}>
              <div className={"flex items-center justify-between"}>
                <span className={"font-label-lg text-label-lg text-on-surface-variant uppercase tracking-wider font-semibold"}>
                  Odometer Reading
                </span>
                <div className={"inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-surface-container-high text-on-surface font-label-md text-label-md"}>
                  <span className={"material-symbols-outlined text-[16px] text-primary"} style={{ fontVariationSettings: "'FILL' 1" }}>
                    check_circle
                  </span>
                  <span className={"font-semibold text-primary"}>
                    High Confidence (98.4%)
                  </span>
                </div>
              </div>
              <div className={"relative flex items-baseline justify-center py-2 bg-surface-container-low rounded-xl group transition-all cursor-pointer"} id={"readingContainer"}>
                <input className={"w-56 bg-transparent text-center font-display-lg-mobile text-display-lg-mobile text-on-surface font-extrabold tracking-tight outline-none select-all"} id={"odometerInput"} inputMode={"numeric"} type={"number"} defaultValue={"84612"} />
                <span className={"font-headline-md text-headline-md text-on-surface-variant font-bold ml-1"}>
                  km
                </span>
                <button onClick={onPlugClick} aria-label={"Manual edit"} className={"absolute right-4 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-surface-container-highest flex items-center justify-center text-on-surface-variant group-hover:text-primary transition-colors"} type={"button"} data-act={"edit"}>
                  <span className={"material-symbols-outlined text-[18px]"}>
                    edit
                  </span>
                </button>
              </div>
              <div className={"grid grid-cols-3 gap-space-sm pt-1"}>
                <button onClick={onPlugClick} className={"h-12 min-h-[48px] rounded-lg bg-surface-container hover:bg-surface-container-high active:scale-95 text-on-surface font-label-lg text-label-lg flex items-center justify-center gap-1 transition-all"} type={"button"} data-act={"10-km"}>
                  <span className={"material-symbols-outlined text-[18px]"}>
                    remove
                  </span>
                  <span>
                    10 km
                  </span>
                </button>
                <button onClick={onPlugClick} className={"h-12 min-h-[48px] rounded-lg bg-surface-container hover:bg-surface-container-high active:scale-95 text-on-surface font-label-lg text-label-lg flex items-center justify-center gap-1 transition-all"} type={"button"} data-act={"10-km-2"}>
                  <span className={"material-symbols-outlined text-[18px]"}>
                    add
                  </span>
                  <span>
                    10 km
                  </span>
                </button>
                <button onClick={onPlugClick} className={"h-12 min-h-[48px] rounded-lg bg-surface-container-highest hover:bg-surface-variant active:scale-95 text-on-surface-variant font-label-lg text-label-lg flex items-center justify-center gap-1 transition-all"} type={"button"} data-act={"retake"}>
                  <span className={"material-symbols-outlined text-[18px]"}>
                    photo_camera
                  </span>
                  <span>
                    Retake
                  </span>
                </button>
              </div>
            </div>
            <div className={"flex flex-col gap-space-xs p-space-md bg-secondary-fixed/50 rounded-xl shadow-sm"}>
              <div className={"flex items-start gap-space-sm"}>
                <div className={"w-8 h-8 rounded-full bg-secondary-container text-on-secondary-container flex items-center justify-center flex-shrink-0 mt-0.5"}>
                  <span className={"material-symbols-outlined text-[20px]"} style={{ fontVariationSettings: "'FILL' 1" }}>
                    insights
                  </span>
                </div>
                <div className={"flex flex-col min-w-0"}>
                  <span className={"font-label-lg text-label-lg font-bold text-on-secondary-fixed"}>
                    Smart Route Validation
                  </span>
                  <p className={"font-body-md text-body-md text-on-secondary-fixed-variant mt-0.5"}>
                    That's
                    <strong className={"font-bold text-on-surface"} id={"calcDiff"}>
                      402 km
                    </strong>
                    since your last log (
                    <span className={"font-semibold"}>
                      84,210 km
                    </span>
                    ) — looks right for your Kingston → Ocho Rios round trip commute!
                  </p>
                </div>
              </div>
            </div>
            <div className={"grid grid-cols-2 gap-space-sm"}>
              <div className={"p-space-md bg-surface-container-lowest rounded-xl shadow-sm flex flex-col justify-between"}>
                <div className={"flex items-center gap-1.5 text-on-surface-variant"}>
                  <span className={"material-symbols-outlined text-[18px]"}>
                    straighten
                  </span>
                  <span className={"font-label-md text-label-md uppercase tracking-wider"}>
                    Distance Run
                  </span>
                </div>
                <div className={"mt-2 flex items-baseline gap-1"}>
                  <span className={"font-display-lg-mobile text-display-lg-mobile font-extrabold text-on-surface"} id={"statDiffKm"}>
                    402
                  </span>
                  <span className={"font-label-lg text-label-lg font-bold text-on-surface-variant"}>
                    km
                  </span>
                </div>
                <span className={"font-body-sm text-body-sm text-on-surface-variant mt-1"}>
                  Since 3 days ago
                </span>
              </div>
              <div className={"p-space-md bg-surface-container-lowest rounded-xl shadow-sm flex flex-col justify-between"}>
                <div className={"flex items-center gap-1.5 text-secondary"}>
                  <span className={"material-symbols-outlined text-[18px]"} style={{ fontVariationSettings: "'FILL' 1" }}>
                    local_gas_station
                  </span>
                  <span className={"font-label-md text-label-md uppercase tracking-wider"}>
                    Est. Burned
                  </span>
                </div>
                <div className={"mt-2 flex items-baseline gap-1"}>
                  <span className={"font-display-lg-mobile text-display-lg-mobile font-extrabold text-secondary"} id={"statEstLiters"}>
                    24.5
                  </span>
                  <span className={"font-label-lg text-label-lg font-bold text-secondary"}>
                    Liters
                  </span>
                </div>
                <span className={"font-body-sm text-body-sm text-on-surface-variant mt-1"}>
                  ~16.4 km/L rating
                </span>
              </div>
            </div>
            <div className={"flex flex-col bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden"}>
              <button onClick={onPlugClick} aria-expanded={"false"} className={"w-full min-h-[48px] px-space-md py-space-sm flex items-center justify-between text-left active:bg-surface-container transition-colors"} id={"safeguardBtn"} type={"button"} data-act={"safeguardBtn"}>
                <div className={"flex items-center gap-space-xs min-w-0"}>
                  <span className={"material-symbols-outlined text-primary text-[20px]"}>
                    shield
                  </span>
                  <span className={"font-label-lg text-label-lg font-bold text-on-surface truncate"}>
                    Lower reading safeguard active
                  </span>
                </div>
                <span className={"material-symbols-outlined text-on-surface-variant text-[20px] transition-transform duration-200"} id={"safeguardChevron"}>
                  expand_more
                </span>
              </button>
              <div className={"hidden px-space-md pb-space-md pt-1 flex-col gap-space-xs bg-surface-container-low"} id={"safeguardContent"}>
                <p className={"font-body-sm text-body-sm text-on-surface-variant"}>
                  If your new odometer entry is lower than your last recorded trip (
                  <span className={"font-semibold text-on-surface"}>
                    84,210 km
                  </span>
                  ), our mileage engine marks it as a cluster replacement or manual reset. You'll be prompted for a reason before statutory fuel consumption calculations update.
                </p>
                <div className={"flex items-center gap-2 mt-2 pt-2 border-t border-surface-container-high/50 text-tertiary"}>
                  <span className={"material-symbols-outlined text-[16px]"}>
                    verified_user
                  </span>
                  <span className={"font-label-sm text-label-sm font-semibold uppercase"}>
                    Island Transport Authority Tamper Guard
                  </span>
                </div>
              </div>
            </div>
          </div>
          <div className={"fixed bottom-0 inset-x-0 bg-surface/95 backdrop-blur-xl p-margin pb-safe shadow-[0_-8px_20px_-4px_rgba(234,88,12,0.15)] z-40"}>
            <div className={"max-w-md mx-auto flex flex-col gap-2"}>
              <button onClick={onPlugClick} className={"w-full h-14 min-h-[48px] rounded-xl bg-primary hover:bg-primary-container active:scale-[0.99] text-on-primary font-headline-sm text-headline-sm flex items-center justify-center gap-space-sm shadow-md transition-all"} type={"button"} data-act={"confirm-continue-to-fuel"} data-way-out={"primary"}>
                <span>
                  {"Confirm & Continue to Fuel"}
                </span>
                <span className={"material-symbols-outlined text-[22px]"}>
                  arrow_forward
                </span>
              </button>
              <div className={"flex items-center justify-center gap-1.5 py-0.5"}>
                <span className={"material-symbols-outlined text-[14px] text-on-surface-variant"}>
                  lock
                </span>
                <span className={"font-label-sm text-label-sm text-on-surface-variant"}>
                  Stored locally • Syncs with Kingston Depot fleet feed
                </span>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
