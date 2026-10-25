import { useEffect, useRef } from 'react';
import { onPlugClick } from '../../shell/actions';
import { bindScreen } from '../../shell/bind';


export function PermissionsScreen() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (ref.current) bindScreen("08-permissions.html", ref.current); }, []);
  return (
    <div ref={ref} data-plug-screen={"08-permissions.html"} className={"bg-surface font-body-md text-on-surface antialiased min-h-screen flex flex-col"}>
      <main className={"flex-1 flex flex-col relative w-full pt-safe pb-safe bg-surface"}>
        <div className={"flex flex-col w-full px-margin pb-space-xl"}>
          <div className={"flex items-center justify-between w-full h-12 mb-space-sm"}>
            <button onClick={onPlugClick} aria-label={"Go back"} className={"flex items-center justify-center w-12 h-12 rounded-full bg-surface-container hover:bg-surface-container-high transition-colors text-on-surface"} type={"button"} data-act={"arrow-back"} data-way-out={"back"}>
              <span className={"material-symbols-outlined text-[20px]"}>
                arrow_back
              </span>
            </button>
            <div className={"flex items-center gap-space-xs px-3 py-1 rounded-full bg-primary-fixed text-on-primary-fixed"}>
              <span className={"w-2 h-2 rounded-full bg-primary animate-pulse"} />
              <span className={"font-label-sm text-label-sm tracking-wider uppercase font-bold"}>
                App Permissions
              </span>
            </div>
            <button onClick={onPlugClick} className={"flex items-center gap-1 px-3 py-2 rounded-full bg-surface-container text-on-surface-variant font-label-md text-label-md hover:bg-surface-container-high transition-colors"} id={"info-modal-trigger"} type={"button"} data-act={"info-modal-trigger"}>
              <span className={"material-symbols-outlined text-[16px] text-primary"}>
                info
              </span>
              <span>
                Why we ask
              </span>
            </button>
          </div>
          <div className={"flex flex-col gap-space-xs mb-space-lg pt-space-xs"}>
            <div className={"flex items-center gap-space-xs"}>
              <span className={"font-label-sm text-label-sm uppercase tracking-widest text-secondary font-bold"}>
                Step 2 of 3
              </span>
              <span className={"w-1 h-1 rounded-full bg-outline-variant"} />
              <span className={"font-label-sm text-label-sm text-on-surface-variant"}>
                Setup Companion
              </span>
            </div>
            <h1 className={"font-display-lg-mobile text-display-lg-mobile text-on-surface"}>
              Enable permissions
            </h1>
            <p className={"font-body-md text-body-md text-on-surface-variant leading-relaxed"}>
              To get live parish fuel alerts, snap your odometer at the pump, and navigate Jamaican roadways accurately.
            </p>
          </div>
          <div className={"flex flex-col gap-space-md mb-space-lg"} id={"permissions-container"}>
            <div className={"relative flex flex-col p-space-md rounded-xl bg-surface-container-lowest shadow-md transition-all duration-300"} id={"card-location"}>
              <div className={"flex items-start justify-between gap-space-sm mb-space-sm"}>
                <div className={"flex items-center gap-space-sm"}>
                  <div className={"flex items-center justify-center w-12 h-12 rounded-xl bg-primary text-on-primary shadow-sm flex-shrink-0"}>
                    <span className={"material-symbols-outlined text-[24px]"}>
                      near_me
                    </span>
                  </div>
                  <div className={"flex flex-col"}>
                    <div className={"flex items-center gap-space-xs"}>
                      <span className={"font-headline-sm text-headline-sm text-on-surface"}>
                        Location Access
                      </span>
                    </div>
                    <span className={"font-label-sm text-label-sm text-primary font-bold uppercase tracking-wide"}>
                      Set to: While using app
                    </span>
                  </div>
                </div>
                <span className={"px-2.5 py-1 rounded-full bg-primary-container text-on-primary-container font-label-sm text-label-sm font-bold tracking-wider"}>
                  REQUIRED
                </span>
              </div>
              <p className={"font-body-sm text-body-sm text-on-surface-variant mb-space-md leading-relaxed"}>
                Pinpoint the cheapest gas station across your parish, track accurate JMD pump rates along your route, and log roadside tire/mechanic spots with precision.
              </p>
              <div className={"flex items-center justify-between pt-space-xs bg-surface-container-low p-space-sm rounded-lg"}>
                <div className={"flex items-center gap-2"}>
                  <span className={"material-symbols-outlined text-[18px] text-on-surface-variant"} id={"location-status-icon"}>
                    fmd_good
                  </span>
                  <span className={"font-label-md text-label-md text-on-surface"} id={"location-status-text"}>
                    Accuracy: High Precision
                  </span>
                </div>
                <button onClick={onPlugClick} className={"flex items-center justify-center h-12 px-space-md rounded-lg bg-primary text-on-primary font-label-lg text-label-lg active:scale-95 transition-all shadow-sm"} id={"btn-perm-location"} type={"button"} data-act={"btn-perm-location"} data-way-out={"primary"}>
                  <span className={"perm-btn-text"}>
                    Allow
                  </span>
                </button>
              </div>
            </div>
            <div className={"relative flex flex-col p-space-md rounded-xl bg-surface-container-lowest shadow-md transition-all duration-300"} id={"card-camera"}>
              <div className={"flex items-start justify-between gap-space-sm mb-space-sm"}>
                <div className={"flex items-center gap-space-sm"}>
                  <div className={"flex items-center justify-center w-12 h-12 rounded-xl bg-tertiary-fixed text-on-tertiary-fixed shadow-sm flex-shrink-0"}>
                    <span className={"material-symbols-outlined text-[24px]"}>
                      photo_camera
                    </span>
                  </div>
                  <div className={"flex flex-col"}>
                    <span className={"font-headline-sm text-headline-sm text-on-surface"}>
                      Camera
                    </span>
                    <span className={"font-label-sm text-label-sm text-tertiary font-bold uppercase tracking-wide"}>
                      {"Pump & Spot Scanner"}
                    </span>
                  </div>
                </div>
                <span className={"px-2.5 py-1 rounded-full bg-tertiary-fixed-dim text-on-tertiary-fixed font-label-sm text-label-sm font-bold tracking-wider"}>
                  RECOMMENDED
                </span>
              </div>
              <p className={"font-body-sm text-body-sm text-on-surface-variant mb-space-md leading-relaxed"}>
                Snap your vehicle's odometer at the fuel pump for instant MPG tracking, and contribute photos of verified auto shops, air compressors, and wash bays.
              </p>
              <div className={"flex items-center justify-between pt-space-xs bg-surface-container-low p-space-sm rounded-lg"}>
                <div className={"flex items-center gap-2"}>
                  <span className={"material-symbols-outlined text-[18px] text-on-surface-variant"} id={"camera-status-icon"}>
                    document_scanner
                  </span>
                  <span className={"font-label-md text-label-md text-on-surface"} id={"camera-status-text"}>
                    {"Odometer & Gas Slips"}
                  </span>
                </div>
                <button onClick={onPlugClick} className={"flex items-center justify-center h-12 px-space-md rounded-lg bg-secondary-fixed text-on-secondary-fixed font-label-lg text-label-lg active:scale-95 transition-all shadow-sm"} id={"btn-perm-camera"} type={"button"} data-act={"btn-perm-camera"}>
                  <span className={"perm-btn-text"}>
                    Allow
                  </span>
                </button>
              </div>
            </div>
            <div className={"relative flex flex-col p-space-md rounded-xl bg-surface-container-lowest shadow-md transition-all duration-300"} id={"card-notifications"}>
              <div className={"flex items-start justify-between gap-space-sm mb-space-sm"}>
                <div className={"flex items-center gap-space-sm"}>
                  <div className={"flex items-center justify-center w-12 h-12 rounded-xl bg-surface-container-high text-on-surface shadow-sm flex-shrink-0"}>
                    <span className={"material-symbols-outlined text-[24px]"}>
                      notifications_active
                    </span>
                  </div>
                  <div className={"flex flex-col"}>
                    <span className={"font-headline-sm text-headline-sm text-on-surface"}>
                      Push Notifications
                    </span>
                    <span className={"font-label-sm text-label-sm text-on-surface-variant font-bold uppercase tracking-wide"}>
                      Timely Local Updates
                    </span>
                  </div>
                </div>
                <span className={"px-2.5 py-1 rounded-full bg-surface-variant text-on-surface-variant font-label-sm text-label-sm font-bold tracking-wider"}>
                  TIMELY ALERTS
                </span>
              </div>
              <p className={"font-body-sm text-body-sm text-on-surface-variant mb-space-md leading-relaxed"}>
                {"Stay notified when Petrojam weekly fuel price changes drop, receive reminders before your vehicle fitness & registration expire, and track parish traffic jams."}
              </p>
              <div className={"flex items-center justify-between pt-space-xs bg-surface-container-low p-space-sm rounded-lg"}>
                <div className={"flex items-center gap-2"}>
                  <span className={"material-symbols-outlined text-[18px] text-on-surface-variant"} id={"notifications-status-icon"}>
                    price_change
                  </span>
                  <span className={"font-label-md text-label-md text-on-surface"} id={"notifications-status-text"}>
                    {"Price Drops & Deadlines"}
                  </span>
                </div>
                <button onClick={onPlugClick} className={"flex items-center justify-center h-12 px-space-md rounded-lg bg-secondary-fixed text-on-secondary-fixed font-label-lg text-label-lg active:scale-95 transition-all shadow-sm"} id={"btn-perm-notifications"} type={"button"} data-act={"btn-perm-notifications"}>
                  <span className={"perm-btn-text"}>
                    Allow
                  </span>
                </button>
              </div>
            </div>
          </div>
          <div className={"flex items-center justify-center gap-space-xs mb-space-lg px-space-sm py-space-xs rounded-xl bg-surface-container-low text-on-surface-variant"}>
            <span className={"material-symbols-outlined text-[18px] text-secondary"}>
              verified_user
            </span>
            <span className={"font-body-sm text-body-sm text-center"}>
              Change these anytime in your Jamaican device settings.
            </span>
          </div>
          <div className={"flex flex-col gap-space-sm w-full mt-auto"}>
            <button onClick={onPlugClick} className={"flex items-center justify-center w-full h-12 gap-space-xs rounded-xl bg-primary text-on-primary font-headline-sm text-headline-sm shadow-md active:scale-[0.98] transition-all"} id={"btn-continue"} type={"button"} data-act={"btn-continue"} data-way-out={"primary"}>
              <span>
                Continue
              </span>
              <span className={"material-symbols-outlined text-[20px]"}>
                arrow_forward
              </span>
            </button>
            <button onClick={onPlugClick} className={"flex items-center justify-center w-full h-12 rounded-xl text-on-surface-variant font-label-lg text-label-lg hover:text-on-surface transition-colors"} id={"btn-skip"} type={"button"} data-act={"btn-skip"}>
              I'll configure later
            </button>
          </div>
          <div className={"fixed inset-0 z-50 flex items-end sm:items-center justify-center p-margin bg-black/60 opacity-0 pointer-events-none transition-opacity duration-300"} id={"info-modal"}>
            <div className={"flex flex-col w-full max-w-sm p-space-lg rounded-2xl bg-surface-container-lowest text-on-surface shadow-2xl transition-transform duration-300 translate-y-8"} id={"modal-card"}>
              <div className={"flex items-center justify-between mb-space-sm"}>
                <div className={"flex items-center gap-2"}>
                  <span className={"material-symbols-outlined text-primary text-[24px]"}>
                    privacy_tip
                  </span>
                  <span className={"font-headline-sm text-headline-sm"}>
                    Privacy Commitment
                  </span>
                </div>
                <button onClick={onPlugClick} className={"p-2 rounded-full hover:bg-surface-container text-on-surface-variant"} id={"close-modal"} type={"button"} data-act={"close-modal"} data-way-out={"back"}>
                  <span className={"material-symbols-outlined text-[20px]"}>
                    close
                  </span>
                </button>
              </div>
              <p className={"font-body-sm text-body-sm text-on-surface-variant mb-space-md"}>
                Roam Plug operates with strict data minimization under the Jamaican Data Protection Act (JDPA). We never sell your telemetry, driving speed, or parish routes to third-party insurers.
              </p>
              <div className={"flex flex-col gap-space-xs mb-space-md"}>
                <div className={"flex items-start gap-2"}>
                  <span className={"material-symbols-outlined text-[16px] text-primary mt-0.5"}>
                    check_circle
                  </span>
                  <span className={"font-body-sm text-body-sm text-on-surface"}>
                    GPS is solely active during live station sorting
                  </span>
                </div>
                <div className={"flex items-start gap-2"}>
                  <span className={"material-symbols-outlined text-[16px] text-primary mt-0.5"}>
                    check_circle
                  </span>
                  <span className={"font-body-sm text-body-sm text-on-surface"}>
                    Photos stay strictly linked to verified motoring pins
                  </span>
                </div>
              </div>
              <button onClick={onPlugClick} className={"flex items-center justify-center w-full h-12 rounded-xl bg-primary text-on-primary font-label-lg text-label-lg shadow-sm"} id={"modal-acknowledge"} type={"button"} data-act={"modal-acknowledge"} data-way-out={"primary"}>
                Got it, blessed
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
