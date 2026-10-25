import { useEffect, useRef } from 'react';
import { onPlugClick } from '../../shell/actions';
import { bindScreen } from '../../shell/bind';


export function NotificationSettingsScreen() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (ref.current) bindScreen("52-notification-settings.html", ref.current); }, []);
  return (
    <div ref={ref} data-plug-screen={"52-notification-settings.html"} className={"bg-surface font-body-md text-on-surface flex flex-col min-h-screen selection:bg-secondary-fixed selection:text-on-secondary-fixed"}>
      <header className={"fixed top-0 inset-x-0 z-50 bg-surface/85 backdrop-blur-xl pt-safe shadow-[0_1px_8px_rgba(28,25,23,0.04)]"}>
        <div className={"h-16 px-margin flex items-center justify-between"}>
          <div className={"flex items-center gap-space-sm"}>
            <button onClick={onPlugClick} aria-label={"Go Back"} className={"w-12 h-12 -ml-2 rounded-full flex items-center justify-center text-on-surface hover:bg-surface-container active:scale-95 transition-all"} type={"button"} data-act={"arrow-back"} data-way-out={"back"}>
              <span className={"material-symbols-outlined text-[24px]"}>
                arrow_back
              </span>
            </button>
            <h1 className={"font-headline-sm text-headline-sm text-on-surface tracking-tight truncate max-w-[210px]"}>
              Notification Settings
            </h1>
          </div>
          <div className={"flex items-center gap-space-xs"}>
            <div className={"w-8 h-8 rounded-full bg-primary flex items-center justify-center shrink-0 shadow-sm"}>
              <span className={"material-symbols-outlined text-on-primary text-[18px]"}>
                person
              </span>
            </div>
          </div>
        </div>
      </header>
      <main className={"flex-1 flex flex-col relative w-full pt-16 pb-safe bg-surface"}>
        <div className={"flex flex-col w-full px-margin pb-space-xl"}>
          <div className={"mt-space-sm mb-space-md"}>
            <p className={"font-body-md text-body-md text-on-surface-variant"}>
              Manage your maintenance alerts, parish scout updates, and island fuel radar.
            </p>
          </div>
          <div className={"bg-surface-container-low rounded-xl p-space-md shadow-sm mb-space-lg"}>
            <div className={"flex items-center justify-between mb-space-sm"}>
              <div className={"flex items-center gap-space-xs"}>
                <span className={"material-symbols-outlined text-primary text-[20px]"} style={{ fontVariationSettings: "'FILL' 1" }}>
                  cell_tower
                </span>
                <span className={"font-label-lg text-label-lg text-on-surface"}>
                  Active Alert Channels
                </span>
              </div>
              <span className={"font-label-sm text-label-sm uppercase tracking-wider text-primary font-bold bg-primary-fixed text-on-primary-fixed px-2 py-0.5 rounded-full"}>
                Synced
              </span>
            </div>
            <div className={"grid grid-cols-1 gap-space-sm"}>
              <button onClick={onPlugClick} className={"w-full min-h-[48px] px-space-md py-space-sm rounded-lg bg-surface-container-lowest shadow-sm flex items-center justify-between transition-all active:scale-[0.98]"} id={"channel-push-btn"} type={"button"} data-act={"channel-push-btn"}>
                <div className={"flex items-center gap-space-sm min-w-0"}>
                  <div className={"w-8 h-8 rounded-full bg-secondary-container text-on-secondary-container flex items-center justify-center shrink-0"} id={"channel-push-icon"}>
                    <span className={"material-symbols-outlined text-[18px]"}>
                      notifications_active
                    </span>
                  </div>
                  <div className={"flex flex-col text-left truncate"}>
                    <span className={"font-label-md text-label-md text-on-surface"}>
                      In-app push notifications
                    </span>
                    <span className={"font-body-sm text-body-sm text-on-surface-variant"}>
                      Real-time alerts on this phone
                    </span>
                  </div>
                </div>
                <span className={"material-symbols-outlined text-secondary-container text-[22px]"} id={"channel-push-check"} style={{ fontVariationSettings: "'FILL' 1" }}>
                  check_circle
                </span>
              </button>
              <button onClick={onPlugClick} className={"w-full min-h-[48px] px-space-md py-space-sm rounded-lg bg-surface-container-lowest shadow-sm flex items-center justify-between transition-all active:scale-[0.98]"} id={"channel-sms-btn"} type={"button"} data-act={"channel-sms-btn"}>
                <div className={"flex items-center gap-space-sm min-w-0"}>
                  <div className={"w-8 h-8 rounded-full bg-secondary-container text-on-secondary-container flex items-center justify-center shrink-0"} id={"channel-sms-icon"}>
                    <span className={"material-symbols-outlined text-[18px]"}>
                      sms
                    </span>
                  </div>
                  <div className={"flex flex-col text-left truncate"}>
                    <span className={"font-label-md text-label-md text-on-surface"}>
                      SMS alerts
                    </span>
                    <span className={"font-body-sm text-body-sm text-on-surface-variant"}>
                      {"Low-data & offline transit texts"}
                    </span>
                  </div>
                </div>
                <span className={"material-symbols-outlined text-secondary-container text-[22px]"} id={"channel-sms-check"} style={{ fontVariationSettings: "'FILL' 1" }}>
                  check_circle
                </span>
              </button>
            </div>
          </div>
          <div className={"mb-space-lg"}>
            <div className={"flex items-center gap-space-xs mb-space-sm px-space-xs"}>
              <div className={"w-6 h-6 rounded-md bg-secondary-fixed flex items-center justify-center text-on-secondary-fixed"}>
                <span className={"material-symbols-outlined text-[16px]"}>
                  car_repair
                </span>
              </div>
              <h2 className={"font-headline-sm text-headline-sm text-on-surface"}>
                {"Vehicle & Maintenance Alerts"}
              </h2>
            </div>
            <div className={"bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden flex flex-col"}>
              <div className={"p-space-md flex items-start justify-between gap-space-md"}>
                <div className={"flex-1 min-w-0 pr-space-xs"}>
                  <p className={"font-label-lg text-label-lg text-on-surface mb-0.5"}>
                    Service due reminders
                  </p>
                  <p className={"font-body-sm text-body-sm text-on-surface-variant"}>
                    Get alerted when oil changes, tyre rotations, or brake inspections are approaching based on your odometer
                  </p>
                </div>
                <button onClick={onPlugClick} aria-checked={"true"} className={"shrink-0 relative w-14 h-8 bg-secondary-container rounded-full p-1 cursor-pointer transition-colors duration-200 focus:outline-none flex items-center"} id={"toggle-service"} role={"switch"} type={"button"} data-act={"toggle-service"}>
                  <span className={"sr-only"}>
                    Toggle service due reminders
                  </span>
                  <span className={"translate-x-6 w-6 h-6 bg-surface-container-lowest rounded-full shadow-md transform transition-transform duration-200 flex items-center justify-center"}>
                    <span className={"material-symbols-outlined text-[14px] text-secondary-container"}>
                      check
                    </span>
                  </span>
                </button>
              </div>
              <div className={"h-px bg-surface-container w-full"} />
              <div className={"p-space-md flex items-start justify-between gap-space-md"}>
                <div className={"flex-1 min-w-0 pr-space-xs"}>
                  <div className={"flex items-center gap-space-xs mb-0.5"}>
                    <p className={"font-label-lg text-label-lg text-on-surface"}>
                      Document renewal reminders
                    </p>
                    <span className={"font-label-sm text-label-sm bg-tertiary-fixed text-on-tertiary-fixed font-bold px-1.5 py-0.2 rounded"}>
                      Vital
                    </span>
                  </div>
                  <p className={"font-body-sm text-body-sm text-on-surface-variant"}>
                    Timely alerts 30, 14, and 1 day before Fitness, Registration, or Insurance expire
                  </p>
                </div>
                <button onClick={onPlugClick} aria-checked={"true"} className={"shrink-0 relative w-14 h-8 bg-secondary-container rounded-full p-1 cursor-pointer transition-colors duration-200 focus:outline-none flex items-center"} id={"toggle-docs"} role={"switch"} type={"button"} data-act={"toggle-docs"}>
                  <span className={"sr-only"}>
                    Toggle document renewal reminders
                  </span>
                  <span className={"translate-x-6 w-6 h-6 bg-surface-container-lowest rounded-full shadow-md transform transition-transform duration-200 flex items-center justify-center"}>
                    <span className={"material-symbols-outlined text-[14px] text-secondary-container"}>
                      check
                    </span>
                  </span>
                </button>
              </div>
            </div>
          </div>
          <div className={"mb-space-lg"}>
            <div className={"flex items-center gap-space-xs mb-space-sm px-space-xs"}>
              <div className={"w-6 h-6 rounded-md bg-secondary-fixed flex items-center justify-center text-on-secondary-fixed"}>
                <span className={"material-symbols-outlined text-[16px]"}>
                  travel_explore
                </span>
              </div>
              <h2 className={"font-headline-sm text-headline-sm text-on-surface"}>
                {"Community & Scout Activity"}
              </h2>
            </div>
            <div className={"bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden flex flex-col"}>
              <div className={"p-space-md flex items-start justify-between gap-space-md"}>
                <div className={"flex-1 min-w-0 pr-space-xs"}>
                  <p className={"font-label-lg text-label-lg text-on-surface mb-0.5"}>
                    Pin approval updates
                  </p>
                  <p className={"font-body-sm text-body-sm text-on-surface-variant"}>
                    Notifications when Roam approves a garage, tyre shop, or fuel station you submitted
                  </p>
                </div>
                <button onClick={onPlugClick} aria-checked={"true"} className={"shrink-0 relative w-14 h-8 bg-secondary-container rounded-full p-1 cursor-pointer transition-colors duration-200 focus:outline-none flex items-center"} id={"toggle-pins"} role={"switch"} type={"button"} data-act={"toggle-pins"}>
                  <span className={"sr-only"}>
                    Toggle pin approval updates
                  </span>
                  <span className={"translate-x-6 w-6 h-6 bg-surface-container-lowest rounded-full shadow-md transform transition-transform duration-200 flex items-center justify-center"}>
                    <span className={"material-symbols-outlined text-[14px] text-secondary-container"}>
                      check
                    </span>
                  </span>
                </button>
              </div>
              <div className={"h-px bg-surface-container w-full"} />
              <div className={"p-space-md flex items-start justify-between gap-space-md"}>
                <div className={"flex-1 min-w-0 pr-space-xs"}>
                  <p className={"font-label-lg text-label-lg text-on-surface mb-0.5"}>
                    Tips and news from Roam Plug
                  </p>
                  <p className={"font-body-sm text-body-sm text-on-surface-variant"}>
                    Island motoring guides, road safety advisories, and new community features
                  </p>
                </div>
                <button onClick={onPlugClick} aria-checked={"false"} className={"shrink-0 relative w-14 h-8 bg-surface-container-highest rounded-full p-1 cursor-pointer transition-colors duration-200 focus:outline-none flex items-center"} id={"toggle-tips"} role={"switch"} type={"button"} data-act={"toggle-tips"}>
                  <span className={"sr-only"}>
                    Toggle tips and news
                  </span>
                  <span className={"translate-x-0 w-6 h-6 bg-surface-container-lowest rounded-full shadow-md transform transition-transform duration-200 flex items-center justify-center"}>
                    <span className={"material-symbols-outlined text-[14px] text-outline opacity-0"}>
                      check
                    </span>
                  </span>
                </button>
              </div>
            </div>
          </div>
          <div className={"mb-space-lg"}>
            <div className={"flex items-center gap-space-xs mb-space-sm px-space-xs"}>
              <div className={"w-6 h-6 rounded-md bg-secondary-fixed flex items-center justify-center text-on-secondary-fixed"}>
                <span className={"material-symbols-outlined text-[16px]"}>
                  local_gas_station
                </span>
              </div>
              <h2 className={"font-headline-sm text-headline-sm text-on-surface"}>
                {"Fuel Radar & Pricing"}
              </h2>
            </div>
            <div className={"bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden flex flex-col"}>
              <div className={"p-space-md flex items-start justify-between gap-space-md"}>
                <div className={"flex-1 min-w-0 pr-space-xs"}>
                  <div className={"flex items-center gap-space-xs mb-0.5"}>
                    <p className={"font-label-lg text-label-lg text-on-surface"}>
                      Weekly fuel price summary
                    </p>
                    <span className={"font-label-sm text-label-sm bg-secondary-fixed-dim text-on-secondary-fixed font-bold px-1.5 py-0.2 rounded"}>
                      Petrojam
                    </span>
                  </div>
                  <p className={"font-body-sm text-body-sm text-on-surface-variant"}>
                    Every Thursday morning Petrojam price change breakdown across Jamaica
                  </p>
                </div>
                <button onClick={onPlugClick} aria-checked={"true"} className={"shrink-0 relative w-14 h-8 bg-secondary-container rounded-full p-1 cursor-pointer transition-colors duration-200 focus:outline-none flex items-center"} id={"toggle-summary"} role={"switch"} type={"button"} data-act={"toggle-summary"}>
                  <span className={"sr-only"}>
                    Toggle weekly fuel price summary
                  </span>
                  <span className={"translate-x-6 w-6 h-6 bg-surface-container-lowest rounded-full shadow-md transform transition-transform duration-200 flex items-center justify-center"}>
                    <span className={"material-symbols-outlined text-[14px] text-secondary-container"}>
                      check
                    </span>
                  </span>
                </button>
              </div>
              <div className={"h-px bg-surface-container w-full"} />
              <div className={"p-space-md flex items-start justify-between gap-space-md"}>
                <div className={"flex-1 min-w-0 pr-space-xs"}>
                  <p className={"font-label-lg text-label-lg text-on-surface mb-0.5"}>
                    Price drop alerts for favourite stations
                  </p>
                  <p className={"font-body-sm text-body-sm text-on-surface-variant"}>
                    Instant notification when your bookmarked pumps lower their per-litre rate
                  </p>
                </div>
                <button onClick={onPlugClick} aria-checked={"true"} className={"shrink-0 relative w-14 h-8 bg-secondary-container rounded-full p-1 cursor-pointer transition-colors duration-200 focus:outline-none flex items-center"} id={"toggle-drops"} role={"switch"} type={"button"} data-act={"toggle-drops"}>
                  <span className={"sr-only"}>
                    Toggle price drop alerts
                  </span>
                  <span className={"translate-x-6 w-6 h-6 bg-surface-container-lowest rounded-full shadow-md transform transition-transform duration-200 flex items-center justify-center"}>
                    <span className={"material-symbols-outlined text-[14px] text-secondary-container"}>
                      check
                    </span>
                  </span>
                </button>
              </div>
            </div>
          </div>
          <div className={"bg-surface-container rounded-xl p-space-md mb-space-lg shadow-sm"}>
            <div className={"flex items-start justify-between gap-space-sm"}>
              <div className={"flex items-start gap-space-sm min-w-0"}>
                <div className={"w-10 h-10 rounded-full bg-surface-container-high text-on-surface flex items-center justify-center shrink-0 mt-0.5"}>
                  <span className={"material-symbols-outlined text-[20px]"}>
                    bedtime
                  </span>
                </div>
                <div className={"flex flex-col"}>
                  <span className={"font-label-lg text-label-lg text-on-surface"}>
                    Quiet Hours
                  </span>
                  <span className={"font-label-md text-label-md text-primary font-semibold"}>
                    10:00 PM – 6:00 AM
                  </span>
                  <p className={"font-body-sm text-body-sm text-on-surface-variant mt-1"}>
                    {"Mutes non-essential pings. Urgent parish roadblock alerts & emergency hazard notices remain active."}
                  </p>
                </div>
              </div>
              <button onClick={onPlugClick} className={"h-9 px-3 rounded-full bg-surface-container-highest text-on-surface font-label-sm text-label-sm hover:bg-surface-variant active:scale-95 transition-all shrink-0"} type={"button"} data-act={"edit"}>
                Edit
              </button>
            </div>
          </div>
          <div className={"bg-surface-container-low rounded-xl p-space-md flex items-start gap-space-sm"}>
            <span className={"material-symbols-outlined text-secondary text-[20px] shrink-0 mt-0.5"}>
              verified_user
            </span>
            <p className={"font-body-sm text-body-sm text-on-surface-variant leading-relaxed"}>
              SMS notifications are sent free of charge courtesy of Roam Plug Jamaica community partners and road safety advocates across all 14 parishes.
            </p>
          </div>
          <div className={"fixed bottom-6 inset-x-margin max-w-sm mx-auto bg-inverse-surface text-inverse-on-surface px-space-md py-space-sm rounded-xl shadow-lg flex items-center justify-between opacity-0 pointer-events-none transition-all duration-300 z-50 transform translate-y-4"} id={"toast"}>
            <div className={"flex items-center gap-space-xs"}>
              <span className={"material-symbols-outlined text-secondary-fixed text-[20px]"}>
                check
              </span>
              <span className={"font-label-md text-label-md"} id={"toast-text"}>
                Setting updated
              </span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
