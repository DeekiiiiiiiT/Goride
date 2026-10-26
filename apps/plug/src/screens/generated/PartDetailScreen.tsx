import { useEffect, useRef } from 'react';
import { onPlugClick } from '../../shell/actions';
import { bindScreen } from '../../shell/bind';


export function PartDetailScreen() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (ref.current) bindScreen("40-part-detail.html", ref.current); }, []);
  return (
    <div ref={ref} data-plug-screen={"40-part-detail.html"} className={"bg-surface font-body-md text-on-surface flex flex-col min-h-screen"}>
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
                Part Detail
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
        <div className={"flex flex-col w-full pb-10 space-y-space-md"}>
          <div className={"fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-space-md py-space-sm bg-inverse-surface text-inverse-on-surface rounded-full shadow-xl opacity-0 pointer-events-none transition-all duration-300 flex items-center gap-space-xs font-label-md text-label-md"} id={"copy-toast"}>
            <span className={"material-symbols-outlined text-[18px] text-tertiary-fixed"}>
              check_circle
            </span>
            <span id={"toast-text"}>
              Part number copied!
            </span>
          </div>
          <section className={"w-full bg-surface-container-lowest rounded-xl p-space-md shadow-sm relative overflow-hidden"}>
            <div className={"flex items-center justify-between gap-space-sm mb-space-sm"}>
              <div className={"inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface-container-low text-on-surface"}>
                <span className={"w-2 h-2 rounded-full bg-[#16a34a] animate-pulse"} />
                <span className={"material-symbols-outlined text-[16px] text-[#16a34a]"} style={{ fontVariationSettings: "'FILL' 1" }}>
                  verified
                </span>
                <span className={"font-label-md text-label-md text-[#16a34a] uppercase tracking-wider font-bold"}>
                  Exact Factory Part
                </span>
              </div>
              <span className={"font-label-sm text-label-sm text-on-surface-variant bg-surface-container px-2 py-0.5 rounded-full uppercase"}>
                OEM JDM
              </span>
            </div>
            <div className={"relative w-full h-44 rounded-lg overflow-hidden mb-space-md bg-surface-container-low flex items-center justify-center"}>
              <div className={"w-full h-full object-cover bg-surface-container flex items-center justify-center text-primary"} aria-hidden={"true"}><span className={"material-symbols-outlined text-[32px]"}>image</span></div>
              <div className={"absolute inset-0 bg-gradient-to-t from-surface-container-lowest/80 via-transparent to-transparent"} />
              <div className={"absolute bottom-2 left-2 flex items-center gap-1.5 px-2.5 py-1 bg-surface-container-lowest/90 backdrop-blur-md rounded-lg shadow-sm"}>
                <span className={"material-symbols-outlined text-primary text-[18px]"}>
                  verified_user
                </span>
                <span className={"font-label-sm text-label-sm text-on-surface font-semibold"}>
                  Toyota Genuine Parts • Made in Japan
                </span>
              </div>
            </div>
            <div className={"flex flex-col space-y-space-xs"}>
              <h2 className={"font-headline-md text-headline-md text-on-surface tracking-tight"}>
                Front Brake Pad Set
              </h2>
              <p className={"font-body-md text-body-md text-on-surface-variant"}>
                {"Disc brake system axle assembly kit (Left & Right)"}
              </p>
            </div>
            <div className={"mt-space-md p-space-md bg-surface-container rounded-lg flex items-center justify-between gap-space-sm shadow-inner"}>
              <div className={"flex flex-col min-w-0"}>
                <span className={"font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider"}>
                  OEM Part Number
                </span>
                <span className={"font-price-display text-price-display text-primary tracking-wide select-all"} id={"main-part-no"}>
                  04465-B1170
                </span>
              </div>
              <button onClick={onPlugClick} aria-label={"Copy OEM Part Number"} className={"h-12 px-space-md rounded-lg bg-primary text-on-primary font-label-lg text-label-lg flex items-center gap-1.5 active:scale-95 shadow-sm transition-transform"} data-act={"copy"} data-way-out={"primary"}>
                <span className={"material-symbols-outlined text-[20px]"}>
                  content_copy
                </span>
                <span>
                  Copy
                </span>
              </button>
            </div>
            <div className={"mt-space-sm p-space-sm rounded-lg bg-surface-container-low flex items-center gap-space-sm"}>
              <div className={"w-8 h-8 rounded-full bg-[#16a34a]/15 text-[#16a34a] flex items-center justify-center shrink-0"}>
                <span className={"material-symbols-outlined text-[20px]"} style={{ fontVariationSettings: "'FILL' 1" }}>
                  task_alt
                </span>
              </div>
              <div className={"flex flex-col min-w-0"}>
                <span className={"font-label-sm text-label-sm text-[#16a34a] font-bold tracking-wide uppercase"}>
                  100% Fit Guarantee
                </span>
                <span className={"font-body-sm text-body-sm text-on-surface truncate"}>
                  Parts for your car
                </span>
              </div>
            </div>
          </section>
          <section className={"w-full bg-surface-container-lowest rounded-xl p-space-md shadow-sm"}>
            <div className={"flex items-center gap-space-xs mb-space-sm"}>
              <span className={"material-symbols-outlined text-primary text-[22px]"} style={{ fontVariationSettings: "'FILL' 1" }}>
                directions_car
              </span>
              <h3 className={"font-headline-sm text-headline-sm text-on-surface"}>
                Fits (Verified Compatibility)
              </h3>
            </div>
            <p className={"font-body-sm text-body-sm text-on-surface-variant mb-space-md"}>
              Standard factory fitment for JDM compacts sharing the Daihatsu DNGA/M900 platform.
            </p>
            <div className={"space-y-space-xs"}>
              <div className={"p-space-sm rounded-lg bg-surface-container-high flex items-center justify-between gap-space-sm"}>
                <div className={"flex items-center gap-space-sm min-w-0"}>
                  <div className={"w-2.5 h-2.5 rounded-full bg-[#16a34a] shrink-0"} />
                  <div className={"flex flex-col min-w-0"}>
                    <span className={"font-label-lg text-label-lg text-on-surface truncate"}>
                      2016–2023 Toyota Roomy
                    </span>
                    <span className={"font-body-sm text-body-sm text-on-surface-variant"}>
                      Chassis: M900A / M910A (2WD/4WD)
                    </span>
                  </div>
                </div>
                <span className={"px-2 py-0.5 rounded-full bg-primary text-on-primary font-label-sm text-label-sm shrink-0"}>
                  Your Car
                </span>
              </div>
              <div className={"p-space-sm rounded-lg bg-surface-container-low flex items-center justify-between gap-space-sm"}>
                <div className={"flex items-center gap-space-sm min-w-0"}>
                  <div className={"w-2 h-2 rounded-full bg-on-surface-variant/40 shrink-0"} />
                  <div className={"flex flex-col min-w-0"}>
                    <span className={"font-label-lg text-label-lg text-on-surface truncate"}>
                      2016–2023 Toyota Tank
                    </span>
                    <span className={"font-body-sm text-body-sm text-on-surface-variant"}>
                      Chassis: M900A / M910A
                    </span>
                  </div>
                </div>
                <span className={"font-label-sm text-label-sm text-on-surface-variant"}>
                  Direct Fit
                </span>
              </div>
              <div className={"p-space-sm rounded-lg bg-surface-container-low flex items-center justify-between gap-space-sm"}>
                <div className={"flex items-center gap-space-sm min-w-0"}>
                  <div className={"w-2 h-2 rounded-full bg-on-surface-variant/40 shrink-0"} />
                  <div className={"flex flex-col min-w-0"}>
                    <span className={"font-label-lg text-label-lg text-on-surface truncate"}>
                      2016–2023 Daihatsu Thor
                    </span>
                    <span className={"font-body-sm text-body-sm text-on-surface-variant"}>
                      Chassis: M900S / M910S
                    </span>
                  </div>
                </div>
                <span className={"font-label-sm text-label-sm text-on-surface-variant"}>
                  Direct Fit
                </span>
              </div>
              <div className={"p-space-sm rounded-lg bg-surface-container-low flex items-center justify-between gap-space-sm"}>
                <div className={"flex items-center gap-space-sm min-w-0"}>
                  <div className={"w-2 h-2 rounded-full bg-on-surface-variant/40 shrink-0"} />
                  <div className={"flex flex-col min-w-0"}>
                    <span className={"font-label-lg text-label-lg text-on-surface truncate"}>
                      2016–2023 Subaru Justy
                    </span>
                    <span className={"font-body-sm text-body-sm text-on-surface-variant"}>
                      Chassis: M900F
                    </span>
                  </div>
                </div>
                <span className={"font-label-sm text-label-sm text-on-surface-variant"}>
                  Direct Fit
                </span>
              </div>
            </div>
            <div className={"mt-space-md p-space-sm rounded-lg bg-surface-container flex items-center gap-space-sm"}>
              <span className={"material-symbols-outlined text-secondary text-[20px]"}>
                engineering
              </span>
              <div className={"flex flex-col min-w-0"}>
                <span className={"font-label-sm text-label-sm text-on-surface-variant uppercase"}>
                  Compatible Engine Codes
                </span>
                <span className={"font-label-md text-label-md text-on-surface font-semibold"}>
                  1KR-FE (1.0L Naturally Aspirated) • 1KR-VET (1.0L Turbo)
                </span>
              </div>
            </div>
          </section>
          <section className={"w-full bg-surface-container-lowest rounded-xl p-space-md shadow-sm"}>
            <div className={"flex items-center justify-between mb-space-xs"}>
              <div className={"flex items-center gap-space-xs"}>
                <span className={"material-symbols-outlined text-primary text-[22px]"}>
                  shuffle
                </span>
                <h3 className={"font-headline-sm text-headline-sm text-on-surface"}>
                  Also Known As
                </h3>
              </div>
              <span className={"font-label-sm text-label-sm text-on-surface-variant"}>
                Tap to copy
              </span>
            </div>
            <p className={"font-body-sm text-body-sm text-on-surface-variant mb-space-md"}>
              Give any of these alternate numbers to Kingston or Montego Bay auto parts desks:
            </p>
            <div className={"grid grid-cols-2 gap-space-sm"}>
              <button onClick={onPlugClick} className={"p-space-sm bg-surface-container rounded-lg text-left active:scale-95 transition-transform group flex flex-col justify-between h-20"} data-act={"daihatsu-oem-04465-b1170-000"}>
                <div className={"flex items-center justify-between"}>
                  <span className={"font-label-sm text-label-sm text-on-surface-variant font-semibold"}>
                    Daihatsu OEM
                  </span>
                  <span className={"material-symbols-outlined text-on-surface-variant text-[16px] group-hover:text-primary"}>
                    content_copy
                  </span>
                </div>
                <span className={"font-label-lg text-label-lg text-on-surface font-bold tracking-tight"}>
                  04465-B1170-000
                </span>
              </button>
              <button onClick={onPlugClick} className={"p-space-sm bg-surface-container rounded-lg text-left active:scale-95 transition-transform group flex flex-col justify-between h-20"} data-act={"akebono-japan-an-788wk"}>
                <div className={"flex items-center justify-between"}>
                  <span className={"font-label-sm text-label-sm text-on-surface-variant font-semibold"}>
                    Akebono (Japan)
                  </span>
                  <span className={"material-symbols-outlined text-on-surface-variant text-[16px] group-hover:text-primary"}>
                    content_copy
                  </span>
                </div>
                <span className={"font-label-lg text-label-lg text-on-surface font-bold tracking-tight"}>
                  AN-788WK
                </span>
              </button>
              <button onClick={onPlugClick} className={"p-space-sm bg-surface-container rounded-lg text-left active:scale-95 transition-transform group flex flex-col justify-between h-20"} data-act={"advics-oe-sn188p"}>
                <div className={"flex items-center justify-between"}>
                  <span className={"font-label-sm text-label-sm text-on-surface-variant font-semibold"}>
                    Advics OE
                  </span>
                  <span className={"material-symbols-outlined text-on-surface-variant text-[16px] group-hover:text-primary"}>
                    content_copy
                  </span>
                </div>
                <span className={"font-label-lg text-label-lg text-on-surface font-bold tracking-tight"}>
                  SN188P
                </span>
              </button>
              <button onClick={onPlugClick} className={"p-space-sm bg-surface-container rounded-lg text-left active:scale-95 transition-transform group flex flex-col justify-between h-20"} data-act={"pitwork-nissan-jdm-ay040-ke150"}>
                <div className={"flex items-center justify-between"}>
                  <span className={"font-label-sm text-label-sm text-on-surface-variant font-semibold"}>
                    Pitwork (Nissan/JDM)
                  </span>
                  <span className={"material-symbols-outlined text-on-surface-variant text-[16px] group-hover:text-primary"}>
                    content_copy
                  </span>
                </div>
                <span className={"font-label-lg text-label-lg text-on-surface font-bold tracking-tight"}>
                  AY040-KE150
                </span>
              </button>
            </div>
          </section>
          <section className={"w-full bg-surface-container-lowest rounded-xl p-space-md shadow-sm"}>
            <div className={"flex items-center gap-space-xs mb-space-md"}>
              <span className={"material-symbols-outlined text-primary text-[22px]"}>
                tune
              </span>
              <h3 className={"font-headline-sm text-headline-sm text-on-surface"}>
                Technical Specifications
              </h3>
            </div>
            <div className={"space-y-space-sm"}>
              <div className={"flex items-center justify-between py-2 bg-surface-container-low px-space-sm rounded-lg"}>
                <span className={"font-body-md text-body-md text-on-surface-variant"}>
                  Position
                </span>
                <span className={"font-label-lg text-label-lg text-on-surface font-semibold text-right"}>
                  {"Front Axle (Left & Right)"}
                </span>
              </div>
              <div className={"flex items-center justify-between py-2 px-space-sm rounded-lg"}>
                <span className={"font-body-md text-body-md text-on-surface-variant"}>
                  Kit Contents
                </span>
                <span className={"font-label-lg text-label-lg text-on-surface font-semibold text-right"}>
                  Disc Brake Pads (4 pcs set)
                </span>
              </div>
              <div className={"flex items-center justify-between py-2 bg-surface-container-low px-space-sm rounded-lg"}>
                <span className={"font-body-md text-body-md text-on-surface-variant"}>
                  Friction Material
                </span>
                <span className={"font-label-lg text-label-lg text-on-surface font-semibold text-right"}>
                  NAO Ceramic (Low-Dust)
                </span>
              </div>
              <div className={"flex items-center justify-between py-2 px-space-sm rounded-lg"}>
                <span className={"font-body-md text-body-md text-on-surface-variant"}>
                  Wear Sensor
                </span>
                <span className={"font-label-lg text-label-lg text-on-surface font-semibold text-right"}>
                  Acoustic Clip Included
                </span>
              </div>
              <div className={"flex items-center justify-between py-2 bg-surface-container-low px-space-sm rounded-lg"}>
                <span className={"font-body-md text-body-md text-on-surface-variant"}>
                  Pad Dimensions
                </span>
                <span className={"font-label-lg text-label-lg text-on-surface font-semibold text-right"}>
                  14.5 mm Thick • 118.2 mm Wide
                </span>
              </div>
            </div>
          </section>
          <section className={"w-full bg-surface-container-lowest rounded-xl p-space-md shadow-sm flex flex-col gap-space-sm"}>
            <h3 className={"font-headline-sm text-headline-sm text-on-surface"}>
              No sellers listed yet
            </h3>
            <p className={"font-body-sm text-body-sm text-on-surface-variant"}>
              A store shows here only after it is approved and lists this part.
            </p>
            <button onClick={onPlugClick} className={"w-full min-h-12 rounded-lg bg-primary text-on-primary font-label-lg text-label-lg flex items-center justify-center gap-space-sm active:scale-95 transition-transform"} data-act={"parts-stores"} data-way-out={"primary"}>
              <span className={"material-symbols-outlined text-[20px]"}>
                storefront
              </span>
              <span>
                Parts stores
              </span>
            </button>
          </section>
          <section className={"w-full bg-surface-container-lowest rounded-xl p-space-md shadow-sm flex items-center justify-between gap-space-sm"}>
            <div className={"flex items-center gap-space-sm min-w-0"}>
              <div className={"w-10 h-10 rounded-full bg-surface-container flex items-center justify-center text-on-surface-variant shrink-0"}>
                <span className={"material-symbols-outlined text-[22px]"}>
                  flag
                </span>
              </div>
              <div className={"flex flex-col min-w-0"}>
                <span className={"font-label-lg text-label-lg text-on-surface font-semibold truncate"}>
                  This didn't fit your Roomy?
                </span>
                <span className={"font-body-sm text-body-sm text-on-surface-variant truncate"}>
                  Report fitment discrepancy for Jamaica database
                </span>
              </div>
            </div>
            <button onClick={onPlugClick} className={"h-10 px-space-md rounded-lg bg-surface-container text-primary font-label-md text-label-md font-bold active:scale-95 transition-transform shrink-0"} data-act={"report"}>
              Report
            </button>
          </section>
        </div>
      </main>
    </div>
  );
}
