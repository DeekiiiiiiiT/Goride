import { useEffect, useRef } from 'react';
import { onPlugClick } from '../../shell/actions';
import { bindScreen } from '../../shell/bind';


export function StationDetailScreen() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (ref.current) bindScreen("19-station-detail.html", ref.current); }, []);
  return (
    <div ref={ref} data-plug-screen={"19-station-detail.html"} className={"min-h-full bg-surface text-on-surface antialiased flex flex-col font-body-md text-body-md"}>
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
        <div className={"flex flex-col w-full pb-8"}>
          <div className={"relative w-full h-56 bg-surface-container-high overflow-hidden shadow-sm"}>
            <div className={"w-full h-full bg-surface-container flex items-center justify-center text-primary"} aria-hidden={"true"}><span className={"material-symbols-outlined text-[32px]"}>image</span></div>
            <div className={"absolute inset-0 bg-gradient-to-t from-on-background/80 via-transparent to-black/30"} />
            <div className={"absolute bottom-3 right-4 bg-inverse-surface/80 backdrop-blur-md px-3 py-1 rounded-full flex items-center gap-1.5 shadow-sm"}>
              <span className={"material-symbols-outlined text-[16px] text-inverse-on-surface"}>
                photo_camera
              </span>
              <span className={"font-label-sm text-label-sm text-inverse-on-surface tracking-wider"}>
                1/6 Photos
              </span>
            </div>
            <div className={"absolute bottom-3 left-4 bg-surface/95 backdrop-blur-md px-3 py-1 rounded-full flex items-center gap-2 shadow-sm"}>
              <span className={"relative flex h-2.5 w-2.5"}>
                <span className={"animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"} />
                <span className={"relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-600"} />
              </span>
              <span className={"font-label-md text-label-md text-on-surface font-bold tracking-wide"}>
                PUMPS ACTIVE NOW
              </span>
            </div>
          </div>
          <div className={"px-gutter pt-space-md flex flex-col gap-space-sm"}>
            <div className={"flex items-start justify-between gap-space-sm"}>
              <div className={"flex-1 min-w-0"}>
                <div className={"flex items-center gap-2 mb-1 flex-wrap"}>
                  <span className={"px-2.5 py-0.5 rounded-full bg-surface-container-highest text-secondary font-label-sm text-label-sm uppercase tracking-wider font-extrabold"}>
                    Rubis Ultra
                  </span>
                  <span className={"px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-label-sm text-label-sm flex items-center gap-1 font-bold"}>
                    <span className={"material-symbols-outlined text-[14px]"}>
                      verified
                    </span>
                    Verified by Roam
                  </span>
                </div>
                <h1 className={"font-headline-md text-headline-md text-on-surface truncate"}>
                  Rubis Hope Road
                </h1>
              </div>
              <div className={"w-12 h-12 rounded-xl bg-surface-container-lowest shadow-md flex items-center justify-center p-1.5 flex-shrink-0"}>
                <div className={"w-full h-full rounded-lg bg-red-600 flex flex-col items-center justify-center font-black text-white text-[12px] leading-tight shadow-inner"}>
                  <span className={"tracking-tighter"}>
                    RUBIS
                  </span>
                </div>
              </div>
            </div>
            <div className={"flex flex-col gap-1.5 text-on-surface-variant font-body-sm text-body-sm"}>
              <div className={"flex items-center gap-1.5"}>
                <span className={"material-symbols-outlined text-[18px] text-primary"}>
                  location_on
                </span>
                <span className={"truncate"}>
                  123 Hope Road, Liguanea, Kingston 6, St. Andrew
                </span>
              </div>
              <div className={"flex items-center gap-2 mt-0.5"}>
                <button onClick={onPlugClick} className={"inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-surface-container text-on-surface font-label-sm text-label-sm hover:bg-surface-container-high transition-colors active:scale-95"} id={"copy-code-btn"} data-act={"copy-code-btn"}>
                  <span className={"material-symbols-outlined text-[15px] text-on-surface-variant"}>
                    content_copy
                  </span>
                  <span className={"font-mono font-semibold"}>
                    7GRM+QX Kingston
                  </span>
                </button>
                <span className={"hidden font-label-sm text-label-sm text-emerald-700 font-bold animate-pulse"} id={"copy-feedback"}>
                  Copied!
                </span>
                <span className={"text-on-surface-variant/50"}>
                  •
                </span>
                <span className={"font-label-sm text-label-sm text-on-surface-variant"}>
                  St. Andrew Hub
                </span>
              </div>
            </div>
          </div>
          <div className={"px-gutter mt-space-md grid grid-cols-2 gap-space-sm"}>
            <button onClick={onPlugClick} className={"min-h-[52px] px-4 rounded-xl bg-surface-container-highest text-on-surface font-label-lg text-label-lg flex items-center justify-center gap-2 shadow-sm hover:bg-surface-dim active:scale-98 transition-all"} data-act={"directions"}>
              <span className={"material-symbols-outlined text-[20px] text-primary"}>
                directions
              </span>
              <span>
                Directions
              </span>
            </button>
            <a onClick={onPlugClick} className={"min-h-[52px] px-4 rounded-xl bg-gradient-to-tr from-primary to-secondary-container text-on-primary font-label-lg text-label-lg flex items-center justify-center gap-2 shadow-[0_4px_16px_rgba(163,57,0,0.3)] hover:opacity-95 active:scale-98 transition-all"} href={"#"} data-act={"log-fuel-here"}>
              <span className={"material-symbols-outlined text-[20px]"}>
                local_gas_station
              </span>
              <span>
                Log Fuel Here
              </span>
            </a>
          </div>
          <div className={"hidden fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-end justify-center p-4"} id={"nav-modal"}>
            <div className={"bg-surface-container-lowest rounded-2xl w-full max-w-sm p-space-md shadow-2xl flex flex-col gap-space-sm animate-in fade-in slide-in-from-bottom duration-200"}>
              <div className={"flex justify-between items-center pb-2"}>
                <h3 className={"font-headline-sm text-headline-sm text-on-surface"}>
                  Start Navigation
                </h3>
                <button onClick={onPlugClick} className={"w-8 h-8 rounded-full bg-surface-container flex items-center justify-center text-on-surface"} data-act={"close"} data-way-out={"back"}>
                  <span className={"material-symbols-outlined text-[20px]"}>
                    close
                  </span>
                </button>
              </div>
              <p className={"font-body-sm text-body-sm text-on-surface-variant"}>
                Select your preferred navigation co-pilot for Hope Road traffic routing:
              </p>
              <div className={"grid grid-cols-2 gap-2 pt-2"}>
                <button onClick={onPlugClick} className={"p-3 rounded-xl bg-surface-container text-on-surface flex flex-col items-center gap-1 font-label-md text-label-md active:bg-surface-container-high"} data-act={"google-maps"}>
                  <span className={"material-symbols-outlined text-[28px] text-blue-600"}>
                    navigation
                  </span>
                  Google Maps
                </button>
                <button onClick={onPlugClick} className={"p-3 rounded-xl bg-surface-container text-on-surface flex flex-col items-center gap-1 font-label-md text-label-md active:bg-surface-container-high"} data-act={"waze-traffic"}>
                  <span className={"material-symbols-outlined text-[28px] text-cyan-500"}>
                    alt_route
                  </span>
                  Waze Traffic
                </button>
              </div>
            </div>
          </div>
          <div className={"px-gutter mt-space-lg"}>
            <div className={"bg-surface-container-lowest rounded-2xl p-space-md shadow-sm flex flex-col gap-space-md"}>
              <div className={"flex items-center justify-between"}>
                <div className={"flex items-center gap-2"}>
                  <div className={"w-8 h-8 rounded-lg bg-primary-fixed flex items-center justify-center text-primary"}>
                    <span className={"material-symbols-outlined text-[20px]"}>
                      payments
                    </span>
                  </div>
                  <div>
                    <h2 className={"font-headline-sm text-headline-sm text-on-surface leading-tight"}>
                      Live Pump Rates
                    </h2>
                    <p className={"font-body-sm text-body-sm text-on-surface-variant"}>
                      Jamaican Dollars per Litre (JMD)
                    </p>
                  </div>
                </div>
                <span className={"px-2 py-1 rounded bg-amber-100 text-amber-900 font-label-sm text-label-sm uppercase font-extrabold tracking-wide"}>
                  Petrojam Indexed
                </span>
              </div>
              <div className={"flex flex-col gap-2.5"}>
                <div className={"p-3 rounded-xl bg-surface-container-low flex items-center justify-between"}>
                  <div className={"flex items-center gap-3"}>
                    <div className={"w-10 h-10 rounded-lg bg-emerald-700 flex items-center justify-center text-white font-extrabold text-sm shadow-sm"}>
                      87
                    </div>
                    <div className={"flex flex-col"}>
                      <span className={"font-label-lg text-label-lg text-on-surface"}>
                        E-10 87 Unleaded
                      </span>
                      <span className={"font-body-sm text-body-sm text-on-surface-variant"}>
                        Updated 2h ago by Andre B.
                      </span>
                    </div>
                  </div>
                  <div className={"flex flex-col items-end"}>
                    <span className={"font-price-display text-price-display text-primary"}>
                      J$214.50
                    </span>
                    <span className={"font-label-sm text-label-sm text-on-surface-variant font-medium"}>
                      / Litre
                    </span>
                  </div>
                </div>
                <div className={"p-3 rounded-xl bg-surface-container-low flex items-center justify-between"}>
                  <div className={"flex items-center gap-3"}>
                    <div className={"w-10 h-10 rounded-lg bg-red-700 flex items-center justify-center text-white font-extrabold text-sm shadow-sm"}>
                      90
                    </div>
                    <div className={"flex flex-col"}>
                      <span className={"font-label-lg text-label-lg text-on-surface"}>
                        E-10 90 Unleaded
                      </span>
                      <span className={"font-body-sm text-body-sm text-on-surface-variant"}>
                        Updated 2h ago
                      </span>
                    </div>
                  </div>
                  <div className={"flex flex-col items-end"}>
                    <span className={"font-price-display text-price-display text-primary"}>
                      J$224.10
                    </span>
                    <span className={"font-label-sm text-label-sm text-on-surface-variant font-medium"}>
                      / Litre
                    </span>
                  </div>
                </div>
                <div className={"p-3 rounded-xl bg-surface-container-low flex items-center justify-between"}>
                  <div className={"flex items-center gap-3"}>
                    <div className={"w-10 h-10 rounded-lg bg-neutral-900 flex items-center justify-center text-white font-extrabold text-xs shadow-sm"}>
                      ULSD
                    </div>
                    <div className={"flex flex-col"}>
                      <span className={"font-label-lg text-label-lg text-on-surface truncate max-w-[140px]"}>
                        Ultra Low Diesel
                      </span>
                      <span className={"font-body-sm text-body-sm text-on-surface-variant"}>
                        Updated yesterday
                      </span>
                    </div>
                  </div>
                  <div className={"flex flex-col items-end"}>
                    <span className={"font-price-display text-price-display text-primary"}>
                      J$231.80
                    </span>
                    <span className={"font-label-sm text-label-sm text-on-surface-variant font-medium"}>
                      / Litre
                    </span>
                  </div>
                </div>
              </div>
              <div className={"flex items-center gap-2 pt-1 text-on-surface-variant font-body-sm text-body-sm"}>
                <span className={"material-symbols-outlined text-[16px] text-tertiary"}>
                  info
                </span>
                <span>
                  {"Prices verified from local taxi drivers' logs & pump receipts."}
                </span>
              </div>
            </div>
          </div>
          <div className={"px-gutter mt-space-md"}>
            <div className={"bg-surface-container-lowest rounded-xl p-space-md shadow-sm flex items-center justify-between"}>
              <div className={"flex items-center gap-3"}>
                <div className={"w-9 h-9 rounded-lg bg-surface-container flex items-center justify-center text-on-surface"}>
                  <span className={"material-symbols-outlined text-[20px]"}>
                    schedule
                  </span>
                </div>
                <div>
                  <span className={"font-label-lg text-label-lg text-on-surface block"}>
                    Operating Hours
                  </span>
                  <span className={"font-body-sm text-body-sm text-on-surface-variant"}>
                    Always Open • 24 Hours, 7 Days
                  </span>
                </div>
              </div>
              <span className={"px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 font-label-sm text-label-sm font-bold flex items-center gap-1"}>
                <span className={"w-2 h-2 rounded-full bg-emerald-600"} />
                Open Now
              </span>
            </div>
          </div>
          <div className={"px-gutter mt-space-lg"}>
            <div className={"flex items-center justify-between mb-space-sm"}>
              <h3 className={"font-headline-sm text-headline-sm text-on-surface"}>
                Station Amenities
              </h3>
              <span className={"font-label-sm text-label-sm text-on-surface-variant"}>
                Verified by drivers
              </span>
            </div>
            <div className={"grid grid-cols-2 gap-2.5"}>
              <div className={"p-3 rounded-xl bg-surface-container-lowest shadow-sm flex items-center gap-3"}>
                <div className={"w-9 h-9 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center flex-shrink-0"}>
                  <span className={"material-symbols-outlined text-[20px]"}>
                    compress
                  </span>
                </div>
                <div className={"min-w-0"}>
                  <span className={"font-label-md text-label-md text-on-surface block truncate"}>
                    Air Gauge / Pump
                  </span>
                  <span className={"font-body-sm text-body-sm text-emerald-700 font-semibold"}>
                    Available • Free
                  </span>
                </div>
              </div>
              <div className={"p-3 rounded-xl bg-surface-container-lowest shadow-sm flex items-center gap-3"}>
                <div className={"w-9 h-9 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center flex-shrink-0"}>
                  <span className={"material-symbols-outlined text-[20px]"}>
                    wc
                  </span>
                </div>
                <div className={"min-w-0"}>
                  <span className={"font-label-md text-label-md text-on-surface block truncate"}>
                    Restroom
                  </span>
                  <span className={"font-body-sm text-body-sm text-on-surface-variant"}>
                    Clean • J$100 fee
                  </span>
                </div>
              </div>
              <div className={"p-3 rounded-xl bg-surface-container-lowest shadow-sm flex items-center gap-3"}>
                <div className={"w-9 h-9 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center flex-shrink-0"}>
                  <span className={"material-symbols-outlined text-[20px]"}>
                    storefront
                  </span>
                </div>
                <div className={"min-w-0"}>
                  <span className={"font-label-md text-label-md text-on-surface block truncate"}>
                    Ultra Shop
                  </span>
                  <span className={"font-body-sm text-body-sm text-emerald-700 font-semibold"}>
                    Available • Snacks
                  </span>
                </div>
              </div>
              <div className={"p-3 rounded-xl bg-surface-container-lowest shadow-sm flex items-center gap-3"}>
                <div className={"w-9 h-9 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center flex-shrink-0"}>
                  <span className={"material-symbols-outlined text-[20px]"}>
                    atm
                  </span>
                </div>
                <div className={"min-w-0"}>
                  <span className={"font-label-md text-label-md text-on-surface block truncate"}>
                    24/7 Bank ATM
                  </span>
                  <span className={"font-body-sm text-body-sm text-emerald-700 font-semibold"}>
                    {"NCB & Scotia"}
                  </span>
                </div>
              </div>
              <div className={"p-3 rounded-xl bg-surface-container-low opacity-70 shadow-sm flex items-center gap-3"}>
                <div className={"w-9 h-9 rounded-lg bg-surface-container text-on-surface-variant flex items-center justify-center flex-shrink-0"}>
                  <span className={"material-symbols-outlined text-[20px]"}>
                    local_car_wash
                  </span>
                </div>
                <div className={"min-w-0"}>
                  <span className={"font-label-md text-label-md text-on-surface block truncate"}>
                    Car Wash Bay
                  </span>
                  <span className={"font-body-sm text-body-sm text-on-surface-variant"}>
                    Unavailable
                  </span>
                </div>
              </div>
              <div className={"p-3 rounded-xl bg-surface-container-low opacity-70 shadow-sm flex items-center gap-3"}>
                <div className={"w-9 h-9 rounded-lg bg-surface-container text-on-surface-variant flex items-center justify-center flex-shrink-0"}>
                  <span className={"material-symbols-outlined text-[20px]"}>
                    ev_station
                  </span>
                </div>
                <div className={"min-w-0"}>
                  <span className={"font-label-md text-label-md text-on-surface block truncate"}>
                    EV Charging
                  </span>
                  <span className={"font-body-sm text-body-sm text-on-surface-variant"}>
                    Not Installed
                  </span>
                </div>
              </div>
            </div>
          </div>
          <div className={"px-gutter mt-space-lg"}>
            <div className={"flex items-center justify-between mb-space-sm"}>
              <h3 className={"font-headline-sm text-headline-sm text-on-surface"}>
                {"Location & Approach"}
              </h3>
              <span className={"font-label-sm text-label-sm text-primary font-bold"}>
                Hope Rd / Liguanea
              </span>
            </div>
            <div className={"w-full h-36 rounded-2xl bg-cover bg-center shadow-sm relative overflow-hidden"} data-location={"123 Hope Road, Kingston, Jamaica"}>
              <div className={"absolute inset-0 bg-black/20 flex items-center justify-center"}>
                <div className={"bg-surface/90 backdrop-blur-md px-3.5 py-1.5 rounded-full shadow-lg flex items-center gap-2"}>
                  <span className={"material-symbols-outlined text-[18px] text-primary"}>
                    pin_drop
                  </span>
                  <span className={"font-label-md text-label-md text-on-surface font-bold"}>
                    Opposite Sovereign Centre
                  </span>
                </div>
              </div>
            </div>
          </div>
          <div className={"px-gutter mt-space-lg"}>
            <div className={"p-space-sm bg-surface-container-low rounded-2xl flex items-center justify-around"}>
              <button onClick={onPlugClick} className={"flex flex-col items-center gap-1 p-2 text-on-surface-variant hover:text-primary transition-colors active:scale-95"} data-act={"suggest-edit"}>
                <span className={"material-symbols-outlined text-[20px]"}>
                  edit_note
                </span>
                <span className={"font-label-sm text-label-sm"}>
                  Suggest Edit
                </span>
              </button>
              <div className={"h-6 w-px bg-surface-container-highest"} />
              <button onClick={onPlugClick} className={"flex flex-col items-center gap-1 p-2 text-on-surface-variant hover:text-primary transition-colors active:scale-95"} data-act={"report-price"}>
                <span className={"material-symbols-outlined text-[20px]"}>
                  price_change
                </span>
                <span className={"font-label-sm text-label-sm"}>
                  Report Price
                </span>
              </button>
              <div className={"h-6 w-px bg-surface-container-highest"} />
              <button onClick={onPlugClick} className={"flex flex-col items-center gap-1 p-2 text-on-surface-variant hover:text-error transition-colors active:scale-95"} data-act={"report-issue"}>
                <span className={"material-symbols-outlined text-[20px]"}>
                  report_problem
                </span>
                <span className={"font-label-sm text-label-sm"}>
                  Report Issue
                </span>
              </button>
            </div>
          </div>
          <div className={"px-gutter mt-space-md"}>
            <div className={"bg-surface-container-highest/60 rounded-xl p-space-md flex items-center gap-3"}>
              <div className={"flex -space-x-2 overflow-hidden flex-shrink-0"}>
                <div className={"inline-block h-8 w-8 rounded-full bg-secondary text-on-secondary flex items-center justify-center font-bold text-xs ring-2 ring-surface"}>
                  AB
                </div>
                <div className={"inline-block h-8 w-8 rounded-full bg-primary text-on-primary flex items-center justify-center font-bold text-xs ring-2 ring-surface"}>
                  KJ
                </div>
                <div className={"inline-block h-8 w-8 rounded-full bg-tertiary text-on-tertiary flex items-center justify-center font-bold text-xs ring-2 ring-surface"}>
                  TR
                </div>
                <div className={"inline-block h-8 w-8 rounded-full bg-surface-container-highest text-on-surface flex items-center justify-center font-bold text-[12px] ring-2 ring-surface"}>
                  +11
                </div>
              </div>
              <div className={"min-w-0"}>
                <p className={"font-label-md text-label-md text-on-surface font-semibold truncate"}>
                  Mapped with 14 St. Andrew drivers
                </p>
                <p className={"font-body-sm text-body-sm text-on-surface-variant"}>
                  {"Keeping Kingston transit transparent & honest."}
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
