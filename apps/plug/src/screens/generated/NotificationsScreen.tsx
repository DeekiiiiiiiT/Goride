import { useEffect, useRef } from 'react';
import { onPlugClick } from '../../shell/actions';
import { bindScreen } from '../../shell/bind';


export function NotificationsScreen() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (ref.current) bindScreen("50-notifications.html", ref.current); }, []);
  return (
    <div ref={ref} data-plug-screen={"50-notifications.html"} className={"bg-surface font-body-md text-on-surface flex flex-col min-h-screen"}>
      <header className={"fixed top-0 w-full z-50 bg-surface/80 backdrop-blur-xl pt-safe shadow-[0_1px_8px_rgba(0,0,0,0.04)]"}>
        <div className={"h-16 px-margin flex items-center justify-between"}>
          <div className={"flex items-center gap-space-sm"}>
            <button onClick={onPlugClick} aria-label={"Go back"} className={"w-12 h-12 -ml-2 rounded-full flex items-center justify-center text-on-surface hover:bg-surface-container-high transition-colors"} type={"button"} data-act={"arrow-back"} data-way-out={"back"}>
              <span className={"material-symbols-outlined text-[24px]"}>
                arrow_back
              </span>
            </button>
            <h1 className={"font-headline-sm text-headline-sm text-on-surface tracking-tight select-none"}>
              Notifications
            </h1>
          </div>
          <div className={"flex items-center gap-space-sm"}>
            <button onClick={onPlugClick} className={"min-h-[44px] px-space-sm py-space-xs rounded-lg text-primary hover:bg-primary-fixed/20 transition-colors font-label-md text-label-md flex items-center gap-1"} type={"button"} data-act={"mark-all-as-read"} data-way-out={"primary"}>
              <span>
                Mark all as read
              </span>
            </button>
            <div className={"w-8 h-8 rounded-full bg-primary flex items-center justify-center shrink-0"}>
              <span className={"material-symbols-outlined text-on-primary text-[18px]"}>
                person
              </span>
            </div>
          </div>
        </div>
      </header>
      <main className={"flex flex-col relative w-full px-margin pt-16 pb-safe bg-surface"}>
        <div className={"flex flex-col w-full pb-8"}>
          <div className={"flex items-center justify-between py-space-sm mb-space-md"}>
            <div className={"flex items-center gap-2"}>
              <span className={"inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary text-on-primary font-label-md text-label-md shadow-sm"}>
                <span className={"w-2 h-2 rounded-full bg-surface-container-lowest animate-pulse"} />
                3 new alerts
              </span>
              <span className={"text-on-surface-variant font-body-sm text-body-sm hidden xs:inline"}>
                Island co-pilot active
              </span>
            </div>
            <button onClick={onPlugClick} className={"flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-primary hover:bg-primary-fixed/30 active:scale-95 transition-all font-label-md text-label-md"} id={"markAllReadBtn"} type={"button"} data-act={"markAllReadBtn"} data-way-out={"primary"}>
              <span className={"material-symbols-outlined text-[18px]"}>
                done_all
              </span>
              <span>
                Clear all
              </span>
            </button>
          </div>
          <div className={"flex items-center gap-2 overflow-x-auto no-scrollbar -mx-margin px-margin pb-2 mb-space-md"}>
            <button onClick={onPlugClick} className={"filter-chip active-filter shrink-0 h-9 px-4 rounded-full bg-on-surface text-surface-container-lowest font-label-md text-label-md shadow-sm transition-all flex items-center gap-1.5"} type={"button"} data-act={"all-5"}>
              <span>
                All
              </span>
              <span className={"px-1.5 py-0.2 rounded-full bg-white/20 text-white font-label-sm text-label-sm"}>
                5
              </span>
            </button>
            <button onClick={onPlugClick} className={"filter-chip shrink-0 h-9 px-4 rounded-full bg-surface-container-high text-on-surface hover:bg-surface-variant active:scale-95 transition-all font-label-md text-label-md flex items-center gap-1.5"} type={"button"} data-act={"reminders-2"}>
              <span>
                Reminders
              </span>
              <span className={"px-1.5 py-0.2 rounded-full bg-secondary-fixed text-on-secondary-fixed font-label-sm text-label-sm"}>
                2
              </span>
            </button>
            <button onClick={onPlugClick} className={"filter-chip shrink-0 h-9 px-4 rounded-full bg-surface-container-high text-on-surface hover:bg-surface-variant active:scale-95 transition-all font-label-md text-label-md flex items-center gap-1.5"} type={"button"} data-act={"scout-updates-1"}>
              <span>
                Scout Updates
              </span>
              <span className={"px-1.5 py-0.2 rounded-full bg-surface-container-highest text-on-surface-variant font-label-sm text-label-sm"}>
                1
              </span>
            </button>
            <button onClick={onPlugClick} className={"filter-chip shrink-0 h-9 px-4 rounded-full bg-surface-container-high text-on-surface hover:bg-surface-variant active:scale-95 transition-all font-label-md text-label-md flex items-center gap-1.5"} type={"button"} data-act={"fuel-radar-2"}>
              <span>
                Fuel Radar
              </span>
              <span className={"px-1.5 py-0.2 rounded-full bg-secondary-fixed text-on-secondary-fixed font-label-sm text-label-sm"}>
                2
              </span>
            </button>
          </div>
          <div className={"flex flex-col gap-space-lg"}>
            <div className={"flex flex-col gap-space-sm"}>
              <div className={"flex items-center justify-between px-1"}>
                <h2 className={"font-label-md text-label-md tracking-wider uppercase text-on-surface-variant"}>
                  Today
                </h2>
                <span className={"font-label-sm text-label-sm text-outline"}>
                  Nov 14, 2024
                </span>
              </div>
              <div className={"unread-card relative flex flex-col p-4 rounded-xl bg-surface-container-lowest shadow-sm hover:shadow-md transition-shadow"}>
                <div className={"flex items-start justify-between gap-3"}>
                  <div className={"flex gap-3 min-w-0"}>
                    <div className={"w-10 h-10 rounded-xl bg-secondary-fixed flex items-center justify-center shrink-0 text-on-secondary-fixed"}>
                      <span className={"material-symbols-outlined text-[22px]"}>
                        oil_barrel
                      </span>
                    </div>
                    <div className={"flex flex-col min-w-0"}>
                      <div className={"flex items-center gap-2"}>
                        <span className={"font-headline-sm text-headline-sm text-on-surface truncate"}>
                          Oil change due in 200 km
                        </span>
                      </div>
                      <div className={"flex items-center gap-1.5 mt-0.5"}>
                        <span className={"inline-flex items-center px-2 py-0.5 rounded-full bg-surface-container font-label-sm text-label-sm text-on-surface-variant font-semibold"}>
                          2019 Toyota Roomy
                        </span>
                        <span className={"font-body-sm text-body-sm text-outline"}>
                          84,210 km
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className={"flex items-center gap-2 shrink-0"}>
                    <span className={"font-body-sm text-body-sm text-outline"}>
                      2h ago
                    </span>
                    <span className={"unread-dot w-2.5 h-2.5 rounded-full bg-primary-container"} />
                  </div>
                </div>
                <p className={"mt-3 font-body-md text-body-md text-on-surface-variant leading-relaxed"}>
                  Your synthetic blend interval reaches its threshold at 84,400 km. Service early to protect against North-South Highway thermal wear.
                </p>
                <div className={"mt-3 p-2.5 rounded-lg bg-surface-container-low flex flex-col gap-1.5"}>
                  <div className={"flex justify-between items-center font-label-sm text-label-sm"}>
                    <span className={"text-on-surface-variant font-medium"}>
                      Interval health
                    </span>
                    <span className={"text-primary font-bold"}>
                      96% utilized
                    </span>
                  </div>
                  <div className={"w-full h-1.5 rounded-full bg-surface-variant overflow-hidden"}>
                    <div className={"h-full bg-primary-container rounded-full"} style={{ width: "96%" }} />
                  </div>
                </div>
                <div className={"flex items-center gap-2 mt-4 pt-1"}>
                  <button onClick={onPlugClick} className={"min-h-[44px] px-4 py-2 rounded-lg bg-primary hover:bg-primary-container text-on-primary font-label-md text-label-md shadow-sm active:scale-95 transition-all flex items-center gap-1.5 justify-center flex-1 sm:flex-initial"} type={"button"} data-act={"log-service"} data-way-out={"primary"}>
                    <span className={"material-symbols-outlined text-[18px]"}>
                      build_circle
                    </span>
                    <span>
                      Log Service
                    </span>
                  </button>
                  <button onClick={onPlugClick} className={"min-h-[44px] px-4 py-2 rounded-lg bg-surface-container-high hover:bg-surface-variant text-on-surface font-label-md text-label-md active:scale-95 transition-all"} type={"button"} data-act={"snooze-100-km"}>
                    Snooze (100 km)
                  </button>
                </div>
              </div>
              <div className={"unread-card relative flex flex-col p-4 rounded-xl bg-surface-container-lowest shadow-sm hover:shadow-md transition-shadow"}>
                <div className={"flex items-start justify-between gap-3"}>
                  <div className={"flex gap-3 min-w-0"}>
                    <div className={"w-10 h-10 rounded-xl bg-tertiary-fixed flex items-center justify-center shrink-0 text-on-tertiary-fixed"}>
                      <span className={"material-symbols-outlined text-[22px]"} style={{ fontVariationSettings: "'FILL' 1" }}>
                        verified
                      </span>
                    </div>
                    <div className={"flex flex-col min-w-0"}>
                      <h3 className={"font-headline-sm text-headline-sm text-on-surface truncate"}>
                        Your pin 'Precision Auto Works' was approved
                      </h3>
                      <p className={"font-body-sm text-body-sm text-on-surface-variant flex items-center gap-1 mt-0.5"}>
                        <span className={"material-symbols-outlined text-[14px] text-tertiary"}>
                          location_on
                        </span>
                        Constant Spring Rd, St. Andrew
                      </p>
                    </div>
                  </div>
                  <div className={"flex items-center gap-2 shrink-0"}>
                    <span className={"font-body-sm text-body-sm text-outline"}>
                      5h ago
                    </span>
                    <span className={"unread-dot w-2.5 h-2.5 rounded-full bg-primary-container"} />
                  </div>
                </div>
                <div className={"mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface-container-low"}>
                  <span className={"flex items-center gap-1 font-label-md text-label-md text-tertiary font-bold"}>
                    <span className={"material-symbols-outlined text-[16px]"}>
                      stars
                    </span>
                    +25 Scout XP
                  </span>
                  <span className={"w-1 h-1 rounded-full bg-outline-variant"} />
                  <span className={"font-label-sm text-label-sm text-on-surface-variant"}>
                    Live on Jamaica Route Map
                  </span>
                </div>
                <p className={"mt-2.5 font-body-md text-body-md text-on-surface-variant"}>
                  A Kingston Road Scout verified your coordinates.
                  <strong className={"text-on-surface"}>
                    18 motorists
                  </strong>
                  {"navigated to this tire & brake depot today!"}
                </p>
                <div className={"mt-3 rounded-lg overflow-hidden relative h-28 bg-surface-variant flex items-end p-2.5"}>
                  <img className={"absolute inset-0 w-full h-full object-cover"} data-alt={"Overhead aerial map shot of Constant Spring Road in Kingston Jamaica with warm tropical lighting, asphalt road intersections, automotive workshops, and Jamaican palm trees bathed in golden afternoon sunlight."} src={"https://lh3.googleusercontent.com/aida-public/AB6AXuCtOPNW2qS9AreOY1VZqWhNsDGvs1uJvTt6ecVtf8nk6utuqSc1JvWleFakHGdM0nrQYcRjDY5pXex-eI1jSs4wZYdJTI0xxWcD4SQq2PF6wsLNr_548lge6z_dDbI1fc2U--jHfYL3ZRQ__wsoWnbqucB4CnhtQe0v3uMERqUgtA3aUEPHu_TLal4L4bD90nrVVXd4g5K2GZOEQv2KKROGzBrnXJpE1au4cFTrP24PIcGc-7Ke6HrN"} />
                  <div className={"absolute inset-0 bg-gradient-to-t from-inverse-surface/80 via-inverse-surface/30 to-transparent"} />
                  <div className={"relative z-10 flex items-center justify-between w-full text-surface-container-lowest"}>
                    <div className={"flex items-center gap-1.5"}>
                      <span className={"material-symbols-outlined text-[18px] text-secondary-fixed"}>
                        pin_drop
                      </span>
                      <span className={"font-label-md text-label-md drop-shadow"}>
                        Constant Spring Hub
                      </span>
                    </div>
                    <span className={"font-label-sm text-label-sm bg-surface-container-lowest/30 backdrop-blur-md px-2 py-0.5 rounded text-white"}>
                      4.8 ★ (12 Reviews)
                    </span>
                  </div>
                </div>
                <div className={"flex items-center gap-2 mt-4"}>
                  <button onClick={onPlugClick} className={"min-h-[44px] px-4 py-2 rounded-lg bg-surface-container-high hover:bg-surface-variant text-on-surface font-label-md text-label-md active:scale-95 transition-all flex items-center gap-1.5 flex-1 sm:flex-initial justify-center"} type={"button"} data-act={"view-on-map"}>
                    <span className={"material-symbols-outlined text-[18px]"}>
                      map
                    </span>
                    <span>
                      View on Map
                    </span>
                  </button>
                  <button onClick={onPlugClick} className={"min-h-[44px] px-4 py-2 rounded-lg text-primary hover:bg-primary-fixed/20 font-label-md text-label-md active:scale-95 transition-all"} type={"button"} data-act={"scout-profile"} data-way-out={"primary"}>
                    Scout Profile
                  </button>
                </div>
              </div>
            </div>
            <div className={"flex flex-col gap-space-sm"}>
              <div className={"flex items-center justify-between px-1"}>
                <h2 className={"font-label-md text-label-md tracking-wider uppercase text-on-surface-variant"}>
                  This Week
                </h2>
                <span className={"font-label-sm text-label-sm text-outline"}>
                  2 Updates
                </span>
              </div>
              <div className={"unread-card relative flex flex-col p-4 rounded-xl bg-surface-container-lowest shadow-sm hover:shadow-md transition-shadow"}>
                <div className={"flex items-start justify-between gap-3"}>
                  <div className={"flex gap-3 min-w-0"}>
                    <div className={"w-10 h-10 rounded-xl bg-secondary-fixed flex items-center justify-center shrink-0 text-on-secondary-fixed"}>
                      <span className={"material-symbols-outlined text-[22px]"}>
                        assignment_late
                      </span>
                    </div>
                    <div className={"flex flex-col min-w-0"}>
                      <h3 className={"font-headline-sm text-headline-sm text-on-surface truncate"}>
                        Fitness certificate expires in 14 days
                      </h3>
                      <p className={"font-body-sm text-body-sm text-on-surface-variant flex items-center gap-2 mt-0.5"}>
                        <span>
                          2019 Toyota Roomy
                        </span>
                        <span className={"w-1 h-1 rounded-full bg-outline-variant"} />
                        <span className={"font-semibold text-on-surface"}>
                          Plate: 4821-JR
                        </span>
                      </p>
                    </div>
                  </div>
                  <div className={"flex items-center gap-2 shrink-0"}>
                    <span className={"font-body-sm text-body-sm text-outline"}>
                      Yesterday
                    </span>
                    <span className={"unread-dot w-2.5 h-2.5 rounded-full bg-primary-container"} />
                  </div>
                </div>
                <div className={"mt-3 flex items-center justify-between px-3 py-2 rounded-lg bg-surface-container-low"}>
                  <div className={"flex items-center gap-2"}>
                    <span className={"material-symbols-outlined text-secondary text-[20px]"}>
                      calendar_clock
                    </span>
                    <span className={"font-label-md text-label-md text-on-surface"}>
                      Valid until:
                      <strong>
                        28 Nov 2024
                      </strong>
                    </span>
                  </div>
                  <span className={"font-label-sm text-label-sm px-2 py-0.5 rounded bg-secondary-fixed text-on-secondary-fixed font-bold"}>
                    14d left
                  </span>
                </div>
                <p className={"mt-2.5 font-body-md text-body-md text-on-surface-variant leading-relaxed"}>
                  Avoid Island Traffic Authority spot checks and penalty tickets. Test bays currently reporting under 20-min wait times around Half-Way-Tree.
                </p>
                <div className={"flex items-center gap-2 mt-4 pt-1"}>
                  <button onClick={onPlugClick} className={"min-h-[44px] px-4 py-2 rounded-lg bg-primary hover:bg-primary-container text-on-primary font-label-md text-label-md shadow-sm active:scale-95 transition-all flex items-center gap-1.5 flex-1 sm:flex-initial justify-center"} type={"button"} data-act={"book-inspection-depot"} data-way-out={"primary"}>
                    <span className={"material-symbols-outlined text-[18px]"}>
                      event_available
                    </span>
                    <span>
                      Book Inspection Depot
                    </span>
                  </button>
                  <button onClick={onPlugClick} className={"min-h-[44px] px-4 py-2 rounded-lg bg-surface-container-high hover:bg-surface-variant text-on-surface font-label-md text-label-md active:scale-95 transition-all"} type={"button"} data-act={"update-date"}>
                    Update Date
                  </button>
                </div>
              </div>
              <div className={"flex flex-col p-4 rounded-xl bg-surface-container-lowest shadow-sm hover:shadow-md transition-shadow"}>
                <div className={"flex items-start justify-between gap-3"}>
                  <div className={"flex gap-3 min-w-0"}>
                    <div className={"w-10 h-10 rounded-xl bg-primary-fixed flex items-center justify-center shrink-0 text-primary"}>
                      <span className={"material-symbols-outlined text-[22px]"}>
                        local_gas_station
                      </span>
                    </div>
                    <div className={"flex flex-col min-w-0"}>
                      <div className={"flex items-center gap-2"}>
                        <h3 className={"font-headline-sm text-headline-sm text-on-surface truncate"}>
                          E-10 87 dropped J$3.20 this week
                        </h3>
                      </div>
                      <p className={"font-body-sm text-body-sm text-on-surface-variant mt-0.5"}>
                        {"Kgn & St. Andrew Avg:"}
                        <strong className={"text-on-surface font-semibold"}>
                          J$208.40 / L
                        </strong>
                      </p>
                    </div>
                  </div>
                  <span className={"font-body-sm text-body-sm text-outline shrink-0"}>
                    Wed
                  </span>
                </div>
                <div className={"mt-3 grid grid-cols-2 gap-2"}>
                  <div className={"p-2.5 rounded-lg bg-surface-container-low flex flex-col"}>
                    <span className={"font-label-sm text-label-sm text-on-surface-variant"}>
                      Rubis Waterloo Rd
                    </span>
                    <div className={"flex items-baseline gap-1 mt-0.5"}>
                      <span className={"font-price-display text-price-display text-primary"}>
                        J$204.85
                      </span>
                      <span className={"font-label-sm text-label-sm text-tertiary"}>
                        Lowest
                      </span>
                    </div>
                  </div>
                  <div className={"p-2.5 rounded-lg bg-surface-container-low flex flex-col"}>
                    <span className={"font-label-sm text-label-sm text-on-surface-variant"}>
                      TotalEnergies HWT
                    </span>
                    <div className={"flex items-baseline gap-1 mt-0.5"}>
                      <span className={"font-price-display text-price-display text-on-surface"}>
                        J$205.10
                      </span>
                      <span className={"font-label-sm text-label-sm text-outline"}>
                        Verified 4h
                      </span>
                    </div>
                  </div>
                </div>
                <p className={"mt-3 font-body-md text-body-md text-on-surface-variant"}>
                  Petrojam ex-refinery price reduction has passed through to pumps along major commuter corridors.
                </p>
                <div className={"mt-4"}>
                  <button onClick={onPlugClick} className={"min-h-[44px] w-full px-4 py-2 rounded-lg bg-surface-container-high hover:bg-surface-variant text-primary font-label-md text-label-md active:scale-95 transition-all flex items-center justify-center gap-1.5"} type={"button"} data-act={"view-best-pump-rates-islandwide"}>
                    <span className={"material-symbols-outlined text-[18px]"}>
                      trending_down
                    </span>
                    <span>
                      View Best Pump Rates (Islandwide)
                    </span>
                  </button>
                </div>
              </div>
            </div>
            <div className={"flex flex-col gap-space-sm"}>
              <div className={"flex items-center justify-between px-1"}>
                <h2 className={"font-label-md text-label-md tracking-wider uppercase text-on-surface-variant"}>
                  Earlier
                </h2>
                <span className={"font-label-sm text-label-sm text-outline"}>
                  Read
                </span>
              </div>
              <div className={"flex flex-col p-4 rounded-xl bg-surface-container-low opacity-90 hover:opacity-100 transition-opacity"}>
                <div className={"flex items-start justify-between gap-3"}>
                  <div className={"flex gap-3 min-w-0"}>
                    <div className={"w-10 h-10 rounded-xl bg-surface-container-highest flex items-center justify-center shrink-0 text-on-surface-variant"}>
                      <span className={"material-symbols-outlined text-[22px]"}>
                        toll
                      </span>
                    </div>
                    <div className={"flex flex-col min-w-0"}>
                      <h3 className={"font-headline-sm text-headline-sm text-on-surface truncate"}>
                        Highway 2000 May Pen interchange update
                      </h3>
                      <span className={"font-body-sm text-body-sm text-outline mt-0.5"}>
                        Clarendon Expressway Section
                      </span>
                    </div>
                  </div>
                  <span className={"font-body-sm text-body-sm text-outline shrink-0"}>
                    Oct 29
                  </span>
                </div>
                <p className={"mt-2.5 font-body-md text-body-md text-on-surface-variant leading-relaxed"}>
                  Cashless T-Tag express lanes have expanded for speedier commuter clearance during Friday evening rush toward Manchester.
                </p>
                <div className={"mt-3 flex items-center gap-2"}>
                  <button onClick={onPlugClick} className={"px-3 py-1.5 rounded-lg text-primary hover:bg-surface-variant font-label-md text-label-md transition-colors flex items-center gap-1"} type={"button"} data-act={"review-toll-rates"}>
                    <span className={"material-symbols-outlined text-[16px]"}>
                      info
                    </span>
                    <span>
                      Review Toll Rates
                    </span>
                  </button>
                </div>
              </div>
            </div>
            <div className={"mt-space-md p-4 rounded-2xl bg-surface-container flex items-center justify-between gap-3"}>
              <div className={"flex items-center gap-3"}>
                <div className={"w-10 h-10 rounded-xl bg-surface-container-lowest flex items-center justify-center text-on-surface shrink-0 shadow-sm"}>
                  <span className={"material-symbols-outlined text-[20px]"}>
                    tune
                  </span>
                </div>
                <div className={"flex flex-col"}>
                  <span className={"font-headline-sm text-headline-sm text-on-surface"}>
                    Alert Preferences
                  </span>
                  <span className={"font-body-sm text-body-sm text-on-surface-variant"}>
                    {"Manage SMS alerts, Fitness reminders & Gas Radar"}
                  </span>
                </div>
              </div>
              <button onClick={onPlugClick} aria-label={"Open alert preferences"} className={"w-10 h-10 rounded-full bg-surface-container-lowest flex items-center justify-center text-on-surface hover:bg-primary hover:text-on-primary transition-colors shrink-0 shadow-sm active:scale-90"} type={"button"} data-act={"chevron-right"} data-way-out={"primary"}>
                <span className={"material-symbols-outlined text-[20px]"}>
                  chevron_right
                </span>
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
