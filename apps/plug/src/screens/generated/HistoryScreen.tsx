import { useEffect, useRef } from 'react';
import { onPlugClick } from '../../shell/actions';
import { bindScreen } from '../../shell/bind';


export function HistoryScreen() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (ref.current) bindScreen("34-history.html", ref.current); }, []);
  return (
    <div ref={ref} data-plug-screen={"34-history.html"} className={"bg-surface font-body-md text-on-surface flex flex-col min-h-screen"}>
      <header className={"fixed top-0 w-full z-50 pt-safe bg-surface/80 backdrop-blur-xl shadow-[0_1px_8px_rgba(0,0,0,0.04)]"}>
        <div className={"h-16 px-gutter flex items-center justify-between gap-space-sm"}>
          <div className={"flex items-center gap-space-sm min-w-0"}>
            <button onClick={onPlugClick} aria-label={"Go back"} className={"w-12 h-12 rounded-full flex items-center justify-center text-on-surface hover:bg-surface-container-high transition-colors active:scale-95"} data-act={"arrow-back"} data-way-out={"back"}>
              <span className={"material-symbols-outlined text-[24px]"}>
                arrow_back
              </span>
            </button>
            <div className={"flex flex-col min-w-0"}>
              <h1 className={"font-headline-sm text-headline-sm text-on-surface truncate"}>
                Maintenance History
              </h1>
              <span className={"font-label-md text-label-md text-on-surface-variant truncate"} data-slot={"car"}>
                Add a car</span>
            </div>
          </div>
          <div className={"flex items-center gap-space-xs"}>
            <div className={"w-8 h-8 rounded-full bg-primary flex items-center justify-center"}>
              <span className={"material-symbols-outlined text-on-primary text-[18px]"}>
                person
              </span>
            </div>
          </div>
        </div>
      </header>
      <main className={"flex-1 flex flex-col relative w-full px-gutter pt-16 pb-safe bg-surface"}>
        <p data-slot={"history"} className={"px-4 py-3"}>No fuel logs yet.</p>
        <div className={"flex flex-col w-full pb-24"}>
          <section className={"mt- space-y-space-md"}>
            <div className={"relative overflow-hidden rounded-xl bg-surface-container-lowest p-space-md shadow-sm"}>
              <div className={"flex items-start justify-between gap-space-sm mb-space-sm"}>
                <div className={"flex items-center gap-space-sm"}>
                  <div className={"w-12 h-12 rounded-xl bg-primary-fixed flex items-center justify-center text-primary shrink-0"}>
                    <span className={"material-symbols-outlined text-[26px]"}>
                      build_circle
                    </span>
                  </div>
                  <div>
                    <span className={"inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface-container text-on-surface-variant font-label-sm text-label-sm uppercase tracking-wider"}>
                      <span className={"w-1.5 h-1.5 rounded-full bg-secondary"} />
                      Logged Health
                    </span>
                    <p className={"font-price-display text-price-display text-primary mt-0.5"}>
                      No services yet
                    </p>
                  </div>
                </div>
                <span className={"px-2.5 py-1 rounded-full bg-surface-container-high text-on-surface font-label-md text-label-md font-semibold"}>
                  
                </span>
              </div>
              <div className={"grid grid-cols-2 gap-space-sm bg-surface-container-low rounded-lg p-space-sm mb-space-md"}>
                <div className={"flex flex-col"}>
                  <span className={"font-label-sm text-label-sm text-on-surface-variant"}>
                    CURRENT ODOMETER
                  </span>
                  <span className={"font-headline-sm text-headline-sm text-on-surface flex items-center gap-1"}>
                    
                    <span className={"font-label-md text-label-md text-on-surface-variant font-normal"}>
                      km
                    </span>
                  </span>
                </div>
                <div className={"flex flex-col border-l border-outline-variant/30 pl-space-sm"}>
                  <span className={"font-label-sm text-label-sm text-on-surface-variant"}>
                    LAST LOGGED
                  </span>
                  <span className={"font-headline-sm text-headline-sm text-secondary flex items-center gap-1"}>
                    
                    <span className={"font-label-md text-label-md text-on-surface-variant font-normal"}>
                      2024
                    </span>
                  </span>
                </div>
              </div>
              <button onClick={onPlugClick} className={"w-full h-12 rounded-lg bg-primary text-on-primary flex items-center justify-center gap-space-sm font-label-lg text-label-lg shadow-md active:bg-primary-container transition-transform active:scale-[0.99]"} type={"button"} data-act={"download-history-pdf"} data-way-out={"primary"}>
                <span className={"material-symbols-outlined text-[20px]"}>
                  verified_user
                </span>
                <span>
                  Download History (PDF)
                </span>
                <span className={"material-symbols-outlined text-[18px]"}>
                  download
                </span>
              </button>
              <div className={"mt-space-xs flex items-center justify-center gap-1.5 text-center"}>
                <span className={"material-symbols-outlined text-secondary text-[14px]"}>
                  format_image_left
                </span>
                <p className={"font-label-sm text-label-sm text-on-surface-variant"}>
                  {"Certified digital logbook • Ideal for ITA compliance, insurance & resale"}
                </p>
              </div>
            </div>
          </section>
          <section className={"mt-space-lg"}>
            <div className={"flex items-center justify-between mb-space-xs"}>
              <span className={"font-label-md text-label-md text-on-surface-variant font-bold uppercase tracking-wider"}>
                Filter Records
              </span>
              <span className={"font-label-sm text-label-sm text-secondary"}>
                
              </span>
            </div>
            <div className={"flex gap-space-xs overflow-x-auto pb-1 -mx-gutter px-gutter scroll-smooth no-scrollbar"} id={"chip-filters"}>
              <button onClick={onPlugClick} className={"filter-chip shrink-0 h-9 px-4 rounded-full bg-primary text-on-primary font-label-md text-label-md font-semibold flex items-center gap-1.5 shadow-sm active:scale-95 transition-all"} data-act={"all-6"} data-way-out={"primary"}>
                <span>
                  All
                </span>
                <span className={"px-1.5 py-0.2 rounded-full bg-primary-container text-on-primary-container font-label-sm text-label-sm"}>
                  6
                </span>
              </button>
              <button onClick={onPlugClick} className={"filter-chip shrink-0 h-9 px-4 rounded-full bg-surface-container-lowest text-on-surface font-label-md text-label-md font-medium flex items-center gap-1.5 shadow-sm active:scale-95 transition-all"} data-act={"oil-fluids-3"}>
                <span>
                  {"Oil & Fluids"}
                </span>
                <span className={"px-1.5 py-0.2 rounded-full bg-surface-container text-on-surface-variant font-label-sm text-label-sm"}>
                  3
                </span>
              </button>
              <button onClick={onPlugClick} className={"filter-chip shrink-0 h-9 px-4 rounded-full bg-surface-container-lowest text-on-surface font-label-md text-label-md font-medium flex items-center gap-1.5 shadow-sm active:scale-95 transition-all"} data-act={"brakes-1"}>
                <span>
                  Brakes
                </span>
                <span className={"px-1.5 py-0.2 rounded-full bg-surface-container text-on-surface-variant font-label-sm text-label-sm"}>
                  1
                </span>
              </button>
              <button onClick={onPlugClick} className={"filter-chip shrink-0 h-9 px-4 rounded-full bg-surface-container-lowest text-on-surface font-label-md text-label-md font-medium flex items-center gap-1.5 shadow-sm active:scale-95 transition-all"} data-act={"tyres-suspension-1"}>
                <span>
                  {"Tyres & Suspension"}
                </span>
                <span className={"px-1.5 py-0.2 rounded-full bg-surface-container text-on-surface-variant font-label-sm text-label-sm"}>
                  1
                </span>
              </button>
              <button onClick={onPlugClick} className={"filter-chip shrink-0 h-9 px-4 rounded-full bg-surface-container-lowest text-on-surface font-label-md text-label-md font-medium flex items-center gap-1.5 shadow-sm active:scale-95 transition-all"} data-act={"statutory-inspection-1"}>
                <span>
                  Statutory / Inspection
                </span>
                <span className={"px-1.5 py-0.2 rounded-full bg-surface-container text-on-surface-variant font-label-sm text-label-sm"}>
                  1
                </span>
              </button>
            </div>
          </section>
          <section className={"mt-space-lg relative"}>
            <div className={"absolute left-4 top-4 bottom-8 w-0.5 bg-surface-container-highest -z-0"} />
            <div className={"space-y-space-md relative z-10"}>
              
              
              
              
            </div>
          </section>
          <section className={"mt-space-lg mb-space-sm"}>
            <div className={"rounded-xl bg-surface-container p-space-md flex items-center gap-space-md"}>
              <div className={"w-10 h-10 rounded-full bg-secondary-fixed text-on-secondary-fixed flex items-center justify-center shrink-0"}>
                <span className={"material-symbols-outlined text-[20px]"}>
                  assignment_turned_in
                </span>
              </div>
              <div className={"min-w-0 flex-1"}>
                <p className={"font-headline-sm text-headline-sm text-on-surface"}>
                  ITA Road Fitness
                </p>
                <p className={"font-body-sm text-body-sm text-on-surface-variant"}>
                  
                </p>
              </div>
              <span className={"material-symbols-outlined text-secondary"}>
                chevron_right
              </span>
            </div>
          </section>
          <div className={"fixed bottom-0 left-0 right-0 z-40 bg-surface/90 backdrop-blur-md px-gutter py-space-sm pb-safe shadow-[0_-4px_16px_rgba(30,27,23,0.06)]"}>
            <div className={"max-w-md mx-auto flex items-center gap-space-sm"}>
              <button onClick={onPlugClick} className={"flex-1 h-12 rounded-xl bg-primary text-on-primary flex items-center justify-center gap-space-xs font-label-lg text-label-lg shadow-lg active:bg-primary-container active:scale-[0.98] transition-transform"} type={"button"} data-act={"log-another-service"} data-way-out={"primary"}>
                <span className={"material-symbols-outlined text-[20px]"}>
                  add_circle
                </span>
                <span>
                  Log Another Service
                </span>
              </button>
              <button onClick={onPlugClick} aria-label={"Share summary report"} className={"w-12 h-12 rounded-xl bg-surface-container-high text-on-surface flex items-center justify-center hover:bg-surface-container-highest active:scale-95 transition-all shrink-0"} type={"button"} data-act={"ios-share"}>
                <span className={"material-symbols-outlined text-[22px]"}>
                  ios_share
                </span>
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
