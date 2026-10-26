import { useEffect, useRef } from 'react';
import { onPlugClick } from '../../shell/actions';
import { bindScreen } from '../../shell/bind';


export function PendingPlaceScreen() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (ref.current) bindScreen("23-pending-place.html", ref.current); }, []);
  return (
    <div ref={ref} data-plug-screen={"23-pending-place.html"} className={"bg-surface font-body-md text-on-surface flex flex-col min-h-screen"}>
      <header className={"fixed top-0 w-full z-50 pt-safe bg-surface/80 backdrop-blur-xl shadow-[0_1px_8px_rgba(0,0,0,0.04)]"}>
        <div className={"h-16 px-margin flex items-center justify-between"}>
          <div className={"flex items-center gap-space-sm"}>
            <button onClick={onPlugClick} aria-label={"Back"} className={"w-12 h-12 flex items-center justify-center text-on-surface hover:text-primary rounded-full active:bg-surface-container transition-colors"} data-act={"arrow-back"} data-way-out={"back"}>
              <span className={"material-symbols-outlined text-[24px]"}>
                arrow_back
              </span>
            </button>
            <h1 className={"font-headline-sm text-headline-sm text-on-surface tracking-tight line-clamp-1"}>
              Traffic Hazard Report
            </h1>
          </div>
          <div className={"flex items-center"}>
            <div className={"w-8 h-8 rounded-full bg-primary flex items-center justify-center"}>
              <span className={"material-symbols-outlined text-on-primary text-[18px]"}>
                person
              </span>
            </div>
          </div>
        </div>
      </header>
      <main className={"flex flex-col relative w-full pt-16 bg-surface flex-1"}>
        <div className={"flex flex-col w-full pb-safe"}>
          <div className={"px-margin pt-space-md"}>
            <div className={"bg-surface-container-high rounded-xl p-space-md shadow-sm relative overflow-hidden"}>
              <div className={"flex items-start gap-space-sm"}>
                <div className={"w-10 h-10 rounded-full bg-secondary-container/20 flex items-center justify-center shrink-0"}>
                  <span className={"material-symbols-outlined text-secondary text-[22px]"} style={{ fontVariationSettings: "'FILL' 1" }}>
                    hourglass_top
                  </span>
                </div>
                <div className={"flex flex-col min-w-0"}>
                  <div className={"flex items-center gap-space-xs flex-wrap"}>
                    <span className={"font-label-md text-label-md bg-secondary text-on-secondary px-2.5 py-0.5 rounded-full uppercase tracking-wider"}>
                      Under Review
                    </span>
                    <span className={"font-label-sm text-label-sm text-on-surface-variant flex items-center gap-0.5"}>
                      <span className={"material-symbols-outlined text-[13px] text-primary"}>
                        schedule
                      </span>
                      24–48 hrs est.
                    </span>
                  </div>
                  <p className={"font-body-md text-body-md text-on-surface mt-1.5 font-semibold leading-snug"}>
                    Pinned by You • Pending Community Approval
                  </p>
                  <p className={"font-body-sm text-body-sm text-on-surface-variant mt-1"}>
                    The Roam team reviews every pin before it goes live to maintain verified road accuracy across all 14 parishes.
                  </p>
                </div>
              </div>
            </div>
          </div>
          <div className={"px-margin mt-space-md"}>
            <div className={"bg-surface-container-lowest rounded-xl p-space-md shadow-sm flex flex-col gap-space-sm"}>
              <div className={"flex items-start justify-between gap-space-sm"}>
                <div className={"flex flex-col min-w-0"}>
                  <span className={"inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface-container font-label-md text-label-md text-on-surface-variant w-fit mb-2"}>
                    <span className={"material-symbols-outlined text-[15px] text-primary"}>
                      tire_repair
                    </span>
                    {"Tyre Shop & Air Compressor"}
                  </span>
                  <h2 className={"font-headline-md text-headline-md text-on-surface leading-tight tracking-tight"}>
                    {""}
                  </h2>
                  <p className={"font-body-sm text-body-sm text-on-surface-variant flex items-center gap-1 mt-1"}>
                    <span className={"material-symbols-outlined text-[16px] text-outline"}>
                      location_on
                    </span>
                    
                  </p>
                </div>
              </div>
              <div className={"flex items-center justify-between pt-2 text-on-surface-variant font-label-sm text-label-sm"}>
                <span className={"flex items-center gap-1"}>
                  <span className={"material-symbols-outlined text-[14px]"}>
                    event_available
                  </span>
                  Oct 24, 2024 • 3:15 PM
                </span>
                <span className={"font-mono bg-surface-container px-2 py-0.5 rounded text-on-surface"}>
                  18.0241° N, 76.7932° W
                </span>
              </div>
            </div>
          </div>
          <div className={"px-margin mt-space-md"}>
            <div className={"bg-surface-container-lowest rounded-xl overflow-hidden shadow-sm flex flex-col"}>
              <div className={"relative w-full h-52 bg-surface-container"}>
                <svg className={"w-full h-full object-cover"} fill={"none"} viewBox={"0 0 400 220"} xmlns={"http://www.w3.org/2000/svg"}>
                  <rect fill={"#f4ede6"} height={"220"} width={"400"} />
                  <rect fill={"#eee7e0"} height={"50"} rx={"4"} width={"70"} x={"20"} y={"20"} />
                  <rect fill={"#eee7e0"} height={"55"} rx={"4"} width={"130"} x={"110"} y={"15"} />
                  <rect fill={"#eee7e0"} height={"50"} rx={"4"} width={"120"} x={"260"} y={"20"} />
                  <rect fill={"#eee7e0"} height={"110"} rx={"4"} width={"80"} x={"20"} y={"90"} />
                  <rect fill={"#eee7e0"} height={"90"} rx={"4"} width={"120"} x={"120"} y={"110"} />
                  <rect fill={"#eee7e0"} height={"110"} rx={"4"} width={"120"} x={"260"} y={"90"} />
                  <path d={"M-20 80 Q 180 80, 420 80"} stroke={"#ffffff"} strokeLinecap={"round"} strokeWidth={"22"} />
                  <path d={"M-20 80 Q 180 80, 420 80"} stroke={"#fd761a"} strokeDasharray={"8 6"} strokeWidth={"3"} />
                  <path d={"M105 -10 L 105 230"} stroke={"#ffffff"} strokeWidth={"16"} />
                  <path d={"M250 -10 L 250 230"} stroke={"#ffffff"} strokeWidth={"14"} />
                  <text fill={"#8e7166"} fontFamily={"sans-serif"} fontSize={"10"} fontWeight={"700"} letterSpacing={"1"} x={"130"} y={"74"}>
                    DUNROBIN AVENUE
                  </text>
                  <text fill={"#8e7166"} fontFamily={"sans-serif"} fontSize={"9"} fontWeight={"600"} x={"265"} y={"130"}>
                    DUNROBIN PLAZA
                  </text>
                </svg>
                <div className={"absolute inset-0 flex items-center justify-center pointer-events-none"}>
                  <div className={"relative flex items-center justify-center"}>
                    <div className={"absolute w-28 h-28 rounded-full bg-secondary-container/25 animate-ping"} />
                    <div className={"absolute w-20 h-20 rounded-full bg-secondary-container/30"} />
                    <div style={{ position: "absolute", top: "42%", left: "50%", transform: "translate(-50%,-100%)", zIndex: "5", display: "flex", flexDirection: "column", alignItems: "center", gap: "6px" }}>
                      <span style={{ background: "#fff", color: "#57534e", border: "1px dashed #57534e", borderRadius: "999px", padding: "4px 8px", font: "700 11px Inter,sans-serif" }}>
                        Awaiting approval
                      </span>
                      <span style={{ width: "18px", height: "18px", border: "2px dashed #57534e", borderRadius: "999px", background: "#fff" }} />
                    </div>
                    <div className={"relative z-10 w-11 h-11 bg-primary rounded-full shadow-lg flex items-center justify-center text-on-primary ring-4 ring-surface-container-lowest"}>
                      <span className={"material-symbols-outlined text-[24px]"} style={{ fontVariationSettings: "'FILL' 1" }}>
                        air
                      </span>
                    </div>
                    <div className={"absolute -bottom-2 w-4 h-1.5 bg-on-surface/30 rounded-full blur-[1px]"} />
                  </div>
                </div>
                <div className={"absolute top-3 left-3 bg-surface-container-lowest/95 backdrop-blur-sm rounded-full px-3 py-1 flex items-center gap-1.5 shadow-sm"}>
                  <span className={"w-2 h-2 rounded-full bg-green-600 animate-pulse"} />
                  <span className={"font-label-sm text-label-sm text-on-surface font-bold tracking-wide"}>
                    High Accuracy (±15m)
                  </span>
                </div>
                <div className={"absolute bottom-3 right-3 bg-inverse-surface/85 backdrop-blur-sm text-inverse-on-surface rounded-full px-2.5 py-1 text-[12px] font-semibold flex items-center gap-1"}>
                  <span className={"material-symbols-outlined text-[13px] text-tertiary-fixed"}>
                    gps_fixed
                  </span>
                  Calibrated on-site
                </div>
              </div>
              <div className={"p-space-md flex items-center justify-between text-on-surface"}>
                <div className={"flex items-center gap-2"}>
                  <span className={"material-symbols-outlined text-primary text-[20px]"}>
                    explore
                  </span>
                  <span className={"font-body-sm text-body-sm text-on-surface-variant"}>
                    Kingston 10 • St. Andrew Parish Corridor
                  </span>
                </div>
                <button onClick={onPlugClick} className={"font-label-md text-label-md text-primary font-bold active:opacity-70 flex items-center gap-0.5"} type={"button"} data-act={"view-map"}>
                  View Map
                  <span className={"material-symbols-outlined text-[16px]"}>
                    open_in_new
                  </span>
                </button>
              </div>
            </div>
          </div>
          <div className={"px-margin mt-space-md grid grid-cols-1 gap-space-sm"}>
            <div className={"bg-surface-container-lowest rounded-xl p-space-md shadow-sm"}>
              <div className={"flex items-center justify-between mb-space-sm"}>
                <h3 className={"font-headline-sm text-headline-sm text-on-surface flex items-center gap-1.5"}>
                  <span className={"material-symbols-outlined text-primary text-[20px]"}>
                    photo_camera
                  </span>
                  Attached Verification Photo
                </h3>
                <span className={"font-label-sm text-label-sm text-on-surface-variant bg-surface-container px-2 py-0.5 rounded"}>
                  1 Photo
                </span>
              </div>
              <div className={"relative rounded-lg overflow-hidden h-44 bg-surface-container"}>
                <div className={"w-full h-full object-cover bg-surface-container flex items-center justify-center text-primary"} aria-hidden={"true"}><span className={"material-symbols-outlined text-[32px]"}>image</span></div>
                <div className={"absolute bottom-2 left-2 bg-on-surface/80 backdrop-blur-sm px-2.5 py-1 rounded text-surface font-label-sm text-label-sm flex items-center gap-1"}>
                  <span className={"material-symbols-outlined text-[14px] text-secondary-fixed"}>
                    verified
                  </span>
                  Original capture • Dunrobin Ave
                </div>
              </div>
            </div>
            <div className={"bg-surface-container-lowest rounded-xl p-space-md shadow-sm flex flex-col gap-1.5"}>
              <h3 className={"font-headline-sm text-headline-sm text-on-surface flex items-center gap-1.5"}>
                <span className={"material-symbols-outlined text-primary text-[20px]"}>
                  comment
                </span>
                {"Driver & Operator Notes"}
              </h3>
              <div className={"bg-surface-container-low rounded-lg p-space-sm mt-1"}>
                <p className={"font-body-md text-body-md text-on-surface italic leading-relaxed"}>
                  “24/7 vulcanizer with digital air gauge.  tip appreciated for air, quick tire plugging for taxis.”
                </p>
              </div>
              <div className={"flex items-center gap-3 pt-1 text-on-surface-variant font-label-sm text-label-sm"}>
                <span className={"flex items-center gap-1"}>
                  <span className={"material-symbols-outlined text-[15px] text-primary"}>
                    local_atm
                  </span>
                  Cash Tip Optional
                </span>
                <span className={"flex items-center gap-1"}>
                  <span className={"material-symbols-outlined text-[15px] text-primary"}>
                    schedule
                  </span>
                  Open 24/7
                </span>
              </div>
            </div>
          </div>
          <div className={"px-margin mt-space-md"}>
            <div className={"bg-surface-container-lowest rounded-xl p-space-md shadow-sm"}>
              <div className={"flex items-center justify-between mb-space-md"}>
                <h3 className={"font-headline-sm text-headline-sm text-on-surface flex items-center gap-1.5"}>
                  <span className={"material-symbols-outlined text-primary text-[20px]"}>
                    linear_scale
                  </span>
                  Verification Progress
                </h3>
                <span className={"font-label-sm text-label-sm font-bold text-secondary bg-secondary-fixed px-2 py-0.5 rounded-full"}>
                  Step 2 of 3
                </span>
              </div>
              <div className={"flex flex-col gap-space-md relative"}>
                <div className={"absolute left-[15px] top-4 bottom-4 w-0.5 bg-surface-variant"} />
                <div className={"flex items-start gap-space-sm relative z-10"}>
                  <div className={"w-8 h-8 rounded-full bg-green-700 text-white flex items-center justify-center shrink-0 shadow-sm"}>
                    <span className={"material-symbols-outlined text-[18px]"}>
                      check
                    </span>
                  </div>
                  <div className={"flex flex-col min-w-0 pt-0.5"}>
                    <span className={"font-label-lg text-label-lg text-on-surface font-bold"}>
                      Automated Duplicate Check
                    </span>
                    <span className={"font-body-sm text-body-sm text-green-800 font-semibold"}>
                      Passed • No existing pin within 250m
                    </span>
                  </div>
                </div>
                <div className={"flex items-start gap-space-sm relative z-10"}>
                  <div className={"w-8 h-8 rounded-full bg-secondary-container text-on-secondary-container flex items-center justify-center shrink-0 shadow-sm animate-pulse"}>
                    <span className={"material-symbols-outlined text-[18px]"} style={{ fontVariationSettings: "'FILL' 1" }}>
                      hourglass_bottom
                    </span>
                  </div>
                  <div className={"flex flex-col min-w-0 pt-0.5"}>
                    <span className={"font-label-lg text-label-lg text-on-surface font-bold"}>
                      St. Andrew Parish Ambassador Review
                    </span>
                    <span className={"font-body-sm text-body-sm text-secondary font-semibold"}>
                      In progress • Community taxi captain verifying 24/7 air pump
                    </span>
                  </div>
                </div>
                <div className={"flex items-start gap-space-sm relative z-10"}>
                  <div className={"w-8 h-8 rounded-full bg-surface-container-high text-outline flex items-center justify-center shrink-0"}>
                    <span className={"material-symbols-outlined text-[18px]"}>
                      stars
                    </span>
                  </div>
                  <div className={"flex flex-col min-w-0 pt-0.5"}>
                    <span className={"font-label-lg text-label-lg text-on-surface-variant font-bold"}>
                      Island-wide Publication
                    </span>
                    <span className={"font-body-sm text-body-sm text-on-surface-variant"}>
                      Live to all Roam Plug drivers • Earn this pin
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className={"px-margin mt-space-lg mb-space-xl flex flex-col gap-space-sm"}>
            <button onClick={onPlugClick} className={"w-full h-12 bg-primary active:bg-on-primary-fixed-variant text-on-primary font-label-lg text-label-lg rounded-xl flex items-center justify-center gap-2 shadow-md transition-all active:scale-[0.99]"} id={"editSubmissionBtn"} type={"button"} data-act={"editSubmissionBtn"} data-way-out={"primary"}>
              <span className={"material-symbols-outlined text-[20px]"}>
                edit
              </span>
              Edit Submission Details
            </button>
            <button onClick={onPlugClick} className={"w-full h-12 bg-surface-container active:bg-surface-variant text-error font-label-lg text-label-lg rounded-xl flex items-center justify-center gap-2 transition-colors"} id={"withdrawPinBtn"} type={"button"} data-act={"withdrawPinBtn"}>
              <span className={"material-symbols-outlined text-[20px]"}>
                delete_outline
              </span>
              Withdraw Pin Submission
            </button>
            <p className={"font-body-sm text-body-sm text-on-surface-variant text-center px-space-md pt-1"}>
              Notice: Edits made while under review will refresh your place in the verification queue.
            </p>
          </div>
          <div className={"hidden fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-xs p-margin"} id={"withdrawModal"}>
            <div className={"bg-surface-container-lowest rounded-2xl w-full max-w-sm p-space-md flex flex-col gap-space-sm shadow-xl"}>
              <div className={"w-10 h-10 rounded-full bg-error-container text-error flex items-center justify-center"}>
                <span className={"material-symbols-outlined text-[24px]"}>
                  warning
                </span>
              </div>
              <h4 className={"font-headline-sm text-headline-sm text-on-surface"}>
                Withdraw this pin?
              </h4>
              <p className={"font-body-sm text-body-sm text-on-surface-variant"}>
                This will cancel your verification request.
              </p>
              <div className={"flex gap-space-sm mt-space-sm"}>
                <button onClick={onPlugClick} className={"flex-1 h-12 rounded-xl bg-surface-container text-on-surface font-label-md text-label-md"} id={"cancelModalBtn"} type={"button"} data-act={"cancelModalBtn"}>
                  Keep Pin
                </button>
                <button onClick={onPlugClick} className={"flex-1 h-12 rounded-xl bg-error text-on-error font-label-md text-label-md"} id={"confirmWithdrawBtn"} type={"button"} data-act={"confirmWithdrawBtn"}>
                  Yes, Withdraw
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
