import { useEffect, useRef } from 'react';
import { onPlugClick } from '../../shell/actions';
import { bindScreen } from '../../shell/bind';


export function PartsStoreScreen() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (ref.current) bindScreen("20-parts-store.html", ref.current); }, []);
  return (
    <div ref={ref} data-plug-screen={"20-parts-store.html"} className={"min-h-full bg-surface text-on-surface antialiased flex flex-col font-body-md text-body-md"}>
      <header className={"fixed top-0 inset-x-0 z-50 bg-surface/85 backdrop-blur-xl shadow-[0_1px_8px_rgba(0,0,0,0.04)] pt-safe"}>
        <div className={"h-16 px-gutter-sm flex items-center justify-between gap-space-sm"}>
          <div className={"flex items-center min-w-0"}>
            <button onClick={onPlugClick} aria-label={"Go back"} className={"min-w-[48px] min-h-[48px] rounded-full flex items-center justify-center text-on-surface hover:text-primary active:bg-surface-container transition-colors"} data-act={"arrow-back"} data-way-out={"back"}>
              <span className={"material-symbols-outlined text-[24px]"}>
                arrow_back
              </span>
            </button>
            <h1 className={"font-headline-sm text-headline-sm text-on-surface truncate ml-1"}>
              Station Details
            </h1>
          </div>
          <div className={"flex items-center gap-space-xs"}>
            <button onClick={onPlugClick} aria-label={"Share location"} className={"min-w-[48px] min-h-[48px] rounded-full flex items-center justify-center text-on-surface-variant hover:text-primary active:bg-surface-container transition-colors"} data-act={"share"}>
              <span className={"material-symbols-outlined text-[22px]"}>
                share
              </span>
            </button>
            <div className={"w-8 h-8 rounded-full bg-primary flex items-center justify-center"}>
              <span className={"material-symbols-outlined text-on-primary text-[18px]"}>
                person
              </span>
            </div>
          </div>
        </div>
      </header>
      <main className={"flex-1 w-full bg-surface pt-16 pb-28"}>
        <div className={"flex flex-col w-full"}>
          <div className={"relative w-full h-56 bg-surface-container-high overflow-hidden"}>
            <div className={"w-full h-full bg-cover bg-center"} data-alt={"Interior of an active Kingston auto parts store counter, neatly stacked shelves of Japanese vehicle brake pads, suspension bushings, oil filters, and spark plug boxes under bright tropical daylight, warm orange ambient accents, vibrant automotive retail setting"} style={{ backgroundImage: "url('https://lh3.googleusercontent.com/aida-public/AB6AXuCv5Ie9_IL6IGILvnnttpA0k03QBfdq4-CeKaqBnfJ4P4ghGw7yWB6g5zIBsVn427-B-hxKP-NciUH8-Y4rFSLdAkk8v0Cfo2uWpivwm8GhjE9OgBnGctaTBGcmj1g9WOxn1yMKqKiNppN1WF2uYgSJYR0I3KiSctrP2g2UC4iybh1vJcO-ewATBHRkpXdkP3qWVCgxvNh70oLMh7MJpScbcC2n3E50bQwxARnrxA42K09kXyl3pEF4')" }} />
            <div className={"absolute inset-0 bg-gradient-to-t from-surface via-transparent to-black/30"} />
            <div className={"absolute top-space-md right-space-md flex items-center gap-space-xs"}>
              <span className={"px-space-sm py-1 rounded-full bg-surface-container-lowest/90 backdrop-blur-md text-primary font-label-md text-label-md shadow-sm flex items-center gap-1"}>
                <span className={"material-symbols-outlined text-[16px]"}>
                  verified
                </span>
                Roam Verified
              </span>
            </div>
            <div className={"absolute bottom-space-md left-space-md flex items-center gap-space-xs"}>
              <div className={"flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface-container-lowest shadow-md"}>
                <span className={"w-2.5 h-2.5 rounded-full bg-emerald-600 animate-pulse"} />
                <span className={"font-label-md text-label-md text-on-surface font-semibold"}>
                  Open Now
                </span>
                <span className={"text-on-surface-variant font-label-sm text-label-sm ml-1"}>
                  Closes 5:30 PM
                </span>
              </div>
            </div>
          </div>
          <div className={"px-space-md -mt-2 relative z-10 flex flex-col gap-space-md"}>
            <div className={"bg-surface-container-lowest rounded-xl p-space-md shadow-sm flex flex-col gap-space-sm"}>
              <div className={"flex items-start justify-between gap-space-sm"}>
                <div className={"flex flex-col"}>
                  <h2 className={"font-headline-md text-headline-md text-on-surface tracking-tight"}>
                    Mario's Auto Parts
                  </h2>
                  <span className={"font-label-lg text-label-lg text-primary font-semibold"}>
                    Constant Spring Branch
                  </span>
                </div>
                <div className={"w-12 h-12 rounded-xl bg-surface-container-low flex items-center justify-center shrink-0 shadow-sm"}>
                  <span className={"material-symbols-outlined text-primary text-[28px]"}>
                    storefront
                  </span>
                </div>
              </div>
              <div className={"flex items-start gap-space-xs text-on-surface-variant mt-1"}>
                <span className={"material-symbols-outlined text-[20px] text-primary shrink-0 mt-0.5"}>
                  location_on
                </span>
                <div className={"flex flex-col"}>
                  <p className={"font-body-md text-body-md text-on-surface font-medium leading-snug"}>
                    84 Constant Spring Road, Kingston 10
                  </p>
                  <p className={"font-body-sm text-body-sm text-on-surface-variant"}>
                    St. Andrew • Opposite Tax Office / Manor Park turnoff
                  </p>
                </div>
              </div>
              <div className={"flex flex-wrap items-center gap-space-xs pt-1"}>
                <button onClick={onPlugClick} aria-label={"Copy Plus Code"} className={"flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-container hover:bg-surface-container-high transition-colors active:scale-95"} id={"copy-plus-code-btn"} data-act={"copy-plus-code-btn"}>
                  <span className={"material-symbols-outlined text-[16px] text-secondary"}>
                    explore
                  </span>
                  <span className={"font-label-md text-label-md text-on-surface font-medium"} id={"plus-code-text"}>
                    7GQJ+9R Kingston
                  </span>
                  <span className={"material-symbols-outlined text-[15px] text-on-surface-variant ml-0.5"}>
                    content_copy
                  </span>
                </button>
                <div className={"flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-container text-on-surface-variant"}>
                  <span className={"material-symbols-outlined text-[16px]"}>
                    schedule
                  </span>
                  <span className={"font-label-md text-label-md"}>
                    Mon–Sat: 8:00 AM – 5:30 PM
                  </span>
                </div>
              </div>
              <div className={"grid grid-cols-2 gap-space-sm pt-space-xs mt-1"}>
                <a onClick={onPlugClick} className={"h-[52px] rounded-xl bg-surface-container-high active:bg-surface-container-highest flex items-center justify-center gap-2 px-3 text-on-surface font-label-lg text-label-lg font-bold shadow-sm transition-transform active:scale-98"} href={"tel:+18769264412"} data-act={"call-counter"}>
                  <span className={"material-symbols-outlined text-[22px] text-primary"} style={{ fontVariationSettings: "'FILL' 1" }}>
                    phone_in_talk
                  </span>
                  <span>
                    Call Counter
                  </span>
                </a>
                <a onClick={onPlugClick} className={"h-[52px] rounded-xl bg-gradient-to-r from-primary to-secondary-container active:brightness-95 flex items-center justify-center gap-2 px-3 text-on-primary font-label-lg text-label-lg font-bold shadow-md transition-transform active:scale-98"} href={"#map-preview"} data-act={"get-directions"}>
                  <span className={"material-symbols-outlined text-[22px]"}>
                    navigation
                  </span>
                  <span>
                    Get Directions
                  </span>
                </a>
              </div>
            </div>
            <div className={"bg-surface-container-lowest rounded-xl p-space-md shadow-sm flex flex-col gap-space-sm"}>
              <div className={"flex items-center gap-2"}>
                <div className={"w-8 h-8 rounded-lg bg-primary-fixed flex items-center justify-center"}>
                  <span className={"material-symbols-outlined text-primary text-[20px]"}>
                    build_circle
                  </span>
                </div>
                <div>
                  <h3 className={"font-headline-sm text-headline-sm text-on-surface"}>
                    Specialises in Japanese Imports
                  </h3>
                  <p className={"font-body-sm text-body-sm text-on-surface-variant"}>
                    {"OEM fitment & local taxi workhorse inventory"}
                  </p>
                </div>
              </div>
              <div className={"flex flex-col gap-space-sm pt-space-xs"}>
                <div className={"flex flex-col gap-1.5"}>
                  <span className={"font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider font-bold"}>
                    Top Supported Models
                  </span>
                  <div className={"flex flex-wrap gap-1.5"}>
                    <span className={"px-3 py-1.5 rounded-lg bg-surface-container-low font-label-md text-label-md text-on-surface font-semibold flex items-center gap-1"}>
                      <span className={"w-1.5 h-1.5 rounded-full bg-primary"} />
                      {"Toyota Axio & Fielder"}
                    </span>
                    <span className={"px-3 py-1.5 rounded-lg bg-surface-container-low font-label-md text-label-md text-on-surface font-semibold flex items-center gap-1"}>
                      <span className={"w-1.5 h-1.5 rounded-full bg-primary"} />
                      {"Toyota Probox & Succeed"}
                    </span>
                    <span className={"px-3 py-1.5 rounded-lg bg-surface-container-low font-label-md text-label-md text-on-surface font-semibold flex items-center gap-1"}>
                      <span className={"w-1.5 h-1.5 rounded-full bg-primary"} />
                      {"Honda Fit & Vezel"}
                    </span>
                    <span className={"px-3 py-1.5 rounded-lg bg-surface-container-low font-label-md text-label-md text-on-surface font-semibold flex items-center gap-1"}>
                      <span className={"w-1.5 h-1.5 rounded-full bg-primary"} />
                      {"Nissan AD Wagon & Note"}
                    </span>
                  </div>
                </div>
                <div className={"flex flex-col gap-1.5 pt-1"}>
                  <span className={"font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider font-bold"}>
                    In-Stock Component Types
                  </span>
                  <div className={"flex flex-wrap gap-1.5"}>
                    <span className={"px-2.5 py-1 rounded-full bg-surface-container-high font-label-md text-label-md text-on-surface"}>
                      Genuine Filters (Oil/Air)
                    </span>
                    <span className={"px-2.5 py-1 rounded-full bg-surface-container-high font-label-md text-label-md text-on-surface"}>
                      {"Poly & Rubber Bushings"}
                    </span>
                    <span className={"px-2.5 py-1 rounded-full bg-surface-container-high font-label-md text-label-md text-on-surface"}>
                      Ceramic Brake Pads
                    </span>
                    <span className={"px-2.5 py-1 rounded-full bg-surface-container-high font-label-md text-label-md text-on-surface"}>
                      {"CV Axles & Boots"}
                    </span>
                    <span className={"px-2.5 py-1 rounded-full bg-surface-container-high font-label-md text-label-md text-on-surface"}>
                      {"OEM Shocks & Struts"}
                    </span>
                    <span className={"px-2.5 py-1 rounded-full bg-surface-container-high font-label-md text-label-md text-on-surface"}>
                      Denso Iridium Plugs
                    </span>
                  </div>
                </div>
              </div>
            </div>
            <div className={"bg-surface-container-lowest rounded-xl overflow-hidden shadow-sm flex flex-col"} id={"map-preview"}>
              <div className={"w-full h-44 bg-cover bg-center relative"} data-location={"84 Constant Spring Road, Kingston, Jamaica"} style={{  }}>
                <div className={"absolute inset-0 bg-black/10"} />
                <div className={"absolute top-space-sm left-space-sm bg-surface-container-lowest/95 backdrop-blur-md px-3 py-1 rounded-full shadow-sm flex items-center gap-1.5 text-on-surface"}>
                  <span className={"material-symbols-outlined text-[16px] text-primary"}>
                    near_me
                  </span>
                  <span className={"font-label-md text-label-md font-bold"}>
                    1.8 km away
                  </span>
                </div>
                <div className={"absolute inset-0 flex items-center justify-center pointer-events-none"}>
                  <div className={"w-10 h-10 rounded-full bg-primary text-on-primary flex items-center justify-center shadow-xl animate-bounce"}>
                    <span className={"material-symbols-outlined text-[24px]"}>
                      storefront
                    </span>
                  </div>
                </div>
              </div>
              <div className={"p-space-md flex items-center justify-between gap-space-sm"}>
                <div className={"flex flex-col"}>
                  <span className={"font-headline-sm text-headline-sm text-on-surface"}>
                    Constant Spring Road Corridor
                  </span>
                  <span className={"font-body-sm text-body-sm text-on-surface-variant"}>
                    Direct road frontage with quick curbside pull-in parking
                  </span>
                </div>
                <a onClick={onPlugClick} aria-label={"Open in external maps"} className={"min-w-[48px] min-h-[48px] rounded-full bg-surface-container flex items-center justify-center text-primary hover:bg-surface-container-high transition-colors active:scale-95 shrink-0"} href={"https://maps.google.com/?q=84+Constant+Spring+Road+Kingston"} rel={"noopener noreferrer"} target={"_blank"} data-act={"open-in-new"}>
                  <span className={"material-symbols-outlined text-[24px]"}>
                    open_in_new
                  </span>
                </a>
              </div>
            </div>
            <div className={"bg-gradient-to-br from-tertiary-fixed via-tertiary-fixed/80 to-surface-container rounded-xl p-space-md shadow-sm relative overflow-hidden"}>
              <div className={"flex items-start gap-space-sm"}>
                <div className={"w-10 h-10 rounded-full bg-tertiary-container text-on-tertiary-container flex items-center justify-center shrink-0 shadow-sm"}>
                  <span className={"material-symbols-outlined text-[22px]"}>
                    shopping_cart_checkout
                  </span>
                </div>
                <div className={"flex flex-col gap-1"}>
                  <div className={"flex items-center gap-2"}>
                    <span className={"px-2 py-0.5 rounded-full bg-primary text-on-primary font-label-sm text-label-sm font-bold uppercase tracking-wide"}>
                      Coming Soon
                    </span>
                    <span className={"font-label-md text-label-md text-on-surface-variant font-bold"}>
                      Plug Direct
                    </span>
                  </div>
                  <h4 className={"font-headline-sm text-headline-sm text-on-surface leading-tight"}>
                    {"Order Online & Reserve at Counter"}
                  </h4>
                  <p className={"font-body-md text-body-md text-on-surface-variant mt-1 leading-relaxed"}>
                    Check live Japanese replacement stock in JMD, reserve front-counter pickup, and skip the Kingston midday queue directly inside Roam.
                  </p>
                  <div className={"pt-2"}>
                    <button onClick={onPlugClick} className={"h-10 px-4 rounded-lg bg-on-surface text-surface font-label-md text-label-md font-bold flex items-center gap-1.5 active:scale-95 transition-all"} id={"notify-btn"} data-act={"notify-btn"}>
                      <span className={"material-symbols-outlined text-[18px]"}>
                        notifications
                      </span>
                      <span>
                        Get Notified on Launch
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
            <div className={"bg-surface-container-low rounded-xl p-space-md flex flex-col gap-space-sm"}>
              <div className={"flex items-center gap-space-sm"}>
                <div className={"flex -space-x-2 overflow-hidden shrink-0"}>
                  <div className={"inline-block h-8 w-8 rounded-full ring-2 ring-surface bg-surface-container-high flex items-center justify-center text-primary font-label-sm text-label-sm font-bold"}>
                    JM
                  </div>
                  <div className={"inline-block h-8 w-8 rounded-full ring-2 ring-surface bg-secondary-fixed flex items-center justify-center text-on-secondary-fixed font-label-sm text-label-sm font-bold"}>
                    RT
                  </div>
                  <div className={"inline-block h-8 w-8 rounded-full ring-2 ring-surface bg-tertiary-fixed-dim flex items-center justify-center text-on-tertiary-fixed-variant font-label-sm text-label-sm font-bold"}>
                    AK
                  </div>
                </div>
                <div className={"flex flex-col"}>
                  <span className={"font-label-md text-label-md text-on-surface font-bold"}>
                    {"Verified by 8 Kingston mechanics & taxi operators"}
                  </span>
                  <span className={"font-body-sm text-body-sm text-on-surface-variant"}>
                    {"Recommended for accurate OEM specs & fair JMD pricing"}
                  </span>
                </div>
              </div>
              <div className={"flex items-center justify-between pt-space-xs text-on-surface-variant"}>
                <button onClick={onPlugClick} className={"flex items-center gap-1 font-label-md text-label-md text-on-surface-variant hover:text-primary transition-colors py-2"} data-act={"suggest-an-edit"}>
                  <span className={"material-symbols-outlined text-[16px]"}>
                    edit_note
                  </span>
                  <span>
                    Suggest an edit
                  </span>
                </button>
                <span className={"text-surface-container-highest"}>
                  •
                </span>
                <button onClick={onPlugClick} className={"flex items-center gap-1 font-label-md text-label-md text-error hover:opacity-80 transition-opacity py-2"} data-act={"report-incorrect-info"}>
                  <span className={"material-symbols-outlined text-[16px]"}>
                    report_problem
                  </span>
                  <span>
                    Report incorrect info
                  </span>
                </button>
              </div>
            </div>
          </div>
          <div className={"fixed bottom-24 inset-x-4 max-w-sm mx-auto bg-inverse-surface text-inverse-on-surface px-4 py-3 rounded-xl shadow-xl flex items-center justify-between gap-3 transform translate-y-32 opacity-0 pointer-events-none transition-all duration-300 z-50"} id={"feedback-toast"}>
            <div className={"flex items-center gap-2"}>
              <span className={"material-symbols-outlined text-primary-fixed-dim text-[20px]"} id={"toast-icon"}>
                check_circle
              </span>
              <span className={"font-body-md text-body-md"} id={"toast-msg"}>
                Saved to your Roam Garage alerts.
              </span>
            </div>
            <button onClick={onPlugClick} className={"text-inverse-on-surface/80 hover:text-inverse-on-surface"} data-act={"close"} data-way-out={"back"}>
              <span className={"material-symbols-outlined text-[18px]"}>
                close
              </span>
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
