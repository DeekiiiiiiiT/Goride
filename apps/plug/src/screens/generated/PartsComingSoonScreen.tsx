import { useEffect, useRef } from 'react';
import { onPlugClick } from '../../shell/actions';
import { bindScreen } from '../../shell/bind';


export function PartsComingSoonScreen() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (ref.current) bindScreen("41-parts-coming-soon.html", ref.current); }, []);
  return (
    <div ref={ref} data-plug-screen={"41-parts-coming-soon.html"} className={"bg-surface font-body-md text-on-surface flex flex-col min-h-screen"}>
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
                Parts Coming Soon
              </h1>
              <span className={"font-label-md text-label-md text-on-surface-variant truncate"}>
                2019 Toyota Roomy
              </span>
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
        <div className={"flex flex-col w-full pb-safe"}>
          <div className={"relative w-full overflow-hidden rounded-xl bg-surface-container p-space-lg shadow-sm mt-space-sm mb-space-md text-center flex flex-col items-center justify-center"}>
            <div className={"absolute -top-10 -right-10 w-44 h-44 rounded-full bg-secondary-container/15 blur-2xl pointer-events-none"} />
            <div className={"absolute -bottom-10 -left-10 w-44 h-44 rounded-full bg-primary/10 blur-2xl pointer-events-none"} />
            <div className={"relative z-10 w-24 h-24 mb-space-md flex items-center justify-center"}>
              <div className={"absolute inset-0 rounded-full bg-surface-container-lowest shadow-md flex items-center justify-center transform transition-transform hover:scale-105 duration-300"}>
                <svg className={"w-14 h-14 text-primary"} fill={"none"} viewBox={"0 0 64 64"} xmlns={"http://www.w3.org/2000/svg"}>
                  <circle className={"animate-[spin_20s_linear_infinite] origin-center opacity-40"} cx={"32"} cy={"32"} r={"23"} stroke={"currentColor"} strokeDasharray={"5 3"} strokeWidth={"3"} />
                  <circle className={"animate-[spin_12s_linear_infinite_reverse] origin-[44px_20px] opacity-60"} cx={"44"} cy={"20"} r={"9"} stroke={"#9d4300"} strokeDasharray={"3 2"} strokeWidth={"2.5"} />
                  <path d={"M22 42L36 28M35 24C35.5 22.5 37 21 39 21C40.5 21 42 22 42.5 23.5L40 26L41.5 27.5L44 25C44.5 26.5 44 28 43 29.5C42 30.5 40.5 31 39 30.5L25 44.5C24 45.5 22.5 45.5 21.5 44.5C20.5 43.5 20.5 42 21.5 41L35 24Z"} fill={"currentColor"} />
                  <circle cx={"25"} cy={"26"} fill={"#936f00"} r={"4"} />
                </svg>
              </div>
              <div className={"absolute -bottom-1 -right-1 bg-surface-container-lowest px-1.5 py-0.5 rounded-full shadow-md flex items-center gap-1 border-0"}>
                <span className={"w-2.5 h-2.5 rounded-full bg-tertiary-container flex items-center justify-center text-[7px] text-on-tertiary font-bold"}>
                  JA
                </span>
                <span className={"material-symbols-outlined text-secondary text-[14px]"}>
                  calendar_today
                </span>
              </div>
            </div>
            <h2 className={"font-headline-sm text-headline-sm text-on-surface mb-space-xs font-bold leading-tight"}>
              Parts for your 2019 Toyota Roomy are coming soon
            </h2>
            <p className={"font-body-md text-body-md text-on-surface-variant max-w-xs mx-auto"}>
              We're building our verified parts database car by car. Yours is currently on the lift!
            </p>
            <div className={"mt-space-md inline-flex items-center gap-1.5 bg-surface-container-highest px-space-md py-1 rounded-full"}>
              <span className={"w-2 h-2 rounded-full bg-secondary animate-pulse"} />
              <span className={"font-label-sm text-label-sm text-on-surface tracking-wider uppercase font-bold"}>
                In Active Research
              </span>
            </div>
          </div>
          <div className={"w-full bg-surface-container-lowest rounded-xl p-space-md shadow-sm mb-space-md"}>
            <div className={"flex items-start gap-space-sm mb-space-sm"}>
              <div className={"w-9 h-9 rounded-lg bg-surface-container-high flex items-center justify-center shrink-0 mt-0.5"}>
                <span className={"material-symbols-outlined text-primary text-[20px]"}>
                  local_shipping
                </span>
              </div>
              <div className={"flex flex-col min-w-0"}>
                <h3 className={"font-headline-sm text-headline-sm text-on-surface text-[16px] leading-5"}>
                  Curated for Jamaican Roads
                </h3>
                <span className={"font-label-md text-label-md text-on-surface-variant"}>
                  OEM Numbers • Cross-Reference • Availability
                </span>
              </div>
            </div>
            <p className={"font-body-md text-body-md text-on-surface-variant mb-space-md leading-relaxed"}>
              Jamaica has over 400 distinct Japanese import models on the road. We are cataloging exact OEM numbers, cross-references with Daihatsu and Subaru sister models (Thor, Justy, Tank), and verifying stock availability parish by parish.
            </p>
            <div className={"bg-surface-container-low rounded-lg p-space-sm"}>
              <div className={"flex items-center justify-between mb-1.5"}>
                <div className={"flex items-center gap-1.5"}>
                  <span className={"material-symbols-outlined text-secondary text-[16px]"}>
                    pie_chart
                  </span>
                  <span className={"font-label-md text-label-md text-on-surface font-semibold"}>
                    Toyota Roomy (M900 series)
                  </span>
                </div>
                <span className={"font-label-md text-label-md text-secondary font-bold"}>
                  72% Mapped
                </span>
              </div>
              <div className={"w-full h-2 rounded-full bg-surface-container-highest overflow-hidden"}>
                <div className={"h-full bg-gradient-to-r from-secondary to-primary-container rounded-full w-[72%] transition-all duration-1000"} />
              </div>
              <div className={"flex items-center justify-between mt-1 text-[11px] font-label-sm text-on-surface-variant"}>
                <span>
                  {"Suspension & Filters done"}
                </span>
                <span>
                  Electrical in progress
                </span>
              </div>
            </div>
          </div>
          <div className={"w-full bg-surface-container-lowest rounded-xl p-space-md shadow-sm mb-space-md flex items-center justify-between gap-space-md"}>
            <div className={"flex items-start gap-space-sm min-w-0"}>
              <div className={"w-10 h-10 rounded-full bg-secondary-container/20 flex items-center justify-center shrink-0 text-secondary"}>
                <span className={"material-symbols-outlined text-[22px]"} style={{ fontVariationSettings: "'FILL' 1" }}>
                  notifications_active
                </span>
              </div>
              <div className={"flex flex-col min-w-0"}>
                <div className={"flex items-center gap-1.5"}>
                  <h4 className={"font-headline-sm text-headline-sm text-[16px] text-on-surface leading-tight"}>
                    Notify me when ready
                  </h4>
                  <span className={"bg-primary-fixed text-on-primary-fixed px-1.5 py-0.5 rounded text-[10px] font-label-sm font-bold"}>
                    SMS / Push
                  </span>
                </div>
                <p className={"font-body-sm text-body-sm text-on-surface-variant mt-0.5 leading-snug"}>
                  Instant alert when the 5-tier parts catalog and local store pricing unlock for your ride.
                </p>
              </div>
            </div>
            <button onClick={onPlugClick} aria-checked={"true"} aria-label={"Toggle notifications for parts catalog readiness"} className={"relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full bg-primary-container p-0.5 transition-colors duration-200 ease-in-out focus:outline-none"} id={"notify-toggle"} role={"switch"} data-act={"notify-toggle"} data-way-out={"primary"}>
              <span className={"pointer-events-none inline-block h-6 w-6 transform rounded-full bg-surface-container-lowest shadow-md transition duration-200 ease-in-out translate-x-5 flex items-center justify-center"} id={"toggle-knob"}>
                <span className={"material-symbols-outlined text-[14px] text-primary"}>
                  check
                </span>
              </span>
            </button>
          </div>
          <div className={"w-full bg-surface-container rounded-xl p-space-md shadow-sm mb-space-lg"}>
            <div className={"flex items-center justify-between mb-space-sm"}>
              <div className={"flex items-center gap-1.5"}>
                <span className={"material-symbols-outlined text-on-surface-variant text-[18px]"}>
                  verified
                </span>
                <span className={"font-label-lg text-label-lg text-on-surface font-semibold"}>
                  Active Profile Targets
                </span>
              </div>
              <span className={"font-label-sm text-label-sm text-primary font-bold uppercase tracking-wider"}>
                Locked to Garage
              </span>
            </div>
            <div className={"grid grid-cols-2 gap-space-sm"}>
              <div className={"bg-surface-container-lowest rounded-lg p-space-sm shadow-sm flex flex-col min-w-0"}>
                <span className={"font-label-sm text-label-sm text-on-surface-variant uppercase"}>
                  Vehicle
                </span>
                <span className={"font-label-md text-label-md text-on-surface truncate font-semibold"}>
                  2019 Toyota Roomy
                </span>
                <span className={"font-body-sm text-body-sm text-on-surface-variant text-[11px] truncate"}>
                  1.0L Turbo GS Custom
                </span>
              </div>
              <div className={"bg-surface-container-lowest rounded-lg p-space-sm shadow-sm flex flex-col min-w-0"}>
                <span className={"font-label-sm text-label-sm text-on-surface-variant uppercase"}>
                  Chassis Code
                </span>
                <span className={"font-price-display text-price-display text-[16px] text-primary truncate font-bold"}>
                  M900A
                </span>
                <span className={"font-body-sm text-body-sm text-on-surface-variant text-[11px] truncate"}>
                  JDM Micro-Van
                </span>
              </div>
              <div className={"bg-surface-container-lowest rounded-lg p-space-sm shadow-sm flex flex-col min-w-0"}>
                <span className={"font-label-sm text-label-sm text-on-surface-variant uppercase"}>
                  Engine Variant
                </span>
                <span className={"font-headline-sm text-headline-sm text-[15px] text-on-surface font-semibold truncate"}>
                  1KR-VET
                </span>
                <span className={"font-body-sm text-body-sm text-on-surface-variant text-[11px] truncate"}>
                  3-Cyl DOHC VVT
                </span>
              </div>
              <div className={"bg-surface-container-lowest rounded-lg p-space-sm shadow-sm flex flex-col min-w-0"}>
                <span className={"font-label-sm text-label-sm text-on-surface-variant uppercase"}>
                  Primary Parish
                </span>
                <span className={"font-headline-sm text-headline-sm text-[15px] text-on-surface font-semibold truncate"}>
                  St. Andrew
                </span>
                <span className={"font-body-sm text-body-sm text-on-surface-variant text-[11px] truncate"}>
                  Kingston Metro hub
                </span>
              </div>
            </div>
          </div>
          <div className={"w-full flex flex-col gap-space-sm mb-space-lg"}>
            <button onClick={onPlugClick} className={"w-full min-h-[48px] rounded-lg bg-primary hover:bg-primary-container active:scale-[0.99] text-on-primary font-label-lg text-label-lg flex items-center justify-center gap-space-sm shadow-md transition-all py-3 px-space-md"} data-act={"find-parts-stores-near-me"} data-way-out={"primary"}>
              <span className={"material-symbols-outlined text-[20px]"}>
                storefront
              </span>
              <span>
                Find Parts Stores Near Me
              </span>
            </button>
            <button onClick={onPlugClick} className={"w-full min-h-[48px] rounded-lg bg-surface-container-high hover:bg-surface-container-highest active:scale-[0.99] text-on-surface font-label-lg text-label-lg flex items-center justify-center gap-space-sm transition-all py-3 px-space-md shadow-sm"} data-act={"contribute-or-request-fast-track"}>
              <span className={"material-symbols-outlined text-secondary text-[20px]"}>
                add_task
              </span>
              <span>
                Contribute or Request Fast-Track
              </span>
            </button>
          </div>
          <div className={"w-full bg-surface-container-lowest rounded-xl p-space-md shadow-sm mb-space-md flex items-start gap-space-sm"}>
            <div className={"w-8 h-8 rounded-full bg-tertiary-fixed flex items-center justify-center shrink-0 text-on-tertiary-fixed mt-0.5"}>
              <span className={"material-symbols-outlined text-[18px]"}>
                support_agent
              </span>
            </div>
            <div className={"flex flex-col min-w-0"}>
              <h4 className={"font-label-md text-label-md text-on-surface font-bold"}>
                Need a part urgently today?
              </h4>
              <p className={"font-body-sm text-body-sm text-on-surface-variant mt-0.5 leading-relaxed"}>
                Don't wait on catalog release if your vehicle is off the road. Call our verified Jamaican parts directory or ask the
                <strong className={"text-on-surface font-semibold"}>
                  Roam Plug WhatsApp motorist group
                </strong>
                for instant store inventory leads.
              </p>
              <div className={"flex items-center gap-space-md mt-space-sm"}>
                <a onClick={onPlugClick} className={"inline-flex items-center gap-1 font-label-sm text-label-sm text-primary hover:underline font-bold"} href={"#directory"} data-act={"view-local-phone-list"}>
                  <span>
                    View Local Phone List
                  </span>
                  <span className={"material-symbols-outlined text-[14px]"}>
                    arrow_forward
                  </span>
                </a>
                <a onClick={onPlugClick} className={"inline-flex items-center gap-1 font-label-sm text-label-sm text-secondary hover:underline font-bold"} href={"#whatsapp"} data-act={"join-whatsapp-hub"}>
                  <span>
                    Join WhatsApp Hub
                  </span>
                  <span className={"material-symbols-outlined text-[14px]"}>
                    open_in_new
                  </span>
                </a>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
