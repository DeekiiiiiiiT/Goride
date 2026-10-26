import { useEffect, useRef } from 'react';
import { onPlugClick } from '../../shell/actions';
import { bindScreen } from '../../shell/bind';


export function FacilityScreen() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (ref.current) bindScreen("22-facility.html", ref.current); }, []);
  return (
    <div ref={ref} data-plug-screen={"22-facility.html"} className={"bg-surface font-body-md text-on-surface flex flex-col min-h-screen"}>
      <header className={"fixed top-0 w-full z-50 pt-safe bg-surface/80 backdrop-blur-xl shadow-[0_1px_8px_rgba(0,0,0,0.04)]"}>
        <div className={"h-16 px-margin flex items-center justify-between"}>
          <div className={"flex items-center gap-space-sm"}>
            <button onClick={onPlugClick} aria-label={"Back"} className={"w-12 h-12 flex items-center justify-center text-on-surface hover:text-primary rounded-full active:bg-surface-container transition-colors"} data-act={"arrow-back"} data-way-out={"back"}>
              <span className={"material-symbols-outlined text-[24px]"}>
                arrow_back
              </span>
            </button>
            <h1 className={"font-headline-sm text-headline-sm text-on-surface tracking-tight line-clamp-1"}>
              Gas Station Details
            </h1>
          </div>
          <div className={"flex items-center"}>
            <div className={"w-8 h-8 rounded-full bg-primary flex items-center justify-center"}>
              <span className={"material-symbols-outlined text-on-primary text-[18px]"}>
                person
              </span>
            </div>
          </div>
        </div>
      </header>
      <main className={"flex flex-col relative w-full pt-16 bg-surface flex-1"}>
        <div className={"flex flex-col w-full pb-safe"}>
          <div className={"fixed top-20 left-4 right-4 z-50 transform -translate-y-24 opacity-0 transition-all duration-300 pointer-events-none bg-inverse-surface text-inverse-on-surface rounded-xl p-space-md shadow-xl flex items-center gap-space-sm"} id={"toastNotification"}>
            <span className={"material-symbols-outlined text-secondary-fixed text-[24px]"} style={{ fontVariationSettings: "'FILL' 1" }}>
              check_circle
            </span>
            <p className={"font-body-md text-body-md font-semibold flex-1"} id={"toastMessage"}>
              Big up! Your confirmation keeps drivers moving.
            </p>
          </div>
          <div className={"px-margin pt-space-md flex flex-col gap-space-md"}>
            <div className={"bg-surface-container-high rounded-xl p-space-md flex items-center justify-between shadow-sm"}>
              <div className={"flex items-center gap-space-sm"}>
                <div className={"w-8 h-8 rounded-full bg-primary flex items-center justify-center shrink-0"}>
                  <span className={"material-symbols-outlined text-on-primary text-[18px]"} style={{ fontVariationSettings: "'FILL' 1" }}>
                    verified
                  </span>
                </div>
                <div className={"flex flex-col"}>
                  <span className={"font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider"}>
                    Driver Verified
                  </span>
                  <p className={"font-body-sm text-body-sm text-on-surface font-semibold"}>
                    Confirmed working 2 days ago by route operator Marcus T.
                  </p>
                </div>
              </div>
              <span className={"material-symbols-outlined text-outline text-[20px]"}>
                local_taxi
              </span>
            </div>
            <div className={"bg-surface-container-lowest rounded-xl p-space-md shadow-sm flex flex-col gap-space-sm"}>
              <div className={"flex items-start justify-between gap-space-sm"}>
                <div className={"w-14 h-14 rounded-xl bg-secondary-fixed flex items-center justify-center shrink-0"}>
                  <span className={"material-symbols-outlined text-on-secondary-fixed text-[32px]"} style={{ fontVariationSettings: "'FILL' 1" }}>
                    wc
                  </span>
                </div>
                <div className={"flex flex-col flex-1 min-w-0"}>
                  <div className={"flex items-center gap-space-xs"}>
                    <span className={"bg-primary/10 text-primary font-label-sm text-label-sm px-2 py-0.5 rounded-full font-bold"}>
                      St. Andrew Parish
                    </span>
                    <span className={"bg-surface-container text-on-surface-variant font-label-sm text-label-sm px-2 py-0.5 rounded-full"}>
                      Turnstile Entry
                    </span>
                  </div>
                  <h2 className={"font-headline-md text-headline-md text-on-surface font-bold mt-1 leading-snug"}>
                    
                  </h2>
                </div>
              </div>
              <div className={"flex flex-col gap-1 mt-1"}>
                <div className={"flex items-center gap-space-xs text-on-surface-variant"}>
                  <span className={"material-symbols-outlined text-[18px] shrink-0 text-primary"}>
                    pin_drop
                  </span>
                  <p className={"font-body-md text-body-md font-medium text-on-surface"}>
                    Clock Tower Roundabout, Half-Way-Tree
                  </p>
                </div>
                <div className={"flex items-center gap-space-sm mt-1"}>
                  <button onClick={onPlugClick} className={"flex items-center gap-1.5 bg-surface-container hover:bg-surface-container-high active:scale-95 transition-all px-3 py-1.5 rounded-lg w-fit"} id={"copyPlusCodeBtn"} data-act={"copyPlusCodeBtn"}>
                    <span className={"material-symbols-outlined text-[16px] text-primary"}>
                      tag
                    </span>
                    <span className={"font-label-md text-label-md font-semibold text-on-surface"} id={"plusCodeText"}>
                      7GQM+2X Kingston
                    </span>
                    <span className={"material-symbols-outlined text-[14px] text-outline ml-1"} id={"copyIcon"}>
                      content_copy
                    </span>
                  </button>
                  <span className={"font-body-sm text-body-sm text-on-surface-variant"}>
                    Standalone Motorist Facility
                  </span>
                </div>
              </div>
            </div>
            <a onClick={onPlugClick} className={"h-14 w-full bg-primary active:bg-on-primary-fixed-variant text-on-primary rounded-xl font-headline-sm text-headline-sm font-bold flex items-center justify-center gap-space-sm shadow-md active:scale-[0.99] transition-all"} href={"https://maps.google.com/?q=TotalEnergies+Half+Way+Tree+Clock+Tower"} rel={"noopener noreferrer"} target={"_blank"} data-act={"get-directions-now"} data-way-out={"primary"}>
              <span className={"material-symbols-outlined text-[24px]"}>
                directions
              </span>
              <span>
                Get Directions Now
              </span>
              <span className={"material-symbols-outlined text-[20px] opacity-80"}>
                arrow_forward
              </span>
            </a>
            <div className={"bg-surface-container-lowest rounded-xl p-space-md shadow-sm flex flex-col gap-space-xs"}>
              <div className={"flex items-center justify-between"}>
                <span className={"font-label-md text-label-md uppercase tracking-wider text-on-surface-variant"}>
                  Required Entry Fee
                </span>
                <span className={"material-symbols-outlined text-secondary text-[20px]"}>
                  payments
                </span>
              </div>
              <div className={"flex items-baseline gap-2"}>
                <span className={"font-display-lg-mobile text-display-lg-mobile font-extrabold text-primary"}>
                  
                </span>
                <span className={"font-body-md text-body-md text-on-surface-variant font-medium"}>
                  (pay attendant)
                </span>
              </div>
              <div className={"mt-2 bg-surface-container-low rounded-lg p-space-sm flex items-start gap-space-sm"}>
                <span className={"material-symbols-outlined text-secondary text-[20px] shrink-0 mt-0.5"}>
                  account_circle
                </span>
                <p className={"font-body-sm text-body-sm text-on-surface font-medium leading-relaxed"}>
                  Attendant stationed at entry turnstile. Exact cash preferred, small coin change available.
                </p>
              </div>
            </div>
            <div className={"grid grid-cols-2 gap-space-md"}>
              <div className={"bg-surface-container-lowest rounded-xl p-space-md shadow-sm flex flex-col justify-between"}>
                <div className={"flex items-center justify-between"}>
                  <span className={"material-symbols-outlined text-primary text-[22px]"}>
                    schedule
                  </span>
                  <span className={"bg-surface-container-high text-primary font-label-sm text-label-sm px-2 py-0.5 rounded-full font-bold"}>
                    Open Now
                  </span>
                </div>
                <div className={"mt-4"}>
                  <span className={"font-label-sm text-label-sm text-on-surface-variant uppercase"}>
                    Hours
                  </span>
                  <p className={"font-body-md text-body-md font-bold text-on-surface mt-0.5"}>
                    Open Daily
                  </p>
                  <p className={"font-body-sm text-body-sm text-on-surface-variant"}>
                    6:00 AM – 10:00 PM
                  </p>
                </div>
              </div>
              <div className={"bg-surface-container-lowest rounded-xl p-space-md shadow-sm flex flex-col justify-between"}>
                <div className={"flex items-center justify-between"}>
                  <span className={"material-symbols-outlined text-primary text-[22px]"} style={{ fontVariationSettings: "'FILL' 1" }}>
                    accessible
                  </span>
                  <span className={"bg-surface-container-high text-primary font-label-sm text-label-sm px-2 py-0.5 rounded-full font-bold"}>
                    Step-Free
                  </span>
                </div>
                <div className={"mt-4"}>
                  <span className={"font-label-sm text-label-sm text-on-surface-variant uppercase"}>
                    Accessibility
                  </span>
                  <p className={"font-body-md text-body-md font-bold text-on-surface mt-0.5"}>
                    {"Ramp & Wide Door"}
                  </p>
                  <p className={"font-body-sm text-body-sm text-on-surface-variant"}>
                    Ground-level access
                  </p>
                </div>
              </div>
            </div>
            <div className={"bg-surface-container-lowest rounded-xl p-space-md shadow-sm flex flex-col gap-space-sm"}>
              <div className={"flex items-center justify-between"}>
                <h3 className={"font-headline-sm text-headline-sm font-bold text-on-surface"}>
                  {"Cleanliness & Provisioning"}
                </h3>
                <span className={"font-label-sm text-label-sm text-primary font-bold"}>
                  5 of 5 Stocked
                </span>
              </div>
              <div className={"grid grid-cols-1 gap-2.5 mt-1"}>
                <div className={"flex items-center justify-between py-1 bg-surface-container-low px-3 rounded-lg"}>
                  <div className={"flex items-center gap-space-sm"}>
                    <span className={"material-symbols-outlined text-primary text-[20px]"}>
                      water_drop
                    </span>
                    <span className={"font-body-md text-body-md font-medium text-on-surface"}>
                      Pressurized Running Water
                    </span>
                  </div>
                  <span className={"material-symbols-outlined text-primary text-[20px]"} style={{ fontVariationSettings: "'FILL' 1" }}>
                    check_circle
                  </span>
                </div>
                <div className={"flex items-center justify-between py-1 bg-surface-container-low px-3 rounded-lg"}>
                  <div className={"flex items-center gap-space-sm"}>
                    <span className={"material-symbols-outlined text-primary text-[20px]"}>
                      soap
                    </span>
                    <span className={"font-body-md text-body-md font-medium text-on-surface"}>
                      Refilled Soap Dispensers
                    </span>
                  </div>
                  <span className={"material-symbols-outlined text-primary text-[20px]"} style={{ fontVariationSettings: "'FILL' 1" }}>
                    check_circle
                  </span>
                </div>
                <div className={"flex items-center justify-between py-1 bg-surface-container-low px-3 rounded-lg"}>
                  <div className={"flex items-center gap-space-sm"}>
                    <span className={"material-symbols-outlined text-primary text-[20px]"}>
                      dry
                    </span>
                    <span className={"font-body-md text-body-md font-medium text-on-surface"}>
                      Hand Paper Towels
                    </span>
                  </div>
                  <span className={"material-symbols-outlined text-primary text-[20px]"} style={{ fontVariationSettings: "'FILL' 1" }}>
                    check_circle
                  </span>
                </div>
                <div className={"flex items-center justify-between py-1 bg-surface-container-low px-3 rounded-lg"}>
                  <div className={"flex items-center gap-space-sm"}>
                    <span className={"material-symbols-outlined text-primary text-[20px]"}>
                      crop_portrait
                    </span>
                    <span className={"font-body-md text-body-md font-medium text-on-surface"}>
                      Full-Length Wall Mirror
                    </span>
                  </div>
                  <span className={"material-symbols-outlined text-primary text-[20px]"} style={{ fontVariationSettings: "'FILL' 1" }}>
                    check_circle
                  </span>
                </div>
                <div className={"flex items-center justify-between py-1 bg-surface-container-low px-3 rounded-lg"}>
                  <div className={"flex items-center gap-space-sm"}>
                    <span className={"material-symbols-outlined text-primary text-[20px]"}>
                      door_sliding
                    </span>
                    <span className={"font-body-md text-body-md font-medium text-on-surface"}>
                      {"Separate Male & Female Stalls"}
                    </span>
                  </div>
                  <span className={"material-symbols-outlined text-primary text-[20px]"} style={{ fontVariationSettings: "'FILL' 1" }}>
                    check_circle
                  </span>
                </div>
              </div>
            </div>
            <div className={"bg-surface-container-lowest rounded-xl p-space-md shadow-sm flex flex-col gap-space-sm"}>
              <div className={"flex items-center justify-between"}>
                <h3 className={"font-headline-sm text-headline-sm font-bold text-on-surface"}>
                  Roundabout Approach View
                </h3>
                <span className={"font-label-sm text-label-sm text-on-surface-variant"}>
                  Station Perimeter
                </span>
              </div>
              <div className={"relative w-full h-44 rounded-lg overflow-hidden bg-surface-container"}>
                <div className={"w-full h-full object-cover bg-surface-container flex items-center justify-center text-primary"} aria-hidden={"true"}><span className={"material-symbols-outlined text-[32px]"}>image</span></div>
                <div className={"absolute bottom-2 left-2 bg-surface/90 backdrop-blur-md px-2.5 py-1 rounded-md flex items-center gap-1.5 shadow-sm"}>
                  <span className={"material-symbols-outlined text-[16px] text-primary"}>
                    visibility
                  </span>
                  <span className={"font-label-md text-label-md font-semibold text-on-surface"}>
                    Located behind convenience mart
                  </span>
                </div>
              </div>
            </div>
            <div className={"bg-surface-container-high rounded-xl p-space-md shadow-sm flex flex-col gap-space-sm"} id={"crowdsourceWidget"}>
              <div className={"flex items-center gap-space-sm"}>
                <div className={"w-9 h-9 rounded-full bg-secondary-fixed flex items-center justify-center shrink-0"}>
                  <span className={"material-symbols-outlined text-on-secondary-fixed text-[20px]"}>
                    live_help
                  </span>
                </div>
                <div>
                  <h4 className={"font-headline-sm text-headline-sm font-bold text-on-surface leading-tight"}>
                    Still active today?
                  </h4>
                  <p className={"font-body-sm text-body-sm text-on-surface-variant"}>
                    Is this amenity open and working right now?
                  </p>
                </div>
              </div>
              <div className={"grid grid-cols-2 gap-space-sm mt-1"} id={"verificationButtons"}>
                <button onClick={onPlugClick} className={"h-12 bg-primary hover:bg-on-primary-fixed-variant active:scale-95 transition-all text-on-primary rounded-xl font-label-lg text-label-lg font-bold flex items-center justify-center gap-2 shadow-sm"} data-act={"yes-it-s-here"} data-way-out={"primary"}>
                  <span className={"material-symbols-outlined text-[20px]"}>
                    thumb_up
                  </span>
                  <span>
                    Yes, it's here
                  </span>
                </button>
                <button onClick={onPlugClick} className={"h-12 bg-surface-container-lowest hover:bg-surface-container active:scale-95 transition-all text-on-surface rounded-xl font-label-lg text-label-lg font-semibold flex items-center justify-center gap-2"} data-act={"no-longer-here"}>
                  <span className={"material-symbols-outlined text-[20px] text-outline"}>
                    thumb_down
                  </span>
                  <span>
                    No longer here
                  </span>
                </button>
              </div>
              <div className={"flex items-center gap-1.5 pt-1 text-on-surface-variant"}>
                <span className={"material-symbols-outlined text-[16px] text-primary shrink-0"}>
                  volunteer_activism
                </span>
                <p className={"font-body-sm text-body-sm leading-tight"}>
                  Driver verifications help keep Jamaican road pins reliable for everyone.
                </p>
              </div>
            </div>
            <div className={"bg-surface-container-lowest rounded-xl p-space-md shadow-sm flex flex-col gap-space-sm mb-4"}>
              <div className={"flex flex-col gap-2"}>
                <button onClick={onPlugClick} className={"flex items-center justify-between py-2 text-left active:opacity-70 transition-opacity"} data-act={"suggest-an-edit-to-hours-or-setup"}>
                  <div className={"flex items-center gap-space-sm"}>
                    <span className={"material-symbols-outlined text-outline text-[20px]"}>
                      edit_note
                    </span>
                    <span className={"font-body-md text-body-md font-semibold text-on-surface"}>
                      Suggest an edit to hours or setup
                    </span>
                  </div>
                  <span className={"material-symbols-outlined text-outline text-[18px]"}>
                    chevron_right
                  </span>
                </button>
                <button onClick={onPlugClick} className={"flex items-center justify-between py-2 text-left active:opacity-70 transition-opacity"} data-act={"report-issue-or-rate-adjustment"}>
                  <div className={"flex items-center gap-space-sm"}>
                    <span className={"material-symbols-outlined text-outline text-[20px]"}>
                      price_change
                    </span>
                    <span className={"font-body-md text-body-md font-semibold text-on-surface"}>
                      Report issue or rate adjustment
                    </span>
                  </div>
                  <span className={"material-symbols-outlined text-outline text-[18px]"}>
                    chevron_right
                  </span>
                </button>
              </div>
              <div className={"bg-surface-container rounded-lg p-space-sm flex items-center gap-space-sm mt-1"}>
                <span className={"material-symbols-outlined text-primary text-[20px] shrink-0"}>
                  person_pin
                </span>
                <p className={"font-body-sm text-body-sm text-on-surface-variant"}>
                  Facility pin added by Roam community member
                  <span className={"font-semibold text-on-surface"}>
                    Kemar W.
                  </span>
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
