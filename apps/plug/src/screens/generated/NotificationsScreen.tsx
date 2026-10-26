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
                No new alerts
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
              </span>
            </button>
            <button onClick={onPlugClick} className={"filter-chip shrink-0 h-9 px-4 rounded-full bg-surface-container-high text-on-surface hover:bg-surface-variant active:scale-95 transition-all font-label-md text-label-md flex items-center gap-1.5"} type={"button"} data-act={"reminders-2"}>
              <span>
                Reminders
              </span>
              <span className={"px-1.5 py-0.2 rounded-full bg-secondary-fixed text-on-secondary-fixed font-label-sm text-label-sm"}>
              </span>
            </button>
            <button onClick={onPlugClick} className={"filter-chip shrink-0 h-9 px-4 rounded-full bg-surface-container-high text-on-surface hover:bg-surface-variant active:scale-95 transition-all font-label-md text-label-md flex items-center gap-1.5"} type={"button"} data-act={"scout-updates-1"}>
              <span>
                Scout Updates
              </span>
              <span className={"px-1.5 py-0.2 rounded-full bg-surface-container-highest text-on-surface-variant font-label-sm text-label-sm"}>
              </span>
            </button>
            <button onClick={onPlugClick} className={"filter-chip shrink-0 h-9 px-4 rounded-full bg-surface-container-high text-on-surface hover:bg-surface-variant active:scale-95 transition-all font-label-md text-label-md flex items-center gap-1.5"} type={"button"} data-act={"fuel-radar-2"}>
              <span>
                Fuel Radar
              </span>
              <span className={"px-1.5 py-0.2 rounded-full bg-secondary-fixed text-on-secondary-fixed font-label-sm text-label-sm"}>
              </span>
            </button>
          </div>
          <div className={"flex flex-col gap-2"} data-slot={"inbox"}>
            <p className={"px-1 py-3 text-sm"}>Inbox is empty.</p>
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
                    {"Manage push reminders, Fitness reminders & Gas Radar"}
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
      </main>
    </div>
  );
}
