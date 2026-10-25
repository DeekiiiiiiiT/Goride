import { useEffect, useRef } from 'react';
import { onPlugClick } from '../../shell/actions';
import { bindScreen } from '../../shell/bind';


export function DocumentsScreen() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (ref.current) bindScreen("36-documents.html", ref.current); }, []);
  return (
    <div ref={ref} data-plug-screen={"36-documents.html"} className={"bg-surface font-body-md text-on-surface min-h-screen flex flex-col antialiased selection:bg-primary/20 selection:text-primary"}>
      <header className={"fixed top-0 w-full z-50 bg-surface/85 backdrop-blur-xl shadow-[0_1px_8px_rgba(28,25,23,0.04)] pt-safe"}>
        <div className={"h-16 px-space-sm flex items-center justify-between"}>
          <div className={"flex items-center gap-space-xs"}>
            <button onClick={onPlugClick} aria-label={"Go Back"} className={"w-11 h-11 flex items-center justify-center rounded-full text-on-surface hover:text-primary hover:bg-surface-container active:scale-95 transition-all"} data-act={"arrow-back"} data-way-out={"back"}>
              <span className={"material-symbols-outlined text-[24px]"}>
                arrow_back
              </span>
            </button>
            <h1 className={"font-headline-md text-headline-md text-on-surface tracking-tight font-headline-md line-clamp-1"}>
              {"Documents & Renewals"}
            </h1>
          </div>
          <div className={"flex items-center gap-space-xs"}>
            <button onClick={onPlugClick} aria-label={"Share Vehicle"} className={"w-11 h-11 flex items-center justify-center rounded-full text-on-surface-variant hover:text-primary hover:bg-surface-container active:scale-95 transition-all"} data-act={"share"}>
              <span className={"material-symbols-outlined text-[22px]"}>
                share
              </span>
            </button>
            <button onClick={onPlugClick} aria-label={"More Options"} className={"w-11 h-11 flex items-center justify-center rounded-full text-on-surface-variant hover:text-primary hover:bg-surface-container active:scale-95 transition-all"} data-act={"more-vert"}>
              <span className={"material-symbols-outlined text-[22px]"}>
                more_vert
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
      <main className={"flex-1 w-full bg-surface pt-16 pb-safe"}>
        <div className={"flex flex-col w-full px-space-md pb-space-xl gap-space-lg"}>
          <div className={"flex flex-col gap-space-xs mt-space-sm"}>
            <div className={"flex items-center justify-between"}>
              <div className={"flex items-center gap-space-xs text-primary"}>
                <span className={"material-symbols-outlined text-[20px]"} style={{ fontVariationSettings: "'FILL' 1" }}>
                  verified_user
                </span>
                <span className={"font-label-md text-label-md uppercase tracking-wider font-bold"}>
                  Island Road Compliance
                </span>
              </div>
              <span className={"font-label-sm text-label-sm bg-surface-container text-on-surface-variant px-space-sm py-1 rounded-full flex items-center gap-1"}>
                <span className={"w-1.5 h-1.5 rounded-full bg-primary animate-pulse"} />
                
              </span>
            </div>
            <p className={"font-body-md text-body-md text-on-surface-variant"}>
              {"Jamaica statutory motoring compliance & reminders"}
            </p>
            <div className={"flex items-center justify-between bg-surface-container-low p-space-sm rounded-xl mt-space-xs shadow-sm"}>
              <div className={"flex items-center gap-space-sm min-w-0"}>
                <div className={"w-10 h-10 rounded-lg bg-surface-container-highest flex items-center justify-center text-primary flex-shrink-0"}>
                  <span className={"material-symbols-outlined text-[22px]"}>
                    directions_car
                  </span>
                </div>
                <div className={"flex flex-col min-w-0"}>
                  <span className={"font-label-sm text-label-sm text-on-surface-variant font-medium"}>
                    {"Active Vehicle & Operator"}
                  </span>
                  <span className={"font-headline-sm text-headline-sm text-on-surface truncate"} data-slot={"car"}>
                    Add a car<span className={"font-body-sm text-body-sm text-on-surface-variant font-normal"}>
                      
                    </span>
                  </span>
                </div>
              </div>
              <button onClick={onPlugClick} aria-label={"Switch Vehicle"} className={"w-9 h-9 flex items-center justify-center rounded-full bg-surface-container text-on-surface hover:text-primary transition-all flex-shrink-0"} data-act={"swap-horiz"}>
                <span className={"material-symbols-outlined text-[20px]"}>
                  swap_horiz
                </span>
              </button>
            </div>
          </div>
          <div className={"bg-gradient-to-r from-surface-container via-surface-container-low to-surface-container p-space-md rounded-xl flex flex-col gap-space-sm shadow-sm"}>
            <div className={"flex items-center justify-between"}>
              <div className={"flex items-center gap-space-xs"}>
                <span className={"material-symbols-outlined text-primary text-[20px]"}>
                  shield_with_heart
                </span>
                <span className={"font-label-lg text-label-lg text-on-surface font-bold"}>
                  Motoring Fitness Score
                </span>
              </div>
              <span className={"font-label-md text-label-md font-bold px-2 py-0.5 rounded-full bg-error-container text-on-error-container"}>
                1 Attention Needed
              </span>
            </div>
            <div className={"w-full grid grid-cols-4 gap-1.5 h-2 rounded-full overflow-hidden bg-surface-container-highest"}>
              <div className={"bg-emerald-600 rounded-sm"} title={"Licence: Valid"} />
              <div className={"bg-amber-500 rounded-sm"} title={"Tax Disc: Expiring soon"} />
              <div className={"bg-amber-500 rounded-sm"} title={"Fitness: Expiring soon"} />
              <div className={"bg-error rounded-sm animate-pulse"} title={"Insurance: Overdue"} />
            </div>
            <div className={"flex items-center justify-between text-on-surface-variant font-body-sm text-body-sm pt-0.5"}>
              <span>
                3 active covers
              </span>
              <span className={"text-error font-medium flex items-center gap-1"}>
                <span className={"material-symbols-outlined text-[16px]"}>
                  error
                </span>
                
              </span>
            </div>
          </div>
          <div className={"flex flex-col gap-space-md"}>
            <div className={"bg-surface-container-lowest rounded-xl p-space-md shadow-sm flex flex-col gap-space-sm relative overflow-hidden transition-transform active:scale-[0.99]"}>
              <div className={"flex items-start justify-between gap-space-sm"}>
                <div className={"flex items-center gap-space-sm min-w-0"}>
                  <div className={"w-11 h-11 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center flex-shrink-0 shadow-sm"}>
                    <span className={"material-symbols-outlined text-[24px]"}>
                      badge
                    </span>
                  </div>
                  <div className={"flex flex-col min-w-0"}>
                    <h2 className={"font-headline-sm text-headline-sm text-on-surface truncate"}>
                      Driver's Licence
                    </h2>
                    <span className={"font-body-sm text-body-sm text-on-surface-variant truncate"}>
                      Tax Administration Jamaica (TAJ)
                    </span>
                  </div>
                </div>
                <span className={"font-label-md text-label-md bg-emerald-100 text-emerald-800 px-space-sm py-1 rounded-full font-bold flex items-center gap-1 flex-shrink-0"}>
                  <span className={"material-symbols-outlined text-[14px]"}>
                    check_circle
                  </span>
                  Valid
                </span>
              </div>
              <div className={"grid grid-cols-2 gap-space-sm bg-surface-container-low p-space-sm rounded-lg"}>
                <div className={"flex flex-col"}>
                  <span className={"font-label-sm text-label-sm text-on-surface-variant"}>
                    Expiry Date
                  </span>
                  <span className={"font-label-lg text-label-lg text-on-surface font-semibold"}>
                    Not set
                  </span>
                </div>
                <div className={"flex flex-col"}>
                  <span className={"font-label-sm text-label-sm text-on-surface-variant"}>
                    Time Remaining
                  </span>
                  <span className={"font-label-lg text-label-lg text-emerald-700 font-semibold"}>
                    Not set
                  </span>
                </div>
              </div>
              <div className={"flex items-center justify-between pt-space-xs gap-space-xs"}>
                <span className={"font-body-sm text-body-sm text-on-surface-variant bg-surface-container px-space-sm py-1.5 rounded-lg flex items-center gap-1"}>
                  <span className={"material-symbols-outlined text-[16px] text-primary"}>
                    notifications_active
                  </span>
                  {"30d & 7d before"}
                </span>
                <button onClick={onPlugClick} className={"h-10 px-space-md rounded-lg bg-surface-container text-on-surface font-label-md text-label-md font-bold hover:bg-surface-container-high transition-colors flex items-center gap-1.5"} data-act={"view-digital-copy"}>
                  <span className={"material-symbols-outlined text-[18px]"}>
                    visibility
                  </span>
                  View Digital Copy
                </button>
              </div>
            </div>
            <div className={"bg-surface-container-lowest rounded-xl p-space-md shadow-sm flex flex-col gap-space-sm relative overflow-hidden transition-transform active:scale-[0.99]"}>
              <div className={"flex items-start justify-between gap-space-sm"}>
                <div className={"flex items-center gap-space-sm min-w-0"}>
                  <div className={"w-11 h-11 rounded-lg bg-amber-50 text-amber-800 flex items-center justify-center flex-shrink-0 shadow-sm"}>
                    <span className={"material-symbols-outlined text-[24px]"}>
                      local_police
                    </span>
                  </div>
                  <div className={"flex flex-col min-w-0"}>
                    <h2 className={"font-headline-sm text-headline-sm text-on-surface truncate"}>
                      Registration (Tax Disc)
                    </h2>
                    <span className={"font-body-sm text-body-sm text-on-surface-variant truncate"}>
                      TAJ Motor Vehicle Licensing
                    </span>
                  </div>
                </div>
                <span className={"font-label-md text-label-md bg-amber-100 text-amber-900 px-space-sm py-1 rounded-full font-bold flex items-center gap-1 flex-shrink-0"}>
                  <span className={"material-symbols-outlined text-[14px]"}>
                    timelapse
                  </span>
                  Expiring Soon
                </span>
              </div>
              <div className={"grid grid-cols-2 gap-space-sm bg-surface-container-low p-space-sm rounded-lg"}>
                <div className={"flex flex-col"}>
                  <span className={"font-label-sm text-label-sm text-on-surface-variant"}>
                    Expiry Date
                  </span>
                  <span className={"font-label-lg text-label-lg text-on-surface font-semibold"}>
                    Not set
                  </span>
                </div>
                <div className={"flex flex-col"}>
                  <span className={"font-label-sm text-label-sm text-on-surface-variant"}>
                    Time Remaining
                  </span>
                  <span className={"font-label-lg text-label-lg text-secondary font-semibold"}>
                    Expires in 45 days
                  </span>
                </div>
              </div>
              <div className={"flex items-center justify-between pt-space-xs gap-space-xs flex-wrap"}>
                <span className={"font-body-sm text-body-sm text-on-surface-variant bg-surface-container px-space-sm py-1.5 rounded-lg flex items-center gap-1"}>
                  <span className={"material-symbols-outlined text-[16px] text-primary"}>
                    notifications_active
                  </span>
                  30d, 14d, 3d before
                </span>
                <button onClick={onPlugClick} className={"h-10 px-space-md rounded-lg bg-primary-fixed text-on-primary-fixed-variant font-label-md text-label-md font-bold hover:bg-primary-fixed-dim transition-colors flex items-center gap-1"} data-act={"renew-online-via-taj"} data-way-out={"primary"}>
                  <span>
                    Renew Online via TAJ
                  </span>
                  <span className={"material-symbols-outlined text-[16px]"}>
                    arrow_forward
                  </span>
                </button>
              </div>
            </div>
            <div className={"bg-surface-container-lowest rounded-xl p-space-md shadow-sm flex flex-col gap-space-sm relative overflow-hidden transition-transform active:scale-[0.99]"}>
              <div className={"flex items-start justify-between gap-space-sm"}>
                <div className={"flex items-center gap-space-sm min-w-0"}>
                  <div className={"w-11 h-11 rounded-lg bg-secondary-fixed text-on-secondary-fixed-variant flex items-center justify-center flex-shrink-0 shadow-sm"}>
                    <span className={"material-symbols-outlined text-[24px]"}>
                      car_repair
                    </span>
                  </div>
                  <div className={"flex flex-col min-w-0"}>
                    <h2 className={"font-headline-sm text-headline-sm text-on-surface truncate"}>
                      Certificate of Fitness
                    </h2>
                    <span className={"font-body-sm text-body-sm text-on-surface-variant truncate"}>
                      ITA Swallowfield Depot
                    </span>
                  </div>
                </div>
                <span className={"font-label-md text-label-md bg-secondary-fixed text-on-secondary-fixed-variant px-space-sm py-1 rounded-full font-bold flex items-center gap-1 flex-shrink-0"}>
                  <span className={"material-symbols-outlined text-[14px]"}>
                    notification_important
                  </span>
                  Action Required
                </span>
              </div>
              <div className={"grid grid-cols-2 gap-space-sm bg-surface-container-low p-space-sm rounded-lg"}>
                <div className={"flex flex-col"}>
                  <span className={"font-label-sm text-label-sm text-on-surface-variant"}>
                    Expiry Date
                  </span>
                  <span className={"font-label-lg text-label-lg text-on-surface font-semibold"}>
                    Not set
                  </span>
                </div>
                <div className={"flex flex-col"}>
                  <span className={"font-label-sm text-label-sm text-on-surface-variant"}>
                    Urgency
                  </span>
                  <span className={"font-label-lg text-label-lg text-secondary font-semibold"}>
                    Expires in 21 days
                  </span>
                </div>
              </div>
              <div className={"flex flex-col gap-space-xs pt-space-xs"}>
                <div className={"flex items-center justify-between text-on-surface-variant"}>
                  <span className={"font-body-sm text-body-sm bg-surface-container px-space-sm py-1 rounded-lg flex items-center gap-1"}>
                    <span className={"material-symbols-outlined text-[16px] text-primary"}>
                      notifications_active
                    </span>
                    30d, 14d, 7d, 1d
                  </span>
                  <span className={"font-body-sm text-body-sm text-on-surface-variant"}>
                    {"Kingston & St. Andrew"}
                  </span>
                </div>
                <button onClick={onPlugClick} className={"w-full min-h-[48px] rounded-lg bg-secondary text-on-secondary font-label-lg text-label-lg font-bold flex items-center justify-center gap-space-xs shadow-md active:opacity-90 transition-all"} data-act={"book-inspection-at-swallowfield"}>
                  <span className={"material-symbols-outlined text-[20px]"}>
                    calendar_month
                  </span>
                  Book Inspection at Swallowfield
                </button>
              </div>
            </div>
            <div className={"bg-surface-container-lowest rounded-xl p-space-md shadow-md flex flex-col gap-space-sm relative overflow-hidden bg-gradient-to-b from-error-container/20 to-surface-container-lowest"}>
              <div className={"flex items-start justify-between gap-space-sm"}>
                <div className={"flex items-center gap-space-sm min-w-0"}>
                  <div className={"w-11 h-11 rounded-lg bg-error-container text-on-error-container flex items-center justify-center flex-shrink-0 shadow-sm animate-pulse"}>
                    <span className={"material-symbols-outlined text-[24px]"}>
                      emergency
                    </span>
                  </div>
                  <div className={"flex flex-col min-w-0"}>
                    <div className={"flex items-center gap-1"}>
                      <h2 className={"font-headline-sm text-headline-sm text-on-surface truncate"}>
                        Vehicle Insurance
                      </h2>
                    </div>
                    <span className={"font-body-sm text-body-sm text-on-surface-variant truncate"}>
                      Advantage General (Comprehensive)
                    </span>
                  </div>
                </div>
                <span className={"font-label-md text-label-md bg-error text-on-error px-space-sm py-1 rounded-full font-bold flex items-center gap-1 flex-shrink-0 shadow-sm"}>
                  <span className={"material-symbols-outlined text-[14px]"}>
                    warning
                  </span>
                  Overdue
                </span>
              </div>
              <div className={"grid grid-cols-2 gap-space-sm bg-error-container/30 p-space-sm rounded-lg"}>
                <div className={"flex flex-col"}>
                  <span className={"font-label-sm text-label-sm text-on-surface-variant font-medium"}>
                    Policy No.
                  </span>
                  <span className={"font-label-lg text-label-lg text-on-surface font-bold tracking-tight"}>
                    POL-88219-JM
                  </span>
                </div>
                <div className={"flex flex-col"}>
                  <span className={"font-label-sm text-label-sm text-error font-medium"}>
                    Not set
                  </span>
                  <span className={"font-label-lg text-label-lg text-error font-extrabold"}>
                    Expired 3 days ago!
                  </span>
                </div>
              </div>
              <div className={"flex items-center gap-1.5 text-error font-body-sm text-body-sm font-semibold px-1"}>
                <span className={"material-symbols-outlined text-[18px]"}>
                  announcement
                </span>
                <span>
                  ⚠️ Urgent Reminder Active • Vehicle not road legal
                </span>
              </div>
              <div className={"flex gap-space-xs pt-space-xs"}>
                <button onClick={onPlugClick} className={"flex-1 min-h-[48px] rounded-lg bg-primary text-on-primary font-label-lg text-label-lg font-bold flex items-center justify-center gap-space-xs shadow-md active:opacity-90 transition-all"} data-act={"call-broker-renew"} data-way-out={"primary"}>
                  <span className={"material-symbols-outlined text-[20px]"}>
                    phone_in_talk
                  </span>
                  Call Broker / Renew
                </button>
                <button onClick={onPlugClick} aria-label={"Upload Insurance Cover Note"} className={"w-12 h-12 rounded-lg bg-surface-container text-on-surface flex items-center justify-center hover:bg-surface-container-high transition-colors flex-shrink-0"} data-act={"upload-file"}>
                  <span className={"material-symbols-outlined text-[20px]"}>
                    upload_file
                  </span>
                </button>
              </div>
            </div>
          </div>
          <div className={"bg-surface-container-low rounded-xl p-space-md flex flex-col gap-space-sm"}>
            <div className={"flex items-center justify-between"}>
              <h3 className={"font-headline-sm text-headline-sm text-on-surface"}>
                Compliance Checklist
              </h3>
              <span className={"font-label-sm text-label-sm text-on-surface-variant"}>
                Road Traffic Act 2018
              </span>
            </div>
            <div className={"grid grid-cols-3 gap-space-xs text-center"}>
              <div className={"bg-surface-container p-space-sm rounded-lg flex flex-col items-center gap-1"}>
                <span className={"material-symbols-outlined text-emerald-700 text-[22px]"}>
                  contact_emergency
                </span>
                <span className={"font-label-sm text-label-sm font-bold text-on-surface"}>
                  Licence
                </span>
                <span className={"font-body-sm text-body-sm text-emerald-700 font-semibold"}>
                  Ready
                </span>
              </div>
              <div className={"bg-surface-container p-space-sm rounded-lg flex flex-col items-center gap-1"}>
                <span className={"material-symbols-outlined text-amber-700 text-[22px]"}>
                  fact_check
                </span>
                <span className={"font-label-sm text-label-sm font-bold text-on-surface"}>
                  Fitness
                </span>
                <span className={"font-body-sm text-body-sm text-amber-700 font-semibold"}>
                  21d Left
                </span>
              </div>
              <div className={"bg-surface-container p-space-sm rounded-lg flex flex-col items-center gap-1"}>
                <span className={"material-symbols-outlined text-error text-[22px]"}>
                  shield_lock
                </span>
                <span className={"font-label-sm text-label-sm font-bold text-on-surface"}>
                  Insurance
                </span>
                <span className={"font-body-sm text-body-sm text-error font-semibold"}>
                  Lapsed
                </span>
              </div>
            </div>
          </div>
          <button onClick={onPlugClick} className={"w-full min-h-[52px] rounded-xl bg-gradient-to-r from-primary to-secondary text-on-primary font-label-lg text-label-lg font-bold flex items-center justify-center gap-space-sm shadow-md active:scale-[0.99] transition-all"} id={"add-doc-btn"} data-act={"add-doc-btn"}>
            <span className={"material-symbols-outlined text-[24px]"}>
              add_circle
            </span>
            + Add Document or Reminder
          </button>
          <div className={"hidden bg-inverse-surface text-inverse-on-surface p-space-md rounded-xl flex items-center justify-between shadow-xl"} id={"quick-action-toast"}>
            <div className={"flex items-center gap-space-sm"}>
              <span className={"material-symbols-outlined text-primary-fixed"}>
                document_scanner
              </span>
              <span className={"font-body-md text-body-md"}>
                Camera scanner loaded. Ready for disc or cover note.
              </span>
            </div>
            <button onClick={onPlugClick} className={"text-primary-fixed font-label-md text-label-md font-bold px-2 py-1"} id={"close-toast"} data-act={"close-toast"}>
              OK
            </button>
          </div>
          <div className={"bg-surface-container rounded-xl p-space-md flex items-start gap-space-md shadow-sm"}>
            <div className={"w-10 h-10 rounded-full bg-surface-container-highest flex items-center justify-center text-primary flex-shrink-0 mt-0.5"}>
              <span className={"material-symbols-outlined text-[22px]"} style={{ fontVariationSettings: "'FILL' 1" }}>
                enhanced_encryption
              </span>
            </div>
            <div className={"flex flex-col gap-1"}>
              <div className={"flex items-center gap-1 text-on-surface"}>
                <span className={"font-label-lg text-label-lg font-bold"}>
                  {"Privacy & Vault Guarantee"}
                </span>
              </div>
              <p className={"font-body-sm text-body-sm text-on-surface-variant leading-relaxed"}>
                Stored privately on your device and encrypted account. Never shared with third parties or tax authorities without your consent.
              </p>
            </div>
          </div>
          <div className={"flex items-center justify-around py-space-xs text-on-surface-variant text-body-sm font-body-sm"}>
            <button onClick={onPlugClick} className={"flex items-center gap-1 hover:text-primary transition-colors"} data-act={"taj-portal-faqs"}>
              <span className={"material-symbols-outlined text-[18px]"}>
                help_center
              </span>
              TAJ Portal FAQs
            </button>
            <span className={"text-outline-variant"}>
              •
            </span>
            <button onClick={onPlugClick} className={"flex items-center gap-1 hover:text-primary transition-colors"} data-act={"ita-depots-list"}>
              <span className={"material-symbols-outlined text-[18px]"}>
                call
              </span>
              ITA Depots List
            </button>
            <span className={"text-outline-variant"}>
              •
            </span>
            <button onClick={onPlugClick} className={"flex items-center gap-1 hover:text-primary transition-colors"} data-act={"notification-rules"}>
              <span className={"material-symbols-outlined text-[18px]"}>
                tune
              </span>
              Notification Rules
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
