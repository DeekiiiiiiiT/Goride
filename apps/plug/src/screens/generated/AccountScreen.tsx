import { useEffect, useRef } from 'react';
import { onPlugClick } from '../../shell/actions';
import { bindScreen } from '../../shell/bind';


export function AccountScreen() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (ref.current) bindScreen("51-account.html", ref.current); }, []);
  return (
    <div ref={ref} data-plug-screen={"51-account.html"} className={"bg-surface font-body-md text-on-surface min-h-screen flex flex-col antialiased selection:bg-primary/20 selection:text-primary"}>
      <header className={"fixed top-0 w-full z-50 bg-surface/85 backdrop-blur-xl shadow-[0_1px_8px_rgba(28,25,23,0.04)] pt-safe"}>
        <div className={"h-16 px-space-md flex items-center justify-between"}>
          <div className={"flex items-center gap-space-sm"}>
            <h1 className={"font-headline-md text-headline-md text-on-surface tracking-tight font-headline-md"}>
              Account
            </h1>
          </div>
          <div className={"flex items-center gap-space-xs"}>
            <button onClick={onPlugClick} aria-label={"Notifications"} className={"w-11 h-11 flex items-center justify-center rounded-full text-on-surface-variant hover:text-primary hover:bg-surface-container active:scale-95 transition-all"} data-act={"notifications"}>
              <span className={"material-symbols-outlined text-[24px]"}>
                notifications
              </span>
            </button>
            <button onClick={onPlugClick} aria-label={"Settings"} className={"w-11 h-11 flex items-center justify-center rounded-full text-on-surface-variant hover:text-primary hover:bg-surface-container active:scale-95 transition-all"} data-act={"settings"}>
              <span className={"material-symbols-outlined text-[24px]"}>
                settings
              </span>
            </button>
            <div className={"w-8 h-8 rounded-full bg-primary flex items-center justify-center ml-space-xs shadow-sm"}>
              <span className={"material-symbols-outlined text-on-primary text-[18px]"}>
                person
              </span>
            </div>
          </div>
        </div>
      </header>
      <main className={"flex-1 w-full bg-surface pt-16 pb-28"}>
        <div className={"flex flex-col w-full px-space-md pb-10 space-y-space-lg"}>
          <section className={"relative overflow-hidden rounded-xl bg-surface-container-lowest shadow-md p-space-md"}>
            <div className={"absolute -right-10 -top-10 w-44 h-44 rounded-full bg-gradient-to-br from-secondary-container/20 via-primary-fixed/30 to-transparent pointer-events-none blur-2xl"} />
            <div className={"relative flex items-start gap-space-md"}>
              <div className={"relative flex-shrink-0"}>
                <div className={"w-20 h-20 rounded-full overflow-hidden shadow-sm bg-surface-container-high flex items-center justify-center font-bold text-primary"} data-initials={"You"}>
                  You
                </div>
                <div className={"absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-surface-container-lowest flex items-center justify-center shadow"}>
                  <span className={"material-symbols-outlined text-[16px] text-primary"} style={{ fontVariationSettings: "'FILL' 1" }}>
                    verified
                  </span>
                </div>
              </div>
              <div className={"flex-1 min-w-0"}>
                <div className={"flex items-center gap-1.5 flex-wrap"}>
                  <h2 className={"font-headline-sm text-headline-sm text-on-surface font-bold tracking-tight truncate"} data-slot={"display-name"}>
                    Your account
                  </h2>
                  <p className={"font-body-sm text-body-sm text-on-surface-variant"} data-slot={"sign-in-method"}>
                    Signed in with email
                  </p>
                </div>
              </div>
            </div>
            <div className={"grid grid-cols-2 gap-2 mt-3"}>
              <div className={"p-2.5 rounded-lg bg-surface-container-low flex items-center gap-2.5"}>
                <div className={"w-9 h-9 rounded-full bg-surface-container-lowest flex items-center justify-center text-primary shadow-xs flex-shrink-0"}>
                  <span className={"material-symbols-outlined text-[20px]"}>
                    directions_car
                  </span>
                </div>
                <div className={"min-w-0"}>
                  <p className={"font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider"}>
                    Garage
                  </p>
                  <p className={"font-label-md text-label-md text-on-surface truncate font-semibold"}>
                    No cars yet
                  </p>
                </div>
              </div>
              <div className={"p-2.5 rounded-lg bg-surface-container-low flex items-center gap-2.5"}>
                <div className={"w-9 h-9 rounded-full bg-surface-container-lowest flex items-center justify-center text-secondary-container shadow-xs flex-shrink-0"}>
                  <span className={"material-symbols-outlined text-[20px]"}>
                    add_location_alt
                  </span>
                </div>
                <div className={"min-w-0"}>
                  <p className={"font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider"}>
                    Mapped
                  </p>
                  <p className={"font-label-md text-label-md text-on-surface font-semibold"}>
                    No places yet
                  </p>
                </div>
              </div>
              <div className={"p-2.5 rounded-lg bg-surface-container-low flex items-center gap-2.5"}>
                <div className={"w-9 h-9 rounded-full bg-surface-container-lowest flex items-center justify-center text-tertiary shadow-xs flex-shrink-0"}>
                  <span className={"material-symbols-outlined text-[20px]"}>
                    local_gas_station
                  </span>
                </div>
                <div className={"min-w-0"}>
                  <p className={"font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider"}>
                    Updates
                  </p>
                  <p className={"font-label-md text-label-md text-on-surface font-semibold"}>
                    No prices yet
                  </p>
                </div>
              </div>
              <div className={"p-2.5 rounded-lg bg-surface-container-low flex items-center gap-2.5"}>
                <div className={"w-9 h-9 rounded-full bg-surface-container-lowest flex items-center justify-center text-primary shadow-xs flex-shrink-0"}>
                  <span className={"material-symbols-outlined text-[20px]"}>
                    payments
                  </span>
                </div>
                <div className={"min-w-0"}>
                  <p className={"font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider"}>
                    Total Fuel
                  </p>
                  <p className={"font-label-md text-label-md text-on-surface font-semibold truncate"}>
                    No fills yet
                  </p>
                </div>
              </div>
            </div>
          </section>
          <section className={"space-y-2"}>
            <div className={"px-1 flex items-center justify-between"}>
              <h3 className={"font-label-md text-label-md uppercase tracking-wider text-on-surface-variant font-bold"}>
                Motorist Core
              </h3>
              <span className={"font-label-sm text-label-sm text-primary font-semibold"}>
                Vehicle Hub
              </span>
            </div>
            <div className={"bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden"}>
              <a onClick={onPlugClick} className={"w-full flex items-center justify-between p-space-md hover:bg-surface-container-low transition-colors min-h-[56px] text-left active:bg-surface-container"} href={"#"} data-act={"my-garage-1-vehicle-active-2019-toyota-roomy-up-"}>
                <div className={"flex items-center gap-space-md min-w-0"}>
                  <div className={"w-10 h-10 rounded-full bg-primary-fixed flex items-center justify-center text-primary flex-shrink-0"}>
                    <span className={"material-symbols-outlined text-[22px]"}>
                      garage
                    </span>
                  </div>
                  <div className={"min-w-0"}>
                    <p className={"font-label-lg text-label-lg text-on-surface font-semibold truncate"}>
                      My Garage
                    </p>
                    <p className={"font-body-sm text-body-sm text-on-surface-variant truncate"}>
                      Add a car
                    </p>
                  </div>
                </div>
                <div className={"flex items-center gap-2 ml-2 flex-shrink-0"}>
                  <span className={"px-2 py-0.5 rounded-full bg-surface-container text-on-surface-variant font-label-sm text-[12px] font-semibold"}>
                    Up to date
                  </span>
                  <span className={"material-symbols-outlined text-outline text-[20px]"}>
                    chevron_right
                  </span>
                </div>
              </a>
              <div className={"h-px bg-surface-container-high mx-space-md"} />
              <a onClick={onPlugClick} className={"w-full flex items-center justify-between p-space-md hover:bg-surface-container-low transition-colors min-h-[56px] text-left active:bg-surface-container"} href={"#"} data-act={"my-contributions-level-3-scout-11-approved-pins-"}>
                <div className={"flex items-center gap-space-md min-w-0"}>
                  <div className={"w-10 h-10 rounded-full bg-tertiary-fixed flex items-center justify-center text-tertiary flex-shrink-0"}>
                    <span className={"material-symbols-outlined text-[22px]"}>
                      stars
                    </span>
                  </div>
                  <div className={"min-w-0"}>
                    <p className={"font-label-lg text-label-lg text-on-surface font-semibold truncate"}>
                      My Contributions
                    </p>
                    <p className={"font-body-sm text-body-sm text-on-surface-variant truncate"}>
                      Level 3 Scout • 11 approved pins
                    </p>
                  </div>
                </div>
                <div className={"flex items-center gap-2 ml-2 flex-shrink-0"}>
                  <span className={"px-2 py-0.5 rounded-full bg-secondary-fixed text-on-secondary-fixed font-label-sm text-[12px] font-semibold"}>
                    +3 pending
                  </span>
                  <span className={"material-symbols-outlined text-outline text-[20px]"}>
                    chevron_right
                  </span>
                </div>
              </a>
              <div className={"h-px bg-surface-container-high mx-space-md"} />
              <a onClick={onPlugClick} className={"w-full flex items-center justify-between p-space-md hover:bg-surface-container-low transition-colors min-h-[56px] text-left active:bg-surface-container"} href={"#"} data-act={"documents-renewals-fitness-expires-in-14-days-ac"}>
                <div className={"flex items-center gap-space-md min-w-0"}>
                  <div className={"w-10 h-10 rounded-full bg-surface-container flex items-center justify-center text-on-surface flex-shrink-0"}>
                    <span className={"material-symbols-outlined text-[22px]"}>
                      assignment
                    </span>
                  </div>
                  <div className={"min-w-0"}>
                    <p className={"font-label-lg text-label-lg text-on-surface font-semibold truncate"}>
                      {"Documents & Renewals"}
                    </p>
                    <p className={"font-body-sm text-body-sm text-on-surface-variant truncate"}>
                      No reminder yet
                    </p>
                  </div>
                </div>
                <div className={"flex items-center gap-2 ml-2 flex-shrink-0"}>
                  <span className={"w-2.5 h-2.5 rounded-full bg-secondary-container animate-pulse"} />
                  <span className={"px-2 py-0.5 rounded-full bg-secondary-fixed text-on-secondary-fixed font-label-sm text-[12px] font-semibold"}>
                    Action Due
                  </span>
                  <span className={"material-symbols-outlined text-outline text-[20px]"}>
                    chevron_right
                  </span>
                </div>
              </a>
            </div>
          </section>
          <section className={"space-y-2"}>
            <div className={"px-1"}>
              <h3 className={"font-label-md text-label-md uppercase tracking-wider text-on-surface-variant font-bold"}>
                {"Preferences & Alerts"}
              </h3>
            </div>
            <div className={"bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden"}>
              <a onClick={onPlugClick} className={"w-full flex items-center justify-between p-space-md hover:bg-surface-container-low transition-colors min-h-[56px] text-left active:bg-surface-container"} href={"#"} data-act={"notification-settings-sms-alerts-price-drop-rada"}>
                <div className={"flex items-center gap-space-md min-w-0"}>
                  <div className={"w-10 h-10 rounded-full bg-surface-container flex items-center justify-center text-on-surface flex-shrink-0"}>
                    <span className={"material-symbols-outlined text-[22px]"}>
                      notifications_active
                    </span>
                  </div>
                  <div className={"min-w-0"}>
                    <p className={"font-label-lg text-label-lg text-on-surface font-semibold truncate"}>
                      Notification Settings
                    </p>
                    <p className={"font-body-sm text-body-sm text-on-surface-variant truncate"}>
                      {"Push reminders, price drop radar & reminders"}
                    </p>
                  </div>
                </div>
                <div className={"flex items-center gap-2 ml-2 flex-shrink-0"}>
                  <span className={"material-symbols-outlined text-outline text-[20px]"}>
                    chevron_right
                  </span>
                </div>
              </a>
              <div className={"h-px bg-surface-container-high mx-space-md"} />
              <a onClick={onPlugClick} className={"w-full flex items-center justify-between p-space-md hover:bg-surface-container-low transition-colors min-h-[56px] text-left active:bg-surface-container"} href={"#"} data-act={"privacy-data-location-permissions-telemetry-offl"}>
                <div className={"flex items-center gap-space-md min-w-0"}>
                  <div className={"w-10 h-10 rounded-full bg-surface-container flex items-center justify-center text-on-surface flex-shrink-0"}>
                    <span className={"material-symbols-outlined text-[22px]"}>
                      shield
                    </span>
                  </div>
                  <div className={"min-w-0"}>
                    <p className={"font-label-lg text-label-lg text-on-surface font-semibold truncate"}>
                      {"Privacy & Data"}
                    </p>
                    <p className={"font-body-sm text-body-sm text-on-surface-variant truncate"}>
                      {"Location permissions, telemetry & offline sync"}
                    </p>
                  </div>
                </div>
                <div className={"flex items-center gap-2 ml-2 flex-shrink-0"}>
                  <span className={"material-symbols-outlined text-outline text-[20px]"}>
                    chevron_right
                  </span>
                </div>
              </a>
              <div className={"h-px bg-surface-container-high mx-space-md"} />
              <a onClick={onPlugClick} className={"w-full flex items-center justify-between p-space-md hover:bg-surface-container-low transition-colors min-h-[56px] text-left active:bg-surface-container"} href={"#"} data-act={"app-settings-measurement-units-km-l-j"}>
                <div className={"flex items-center gap-space-md min-w-0"}>
                  <div className={"w-10 h-10 rounded-full bg-surface-container flex items-center justify-center text-on-surface flex-shrink-0"}>
                    <span className={"material-symbols-outlined text-[22px]"}>
                      tune
                    </span>
                  </div>
                  <div className={"min-w-0"}>
                    <p className={"font-label-lg text-label-lg text-on-surface font-semibold truncate"}>
                      App Settings
                    </p>
                    <p className={"font-body-sm text-body-sm text-on-surface-variant truncate"}>
                      Measurement units (km / L / J$)
                    </p>
                  </div>
                </div>
                <div className={"flex items-center gap-2 ml-2 flex-shrink-0"}>
                  <span className={"material-symbols-outlined text-outline text-[20px]"}>
                    chevron_right
                  </span>
                </div>
              </a>
            </div>
          </section>
          <section className={"space-y-2"}>
            <div className={"px-1"}>
              <h3 className={"font-label-md text-label-md uppercase tracking-wider text-on-surface-variant font-bold"}>
                {"Community & Support"}
              </h3>
            </div>
            <div className={"bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden"}>
              <a onClick={onPlugClick} className={"w-full flex items-center justify-between p-space-md hover:bg-surface-container-low transition-colors min-h-[56px] text-left active:bg-surface-container"} href={"#"} data-act={"help-support-faqs-road-scout-guides-whatsapp-sup"}>
                <div className={"flex items-center gap-space-md min-w-0"}>
                  <div className={"w-10 h-10 rounded-full bg-surface-container flex items-center justify-center text-on-surface flex-shrink-0"}>
                    <span className={"material-symbols-outlined text-[22px]"}>
                      support_agent
                    </span>
                  </div>
                  <div className={"min-w-0"}>
                    <p className={"font-label-lg text-label-lg text-on-surface font-semibold truncate"}>
                      {"Help & Support"}
                    </p>
                    <p className={"font-body-sm text-body-sm text-on-surface-variant truncate"}>
                      FAQs and WhatsApp support
                    </p>
                  </div>
                </div>
                <div className={"flex items-center gap-2 ml-2 flex-shrink-0"}>
                  <span className={"material-symbols-outlined text-outline text-[20px]"}>
                    chevron_right
                  </span>
                </div>
              </a>
              <div className={"h-px bg-surface-container-high mx-space-md"} />
              <a onClick={onPlugClick} className={"w-full flex items-center justify-between p-space-md hover:bg-surface-container-low transition-colors min-h-[56px] text-left active:bg-surface-container"} href={"#"} data-act={"about-roam-plug-version-2-4-1-made-for-jamaican-"}>
                <div className={"flex items-center gap-space-md min-w-0"}>
                  <div className={"w-10 h-10 rounded-full bg-primary-fixed flex items-center justify-center text-primary flex-shrink-0"}>
                    <span className={"material-symbols-outlined text-[22px]"}>
                      local_fire_department
                    </span>
                  </div>
                  <div className={"min-w-0"}>
                    <p className={"font-label-lg text-label-lg text-on-surface font-semibold truncate"}>
                      About Roam Plug
                    </p>
                    <p className={"font-body-sm text-body-sm text-on-surface-variant truncate"}>
                      Version 2.4.1 • Made for Jamaican Drivers
                    </p>
                  </div>
                </div>
                <div className={"flex items-center gap-2 ml-2 flex-shrink-0"}>
                  <span className={"px-2 py-0.5 rounded-full bg-surface-container text-on-surface-variant font-label-sm text-[12px] font-semibold"}>
                    Latest
                  </span>
                  <span className={"material-symbols-outlined text-outline text-[20px]"}>
                    chevron_right
                  </span>
                </div>
              </a>
            </div>
          </section>
          <section className={"space-y-2"}>
            <div className={"bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden p-space-sm"}>
              <button onClick={onPlugClick} className={"w-full flex items-center justify-between p-space-md rounded-lg bg-surface-container-lowest hover:bg-error-container/20 text-error transition-all min-h-[48px] active:scale-[0.99]"} id={"sign-out-btn"} type={"button"} data-act={"sign-out-btn"}>
                <div className={"flex items-center gap-space-md"}>
                  <div className={"w-10 h-10 rounded-full bg-error-container flex items-center justify-center text-error flex-shrink-0"}>
                    <span className={"material-symbols-outlined text-[22px]"}>
                      logout
                    </span>
                  </div>
                  <div className={"text-left"}>
                    <p className={"font-label-lg text-label-lg font-bold"}>
                      Sign Out
                    </p>
                    <p className={"font-body-sm text-body-sm text-on-surface-variant"}>
                      
                    </p>
                  </div>
                </div>
                <span className={"material-symbols-outlined text-error text-[20px]"}>
                  chevron_right
                </span>
              </button>
            </div>
          </section>
          <footer className={"pt-2 text-center space-y-2"}>
            <p className={"font-label-sm text-label-sm uppercase tracking-widest text-on-surface-variant font-semibold"}>
              Roam Plug Jamaica • Built for Island Roads
            </p>
            <div className={"flex items-center justify-center gap-3 font-body-sm text-body-sm text-on-surface-variant"}>
              <a onClick={onPlugClick} className={"hover:text-primary transition-colors underline-offset-4 hover:underline"} href={"#"} data-act={"terms-of-service"}>
                Terms of Service
              </a>
              <span>
                •
              </span>
              <a onClick={onPlugClick} className={"hover:text-primary transition-colors underline-offset-4 hover:underline"} href={"#"} data-act={"privacy-policy"}>
                Privacy Policy
              </a>
              <span>
                •
              </span>
              <a onClick={onPlugClick} className={"hover:text-primary transition-colors underline-offset-4 hover:underline"} href={"#"} data-act={"gazetted-fuel-notice"}>
                Gazetted Fuel Notice
              </a>
            </div>
            <p className={"font-body-sm text-[12px] text-on-surface-variant/70 max-w-xs mx-auto"}>
              Fuel rates and toll tariffs are community-verified under the Jamaica Motoring Community Guidelines.
            </p>
          </footer>
        </div>
      </main>
    </div>
  );
}
