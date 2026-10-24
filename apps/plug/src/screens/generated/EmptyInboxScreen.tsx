import { useEffect, useRef } from 'react';
import { onPlugClick } from '../../shell/actions';
import { bindScreen } from '../../shell/bind';


export function EmptyInboxScreen() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (ref.current) bindScreen("50b-empty-inbox.html", ref.current); }, []);
  return (
    <div ref={ref} data-plug-screen={"50b-empty-inbox.html"} className={"bg-background text-on-surface font-body-md antialiased min-h-screen flex justify-center selection:bg-secondary-fixed selection:text-on-secondary-fixed"}>
      <div className={"w-full max-w-[390px] min-h-screen bg-background flex flex-col relative shadow-2xl overflow-hidden"}>
        <header className={"sticky top-0 z-40 bg-surface-container-lowest/90 backdrop-blur-md transition-colors shadow-sm"}>
          <div className={"h-2 w-full pt-safe"} />
          <div className={"flex items-center justify-between px-4 h-14"}>
            <button onClick={onPlugClick} aria-label={"Go back"} className={"flex items-center justify-center w-10 h-10 -ml-1 rounded-full text-on-surface hover:bg-surface-container-high/50 active:scale-95 transition-all"} type={"button"} data-act={"arrow-back"} data-way-out={"back"}>
              <span className={"material-symbols-outlined text-[24px]"}>
                arrow_back
              </span>
            </button>
            <h1 className={"font-headline-sm text-headline-sm font-bold text-on-surface tracking-tight"}>
              Inbox
            </h1>
            <button onClick={onPlugClick} aria-label={"Inbox options"} className={"flex items-center justify-center w-10 h-10 -mr-1 rounded-full text-on-surface hover:bg-surface-container-high/50 active:scale-95 transition-all"} type={"button"} data-act={"tune"}>
              <span className={"material-symbols-outlined text-[22px]"}>
                tune
              </span>
            </button>
          </div>
          <div className={"flex px-4 pt-1 pb-2.5 gap-2 border-b border-outline-variant/30"}>
            <button onClick={onPlugClick} className={"px-3.5 py-1.5 rounded-full bg-secondary text-on-secondary font-label-md text-label-md font-semibold transition-all shadow-sm"} data-act={"all-updates"}>
              All Updates
            </button>
            <button onClick={onPlugClick} className={"px-3.5 py-1.5 rounded-full bg-surface-container-low text-on-surface-variant font-label-md text-label-md font-semibold hover:bg-surface-container hover:text-on-surface transition-all"} data-act={"parish-alerts"}>
              Parish Alerts
            </button>
            <button onClick={onPlugClick} className={"px-3.5 py-1.5 rounded-full bg-surface-container-low text-on-surface-variant font-label-md text-label-md font-semibold hover:bg-surface-container hover:text-on-surface transition-all"} data-act={"receipts"}>
              Receipts
            </button>
          </div>
        </header>
        <main className={"flex-1 flex flex-col items-center justify-center px-6 py-8 relative z-10 text-center"}>
          <div className={"absolute w-64 h-64 bg-secondary-fixed-dim/20 rounded-full blur-3xl pointer-events-none -translate-y-6"} />
          <div className={"relative z-10 mb-2 flex items-center justify-center"}>
            <div className={"relative p-2 rounded-full transition-transform active:scale-95 duration-300"}>
              <img alt={"Quiet mailbox illustration"} className={"w-[172px] h-[172px] object-contain drop-shadow-[0_8px_16px_rgba(163,57,0,0.08)]"} src={"https://lh3.googleusercontent.com/aida/AEtjO1VFwcjgU-QeYf9NpbyF5PiUDLcnH964admWNDssq7t8ayK2rsyApbY6_KKUco4t9Pv5SF1neQb1zuIP2pRDbtKW7n3pgGQUrX6KvpvmE_u9KZK5Rxn98rOm0Hzu_eCs-hZdmrjL_nT6fOBh88ftHj1rOkDS9qhS89oI_wn5MMMRrMGXmatFGlNTOqzCy790FXnNBdzE2_TvcbBiJvwy1mzQFcqCSqP5leOxAe4FpVTcaAcbBP7gEk_ElCQ"} />
            </div>
          </div>
          <h2 className={"font-headline-md text-headline-md text-on-surface font-extrabold tracking-tight mt-3"}>
            Nothing waiting
          </h2>
          <p className={"font-body-md text-body-md text-on-surface-variant max-w-[270px] mt-2 leading-relaxed"}>
            Approvals and place updates will show up here.
          </p>
          <div className={"inline-flex items-center gap-1.5 mt-5 px-3 py-1 bg-surface-container-low border border-outline-variant/40 rounded-full text-on-surface-variant font-label-sm text-label-sm"}>
            <span className={"w-1.5 h-1.5 rounded-full bg-green-600 animate-pulse"} />
            <span>
              Synced with Road Network
            </span>
          </div>
          <div className={"w-full mt-7 flex flex-col gap-3 max-w-[280px]"}>
            <button onClick={onPlugClick} className={"w-full min-h-[48px] px-5 py-2.5 rounded-xl border-[1.5px] border-secondary text-secondary font-label-lg text-label-lg font-bold flex items-center justify-center gap-2 hover:bg-secondary-fixed/30 active:scale-[0.98] transition-all bg-surface-container-lowest/60 backdrop-blur-sm shadow-sm"} type={"button"} data-act={"explore-recent-activity"}>
              <span className={"material-symbols-outlined text-[20px]"}>
                history
              </span>
              <span>
                Explore recent activity
              </span>
            </button>
            <button onClick={onPlugClick} className={"w-full py-2.5 text-on-surface-variant hover:text-on-surface font-label-md text-label-md font-semibold transition-colors flex items-center justify-center gap-1"} type={"button"} data-act={"check-your-contributions"}>
              <span>
                Check your contributions
              </span>
              <span className={"material-symbols-outlined text-[16px]"}>
                chevron_right
              </span>
            </button>
          </div>
        </main>
        <nav className={"sticky bottom-0 left-0 right-0 z-50 w-full bg-surface-container-lowest/95 backdrop-blur-md shadow-[0_-4px_16px_rgba(28,25,23,0.06)] border-t border-outline-variant/30 pb-safe"}>
          <div className={"flex items-center justify-around h-16 px-1"}>
            <a onClick={onPlugClick} className={"flex flex-col items-center justify-center text-on-surface-variant hover:text-primary transition-colors px-2 py-1 flex-1 group"} href={"#"} data-act={"explore"}>
              <span className={"material-symbols-outlined text-[22px] group-active:scale-90 transition-transform"}>
                explore
              </span>
              <span className={"font-label-sm text-label-sm tracking-tight mt-1 text-on-surface-variant"}>
                Explore
              </span>
            </a>
            <a onClick={onPlugClick} className={"flex flex-col items-center justify-center text-on-surface-variant hover:text-primary transition-colors px-2 py-1 flex-1 group"} href={"#"} data-act={"garage"}>
              <span className={"material-symbols-outlined text-[22px] group-active:scale-90 transition-transform"}>
                directions_car
              </span>
              <span className={"font-label-sm text-label-sm tracking-tight mt-1 text-on-surface-variant"}>
                Garage
              </span>
            </a>
            <div className={"flex items-center justify-center flex-1 -mt-4"}>
              <button onClick={onPlugClick} aria-label={"Log Fuel"} className={"w-12 h-12 rounded-full bg-secondary hover:bg-primary text-on-secondary flex items-center justify-center shadow-[0_8px_16px_-2px_rgba(157,67,0,0.38)] active:scale-95 transition-all"} type={"button"} data-act={"local-gas-station"} data-way-out={"primary"}>
                <span className={"material-symbols-outlined text-[24px] fill"} style={{ fontVariationSettings: "'FILL' 1" }}>
                  local_gas_station
                </span>
              </button>
            </div>
            <a onClick={onPlugClick} className={"flex flex-col items-center justify-center text-on-surface-variant hover:text-primary transition-colors px-2 py-1 flex-1 group"} href={"#"} data-act={"map-it"}>
              <span className={"material-symbols-outlined text-[22px] group-active:scale-90 transition-transform"}>
                map
              </span>
              <span className={"font-label-sm text-label-sm tracking-tight mt-1 text-on-surface-variant"}>
                Map It
              </span>
            </a>
            <a onClick={onPlugClick} className={"flex flex-col items-center justify-center text-primary font-bold px-2 py-1 flex-1 group"} href={"#"} data-act={"account"}>
              <div className={"relative flex items-center justify-center"}>
                <span className={"material-symbols-outlined text-[22px] fill text-primary"} style={{ fontVariationSettings: "'FILL' 1" }}>
                  person
                </span>
                <span className={"absolute -top-0.5 -right-1 w-2 h-2 bg-secondary rounded-full ring-2 ring-surface-container-lowest"} />
              </div>
              <span className={"font-label-sm text-label-sm tracking-tight mt-1 text-primary font-bold"}>
                Account
              </span>
            </a>
          </div>
        </nav>
      </div>
    </div>
  );
}
