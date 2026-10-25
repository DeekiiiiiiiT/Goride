import { useEffect, useRef } from 'react';
import { onPlugClick } from '../../shell/actions';
import { bindScreen } from '../../shell/bind';


export function ApprovedScreen() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (ref.current) bindScreen("46b-approved.html", ref.current); }, []);
  return (
    <div ref={ref} data-plug-screen={"46b-approved.html"} className={"bg-background text-on-surface antialiased min-h-screen selection:bg-primary-fixed selection:text-on-primary-fixed"}>
      <div className={"max-w-md mx-auto min-h-screen flex flex-col bg-background relative shadow-2xl pb-24 overflow-x-hidden"}>
        <header className={"sticky top-0 z-40 bg-surface/95 backdrop-blur-md border-b border-outline-variant/40 shadow-sm"}>
          <div className={"flex justify-between items-center w-full px-4 h-16 max-w-md mx-auto"}>
            <button onClick={onPlugClick} aria-label={"Go back"} className={"p-2 -ml-2 rounded-full text-on-surface-variant hover:bg-surface-container active:scale-95 transition-transform duration-150 flex items-center justify-center"} type={"button"} data-act={"arrow-back"} data-way-out={"back"}>
              <span className={"material-symbols-outlined text-[24px]"}>
                arrow_back
              </span>
            </button>
            <h1 className={"text-headline-sm font-headline-sm text-primary tracking-tight font-bold"}>
              Place Approved
            </h1>
            <button onClick={onPlugClick} aria-label={"Share approval"} className={"p-2 -mr-2 rounded-full text-primary hover:bg-surface-container active:scale-95 transition-transform duration-150 flex items-center justify-center"} type={"button"} data-act={"share"}>
              <span className={"material-symbols-outlined text-[24px]"}>
                share
              </span>
            </button>
          </div>
          <div className={"px-4 pb-2.5 pt-0.5"}>
            <div className={"bg-surface-container-lowest border border-outline-variant/60 rounded-full px-3 py-1.5 flex items-center justify-between shadow-sm"}>
              <div className={"flex items-center space-x-2"}>
                <span className={"flex h-2.5 w-2.5 relative"}>
                  <span className={"animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"} />
                  <span className={"relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-600"} />
                </span>
                <span className={"text-label-md font-label-md text-on-surface font-semibold"}>
                  Live on Island Grid
                </span>
              </div>
              <div className={"flex items-center space-x-1 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200"}>
                <span className={"material-symbols-outlined text-emerald-700 text-[14px]"} style={{ fontVariationSettings: "'FILL' 1" }}>
                  check_circle
                </span>
                <span className={"text-label-sm font-label-sm text-emerald-800 tracking-wider"}>
                  VERIFIED
                </span>
              </div>
            </div>
          </div>
        </header>
        <main className={"flex-1 px-4 pt-3 space-y-4"}>
          <section className={"relative bg-surface-container-lowest rounded-2xl p-5 border border-outline-variant/50 shadow-sm overflow-hidden"}>
            <div className={"absolute -top-3 -right-3 w-28 h-28 bg-gradient-to-br from-tertiary-fixed/40 to-primary-fixed/20 rounded-full blur-2xl pointer-events-none"} />
            <div className={"absolute top-2 left-6 text-tertiary-container animate-float opacity-80 pointer-events-none select-none"}>
              <span className={"material-symbols-outlined text-[18px]"}>
                celebration
              </span>
            </div>
            <div className={"absolute top-4 right-10 text-secondary-container animate-float-delayed opacity-90 pointer-events-none select-none"}>
              <span className={"material-symbols-outlined text-[16px]"}>
                arrow_back_ios_new
              </span>
            </div>
            <div className={"absolute bottom-3 right-6 text-primary animate-float opacity-75 pointer-events-none select-none"}>
              <span className={"material-symbols-outlined text-[14px]"}>
                auto_awesome
              </span>
            </div>
            <div className={"absolute top-12 left-1 text-tertiary animate-float-delayed opacity-60 pointer-events-none select-none"}>
              <span className={"material-symbols-outlined text-[12px]"}>
                grade
              </span>
            </div>
            <div className={"relative z-10 flex flex-col items-center text-center"}>
              <div className={"relative mb-3"}>
                <div className={"w-16 h-16 rounded-full bg-gradient-to-tr from-primary to-secondary-container flex items-center justify-center shadow-lg shadow-primary/20 ring-4 ring-primary-fixed"}>
                  <span className={"material-symbols-outlined text-on-primary text-[32px]"} style={{ fontVariationSettings: "'FILL' 1" }}>
                    task_alt
                  </span>
                </div>
                <div className={"absolute -bottom-1 -right-1 bg-emerald-600 text-white rounded-full p-1 border-2 border-surface-container-lowest shadow-sm flex items-center justify-center"}>
                  <span className={"material-symbols-outlined text-[12px]"} style={{ fontVariationSettings: "'FILL' 1" }}>
                    check
                  </span>
                </div>
              </div>
              <div className={"inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full bg-primary-fixed/60 mb-1.5"}>
                <span className={"material-symbols-outlined text-primary text-[14px]"}>
                  local_police
                </span>
                <span className={"text-label-sm font-label-sm text-primary tracking-wide"}>
                  MILESTONE UNLOCKED
                </span>
              </div>
              <h2 className={"text-headline-md font-headline-md text-on-background font-extrabold tracking-tight"}>
                Your First Pin is Approved! 🎉
              </h2>
              <p className={"text-body-md font-body-md text-on-surface-variant mt-1.5 max-w-xs"}>
                This place is now live on the island map for all Jamaican drivers.
              </p>
            </div>
          </section>
          <section className={"bg-surface-container-lowest rounded-2xl border border-outline-variant/60 shadow-sm overflow-hidden"}>
            <div className={"p-4"}>
              <div className={"flex items-start justify-between gap-3"}>
                <div className={"flex items-center space-x-3"}>
                  <div className={"w-12 h-12 rounded-xl bg-surface-container flex items-center justify-center text-primary border border-outline-variant/30 flex-shrink-0"}>
                    <span className={"material-symbols-outlined text-[28px]"} style={{ fontVariationSettings: "'FILL' 1" }}>
                      build_circle
                    </span>
                  </div>
                  <div>
                    <div className={"flex items-center space-x-1.5 flex-wrap"}>
                      <h3 className={"text-headline-sm font-headline-sm text-on-background font-bold leading-tight"}>
                        {""}
                      </h3>
                    </div>
                    <div className={"flex items-center gap-1.5 mt-1"}>
                      <span className={"inline-flex items-center space-x-1 bg-emerald-100/80 text-emerald-800 px-2 py-0.5 rounded text-label-sm font-label-sm font-bold"}>
                        <span className={"material-symbols-outlined text-[12px]"} style={{ fontVariationSettings: "'FILL' 1" }}>
                          verified
                        </span>
                        <span>
                          Verified Place
                        </span>
                      </span>
                      <span className={"text-label-sm font-label-sm text-on-surface-variant bg-surface-container px-2 py-0.5 rounded"}>
                        {"Tyre & Vulcanizing"}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
              <div className={"mt-3.5 pt-3 border-t border-surface-container flex items-start space-x-2"}>
                <span className={"material-symbols-outlined text-outline text-[18px] mt-0.5 flex-shrink-0"}>
                  location_on
                </span>
                <div className={"text-body-sm font-body-sm text-on-surface leading-snug"}>
                  <span className={"font-semibold text-on-background"}>
                    14 Eastwood Park Rd
                  </span>
                  {", Half-Way-Tree, Kingston & St. Andrew"}
                </div>
              </div>
            </div>
            <div className={"relative bg-surface-container-high border-t border-outline-variant/40 h-28 overflow-hidden flex items-center justify-center"}>
              <div className={"absolute inset-0 opacity-80 mix-blend-multiply bg-[radial-gradient(#cc4900_1px,transparent_1px)] [background-size:12px_12px]"} />
              <div className={"absolute inset-0 flex items-center justify-center pointer-events-none"}>
                <div className={"w-full h-2 bg-surface-container-highest/90 rotate-12 absolute"} />
                <div className={"w-full h-3 bg-white/70 -rotate-45 absolute"} />
                <div className={"w-1.5 h-full bg-white/70 rotate-6 absolute"} />
              </div>
              <div className={"relative z-10 flex flex-col items-center"}>
                <div className={"relative flex items-center justify-center"}>
                  <div className={"w-10 h-10 rounded-full bg-primary/20 animate-ping absolute"} />
                  <div className={"w-9 h-9 rounded-full bg-primary text-white flex items-center justify-center shadow-lg border-2 border-white"}>
                    <span className={"material-symbols-outlined text-[20px]"} style={{ fontVariationSettings: "'FILL' 1" }}>
                      pin_drop
                    </span>
                  </div>
                </div>
                <div className={"mt-1 bg-inverse-surface text-surface text-label-sm font-label-sm px-2.5 py-0.5 rounded-full shadow-md whitespace-nowrap"}>
                  Live on Map • Pin ID #849
                </div>
              </div>
              <div className={"absolute bottom-2 left-2 z-10 bg-surface-container-lowest/90 backdrop-blur-xs px-2 py-0.5 rounded border border-outline-variant/50 text-label-sm font-label-sm text-on-surface-variant"}>
                St. Andrew Grid
              </div>
            </div>
          </section>
          <div className={"grid grid-cols-1 gap-3"}>
            <section className={"bg-surface-container-lowest rounded-2xl p-4 border border-outline-variant/60 shadow-sm space-y-3"}>
              <div className={"flex items-center justify-between"}>
                <div className={"flex items-center space-x-2"}>
                  <div className={"w-8 h-8 rounded-lg bg-tertiary-fixed flex items-center justify-center text-on-tertiary-fixed"}>
                    <span className={"material-symbols-outlined text-[18px]"} style={{ fontVariationSettings: "'FILL' 1" }}>
                      military_tech
                    </span>
                  </div>
                  <h4 className={"text-label-lg font-label-lg text-on-background font-bold"}>
                    Contributor Rewards
                  </h4>
                </div>
                <span className={"bg-secondary-fixed text-on-secondary-fixed font-bold text-label-sm font-label-sm px-2.5 py-1 rounded-full flex items-center space-x-1"}>
                  <span className={"material-symbols-outlined text-[13px]"} style={{ fontVariationSettings: "'FILL' 1" }}>
                    add
                  </span>
                  <span>
                    
                  </span>
                </span>
              </div>
              <div className={"bg-surface-container-low p-3 rounded-xl border border-outline-variant/40 flex items-center space-x-3"}>
                <div className={"w-10 h-10 rounded-full bg-primary-container text-on-primary-container flex items-center justify-center flex-shrink-0 shadow-sm"}>
                  <span className={"material-symbols-outlined text-[20px]"} style={{ fontVariationSettings: "'FILL' 1" }}>
                    shield
                  </span>
                </div>
                <div className={"flex-1"}>
                  <div className={"text-label-sm font-label-sm text-primary font-bold uppercase tracking-wider"}>
                    New Badge Unlocked
                  </div>
                  <div className={"text-body-md font-body-md font-bold text-on-background"}>
                    
                  </div>
                </div>
              </div>
              <div>
                <div className={"flex justify-between items-center text-label-sm font-label-sm mb-1.5"}>
                  <span className={"text-on-surface-variant font-medium"}>
                    Scout Grade Progress
                  </span>
                  <span className={"text-on-background font-bold tracking-tight"}>
                    
                  </span>
                </div>
                <div className={"w-full bg-surface-container rounded-full h-2.5 overflow-hidden"}>
                  <div className={"bg-gradient-to-r from-primary to-secondary-container h-full rounded-full transition-all duration-500"} style={{ width: "73%" }} />
                </div>
              </div>
            </section>
            <section className={"bg-surface-container-low rounded-2xl p-4 border border-outline-variant/50 flex items-start space-x-3"}>
              <div className={"w-8 h-8 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center flex-shrink-0 mt-0.5"}>
                <span className={"material-symbols-outlined text-[18px]"} style={{ fontVariationSettings: "'FILL' 1" }}>
                  groups
                </span>
              </div>
              <div>
                <h4 className={"text-label-lg font-label-lg text-on-background font-bold"}>
                  Island Community Impact
                </h4>
                <p className={"text-body-sm font-body-sm text-on-surface-variant mt-0.5 leading-relaxed"}>
                  Jamaican motorists can now find reliable tyre repair and air at this location thanks to your pin.
                </p>
              </div>
            </section>
          </div>
          <section className={"pt-2 space-y-2.5"}>
            <button onClick={onPlugClick} className={"w-full h-12 bg-primary hover:bg-primary-container text-on-primary rounded-xl font-label-lg font-label-lg font-bold flex items-center justify-center space-x-2 shadow-md shadow-primary/20 active:scale-[0.98] transition-all"} type={"button"} data-act={"view-on-island-map"} data-way-out={"primary"}>
              <span className={"material-symbols-outlined text-[20px]"} style={{ fontVariationSettings: "'FILL' 1" }}>
                map
              </span>
              <span>
                View on Island Map
              </span>
            </button>
            <button onClick={onPlugClick} className={"w-full h-12 bg-surface-container hover:bg-surface-container-high border border-outline-variant text-primary rounded-xl font-label-lg font-label-lg font-bold flex items-center justify-center space-x-2 active:scale-[0.98] transition-all"} type={"button"} data-act={"map-another-place"}>
              <span className={"material-symbols-outlined text-[20px]"}>
                add_location_alt
              </span>
              <span>
                Map Another Place
              </span>
            </button>
          </section>
        </main>
        <nav className={"fixed bottom-0 left-0 w-full z-50 flex justify-around items-center px-4 h-16 max-w-md mx-auto bg-surface/95 backdrop-blur-md shadow-[0_-4px_16px_rgba(28,25,23,0.06)]"}>
          <a onClick={onPlugClick} className={"flex flex-col items-center justify-center text-on-surface-variant hover:text-primary transition-colors active:scale-95 transition-transform duration-150 min-h-[48px] min-w-[48px]"} href={"#explore"} data-act={"explore"}>
            <span className={"material-symbols-outlined text-[22px]"}>
              explore
            </span>
            <span className={"text-label-sm font-label-sm mt-0.5"}>
              Explore
            </span>
          </a>
          <a onClick={onPlugClick} className={"flex flex-col items-center justify-center text-primary font-bold hover:text-primary transition-colors active:scale-95 transition-transform duration-150 min-h-[48px] min-w-[48px]"} href={"#contribute"} data-act={"contribute"}>
            <span className={"material-symbols-outlined text-[22px]"} style={{ fontVariationSettings: "'FILL' 1" }}>
              add_location_alt
            </span>
            <span className={"text-label-sm font-label-sm mt-0.5"}>
              Contribute
            </span>
          </a>
          <a onClick={onPlugClick} className={"flex flex-col items-center justify-center text-on-surface-variant hover:text-primary transition-colors active:scale-95 transition-transform duration-150 min-h-[48px] min-w-[48px]"} href={"#rewards"} data-act={"rewards"}>
            <span className={"material-symbols-outlined text-[22px]"}>
              stars
            </span>
            <span className={"text-label-sm font-label-sm mt-0.5"}>
              Rewards
            </span>
          </a>
          <a onClick={onPlugClick} className={"flex flex-col items-center justify-center text-on-surface-variant hover:text-primary transition-colors active:scale-95 transition-transform duration-150 min-h-[48px] min-w-[48px]"} href={"#profile"} data-act={"profile"}>
            <span className={"material-symbols-outlined text-[22px]"}>
              person
            </span>
            <span className={"text-label-sm font-label-sm mt-0.5"}>
              Profile
            </span>
          </a>
        </nav>
      </div>
    </div>
  );
}
