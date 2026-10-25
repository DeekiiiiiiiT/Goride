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
              
            </span>
          </div>
          <div className={"px-gutter flex flex-col gap-space-lg pt-space-sm pb-space-xl"}>
            <section className={"flex flex-col gap-space-sm"}>
              <div className={"flex items-center justify-between"}>
                <h3 className={"font-headline-sm text-headline-sm text-on-surface"}>
                  Submission History
                </h3>
                <span className={"font-body-sm text-body-sm text-on-surface-variant"}>
                  
                </span>
              </div>
              <div className={"flex gap-space-xs overflow-x-auto pb-1 no-scrollbar -mx-gutter px-gutter"} id={"status-tabs"} role={"tablist"}>
                <button onClick={onPlugClick} className={"tab-btn px-space-md py-space-sm rounded-full font-label-md text-label-md bg-inverse-surface text-inverse-on-surface transition-all flex items-center gap-1.5 shadow-sm active:scale-95"} type={"button"} data-act={"all-16"}>
                  <span>
                    All
                  </span>
                  
                </button>
                <button onClick={onPlugClick} className={"tab-btn px-space-md py-space-sm rounded-full font-label-md text-label-md bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container transition-all flex items-center gap-1.5 shadow-sm active:scale-95"} type={"button"} data-act={"awaiting-approval-3"}>
                  <span>
                    Awaiting approval
                  </span>
                  
                </button>
                <button onClick={onPlugClick} className={"tab-btn px-space-md py-space-sm rounded-full font-label-md text-label-md bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container transition-all flex items-center gap-1.5 shadow-sm active:scale-95"} type={"button"} data-act={"approved-11"}>
                  <span>
                    Approved
                  </span>
                  
                </button>
                <button onClick={onPlugClick} className={"tab-btn px-space-md py-space-sm rounded-full font-label-md text-label-md bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container transition-all flex items-center gap-1.5 shadow-sm active:scale-95"} type={"button"} data-act={"not-approved-2"}>
                  <span>
                    Not approved
                  </span>
                  
                </button>
              </div>
              <div className={"flex flex-col gap-space-sm mt-space-xs"} id={"contributions-list"}>
                <p data-slot={"pins"}>No places yet.</p>
                
                
                
                
                
                
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
