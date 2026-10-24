import { useEffect, useRef } from 'react';
import { onPlugClick } from '../../shell/actions';
import { bindScreen } from '../../shell/bind';
import { DemoSettingsRow } from '../../shell/chrome';

export function SettingsScreen() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (ref.current) bindScreen("54-settings.html", ref.current); }, []);
  return (
    <div ref={ref} data-plug-screen={"54-settings.html"} className={"bg-surface font-body-md text-on-surface flex flex-col min-h-screen selection:bg-secondary-fixed selection:text-on-secondary-fixed"}>
      <header className={"fixed top-0 inset-x-0 z-50 bg-surface/85 backdrop-blur-xl pt-safe shadow-[0_1px_8px_rgba(28,25,23,0.04)]"}>
        <div className={"h-16 px-margin flex items-center justify-between"}>
          <div className={"flex items-center gap-space-sm"}>
            <button onClick={onPlugClick} aria-label={"Go Back"} className={"w-12 h-12 -ml-2 rounded-full flex items-center justify-center text-on-surface hover:bg-surface-container active:scale-95 transition-all"} type={"button"} data-act={"arrow-back"} data-way-out={"back"}>
              <span className={"material-symbols-outlined text-[24px]"}>
                arrow_back
              </span>
            </button>
            <h1 className={"font-headline-sm text-headline-sm text-on-surface tracking-tight truncate max-w-[210px]"}>
              Settings
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
        <div className={"flex flex-col w-full pb-8"}>
          <div className={"px-margin pt-2 pb-4"}>
            <div className={"flex items-center justify-between gap-space-sm mb-1.5"}>
              <span className={"inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-secondary-fixed text-on-secondary-fixed text-label-sm font-label-sm tracking-wider uppercase"}>
                <span className={"material-symbols-outlined text-[13px]"} style={{ fontVariationSettings: "'FILL' 1" }}>
                  local_gas_station
                </span>
                Driver Preferences
              </span>
              <span className={"text-label-sm font-label-sm text-outline flex items-center gap-1"}>
                <span className={"inline-block w-2 h-2 rounded-full bg-emerald-600 animate-pulse"} />
                Sync Active
              </span>
            </div>
            <p className={"font-body-md text-body-md text-on-surface-variant"}>
              Customize your app experience, navigation preferences, and fuel defaults.
            </p>
          </div>
          <div className={"px-margin flex flex-col gap-space-lg"}>
            <section className={"flex flex-col gap-space-xs"}>
              <div className={"flex items-center justify-between mb-1"}>
                <h2 className={"font-label-lg text-label-lg text-on-surface flex items-center gap-2"}>
                  <span className={"material-symbols-outlined text-primary text-[20px]"}>
                    palette
                  </span>
                  Appearance
                </h2>
                <span className={"text-label-sm font-label-sm text-on-surface-variant uppercase"}>
                  Display
                </span>
              </div>
              <div className={"p-1.5 rounded-xl bg-surface-container flex items-center gap-1.5 shadow-sm"}>
                <button onClick={onPlugClick} className={"appearance-btn flex-1 flex items-center justify-center gap-1.5 py-2.5 px-2 rounded-lg bg-surface-container-lowest text-primary shadow-sm font-label-md text-label-md transition-all active:scale-95"} data-theme={"light"} type={"button"} data-act={"light"}>
                  <span className={"material-symbols-outlined text-[18px]"} style={{ fontVariationSettings: "'FILL' 1" }}>
                    light_mode
                  </span>
                  <span>
                    Light
                  </span>
                </button>
                <button onClick={onPlugClick} className={"appearance-btn flex-1 flex items-center justify-center gap-1.5 py-2.5 px-2 rounded-lg text-on-surface-variant hover:text-on-surface font-label-md text-label-md transition-all active:scale-95"} data-theme={"dark"} type={"button"} data-act={"dark"}>
                  <span className={"material-symbols-outlined text-[18px]"}>
                    dark_mode
                  </span>
                  <span>
                    Dark
                  </span>
                </button>
                <button onClick={onPlugClick} className={"appearance-btn flex-1 flex items-center justify-center gap-1.5 py-2.5 px-2 rounded-lg text-on-surface-variant hover:text-on-surface font-label-md text-label-md transition-all active:scale-95"} data-theme={"system"} type={"button"} data-act={"system"}>
                  <span className={"material-symbols-outlined text-[18px]"}>
                    devices
                  </span>
                  <span>
                    System
                  </span>
                </button>
              </div>
            </section>
            <section className={"flex flex-col gap-space-xs"}>
              <div className={"flex flex-col mb-1"}>
                <h2 className={"font-label-lg text-label-lg text-on-surface flex items-center gap-2"}>
                  <span className={"material-symbols-outlined text-primary text-[20px]"}>
                    turn_sharp_right
                  </span>
                  Default navigation app
                </h2>
                <p className={"font-body-sm text-body-sm text-on-surface-variant mt-0.5"}>
                  Used when launching turn-by-turn directions to stations or mechanics
                </p>
              </div>
              <div className={"flex flex-col gap-2"}>
                <label className={"nav-choice flex items-center justify-between p-3.5 rounded-xl bg-surface-container-lowest shadow-sm cursor-pointer transition-all active:scale-[0.99] group"}>
                  <div className={"flex items-center gap-3"}>
                    <div className={"w-10 h-10 rounded-lg bg-surface-container flex items-center justify-center shrink-0 text-primary"}>
                      <span className={"material-symbols-outlined text-[24px]"}>
                        map
                      </span>
                    </div>
                    <div className={"flex flex-col"}>
                      <span className={"font-label-lg text-label-lg text-on-surface"}>
                        Google Maps
                      </span>
                      <span className={"font-body-sm text-body-sm text-on-surface-variant"}>
                        Recommended for island-wide routes
                      </span>
                    </div>
                  </div>
                  <input defaultChecked={true} className={"accent-primary w-5 h-5 cursor-pointer"} name={"default_nav"} type={"radio"} defaultValue={"google"} />
                </label>
                <label className={"nav-choice flex items-center justify-between p-3.5 rounded-xl bg-surface-container-lowest shadow-sm cursor-pointer transition-all active:scale-[0.99] group"}>
                  <div className={"flex items-center gap-3"}>
                    <div className={"w-10 h-10 rounded-lg bg-surface-container flex items-center justify-center shrink-0 text-secondary"}>
                      <span className={"material-symbols-outlined text-[24px]"}>
                        traffic
                      </span>
                    </div>
                    <div className={"flex flex-col"}>
                      <span className={"font-label-lg text-label-lg text-on-surface"}>
                        Waze
                      </span>
                      <span className={"font-body-sm text-body-sm text-on-surface-variant"}>
                        {"Active road hazard & police reports"}
                      </span>
                    </div>
                  </div>
                  <input className={"accent-primary w-5 h-5 cursor-pointer"} name={"default_nav"} type={"radio"} defaultValue={"waze"} />
                </label>
                <label className={"nav-choice flex items-center justify-between p-3.5 rounded-xl bg-surface-container-lowest shadow-sm cursor-pointer transition-all active:scale-[0.99] group"}>
                  <div className={"flex items-center gap-3"}>
                    <div className={"w-10 h-10 rounded-lg bg-surface-container flex items-center justify-center shrink-0 text-outline"}>
                      <span className={"material-symbols-outlined text-[24px]"}>
                        explore
                      </span>
                    </div>
                    <div className={"flex flex-col"}>
                      <span className={"font-label-lg text-label-lg text-on-surface"}>
                        Apple Maps
                      </span>
                      <span className={"font-body-sm text-body-sm text-on-surface-variant"}>
                        Native iOS vehicle integration
                      </span>
                    </div>
                  </div>
                  <input className={"accent-primary w-5 h-5 cursor-pointer"} name={"default_nav"} type={"radio"} defaultValue={"apple"} />
                </label>
              </div>
            </section>
            <section className={"flex flex-col gap-space-xs"}>
              <div className={"flex flex-col mb-1"}>
                <h2 className={"font-label-lg text-label-lg text-on-surface flex items-center gap-2"}>
                  <span className={"material-symbols-outlined text-primary text-[20px]"}>
                    local_gas_station
                  </span>
                  Default fuel grade
                </h2>
                <p className={"font-body-sm text-body-sm text-on-surface-variant mt-0.5"}>
                  Pre-selects your pump type when viewing station prices and logging fill-ups
                </p>
              </div>
              <div className={"grid grid-cols-3 gap-2"}>
                <button onClick={onPlugClick} className={"fuel-btn flex flex-col items-center justify-center p-3 rounded-xl bg-surface-container-lowest shadow-sm transition-all active:scale-95 text-center relative overflow-hidden"} data-fuel={"e10-87"} type={"button"} data-act={"87-e-10-87-regular-unleaded"}>
                  <span className={"inline-block w-full h-1 bg-primary absolute top-0 inset-x-0"} />
                  <span className={"font-headline-sm text-headline-sm text-primary mb-0.5"}>
                    87
                  </span>
                  <span className={"font-label-md text-label-md text-on-surface font-semibold"}>
                    E-10 87
                  </span>
                  <span className={"font-label-sm text-label-sm text-on-surface-variant mt-1"}>
                    Regular Unleaded
                  </span>
                  <div className={"mt-2 text-primary"}>
                    <span className={"material-symbols-outlined text-[18px]"} style={{ fontVariationSettings: "'FILL' 1" }}>
                      check_circle
                    </span>
                  </div>
                </button>
                <button onClick={onPlugClick} className={"fuel-btn flex flex-col items-center justify-center p-3 rounded-xl bg-surface-container-lowest shadow-sm transition-all active:scale-95 text-center relative opacity-85 hover:opacity-100"} data-fuel={"e10-90"} type={"button"} data-act={"90-e-10-90-super-premium"}>
                  <span className={"inline-block w-full h-1 bg-transparent absolute top-0 inset-x-0"} />
                  <span className={"font-headline-sm text-headline-sm text-on-surface mb-0.5"}>
                    90
                  </span>
                  <span className={"font-label-md text-label-md text-on-surface font-semibold"}>
                    E-10 90
                  </span>
                  <span className={"font-label-sm text-label-sm text-on-surface-variant mt-1"}>
                    Super Premium
                  </span>
                  <div className={"mt-2 text-outline-variant"}>
                    <span className={"material-symbols-outlined text-[18px]"}>
                      radio_button_unchecked
                    </span>
                  </div>
                </button>
                <button onClick={onPlugClick} className={"fuel-btn flex flex-col items-center justify-center p-3 rounded-xl bg-surface-container-lowest shadow-sm transition-all active:scale-95 text-center relative opacity-85 hover:opacity-100"} data-fuel={"diesel"} type={"button"} data-act={"ulsd-diesel-ultra-low-sulfur"}>
                  <span className={"inline-block w-full h-1 bg-transparent absolute top-0 inset-x-0"} />
                  <span className={"font-headline-sm text-headline-sm text-on-surface mb-0.5"}>
                    ULSD
                  </span>
                  <span className={"font-label-md text-label-md text-on-surface font-semibold"}>
                    Diesel
                  </span>
                  <span className={"font-label-sm text-label-sm text-on-surface-variant mt-1"}>
                    Ultra Low Sulfur
                  </span>
                  <div className={"mt-2 text-outline-variant"}>
                    <span className={"material-symbols-outlined text-[18px]"}>
                      radio_button_unchecked
                    </span>
                  </div>
                </button>
              </div>
            </section>
            <section className={"flex flex-col gap-space-xs"}>
              <div className={"flex items-center justify-between mb-1"}>
                <h2 className={"font-label-lg text-label-lg text-on-surface flex items-center gap-2"}>
                  <span className={"material-symbols-outlined text-primary text-[20px]"}>
                    public
                  </span>
                  {"Regional & Measurement Units"}
                </h2>
                <span className={"text-label-sm font-label-sm text-on-surface-variant uppercase"}>
                  Local Specs
                </span>
              </div>
              <div className={"rounded-xl bg-surface-container-lowest shadow-sm overflow-hidden flex flex-col"}>
                <div className={"p-4 flex items-center justify-between bg-surface-container-lowest"}>
                  <div className={"flex items-center gap-3"}>
                    <div className={"w-8 h-8 rounded-full bg-surface-container flex items-center justify-center text-on-surface-variant shrink-0"}>
                      <span className={"material-symbols-outlined text-[18px]"}>
                        straighten
                      </span>
                    </div>
                    <div className={"flex flex-col"}>
                      <span className={"font-label-lg text-label-lg text-on-surface"}>
                        Distance units
                      </span>
                      <span className={"font-body-sm text-body-sm text-on-surface-variant"}>
                        Mandatory Jamaican highway standard
                      </span>
                    </div>
                  </div>
                  <div className={"flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-container text-on-surface font-label-md text-label-md"}>
                    <span>
                      Kilometres (km)
                    </span>
                    <span className={"material-symbols-outlined text-[16px] text-outline"} title={"Locked by regional regulation"}>
                      lock
                    </span>
                  </div>
                </div>
                <div className={"h-px w-full bg-surface-container"} />
                <div className={"p-4 flex items-center justify-between bg-surface-container-lowest"}>
                  <div className={"flex items-center gap-3"}>
                    <div className={"w-8 h-8 rounded-full bg-surface-container flex items-center justify-center text-on-surface-variant shrink-0"}>
                      <span className={"material-symbols-outlined text-[18px]"}>
                        payments
                      </span>
                    </div>
                    <div className={"flex flex-col"}>
                      <span className={"font-label-lg text-label-lg text-on-surface"}>
                        Currency
                      </span>
                      <span className={"font-body-sm text-body-sm text-on-surface-variant"}>
                        {"Pump pricing & toll fees"}
                      </span>
                    </div>
                  </div>
                  <div className={"flex items-center gap-1 px-3 py-1.5 rounded-lg bg-secondary-fixed text-on-secondary-fixed font-label-md text-label-md"}>
                    <span>
                      Jamaican Dollars (J$)
                    </span>
                  </div>
                </div>
                <div className={"h-px w-full bg-surface-container"} />
                <button onClick={onPlugClick} className={"w-full p-4 flex items-center justify-between bg-surface-container-lowest hover:bg-surface-container-low transition-colors text-left active:bg-surface-container"} type={"button"} data-act={"language-locale-roadside-terminology-english-jam"}>
                  <div className={"flex items-center gap-3"}>
                    <div className={"w-8 h-8 rounded-full bg-surface-container flex items-center justify-center text-on-surface-variant shrink-0"}>
                      <span className={"material-symbols-outlined text-[18px]"}>
                        translate
                      </span>
                    </div>
                    <div className={"flex flex-col"}>
                      <span className={"font-label-lg text-label-lg text-on-surface"}>
                        Language
                      </span>
                      <span className={"font-body-sm text-body-sm text-on-surface-variant"}>
                        {"Locale & roadside terminology"}
                      </span>
                    </div>
                  </div>
                  <div className={"flex items-center gap-1 text-on-surface-variant font-label-md text-label-md"}>
                    <span className={"text-on-surface"}>
                      English (Jamaica)
                    </span>
                    <span className={"material-symbols-outlined text-[20px]"}>
                      chevron_right
                    </span>
                  </div>
                </button>
              </div>
            </section>
            <section className={"flex flex-col gap-space-xs"}>
              <div className={"flex items-center justify-between mb-1"}>
                <h2 className={"font-label-lg text-label-lg text-on-surface flex items-center gap-2"}>
                  <span className={"material-symbols-outlined text-primary text-[20px]"}>
                    info
                  </span>
                  {"About & Community"}
                </h2>
              </div>
              <div className={"rounded-xl bg-surface-container-lowest shadow-sm overflow-hidden flex flex-col"}>
                <button onClick={onPlugClick} className={"w-full p-4 flex items-center justify-between bg-surface-container-lowest hover:bg-surface-container-low transition-colors text-left active:bg-surface-container"} type={"button"} data-act={"about-roam-plug-built-for-jamaican-roads-by-loca"}>
                  <div className={"flex items-center gap-3 min-w-0"}>
                    <div className={"w-9 h-9 rounded-lg bg-primary-fixed flex items-center justify-center text-primary shrink-0"}>
                      <span className={"material-symbols-outlined text-[20px]"}>
                        electric_bolt
                      </span>
                    </div>
                    <div className={"flex flex-col min-w-0"}>
                      <span className={"font-label-lg text-label-lg text-on-surface"}>
                        About Roam Plug
                      </span>
                      <span className={"font-body-sm text-body-sm text-on-surface-variant truncate"}>
                        Built for Jamaican roads, by local drivers
                      </span>
                    </div>
                  </div>
                  <span className={"material-symbols-outlined text-[20px] text-outline shrink-0 ml-2"}>
                    chevron_right
                  </span>
                </button>
                <div className={"h-px w-full bg-surface-container"} />
                <button onClick={onPlugClick} className={"w-full p-4 flex items-center justify-between bg-surface-container-lowest hover:bg-surface-container-low transition-colors text-left active:bg-surface-container"} type={"button"} data-act={"community-scout-guidelines-accuracy-rewards-stat"}>
                  <div className={"flex items-center gap-3 min-w-0"}>
                    <div className={"w-9 h-9 rounded-lg bg-tertiary-fixed flex items-center justify-center text-tertiary shrink-0"}>
                      <span className={"material-symbols-outlined text-[20px]"}>
                        verified_user
                      </span>
                    </div>
                    <div className={"flex flex-col min-w-0"}>
                      <span className={"font-label-lg text-label-lg text-on-surface"}>
                        Community Scout Guidelines
                      </span>
                      <span className={"font-body-sm text-body-sm text-on-surface-variant truncate"}>
                        {"Accuracy rewards & station verification"}
                      </span>
                    </div>
                  </div>
                  <span className={"material-symbols-outlined text-[20px] text-outline shrink-0 ml-2"}>
                    chevron_right
                  </span>
                </button>
                <div className={"h-px w-full bg-surface-container"} />
                <button onClick={onPlugClick} className={"w-full p-4 flex items-center justify-between bg-surface-container-lowest hover:bg-surface-container-low transition-colors text-left active:bg-surface-container"} type={"button"} data-act={"terms-of-service-user-rights-telemetry-navigatio"}>
                  <div className={"flex items-center gap-3 min-w-0"}>
                    <div className={"w-9 h-9 rounded-lg bg-surface-container flex items-center justify-center text-on-surface-variant shrink-0"}>
                      <span className={"material-symbols-outlined text-[20px]"}>
                        gavel
                      </span>
                    </div>
                    <div className={"flex flex-col min-w-0"}>
                      <span className={"font-label-lg text-label-lg text-on-surface"}>
                        Terms of Service
                      </span>
                      <span className={"font-body-sm text-body-sm text-on-surface-variant truncate"}>
                        {"User rights, telemetry & navigation rules"}
                      </span>
                    </div>
                  </div>
                  <span className={"material-symbols-outlined text-[20px] text-outline shrink-0 ml-2"}>
                    chevron_right
                  </span>
                </button>
                <div className={"h-px w-full bg-surface-container"} />
                <button onClick={onPlugClick} className={"w-full p-4 flex items-center justify-between bg-surface-container-lowest hover:bg-surface-container-low transition-colors text-left active:bg-surface-container"} type={"button"} data-act={"privacy-policy-strict-location-privacy-data-poli"}>
                  <div className={"flex items-center gap-3 min-w-0"}>
                    <div className={"w-9 h-9 rounded-lg bg-surface-container flex items-center justify-center text-on-surface-variant shrink-0"}>
                      <span className={"material-symbols-outlined text-[20px]"}>
                        policy
                      </span>
                    </div>
                    <div className={"flex flex-col min-w-0"}>
                      <span className={"font-label-lg text-label-lg text-on-surface"}>
                        Privacy Policy
                      </span>
                      <span className={"font-body-sm text-body-sm text-on-surface-variant truncate"}>
                        {"Strict location privacy & data policies"}
                      </span>
                    </div>
                  </div>
                  <span className={"material-symbols-outlined text-[20px] text-outline shrink-0 ml-2"}>
                    chevron_right
                  </span>
                </button>
              </div>
            </section>
            <div className={"rounded-xl overflow-hidden bg-surface-container-low shadow-sm p-4 flex items-center gap-3.5"}>
              <div className={"w-12 h-12 rounded-xl bg-primary flex items-center justify-center text-on-primary shrink-0 shadow-md"}>
                <span className={"material-symbols-outlined text-[26px]"}>
                  handshake
                </span>
              </div>
              <div className={"flex flex-col"}>
                <span className={"font-label-lg text-label-lg text-on-surface"}>
                  One Road, One People
                </span>
                <span className={"font-body-sm text-body-sm text-on-surface-variant"}>
                  {"Over 14,200 active drivers updating gas stations & road repairs across 14 parishes daily."}
                </span>
              </div>
            </div>
            <footer className={"pt-2 pb-6 flex flex-col items-center text-center gap-2"}>
              <div className={"flex items-center gap-2 px-3 py-1 rounded-full bg-surface-container text-on-surface-variant"}>
                <span className={"material-symbols-outlined text-[15px] text-primary"}>
                  local_taxi
                </span>
                <span className={"font-label-sm text-label-sm"}>
                  Roam Plug v2.4.1 (Build 184) • Kingston, Jamaica
                </span>
              </div>
              <p className={"font-body-sm text-body-sm text-outline max-w-[290px] leading-relaxed"}>
                © 2024 Roam Plug Jamaica. Fuel prices updated with Petrojam weekly notices.
              </p>
            </footer>
          </div>
        </div>
      </main>
      <DemoSettingsRow />
    </div>
  );
}
