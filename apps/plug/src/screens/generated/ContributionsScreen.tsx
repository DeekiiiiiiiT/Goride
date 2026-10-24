import { useEffect, useRef } from 'react';
import { onPlugClick } from '../../shell/actions';
import { bindScreen } from '../../shell/bind';


export function ContributionsScreen() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (ref.current) bindScreen("46-contributions.html", ref.current); }, []);
  return (
    <div ref={ref} data-plug-screen={"46-contributions.html"} className={"bg-surface font-body-md text-on-surface flex flex-col min-h-screen"}>
      <header className={"fixed top-0 w-full z-50 pt-safe bg-surface/80 backdrop-blur-xl shadow-[0_1px_8px_rgba(0,0,0,0.04)]"}>
        <div className={"h-16 px-gutter flex items-center justify-between"}>
          <div className={"flex items-center gap-space-sm"}>
            <button onClick={onPlugClick} aria-label={"Go back"} className={"w-12 h-12 flex items-center justify-center rounded-full text-on-surface hover:bg-surface-container active:bg-surface-container-high transition-colors"} type={"button"} data-act={"arrow-back"} data-way-out={"back"}>
              <span className={"material-symbols-outlined text-[24px]"}>
                arrow_back
              </span>
            </button>
            <h1 className={"font-headline-sm text-headline-sm text-on-surface tracking-tight truncate"}>
              My Contributions
            </h1>
          </div>
          <div className={"flex items-center gap-space-xs"}>
            <button onClick={onPlugClick} aria-label={"Contribution guidelines"} className={"w-12 h-12 flex items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container active:bg-surface-container-high transition-colors"} type={"button"} data-act={"help-outline"}>
              <span className={"material-symbols-outlined text-[22px]"}>
                help_outline
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
      <main className={"flex flex-col relative w-full pt-16 bg-surface min-h-screen pb-safe"}>
        <div className={"flex flex-col w-full"}>
          <div className={"fixed top-20 left-1/2 -translate-x-1/2 z-50 transition-all duration-300 opacity-0 pointer-events-none transform -translate-y-2 flex items-center gap-space-sm bg-inverse-surface text-inverse-on-surface px-space-md py-space-sm rounded-full shadow-lg"} id={"roam-toast"}>
            <span className={"material-symbols-outlined text-tertiary-fixed-dim text-[18px]"} style={{ fontVariationSettings: "'FILL' 1" }}>
              stars
            </span>
            <span className={"font-label-md text-label-md"} id={"toast-text"}>
              Scout XP synced
            </span>
          </div>
          <div className={"px-gutter flex flex-col gap-space-lg pt-space-sm pb-space-xl"}>
            <section className={"relative overflow-hidden rounded-xl bg-gradient-to-br from-primary via-primary-container to-secondary text-on-primary p-space-md shadow-md"}>
              <div className={"absolute -right-8 -bottom-10 w-44 h-44 rounded-full bg-white/10 blur-2xl pointer-events-none"} />
              <div className={"absolute right-3 top-3 opacity-15 pointer-events-none"}>
                <svg className={"w-24 h-24 text-on-primary"} fill={"currentColor"} viewBox={"0 0 100 100"}>
                  <circle cx={"50"} cy={"50"} fill={"none"} r={"46"} stroke={"currentColor"} strokeDasharray={"4 4"} strokeWidth={"2"} />
                  <polygon opacity={"0.8"} points={"50,12 56,44 88,50 56,56 50,88 44,56 12,50 44,44"} />
                </svg>
              </div>
              <div className={"relative z-10 flex flex-col gap-space-md"}>
                <div className={"flex items-center justify-between"}>
                  <div className={"flex items-center gap-space-sm"}>
                    <div className={"w-12 h-12 rounded-xl bg-white/20 backdrop-blur-md flex items-center justify-center shadow-inner"}>
                      <span className={"material-symbols-outlined text-white text-[28px]"} style={{ fontVariationSettings: "'FILL' 1" }}>
                        military_tech
                      </span>
                    </div>
                    <div className={"flex flex-col"}>
                      <span className={"font-label-sm text-label-sm uppercase tracking-wider text-primary-fixed"}>
                        Scout Tier • Verified
                      </span>
                      <h2 className={"font-headline-sm text-headline-sm text-white leading-tight"}>
                        Road Scout — Level 3
                      </h2>
                    </div>
                  </div>
                  <span className={"font-label-md text-label-md bg-white/15 px-space-sm py-1 rounded-full text-white backdrop-blur-sm"}>
                    Island Rank #18
                  </span>
                </div>
                <div className={"flex flex-col gap-space-xs bg-black/15 p-space-sm rounded-lg backdrop-blur-sm"}>
                  <div className={"flex items-center justify-between font-label-md text-label-md text-primary-fixed"}>
                    <span>
                      340 / 500 Scout XP
                    </span>
                    <span className={"text-white font-semibold"}>
                      160 XP to Level 4
                    </span>
                  </div>
                  <div className={"w-full h-2.5 rounded-full bg-white/25 overflow-hidden p-0.5"}>
                    <div className={"h-full rounded-full bg-gradient-to-r from-tertiary-fixed-dim to-white transition-all duration-700"} style={{ width: "68%" }} />
                  </div>
                  <div className={"flex items-center justify-between font-body-sm text-body-sm text-white/80 pt-0.5"}>
                    <span className={"flex items-center gap-1"}>
                      <span className={"material-symbols-outlined text-[14px]"}>
                        turn_sharp_right
                      </span>
                      Next Rank:
                      <strong className={"text-white font-medium ml-0.5"}>
                        Highway Pathfinder
                      </strong>
                    </span>
                    <span className={"font-label-sm text-label-sm text-tertiary-fixed"}>
                      +50 XP Per Verified Pin
                    </span>
                  </div>
                </div>
                <div className={"grid grid-cols-4 gap-space-xs pt-space-xs text-center"}>
                  <div className={"flex flex-col items-center bg-white/10 rounded-lg py-space-sm px-1 backdrop-blur-xs"}>
                    <span className={"font-headline-sm text-headline-sm text-white"}>
                      14
                    </span>
                    <span className={"font-label-sm text-label-sm text-primary-fixed truncate w-full mt-0.5"}>
                      Places
                    </span>
                  </div>
                  <div className={"flex flex-col items-center bg-white/10 rounded-lg py-space-sm px-1 backdrop-blur-xs"}>
                    <span className={"font-headline-sm text-headline-sm text-white"}>
                      11
                    </span>
                    <span className={"font-label-sm text-label-sm text-primary-fixed truncate w-full mt-0.5"}>
                      Approved
                    </span>
                  </div>
                  <div className={"flex flex-col items-center bg-white/10 rounded-lg py-space-sm px-1 backdrop-blur-xs"}>
                    <span className={"font-headline-sm text-headline-sm text-white"}>
                      42
                    </span>
                    <span className={"font-label-sm text-label-sm text-primary-fixed truncate w-full mt-0.5"}>
                      Prices Logged
                    </span>
                  </div>
                  <div className={"flex flex-col items-center bg-white/10 rounded-lg py-space-sm px-1 backdrop-blur-xs"}>
                    <span className={"font-headline-sm text-headline-sm text-tertiary-fixed font-bold"}>
                      Top 5%
                    </span>
                    <span className={"font-label-sm text-label-sm text-primary-fixed truncate w-full mt-0.5"}>
                      Parish Impact
                    </span>
                  </div>
                </div>
              </div>
            </section>
            <section className={"flex flex-col gap-space-sm"}>
              <div className={"flex items-center justify-between"}>
                <div className={"flex items-center gap-space-xs"}>
                  <span className={"material-symbols-outlined text-primary text-[20px]"} style={{ fontVariationSettings: "'FILL' 1" }}>
                    workspace_premium
                  </span>
                  <h3 className={"font-headline-sm text-headline-sm text-on-surface"}>
                    Scout Milestones
                  </h3>
                </div>
                <span className={"font-label-md text-label-md text-primary font-semibold"}>
                  4 Unlocked
                </span>
              </div>
              <div className={"flex gap-space-sm overflow-x-auto pb-space-xs -mx-gutter px-gutter scroll-smooth no-scrollbar"} style={{ scrollbarWidth: "none" }}>
                <div className={"flex-shrink-0 w-52 p-space-md rounded-xl bg-surface-container-lowest shadow-sm flex flex-col justify-between gap-space-sm"}>
                  <div className={"flex items-start justify-between"}>
                    <div className={"w-10 h-10 rounded-xl bg-tertiary-fixed flex items-center justify-center text-on-tertiary-fixed shadow-sm"}>
                      <span className={"material-symbols-outlined text-[24px]"} style={{ fontVariationSettings: "'FILL' 1" }}>
                        explore
                      </span>
                    </div>
                    <span className={"font-label-sm text-label-sm bg-surface-container px-2 py-0.5 rounded-full text-on-surface-variant font-bold"}>
                      PIONEER
                    </span>
                  </div>
                  <div>
                    <h4 className={"font-label-lg text-label-lg text-on-surface truncate"}>
                      First in St Elizabeth
                    </h4>
                    <p className={"font-body-sm text-body-sm text-on-surface-variant mt-0.5 line-clamp-2"}>
                      Pioneered pins across the Junction corridor.
                    </p>
                  </div>
                  <div className={"flex items-center gap-1 font-label-sm text-label-sm text-tertiary"}>
                    <span className={"material-symbols-outlined text-[14px]"}>
                      verified
                    </span>
                    Parish Pioneer #1
                  </div>
                </div>
                <div className={"flex-shrink-0 w-52 p-space-md rounded-xl bg-surface-container-lowest shadow-sm flex flex-col justify-between gap-space-sm"}>
                  <div className={"flex items-start justify-between"}>
                    <div className={"w-10 h-10 rounded-xl bg-primary-fixed flex items-center justify-center text-on-primary-fixed shadow-sm"}>
                      <span className={"material-symbols-outlined text-[24px]"} style={{ fontVariationSettings: "'FILL' 1" }}>
                        local_gas_station
                      </span>
                    </div>
                    <span className={"font-label-sm text-label-sm bg-primary-fixed/60 px-2 py-0.5 rounded-full text-on-primary-fixed font-bold"}>
                      10+ STOPS
                    </span>
                  </div>
                  <div>
                    <h4 className={"font-label-lg text-label-lg text-on-surface truncate"}>
                      10 Stations Mapped
                    </h4>
                    <p className={"font-body-sm text-body-sm text-on-surface-variant mt-0.5 line-clamp-2"}>
                      Mapped 10+ island fuel stops accurately.
                    </p>
                  </div>
                  <div className={"flex items-center gap-1 font-label-sm text-label-sm text-primary"}>
                    <span className={"material-symbols-outlined text-[14px]"}>
                      local_fire_department
                    </span>
                    Fuel Network Builder
                  </div>
                </div>
                <div className={"flex-shrink-0 w-52 p-space-md rounded-xl bg-surface-container-lowest shadow-sm flex flex-col justify-between gap-space-sm"}>
                  <div className={"flex items-start justify-between"}>
                    <div className={"w-10 h-10 rounded-xl bg-surface-container-high flex items-center justify-center text-secondary shadow-sm"}>
                      <span className={"material-symbols-outlined text-[24px]"} style={{ fontVariationSettings: "'FILL' 1" }}>
                        bolt
                      </span>
                    </div>
                    <span className={"font-label-sm text-label-sm bg-surface-container px-2 py-0.5 rounded-full text-secondary font-bold"}>
                      40+ RATES
                    </span>
                  </div>
                  <div>
                    <h4 className={"font-label-lg text-label-lg text-on-surface truncate"}>
                      Price Hero
                    </h4>
                    <p className={"font-body-sm text-body-sm text-on-surface-variant mt-0.5 line-clamp-2"}>
                      Logged 40+ verified Jamaican pump rates.
                    </p>
                  </div>
                  <div className={"flex items-center gap-1 font-label-sm text-label-sm text-secondary"}>
                    <span className={"material-symbols-outlined text-[14px]"}>
                      trending_down
                    </span>
                    Drivers Saved ~$14k JMD
                  </div>
                </div>
                <div className={"flex-shrink-0 w-52 p-space-md rounded-xl bg-surface-container-lowest shadow-sm flex flex-col justify-between gap-space-sm"}>
                  <div className={"flex items-start justify-between"}>
                    <div className={"w-10 h-10 rounded-xl bg-surface-container-highest flex items-center justify-center text-on-surface shadow-sm"}>
                      <span className={"material-symbols-outlined text-[24px]"} style={{ fontVariationSettings: "'FILL' 1" }}>
                        security
                      </span>
                    </div>
                    <span className={"font-label-sm text-label-sm bg-surface-container px-2 py-0.5 rounded-full text-on-surface-variant font-bold"}>
                      GUARDIAN
                    </span>
                  </div>
                  <div>
                    <h4 className={"font-label-lg text-label-lg text-on-surface truncate"}>
                      Road Guardian
                    </h4>
                    <p className={"font-body-sm text-body-sm text-on-surface-variant mt-0.5 line-clamp-2"}>
                      {"Verified 5 critical hazard & amenity spots."}
                    </p>
                  </div>
                  <div className={"flex items-center gap-1 font-label-sm text-label-sm text-on-surface-variant"}>
                    <span className={"material-symbols-outlined text-[14px]"}>
                      shield
                    </span>
                    Island Route Safe
                  </div>
                </div>
              </div>
            </section>
            <section className={"flex flex-col gap-space-sm"}>
              <div className={"flex items-center justify-between"}>
                <h3 className={"font-headline-sm text-headline-sm text-on-surface"}>
                  Submission History
                </h3>
                <span className={"font-body-sm text-body-sm text-on-surface-variant"}>
                  Parish of St. Andrew Focus
                </span>
              </div>
              <div className={"flex gap-space-xs overflow-x-auto pb-1 no-scrollbar -mx-gutter px-gutter"} id={"status-tabs"} role={"tablist"}>
                <button onClick={onPlugClick} className={"tab-btn px-space-md py-space-sm rounded-full font-label-md text-label-md bg-inverse-surface text-inverse-on-surface transition-all flex items-center gap-1.5 shadow-sm active:scale-95"} type={"button"} data-act={"all-16"}>
                  <span>
                    All
                  </span>
                  <span className={"px-1.5 py-0.2 bg-white/20 rounded-full font-label-sm text-label-sm"}>
                    16
                  </span>
                </button>
                <button onClick={onPlugClick} className={"tab-btn px-space-md py-space-sm rounded-full font-label-md text-label-md bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container transition-all flex items-center gap-1.5 shadow-sm active:scale-95"} type={"button"} data-act={"awaiting-approval-3"}>
                  <span>
                    Awaiting approval
                  </span>
                  <span className={"px-1.5 py-0.2 bg-surface-container-high rounded-full font-label-sm text-label-sm"}>
                    3
                  </span>
                </button>
                <button onClick={onPlugClick} className={"tab-btn px-space-md py-space-sm rounded-full font-label-md text-label-md bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container transition-all flex items-center gap-1.5 shadow-sm active:scale-95"} type={"button"} data-act={"approved-11"}>
                  <span>
                    Approved
                  </span>
                  <span className={"px-1.5 py-0.2 bg-surface-container-high rounded-full font-label-sm text-label-sm"}>
                    11
                  </span>
                </button>
                <button onClick={onPlugClick} className={"tab-btn px-space-md py-space-sm rounded-full font-label-md text-label-md bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container transition-all flex items-center gap-1.5 shadow-sm active:scale-95"} type={"button"} data-act={"not-approved-2"}>
                  <span>
                    Not approved
                  </span>
                  <span className={"px-1.5 py-0.2 bg-surface-container-high rounded-full font-label-sm text-label-sm"}>
                    2
                  </span>
                </button>
              </div>
              <div className={"flex flex-col gap-space-sm mt-space-xs"} id={"contributions-list"}>
                <article className={"contribution-item p-space-md rounded-xl bg-surface-container-lowest shadow-sm flex flex-col gap-space-sm transition-transform active:scale-[0.99]"} data-status={"awaiting"}>
                  <div className={"flex items-start justify-between gap-space-sm"}>
                    <div className={"flex items-start gap-space-sm min-w-0"}>
                      <div className={"w-12 h-12 rounded-xl bg-surface-container flex-shrink-0 flex items-center justify-center text-primary shadow-xs"}>
                        <span className={"material-symbols-outlined text-[26px]"}>
                          local_gas_station
                        </span>
                      </div>
                      <div className={"flex flex-col min-w-0"}>
                        <h4 className={"font-headline-sm text-headline-sm text-on-surface truncate"}>
                          TotalEnergies Half-Way-Tree
                        </h4>
                        <p className={"font-body-sm text-body-sm text-on-surface-variant truncate"}>
                          Constant Spring Rd, St. Andrew • Submitted Today, 2:15 PM
                        </p>
                      </div>
                    </div>
                    <span className={"flex-shrink-0 px-2.5 py-1 rounded-full bg-secondary-fixed text-on-secondary-fixed font-label-sm text-label-sm font-bold"}>
                      +25 XP Pending
                    </span>
                  </div>
                  <div className={"flex flex-wrap items-center justify-between gap-space-sm pt-space-xs"}>
                    <div className={"flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface-container text-on-surface-variant font-label-md text-label-md"}>
                      <span className={"material-symbols-outlined text-[16px] text-tertiary animate-spin"} style={{ animationDuration: "4s" }}>
                        schedule
                      </span>
                      <span>
                        In moderation queue • ~2h est.
                      </span>
                    </div>
                    <div className={"flex items-center gap-space-xs text-on-surface-variant font-label-sm text-label-sm"}>
                      <span className={"material-symbols-outlined text-[16px]"}>
                        photo_camera
                      </span>
                      <span>
                        2 Photos Attached
                      </span>
                    </div>
                  </div>
                </article>
                <article className={"contribution-item p-space-md rounded-xl bg-surface-container-lowest shadow-sm flex flex-col gap-space-sm transition-transform active:scale-[0.99]"} data-status={"approved"}>
                  <div className={"flex items-start justify-between gap-space-sm"}>
                    <div className={"flex items-start gap-space-sm min-w-0"}>
                      <div className={"w-12 h-12 rounded-xl bg-surface-container flex-shrink-0 flex items-center justify-center text-primary shadow-xs"}>
                        <span className={"material-symbols-outlined text-[26px]"}>
                          build
                        </span>
                      </div>
                      <div className={"flex flex-col min-w-0"}>
                        <div className={"flex items-center gap-1.5"}>
                          <h4 className={"font-headline-sm text-headline-sm text-on-surface truncate"}>
                            Precision Auto Works
                          </h4>
                          <span className={"material-symbols-outlined text-[18px] text-primary"} style={{ fontVariationSettings: "'FILL' 1" }}>
                            check_circle
                          </span>
                        </div>
                        <p className={"font-body-sm text-body-sm text-on-surface-variant truncate"}>
                          14 Dunrobin Ave, St. Andrew • Approved 18 Oct 2024
                        </p>
                      </div>
                    </div>
                    <span className={"flex-shrink-0 flex items-center gap-1 px-3 py-1 rounded-full bg-surface-container-highest text-on-surface font-label-sm text-label-sm font-semibold"}>
                      <span className={"w-2 h-2 rounded-full bg-primary animate-pulse"} />
                      Live on Map
                    </span>
                  </div>
                  <div className={"flex items-center justify-between bg-surface-container-low p-space-sm rounded-lg"}>
                    <div className={"flex items-center gap-2"}>
                      <span className={"material-symbols-outlined text-primary text-[18px]"}>
                        group
                      </span>
                      <span className={"font-label-md text-label-md text-on-surface"}>
                        Helped 420+ drivers
                      </span>
                    </div>
                    <span className={"font-label-md text-label-md text-primary font-bold"}>
                      +25 XP awarded
                    </span>
                  </div>
                </article>
                <article className={"contribution-item p-space-md rounded-xl bg-surface-container-lowest shadow-sm flex flex-col gap-space-sm transition-transform active:scale-[0.99]"} data-status={"approved"}>
                  <div className={"flex items-start justify-between gap-space-sm"}>
                    <div className={"flex items-start gap-space-sm min-w-0"}>
                      <div className={"w-12 h-12 rounded-xl bg-surface-container flex-shrink-0 flex items-center justify-center text-primary shadow-xs"}>
                        <span className={"material-symbols-outlined text-[26px]"}>
                          tire_repair
                        </span>
                      </div>
                      <div className={"flex flex-col min-w-0"}>
                        <div className={"flex items-center gap-1.5"}>
                          <h4 className={"font-headline-sm text-headline-sm text-on-surface truncate"}>
                            {"Sammy's Tyre Repair & Air"}
                          </h4>
                          <span className={"material-symbols-outlined text-[18px] text-primary"} style={{ fontVariationSettings: "'FILL' 1" }}>
                            check_circle
                          </span>
                        </div>
                        <p className={"font-body-sm text-body-sm text-on-surface-variant truncate"}>
                          Dunrobin Ave, St. Andrew • Approved 12 Oct 2024
                        </p>
                      </div>
                    </div>
                    <span className={"flex-shrink-0 flex items-center gap-1 px-3 py-1 rounded-full bg-surface-container-highest text-on-surface font-label-sm text-label-sm font-semibold"}>
                      <span className={"w-2 h-2 rounded-full bg-primary"} />
                      Live on Map
                    </span>
                  </div>
                  <div className={"flex items-center justify-between bg-surface-container-low p-space-sm rounded-lg"}>
                    <div className={"flex items-center gap-2"}>
                      <span className={"material-symbols-outlined text-secondary text-[18px]"}>
                        air
                      </span>
                      <span className={"font-label-md text-label-md text-on-surface"}>
                        Verified 24/7 Air Pump
                      </span>
                    </div>
                    <span className={"font-label-md text-label-md text-primary font-bold"}>
                      +25 XP awarded
                    </span>
                  </div>
                </article>
                <article className={"contribution-item p-space-md rounded-xl bg-surface-container-lowest shadow-sm flex flex-col gap-space-sm transition-transform active:scale-[0.99]"} data-status={"not-approved"}>
                  <div className={"flex items-start justify-between gap-space-sm"}>
                    <div className={"flex items-start gap-space-sm min-w-0"}>
                      <div className={"w-12 h-12 rounded-xl bg-error-container flex-shrink-0 flex items-center justify-center text-error shadow-xs"}>
                        <span className={"material-symbols-outlined text-[26px]"}>
                          local_gas_station
                        </span>
                      </div>
                      <div className={"flex flex-col min-w-0"}>
                        <h4 className={"font-headline-sm text-headline-sm text-on-surface truncate"}>
                          Texaco Constant Spring
                        </h4>
                        <p className={"font-body-sm text-body-sm text-on-surface-variant truncate"}>
                          Constant Spring Rd, St. Andrew • Submitted 04 Oct 2024
                        </p>
                      </div>
                    </div>
                    <span className={"flex-shrink-0 flex items-center gap-1 px-3 py-1 rounded-full bg-error-container text-on-error-container font-label-sm text-label-sm font-bold"}>
                      <span className={"material-symbols-outlined text-[14px]"}>
                        cancel
                      </span>
                      Not approved
                    </span>
                  </div>
                  <div className={"flex flex-col gap-space-xs bg-surface-container-low p-space-sm rounded-lg"}>
                    <div className={"flex items-start gap-2"}>
                      <span className={"material-symbols-outlined text-error text-[18px] mt-0.5"}>
                        info
                      </span>
                      <p className={"font-body-sm text-body-sm text-on-surface-variant leading-relaxed"}>
                        <strong className={"text-on-surface"}>
                          Reason:
                        </strong>
                        Duplicate of an existing place (already pinned as Texaco Barbican / Constant Spring).
                      </p>
                    </div>
                    <div className={"flex items-center justify-end pt-1"}>
                      <button onClick={onPlugClick} className={"font-label-md text-label-md text-primary font-semibold flex items-center gap-1 hover:underline"} type={"button"} data-act={"appeal-or-merge-notes"}>
                        Appeal or merge notes
                        <span className={"material-symbols-outlined text-[16px]"}>
                          arrow_forward
                        </span>
                      </button>
                    </div>
                  </div>
                </article>
                <article className={"contribution-item p-space-md rounded-xl bg-surface-container-lowest shadow-sm flex flex-col gap-space-sm transition-transform active:scale-[0.99]"} data-status={"awaiting"}>
                  <div className={"flex items-start justify-between gap-space-sm"}>
                    <div className={"flex items-start gap-space-sm min-w-0"}>
                      <div className={"w-12 h-12 rounded-xl bg-surface-container flex-shrink-0 flex items-center justify-center text-primary shadow-xs"}>
                        <span className={"material-symbols-outlined text-[26px]"}>
                          wc
                        </span>
                      </div>
                      <div className={"flex flex-col min-w-0"}>
                        <h4 className={"font-headline-sm text-headline-sm text-on-surface truncate"}>
                          Swallowfield Depot Restroom
                        </h4>
                        <p className={"font-body-sm text-body-sm text-on-surface-variant truncate"}>
                          Swallowfield, St. Andrew • Submitted yesterday
                        </p>
                      </div>
                    </div>
                    <span className={"flex-shrink-0 px-2.5 py-1 rounded-full bg-secondary-fixed text-on-secondary-fixed font-label-sm text-label-sm font-bold"}>
                      +15 XP Pending
                    </span>
                  </div>
                  <div className={"flex flex-wrap items-center justify-between gap-space-sm pt-space-xs"}>
                    <div className={"flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface-container text-on-surface-variant font-label-md text-label-md"}>
                      <span className={"material-symbols-outlined text-[16px] text-tertiary"}>
                        hourglass_top
                      </span>
                      <span>
                        Awaiting moderation
                      </span>
                    </div>
                    <p className={"font-body-sm text-body-sm text-on-surface-variant flex items-center gap-1"}>
                      <span className={"material-symbols-outlined text-[16px] text-secondary"}>
                        accessible
                      </span>
                      {"Includes wheelchair access & customer key info"}
                    </p>
                  </div>
                </article>
                <article className={"contribution-item p-space-md rounded-xl bg-surface-container-lowest shadow-sm flex flex-col gap-space-sm transition-transform active:scale-[0.99]"} data-status={"approved"}>
                  <div className={"flex items-start justify-between gap-space-sm"}>
                    <div className={"flex items-start gap-space-sm min-w-0"}>
                      <div className={"w-12 h-12 rounded-xl bg-surface-container flex-shrink-0 flex items-center justify-center text-primary shadow-xs"}>
                        <span className={"material-symbols-outlined text-[26px]"}>
                          settings
                        </span>
                      </div>
                      <div className={"flex flex-col min-w-0"}>
                        <div className={"flex items-center gap-1.5"}>
                          <h4 className={"font-headline-sm text-headline-sm text-on-surface truncate"}>
                            Mario's Auto Parts
                          </h4>
                          <span className={"material-symbols-outlined text-[18px] text-primary"} style={{ fontVariationSettings: "'FILL' 1" }}>
                            check_circle
                          </span>
                        </div>
                        <p className={"font-body-sm text-body-sm text-on-surface-variant truncate"}>
                          Constant Spring Rd, St. Andrew • Approved 28 Sep 2024
                        </p>
                      </div>
                    </div>
                    <span className={"flex-shrink-0 flex items-center gap-1 px-3 py-1 rounded-full bg-surface-container-highest text-on-surface font-label-sm text-label-sm font-semibold"}>
                      <span className={"w-2 h-2 rounded-full bg-primary"} />
                      Live on Map
                    </span>
                  </div>
                  <div className={"flex items-center justify-between bg-surface-container-low p-space-sm rounded-lg"}>
                    <div className={"flex items-center gap-2"}>
                      <span className={"material-symbols-outlined text-primary text-[18px]"}>
                        verified
                      </span>
                      <span className={"font-label-md text-label-md text-on-surface"}>
                        {"Genuine Toyota & Nissan Inventory"}
                      </span>
                    </div>
                    <span className={"font-label-md text-label-md text-primary font-bold"}>
                      +25 XP awarded
                    </span>
                  </div>
                </article>
              </div>
            </section>
            <div className={"hidden flex-col items-center justify-center py-space-xl px-space-md text-center bg-surface-container-lowest rounded-xl shadow-sm gap-space-sm"} id={"empty-state"}>
              <div className={"w-16 h-16 rounded-full bg-surface-container flex items-center justify-center text-on-surface-variant"}>
                <span className={"material-symbols-outlined text-[32px]"}>
                  manage_search
                </span>
              </div>
              <h4 className={"font-headline-sm text-headline-sm text-on-surface"}>
                No submissions found
              </h4>
              <p className={"font-body-sm text-body-sm text-on-surface-variant max-w-xs"}>
                There are currently no pinned places in this review category.
              </p>
            </div>
            <div className={"p-space-md rounded-xl bg-surface-container flex items-center gap-space-sm shadow-xs"}>
              <div className={"w-10 h-10 rounded-full bg-primary-fixed flex-shrink-0 flex items-center justify-center text-primary"}>
                <span className={"material-symbols-outlined text-[22px]"}>
                  lightbulb
                </span>
              </div>
              <div className={"flex flex-col"}>
                <h5 className={"font-label-md text-label-md text-on-surface font-bold"}>
                  Pro-Tip for Fast Approvals
                </h5>
                <p className={"font-body-sm text-body-sm text-on-surface-variant leading-snug"}>
                  Adding pump price photos or station contact tags cuts verification time down to under 45 minutes.
                </p>
              </div>
            </div>
            <div className={"sticky bottom-4 z-30 pt-space-xs"}>
              <button onClick={onPlugClick} className={"w-full h-14 rounded-xl bg-primary text-on-primary font-headline-sm text-headline-sm flex items-center justify-center gap-space-sm shadow-xl active:bg-secondary transition-all transform active:scale-[0.98]"} type={"button"} data-act={"map-another-place"} data-way-out={"primary"}>
                <span className={"material-symbols-outlined text-[24px]"}>
                  add_location_alt
                </span>
                <span>
                  + Map Another Place
                </span>
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
