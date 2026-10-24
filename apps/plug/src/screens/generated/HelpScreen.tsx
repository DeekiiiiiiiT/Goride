import { useEffect, useRef } from 'react';
import { onPlugClick } from '../../shell/actions';
import { bindScreen } from '../../shell/bind';


export function HelpScreen() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (ref.current) bindScreen("55-help.html", ref.current); }, []);
  return (
    <div ref={ref} data-plug-screen={"55-help.html"} className={"bg-surface font-body-md text-on-surface flex flex-col min-h-screen selection:bg-secondary-fixed selection:text-on-secondary-fixed"}>
      <header className={"fixed top-0 inset-x-0 z-50 bg-surface/85 backdrop-blur-xl pt-safe shadow-[0_1px_8px_rgba(28,25,23,0.04)]"}>
        <div className={"h-16 px-margin flex items-center justify-between"}>
          <div className={"flex items-center gap-space-sm"}>
            <button onClick={onPlugClick} aria-label={"Go Back"} className={"w-12 h-12 -ml-2 rounded-full flex items-center justify-center text-on-surface hover:bg-surface-container active:scale-95 transition-all"} type={"button"} data-act={"arrow-back"} data-way-out={"back"}>
              <span className={"material-symbols-outlined text-[24px]"}>
                arrow_back
              </span>
            </button>
            <h1 className={"font-headline-sm text-headline-sm text-on-surface tracking-tight truncate max-w-[210px]"}>
              {"Help & Support"}
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
        <div className={"flex flex-col w-full"}>
          <section className={"px-margin pt-space-md pb-space-sm"}>
            <div className={"relative w-full"}>
              <div className={"absolute inset-y-0 left-0 pl-space-md flex items-center pointer-events-none text-on-surface-variant"}>
                <span className={"material-symbols-outlined text-[22px]"}>
                  search
                </span>
              </div>
              <input onClick={onPlugClick} className={"w-full h-12 pl-12 pr-12 rounded-xl bg-surface-container-lowest text-on-surface placeholder:text-on-surface-variant/70 shadow-sm focus:outline-none focus:bg-surface-container-low transition-all font-body-md text-body-md"} id={"support-search"} placeholder={"Search questions, guides, parish tips..."} type={"search"} data-act={"support-search"} />
              <button onClick={onPlugClick} aria-label={"Clear Search"} className={"absolute inset-y-0 right-0 pr-space-md flex items-center text-on-surface-variant hover:text-on-surface active:scale-90 transition-all opacity-0 pointer-events-none"} id={"clear-search"} type={"button"} data-act={"clear-search"}>
                <span className={"material-symbols-outlined text-[20px]"}>
                  cancel
                </span>
              </button>
            </div>
          </section>
          <section className={"px-margin py-space-sm"}>
            <div className={"relative overflow-hidden rounded-xl bg-gradient-to-br from-primary via-primary-container to-secondary-container p-space-md shadow-md text-on-primary"}>
              <div className={"absolute -right-4 -bottom-6 w-28 h-28 rounded-full bg-on-primary/10 blur-xl pointer-events-none"} />
              <div className={"relative z-10 flex items-start gap-space-md"}>
                <div className={"w-12 h-12 rounded-xl bg-on-primary/20 backdrop-blur-md flex items-center justify-center shrink-0 shadow-inner"}>
                  <span className={"material-symbols-outlined text-on-primary text-[28px]"} style={{ fontVariationSettings: "'FILL' 1" }}>
                    support_agent
                  </span>
                </div>
                <div className={"flex-1 min-w-0"}>
                  <div className={"flex items-center gap-space-xs mb-1"}>
                    <span className={"inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-tertiary-fixed text-on-tertiary-fixed font-label-sm text-label-sm uppercase tracking-wider"}>
                      <span className={"w-1.5 h-1.5 rounded-full bg-primary animate-pulse"} />
                      Live On-Road
                    </span>
                  </div>
                  <h2 className={"font-headline-sm text-headline-sm text-on-primary leading-tight"}>
                    Direct Motorist Helpdesk
                  </h2>
                  <p className={"font-body-sm text-body-sm text-on-primary/90 mt-1"}>
                    Stuck between towns or got route questions? Fast assistance for Jamaican drivers on the asphalt.
                  </p>
                  <div className={"mt-space-md flex items-center gap-space-sm"}>
                    <a onClick={onPlugClick} className={"inline-flex items-center justify-center gap-2 h-10 px-space-md rounded-lg bg-surface-container-lowest text-primary font-label-lg text-label-lg shadow-sm hover:bg-surface-container-low active:scale-95 transition-all"} href={"https://wa.me/18765557626"} data-act={"quick-dispatch"}>
                      <span className={"material-symbols-outlined text-[18px]"}>
                        chat
                      </span>
                      Quick Dispatch
                    </a>
                    <span className={"font-label-sm text-label-sm text-on-primary/80"}>
                      Avg reply ~10 min
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </section>
          <section className={"px-margin pt-space-lg pb-space-sm"}>
            <div className={"flex items-center justify-between mb-space-sm"}>
              <div className={"flex items-center gap-2"}>
                <span className={"material-symbols-outlined text-primary text-[20px]"}>
                  grid_view
                </span>
                <h2 className={"font-headline-sm text-headline-sm text-on-surface"}>
                  Browse by Topic
                </h2>
              </div>
              <span className={"font-label-sm text-label-sm text-on-surface-variant font-bold uppercase tracking-wider"}>
                6 Categories
              </span>
            </div>
            <div className={"grid grid-cols-1 gap-space-sm"} id={"faq-category-list"}>
              <button onClick={onPlugClick} className={"faq-card w-full text-left bg-surface-container-lowest hover:bg-surface-container-low p-space-md rounded-xl shadow-sm transition-all flex items-start gap-space-md active:scale-[0.99] group"} data-keywords={"gas fuel petrojam price petrol diesel e10 87 90 discrepancy parish"} type={"button"} data-act={"fuel-prices-petrojam-updates-parish-averages-rep"}>
                <div className={"w-12 h-12 rounded-xl bg-primary-fixed flex items-center justify-center shrink-0 text-on-primary-fixed group-hover:scale-105 transition-transform"}>
                  <span className={"material-symbols-outlined text-[26px]"}>
                    local_gas_station
                  </span>
                </div>
                <div className={"flex-1 min-w-0"}>
                  <div className={"flex items-center justify-between"}>
                    <h3 className={"font-label-lg text-label-lg text-on-surface font-semibold group-hover:text-primary transition-colors"}>
                      Fuel prices
                    </h3>
                    <span className={"material-symbols-outlined text-on-surface-variant/60 group-hover:translate-x-0.5 transition-transform text-[20px]"}>
                      chevron_right
                    </span>
                  </div>
                  <p className={"font-body-sm text-body-sm text-on-surface-variant mt-0.5 line-clamp-2"}>
                    Petrojam updates, parish averages, reporting discrepancies
                  </p>
                </div>
              </button>
              <button onClick={onPlugClick} className={"faq-card w-full text-left bg-surface-container-lowest hover:bg-surface-container-low p-space-md rounded-xl shadow-sm transition-all flex items-start gap-space-md active:scale-[0.99] group"} data-keywords={"odometer logs log camera scan receipt km/l offline mileage speed"} type={"button"} data-act={"logging-fuel-odometer-camera-scan-tips-calculati"}>
                <div className={"w-12 h-12 rounded-xl bg-secondary-fixed flex items-center justify-center shrink-0 text-on-secondary-fixed group-hover:scale-105 transition-transform"}>
                  <span className={"material-symbols-outlined text-[26px]"}>
                    speed
                  </span>
                </div>
                <div className={"flex-1 min-w-0"}>
                  <div className={"flex items-center justify-between"}>
                    <h3 className={"font-label-lg text-label-lg text-on-surface font-semibold group-hover:text-primary transition-colors"}>
                      {"Logging fuel & odometer"}
                    </h3>
                    <span className={"material-symbols-outlined text-on-surface-variant/60 group-hover:translate-x-0.5 transition-transform text-[20px]"}>
                      chevron_right
                    </span>
                  </div>
                  <p className={"font-body-sm text-body-sm text-on-surface-variant mt-0.5 line-clamp-2"}>
                    Camera scan tips, calculating km/L, offline logs
                  </p>
                </div>
              </button>
              <button onClick={onPlugClick} className={"faq-card w-full text-left bg-surface-container-lowest hover:bg-surface-container-low p-space-md rounded-xl shadow-sm transition-all flex items-start gap-space-md active:scale-[0.99] group"} data-keywords={"maintenance service oem severe potholes dust tropical interval oil filter brakes wrench"} type={"button"} data-act={"maintenance-schedules-oem-vs-jamaican-severe-con"}>
                <div className={"w-12 h-12 rounded-xl bg-tertiary-fixed flex items-center justify-center shrink-0 text-on-tertiary-fixed group-hover:scale-105 transition-transform"}>
                  <span className={"material-symbols-outlined text-[26px]"}>
                    build
                  </span>
                </div>
                <div className={"flex-1 min-w-0"}>
                  <div className={"flex items-center justify-between"}>
                    <h3 className={"font-label-lg text-label-lg text-on-surface font-semibold group-hover:text-primary transition-colors"}>
                      Maintenance schedules
                    </h3>
                    <span className={"material-symbols-outlined text-on-surface-variant/60 group-hover:translate-x-0.5 transition-transform text-[20px]"}>
                      chevron_right
                    </span>
                  </div>
                  <p className={"font-body-sm text-body-sm text-on-surface-variant mt-0.5 line-clamp-2"}>
                    OEM vs Jamaican severe conditions, custom service intervals
                  </p>
                </div>
              </button>
              <button onClick={onPlugClick} className={"faq-card w-full text-left bg-surface-container-lowest hover:bg-surface-container-low p-space-md rounded-xl shadow-sm transition-all flex items-start gap-space-md active:scale-[0.99] group"} data-keywords={"mapping map tyre tire shop pin scout xp community points verified route"} type={"button"} data-act={"mapping-places-pinning-tyre-shops-verification-p"}>
                <div className={"w-12 h-12 rounded-xl bg-primary-fixed-dim flex items-center justify-center shrink-0 text-on-primary-fixed group-hover:scale-105 transition-transform"}>
                  <span className={"material-symbols-outlined text-[26px]"}>
                    pin_drop
                  </span>
                </div>
                <div className={"flex-1 min-w-0"}>
                  <div className={"flex items-center justify-between"}>
                    <h3 className={"font-label-lg text-label-lg text-on-surface font-semibold group-hover:text-primary transition-colors"}>
                      Mapping places
                    </h3>
                    <span className={"material-symbols-outlined text-on-surface-variant/60 group-hover:translate-x-0.5 transition-transform text-[20px]"}>
                      chevron_right
                    </span>
                  </div>
                  <p className={"font-body-sm text-body-sm text-on-surface-variant mt-0.5 line-clamp-2"}>
                    Pinning tyre shops, verification process, earning Scout XP
                  </p>
                </div>
              </button>
              <button onClick={onPlugClick} className={"faq-card w-full text-left bg-surface-container-lowest hover:bg-surface-container-low p-space-md rounded-xl shadow-sm transition-all flex items-start gap-space-md active:scale-[0.99] group"} data-keywords={"parts spares fitment tiers genuine oem aftermarket local auto desk kingston montego"} type={"button"} data-act={"parts-info-fitment-guarantee-5-quality-tiers-loc"}>
                <div className={"w-12 h-12 rounded-xl bg-surface-container-highest flex items-center justify-center shrink-0 text-on-surface group-hover:scale-105 transition-transform"}>
                  <span className={"material-symbols-outlined text-[26px]"}>
                    settings_input_component
                  </span>
                </div>
                <div className={"flex-1 min-w-0"}>
                  <div className={"flex items-center justify-between"}>
                    <h3 className={"font-label-lg text-label-lg text-on-surface font-semibold group-hover:text-primary transition-colors"}>
                      Parts info
                    </h3>
                    <span className={"material-symbols-outlined text-on-surface-variant/60 group-hover:translate-x-0.5 transition-transform text-[20px]"}>
                      chevron_right
                    </span>
                  </div>
                  <p className={"font-body-sm text-body-sm text-on-surface-variant mt-0.5 line-clamp-2"}>
                    Fitment guarantee, 5 quality tiers, local parts desk contacts
                  </p>
                </div>
              </button>
              <button onClick={onPlugClick} className={"faq-card w-full text-left bg-surface-container-lowest hover:bg-surface-container-low p-space-md rounded-xl shadow-sm transition-all flex items-start gap-space-md active:scale-[0.99] group"} data-keywords={"account privacy jdpa data compliance export logs backup security legal profile"} type={"button"} data-act={"account-privacy-data-charter-jdpa-compliance-exp"}>
                <div className={"w-12 h-12 rounded-xl bg-surface-container-high flex items-center justify-center shrink-0 text-on-surface-variant group-hover:scale-105 transition-transform"}>
                  <span className={"material-symbols-outlined text-[26px]"}>
                    verified_user
                  </span>
                </div>
                <div className={"flex-1 min-w-0"}>
                  <div className={"flex items-center justify-between"}>
                    <h3 className={"font-label-lg text-label-lg text-on-surface font-semibold group-hover:text-primary transition-colors"}>
                      {"Account & privacy"}
                    </h3>
                    <span className={"material-symbols-outlined text-on-surface-variant/60 group-hover:translate-x-0.5 transition-transform text-[20px]"}>
                      chevron_right
                    </span>
                  </div>
                  <p className={"font-body-sm text-body-sm text-on-surface-variant mt-0.5 line-clamp-2"}>
                    Data charter, JDPA compliance, export motoring logs
                  </p>
                </div>
              </button>
            </div>
          </section>
          <section className={"px-margin pt-space-lg pb-space-sm"}>
            <div className={"flex items-center gap-2 mb-space-sm"}>
              <span className={"material-symbols-outlined text-primary text-[20px]"}>
                help_center
              </span>
              <h2 className={"font-headline-sm text-headline-sm text-on-surface"}>
                Top Driver Questions
              </h2>
            </div>
            <div className={"flex flex-col gap-space-sm"} id={"popular-questions-list"}>
              <div className={"faq-item rounded-xl bg-surface-container-lowest shadow-sm overflow-hidden transition-all"}>
                <button onClick={onPlugClick} aria-expanded={"false"} className={"faq-toggle w-full px-space-md py- space-md text-left flex items-center justify-between gap-space-sm min-h-[52px]"} type={"button"} data-act={"why-do-gas-prices-vary-across-parishes-in-jamaic"}>
                  <span className={"font-label-lg text-label-lg text-on-surface font-semibold flex-1"}>
                    Why do gas prices vary across parishes in Jamaica?
                  </span>
                  <span className={"material-symbols-outlined text-on-surface-variant text-[22px] transition-transform duration-200 faq-icon shrink-0"}>
                    expand_more
                  </span>
                </button>
                <div className={"faq-content hidden px-space-md pb-space-md pt-1 text-on-surface-variant font-body-sm text-body-sm bg-surface-container-low/50"}>
                  <p className={"leading-relaxed"}>
                    While Petrojam publishes weekly ex-refinery billing benchmarks, pump prices differ by parish due to marketing company dealer margins, haulage transport costs from Kingston/Montego Bay terminals, and individual service station overheads (such as 24-hour backup generator fueling in hilly terrains).
                  </p>
                  <div className={"mt-space-sm flex items-center gap-2"}>
                    <span className={"inline-flex items-center gap-1 font-label-sm text-label-sm text-primary font-bold"}>
                      <span className={"material-symbols-outlined text-[14px]"}>
                        insights
                      </span>
                      Live Parish Variance Tracker
                    </span>
                  </div>
                </div>
              </div>
              <div className={"faq-item rounded-xl bg-surface-container-lowest shadow-sm overflow-hidden transition-all"}>
                <button onClick={onPlugClick} aria-expanded={"false"} className={"faq-toggle w-full px-space-md py-space-md text-left flex items-center justify-between gap-space-sm min-h-[52px]"} type={"button"} data-act={"how-do-i-sync-my-logs-if-i-m-driving-through-a-d"}>
                  <span className={"font-label-lg text-label-lg text-on-surface font-semibold flex-1"}>
                    How do I sync my logs if I'm driving through a dead zone?
                  </span>
                  <span className={"material-symbols-outlined text-on-surface-variant text-[22px] transition-transform duration-200 faq-icon shrink-0"}>
                    expand_more
                  </span>
                </button>
                <div className={"faq-content hidden px-space-md pb-space-md pt-1 text-on-surface-variant font-body-sm text-body-sm bg-surface-container-low/50"}>
                  <p className={"leading-relaxed"}>
                    Roam Plug uses an offline-first storage engine designed for rural routes like Spur Tree Hill or Cockpit country. You can snap receipts and record your odometer values without any cellular reception. Your logs are safely encrypted locally and will automatically sync as soon as you reconnect to Digicel or Flow networks.
                  </p>
                  <div className={"mt-space-sm inline-flex items-center gap-1 font-label-sm text-label-sm text-secondary font-bold"}>
                    <span className={"material-symbols-outlined text-[14px]"}>
                      cloud_done
                    </span>
                    Offline Queue: Active
                  </div>
                </div>
              </div>
              <div className={"faq-item rounded-xl bg-surface-container-lowest shadow-sm overflow-hidden transition-all"}>
                <button onClick={onPlugClick} aria-expanded={"false"} className={"faq-toggle w-full px-space-md py-space-md text-left flex items-center justify-between gap-space-sm min-h-[52px]"} type={"button"} data-act={"how-long-does-it-take-for-a-newly-pinned-tyre-sh"}>
                  <span className={"font-label-lg text-label-lg text-on-surface font-semibold flex-1"}>
                    How long does it take for a newly pinned tyre shop to be approved?
                  </span>
                  <span className={"material-symbols-outlined text-on-surface-variant text-[22px] transition-transform duration-200 faq-icon shrink-0"}>
                    expand_more
                  </span>
                </button>
                <div className={"faq-content hidden px-space-md pb-space-md pt-1 text-on-surface-variant font-body-sm text-body-sm bg-surface-container-low/50"}>
                  <p className={"leading-relaxed"}>
                    Community scout submissions undergo a dual-verification process. Once two other verified drivers or a Parish Scout confirm the GPS pin and operating hours, the pin turns green on the public live map. This typically happens within 2 to 4 hours. You will receive 50 Scout XP immediately upon approval!
                  </p>
                </div>
              </div>
            </div>
          </section>
          <section className={"px-margin pt-space-lg pb-space-sm"}>
            <div className={"rounded-xl bg-surface-container p-space-md shadow-sm relative overflow-hidden"}>
              <div className={"flex items-center gap-space-md"}>
                <div className={"w-12 h-12 rounded-xl bg-secondary-container text-on-secondary-container flex items-center justify-center shrink-0"}>
                  <span className={"material-symbols-outlined text-[26px]"}>
                    groups
                  </span>
                </div>
                <div className={"flex-1 min-w-0"}>
                  <span className={"inline-block px-2 py-0.5 rounded-full bg-primary-fixed text-on-primary-fixed font-label-sm text-label-sm mb-1 uppercase tracking-wider"}>
                    Islandwide Network
                  </span>
                  <h3 className={"font-label-lg text-label-lg text-on-surface font-bold"}>
                    Roam Plug Driver Community
                  </h3>
                  <p className={"font-body-sm text-body-sm text-on-surface-variant mt-0.5"}>
                    {"Join over 14,000 drivers in our WhatsApp Community for road alerts & taxi route updates."}
                  </p>
                </div>
              </div>
              <div className={"mt-space-md"}>
                <a onClick={onPlugClick} className={"w-full h-11 flex items-center justify-center gap-2 rounded-lg bg-surface-container-lowest text-on-surface font-label-lg text-label-lg shadow-sm hover:bg-surface-container-low active:scale-95 transition-all"} href={"https://chat.whatsapp.com/sample-roam-plug"} rel={"noopener noreferrer"} target={"_blank"} data-act={"enter-island-driver-group"}>
                  <span className={"material-symbols-outlined text-primary text-[20px]"}>
                    hub
                  </span>
                  Enter Island Driver Group
                </a>
              </div>
            </div>
          </section>
          <section className={"px-margin pt-space-md pb-space-xl"}>
            <div className={"text-center mb-space-md"}>
              <h2 className={"font-headline-sm text-headline-sm text-on-surface"}>
                Still Need Assistance?
              </h2>
              <p className={"font-body-sm text-body-sm text-on-surface-variant mt-0.5"}>
                Our Kingston support desk is staffed 7:00 AM – 9:00 PM daily
              </p>
            </div>
            <div className={"flex flex-col gap-space-sm"}>
              <a onClick={onPlugClick} className={"w-full min-h-[58px] p-space-md rounded-xl bg-[#128C7E] text-white flex items-center justify-between shadow-md hover:bg-[#075E54] active:scale-[0.98] transition-all group"} href={"https://wa.me/18765557626"} rel={"noopener noreferrer"} target={"_blank"} data-act={"whatsapp-support-fastest-1-876-555-roam-avg-repl"}>
                <div className={"flex items-center gap-space-md"}>
                  <div className={"w-10 h-10 rounded-full bg-white/20 flex items-center justify-center shrink-0"}>
                    <span className={"material-symbols-outlined text-[22px] text-white"}>
                      chat
                    </span>
                  </div>
                  <div className={"text-left min-w-0"}>
                    <div className={"flex items-center gap-2"}>
                      <span className={"font-label-lg text-label-lg font-bold"}>
                        WhatsApp Support
                      </span>
                      <span className={"px-1.5 py-0.5 rounded text-[10px] bg-white/25 font-bold tracking-wider uppercase"}>
                        Fastest
                      </span>
                    </div>
                    <p className={"font-body-sm text-body-sm text-white/90 truncate"}>
                      +1 (876) 555-ROAM • Avg reply 10 mins
                    </p>
                  </div>
                </div>
                <span className={"material-symbols-outlined text-white/80 group-hover:translate-x-1 transition-transform text-[22px]"}>
                  arrow_forward
                </span>
              </a>
              <a onClick={onPlugClick} className={"w-full min-h-[58px] p-space-md rounded-xl bg-surface-container-lowest text-on-surface flex items-center justify-between shadow-sm hover:bg-surface-container-low active:scale-[0.98] transition-all group"} href={"mailto:support@roamplug.jm"} data-act={"email-driver-desk-support-roamplug-jm-within-24-"}>
                <div className={"flex items-center gap-space-md"}>
                  <div className={"w-10 h-10 rounded-full bg-surface-container-high flex items-center justify-center shrink-0 text-primary"}>
                    <span className={"material-symbols-outlined text-[22px]"}>
                      mail
                    </span>
                  </div>
                  <div className={"text-left min-w-0"}>
                    <h3 className={"font-label-lg text-label-lg font-bold"}>
                      Email Driver Desk
                    </h3>
                    <p className={"font-body-sm text-body-sm text-on-surface-variant truncate"}>
                      support@roamplug.jm • Within 24 hrs
                    </p>
                  </div>
                </div>
                <span className={"material-symbols-outlined text-on-surface-variant group-hover:translate-x-1 transition-transform text-[22px]"}>
                  arrow_forward
                </span>
              </a>
            </div>
            <div className={"mt-space-lg text-center"}>
              <div className={"inline-flex items-center gap-1.5 text-on-surface-variant/80 font-label-sm text-label-sm"}>
                <span className={"material-symbols-outlined text-[16px] text-primary"}>
                  security
                </span>
                <span>
                  Registered with Jamaica Data Protection Act (JDPA)
                </span>
              </div>
              <p className={"font-body-sm text-body-sm text-on-surface-variant/60 mt-1"}>
                Roam Plug Jamaica • Version 2.4.1 (Build 88)
              </p>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
