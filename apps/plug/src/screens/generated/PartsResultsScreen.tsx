import { useEffect, useRef } from 'react';
import { onPlugClick } from '../../shell/actions';
import { bindScreen } from '../../shell/bind';


export function PartsResultsScreen() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (ref.current) bindScreen("39-parts-results.html", ref.current); }, []);
  return (
    <div ref={ref} data-plug-screen={"39-parts-results.html"} className={"bg-surface font-body-md text-on-surface flex flex-col min-h-screen"}>
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
                Parts Results 5 Tiers
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
        <div className={"flex flex-col w-full pb-28 space-y-space-md"}>
          <section className={"bg-surface-container rounded-xl p-space-md shadow-sm space-y-space-sm"}>
            <div className={"flex items-start justify-between gap-space-sm"}>
              <div className={"space-y-space-xs"}>
                <span className={"inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-secondary-container/20 text-secondary font-label-sm text-label-sm uppercase tracking-wider"}>
                  <span className={"material-symbols-outlined text-[14px]"}>
                    verified
                  </span>
                  Fitment Verified
                </span>
                <h2 className={"font-headline-sm text-headline-sm text-on-surface"}>
                  Brake pads (front) — 2019 Toyota Roomy
                </h2>
                <p className={"font-body-md text-body-md text-on-surface-variant"}>
                  Front disc brake pads • 1.0L Turbo GS (1KR-FE)
                </p>
              </div>
              <div className={"w-10 h-10 rounded-full bg-primary-fixed flex items-center justify-center shrink-0"}>
                <span className={"material-symbols-outlined text-primary text-[22px]"} style={{ fontVariationSettings: "'FILL' 1" }}>
                  car_repair
                </span>
              </div>
            </div>
            <div className={"flex items-center gap-space-xs text-on-surface-variant font-label-md text-label-md pt-1"}>
              <span className={"w-2 h-2 rounded-full bg-primary animate-pulse"} />
              <span>
                14 verified matches across 5 island compatibility tiers
              </span>
            </div>
            <div className={"bg-surface-container-highest/80 rounded-lg p-space-sm flex items-start gap-space-sm"}>
              <span className={"text-[18px] shrink-0 mt-0.5"}>
                💡
              </span>
              <p className={"font-body-sm text-body-sm text-on-surface"}>
                <span className={"font-semibold text-primary"}>
                  Jamaican Fitment Note:
                </span>
                {"Your Roomy shares the exact Daihatsu Thor, Toyota Tank & Subaru Justy platform. Broadens yard sourcing options across Kingston & MoBay auto marts."}
              </p>
            </div>
          </section>
          <div className={"flex items-center gap-space-xs overflow-x-auto py-1 -mx-gutter px-gutter no-scrollbar"}>
            <a onClick={onPlugClick} className={"shrink-0 px-3 py-1.5 rounded-full bg-primary text-on-primary font-label-md text-label-md shadow-sm flex items-center gap-1.5"} href={"#tier-1"} data-act={"tier-1-oem"} data-way-out={"primary"}>
              <span className={"w-1.5 h-1.5 rounded-full bg-white"} />
              Tier 1: OEM
            </a>
            <a onClick={onPlugClick} className={"shrink-0 px-3 py-1.5 rounded-full bg-surface-container-high text-on-surface-variant font-label-md text-label-md"} href={"#tier-2"} data-act={"tier-2-twin-4"}>
              Tier 2: Twin (4)
            </a>
            <a onClick={onPlugClick} className={"shrink-0 px-3 py-1.5 rounded-full bg-surface-container-high text-on-surface-variant font-label-md text-label-md"} href={"#tier-3"} data-act={"tier-3-1kr-fe-9"}>
              Tier 3: 1KR-FE (9)
            </a>
            <a onClick={onPlugClick} className={"shrink-0 px-3 py-1.5 rounded-full bg-surface-container-high text-on-surface-variant font-label-md text-label-md"} href={"#tier-4"} data-act={"tier-4-aftermarket-12"}>
              Tier 4: Aftermarket (12)
            </a>
            <a onClick={onPlugClick} className={"shrink-0 px-3 py-1.5 rounded-full bg-surface-container-high text-on-surface-variant font-label-md text-label-md"} href={"#tier-5"} data-act={"tier-5-universal"}>
              Tier 5: Universal
            </a>
          </div>
          <section className={"space-y-space-sm"} id={"tier-1"}>
            <div className={"flex items-center justify-between"}>
              <div className={"flex items-center gap-space-xs"}>
                <div className={"w-7 h-7 rounded-lg bg-surface-container-high flex items-center justify-center text-primary"}>
                  <span className={"material-symbols-outlined text-[18px]"} style={{ fontVariationSettings: "'FILL' 1" }}>
                    stars
                  </span>
                </div>
                <h3 className={"font-headline-sm text-headline-sm text-on-surface"}>
                  1. Exact Factory Part
                </h3>
              </div>
              <span className={"px-2.5 py-1 rounded-full bg-surface-container-high text-primary font-label-sm text-label-sm uppercase tracking-wide"}>
                Direct OEM
              </span>
            </div>
            <p className={"font-body-sm text-body-sm text-on-surface-variant pl-9"}>
              Direct OEM match built specifically for this vehicle by Toyota Motor Japan.
            </p>
            <div className={"bg-surface-container-lowest rounded-xl p-space-md shadow-sm space-y-space-sm"}>
              <div className={"flex items-start justify-between gap-space-sm"}>
                <div className={"space-y-space-xs"}>
                  <span className={"inline-block px-2 py-0.5 rounded bg-surface-container-high text-on-surface-variant font-label-sm text-label-sm font-semibold"}>
                    Toyota Genuine Parts (Japan)
                  </span>
                  <h4 className={"font-headline-sm text-headline-sm text-on-surface"}>
                    Genuine Toyota Front Brake Pad Set
                  </h4>
                  <div className={"flex items-center gap-2"}>
                    <span className={"font-label-md text-label-md text-on-surface-variant font-mono"}>
                      PN: 04465-B1170
                    </span>
                    <button onClick={onPlugClick} className={"text-primary hover:text-primary-container p-1 rounded"} title={"Copy part number"} data-act={"content-copy"}>
                      <span className={"material-symbols-outlined text-[16px]"}>
                        content_copy
                      </span>
                    </button>
                  </div>
                </div>
                <div className={"w-16 h-16 rounded-lg bg-surface-container-low shrink-0 overflow-hidden flex items-center justify-center"}>
                  <img className={"w-full h-full object-cover"} data-alt={"High-contrast studio product shot of an authentic genuine Toyota front disc brake pad box with holographic seal and 4 ceramic brake pads resting on warm metallic automotive backdrop"} src={"https://lh3.googleusercontent.com/aida-public/AB6AXuDeoyM_2r9KJbdAUSxQLH1zoVII4ZraWF0XY7XJfh0tQeFFybIPxN0MIWMHDRGVsnAdn6lxqepjM1uAvBh5YnNtVUio8R9uwklugENi5mS4pci_jWddF_cAIWEdzT_V9LI65NdGVxJ0RFBAEenl4xFmlFrwJcSBLUYe3TT-pf7boDP6Dofytq_z17faKbMVWhBWqeXVQko0FvbIQYa9q9NESEb8Ch3rtAJBOE7NOI7X2_m0FW6BueKn"} />
                </div>
              </div>
              <div className={"flex flex-wrap items-center gap-space-xs pt-1"}>
                <span className={"px-2.5 py-1 rounded-full bg-primary-fixed text-on-primary-fixed font-label-sm text-label-sm flex items-center gap-1"}>
                  <span className={"material-symbols-outlined text-[13px]"}>
                    check_circle
                  </span>
                  High Confidence
                </span>
                <span className={"px-2.5 py-1 rounded-full bg-surface-container-high text-on-surface font-label-sm text-label-sm"}>
                  100% Direct Bolt-on
                </span>
              </div>
              <div className={"pt-2 flex items-baseline justify-between border-t-0 bg-surface-container-low/50 -mx-space-md -mb-space-md p-space-md rounded-b-xl"}>
                <div>
                  <span className={"font-label-sm text-label-sm text-on-surface-variant block uppercase tracking-wider"}>
                    Estimated Retail
                  </span>
                  <span className={"font-price-display text-price-display text-primary"}>
                    J$ 11,500 – 14,000
                  </span>
                </div>
                <button onClick={onPlugClick} className={"h-12 px-4 rounded-lg bg-primary hover:bg-primary-container text-on-primary font-label-lg text-label-lg shadow-sm flex items-center gap-1.5 transition-transform active:scale-95"} data-act={"find-stores-6-in-kgn"} data-way-out={"primary"}>
                  <span className={"material-symbols-outlined text-[20px]"}>
                    storefront
                  </span>
                  <span>
                    Find stores (6 in Kgn)
                  </span>
                </button>
              </div>
            </div>
          </section>
          <section className={"space-y-space-sm pt-2"} id={"tier-2"}>
            <div className={"flex items-center justify-between"}>
              <div className={"flex items-center gap-space-xs"}>
                <div className={"w-7 h-7 rounded-lg bg-surface-container-high flex items-center justify-center text-secondary"}>
                  <span className={"material-symbols-outlined text-[18px]"} style={{ fontVariationSettings: "'FILL' 1" }}>
                    swap_horiz
                  </span>
                </div>
                <h3 className={"font-headline-sm text-headline-sm text-on-surface"}>
                  2. Sister Vehicle Part
                </h3>
              </div>
              <span className={"px-2.5 py-1 rounded-full bg-surface-container-high text-secondary font-label-sm text-label-sm uppercase tracking-wide"}>
                Platform Twin
              </span>
            </div>
            <p className={"font-body-sm text-body-sm text-on-surface-variant pl-9"}>
              Identical car sold under another badge. 100% mechanical match (Daihatsu Thor / Tank, Subaru Justy).
            </p>
            <div className={"bg-surface-container-lowest rounded-xl p-space-md shadow-sm space-y-space-sm"}>
              <div className={"flex items-start justify-between gap-space-sm"}>
                <div className={"space-y-space-xs"}>
                  <span className={"inline-block px-2 py-0.5 rounded bg-surface-container-high text-on-surface-variant font-label-sm text-label-sm font-semibold"}>
                    Daihatsu Genuine (Japan)
                  </span>
                  <h4 className={"font-headline-sm text-headline-sm text-on-surface"}>
                    Daihatsu OEM Front Brake Pad Set
                  </h4>
                  <div className={"flex items-center gap-2"}>
                    <span className={"font-label-md text-label-md text-on-surface-variant font-mono"}>
                      PN: 04465-B1170-000
                    </span>
                    <button onClick={onPlugClick} className={"text-primary hover:text-primary-container p-1 rounded"} data-act={"content-copy-2"}>
                      <span className={"material-symbols-outlined text-[16px]"}>
                        content_copy
                      </span>
                    </button>
                  </div>
                </div>
                <div className={"w-16 h-16 rounded-lg bg-surface-container-low shrink-0 overflow-hidden flex items-center justify-center"}>
                  <img className={"w-full h-full object-cover"} data-alt={"Official Daihatsu Motors branded automotive spare parts package on a crisp clean display stand in bright daylight, showing factory stamped metallic brake pads"} src={"https://lh3.googleusercontent.com/aida-public/AB6AXuBJF05OZl3lRRZsXj7rlHVwYTv5PXBIqEwksr1Z7sfQFdR4Th7Pgl1DIPnJ5-1o9avliJmc0VETf6MAfgmiLcyaW1dzuPTIOxntfcUTSwww69yNV9OidS0JMlTuRcD6Rfre8b1QOoRX3PlzCtILer9ad0Xcqz4g1HBfFeeqld5A_sAqxsqqdshxLbYF0dkwFllWEKG-_XMs0yFepCoO36lquJTPsZzOaBOiGNIz6wHY-BjIXYuzNGIS"} />
                </div>
              </div>
              <div className={"flex flex-wrap items-center gap-space-xs"}>
                <span className={"px-2.5 py-1 rounded-full bg-secondary-fixed text-on-secondary-fixed-variant font-label-sm text-label-sm"}>
                  Identical Chassis (M900A / M900S)
                </span>
                <span className={"px-2.5 py-1 rounded-full bg-surface-container-high text-on-surface-variant font-label-sm text-label-sm"}>
                  Factory Fit
                </span>
              </div>
              <div className={"pt-2 flex items-baseline justify-between bg-surface-container-low/50 -mx-space-md -mb-space-md p-space-md rounded-b-xl"}>
                <div>
                  <span className={"font-label-sm text-label-sm text-on-surface-variant block uppercase tracking-wider"}>
                    Estimated Retail
                  </span>
                  <span className={"font-price-display text-price-display text-on-surface"}>
                    J$ 10,800 – 13,200
                  </span>
                </div>
                <button onClick={onPlugClick} className={"h-12 px-4 rounded-lg bg-secondary text-on-secondary font-label-lg text-label-lg shadow-sm flex items-center gap-1.5 active:scale-95 transition-transform"} data-act={"find-stores-4-stores"}>
                  <span className={"material-symbols-outlined text-[20px]"}>
                    storefront
                  </span>
                  <span>
                    Find stores (4 stores)
                  </span>
                </button>
              </div>
            </div>
          </section>
          <section className={"space-y-space-sm pt-2"} id={"tier-3"}>
            <div className={"flex items-center justify-between"}>
              <div className={"flex items-center gap-space-xs"}>
                <div className={"w-7 h-7 rounded-lg bg-surface-container-high flex items-center justify-center text-tertiary"}>
                  <span className={"material-symbols-outlined text-[18px]"} style={{ fontVariationSettings: "'FILL' 1" }}>
                    precision_manufacturing
                  </span>
                </div>
                <h3 className={"font-headline-sm text-headline-sm text-on-surface"}>
                  3. Engine-Compatible Part
                </h3>
              </div>
              <span className={"px-2.5 py-1 rounded-full bg-tertiary-fixed text-on-tertiary-fixed-variant font-label-sm text-label-sm uppercase tracking-wide"}>
                Shared Engine
              </span>
            </div>
            <p className={"font-body-sm text-body-sm text-on-surface-variant pl-9"}>
              Fits because the 1.0L 1KR-FE engine or caliper assembly is shared with other Jamaican models (Toyota Vitz, Passo, Passo Sette, Yaris 1.0).
            </p>
            <div className={"bg-surface-container-lowest rounded-xl p-space-md shadow-sm space-y-space-sm"}>
              <div className={"flex items-start justify-between gap-space-sm"}>
                <div className={"space-y-space-xs"}>
                  <span className={"inline-block px-2 py-0.5 rounded bg-surface-container-high text-on-surface-variant font-label-sm text-label-sm font-semibold"}>
                    Advics (Toyota OEM Supplier)
                  </span>
                  <h4 className={"font-headline-sm text-headline-sm text-on-surface"}>
                    Toyota Vitz / Passo Caliper Spec Pad Set
                  </h4>
                  <div className={"flex items-center gap-2"}>
                    <span className={"font-label-md text-label-md text-on-surface-variant font-mono"}>
                      PN: 04465-B1010
                    </span>
                    <button onClick={onPlugClick} className={"text-primary hover:text-primary-container p-1 rounded"} data-act={"content-copy-3"}>
                      <span className={"material-symbols-outlined text-[16px]"}>
                        content_copy
                      </span>
                    </button>
                  </div>
                </div>
                <div className={"w-16 h-16 rounded-lg bg-surface-container-low shrink-0 overflow-hidden flex items-center justify-center"}>
                  <img className={"w-full h-full object-cover"} data-alt={"Advics blue and white automotive replacement brake parts box next to steel brake friction pads arranged neatly on a warm workshop counter"} src={"https://lh3.googleusercontent.com/aida-public/AB6AXuBwY6iGmdze43AQ5awRtczDy_PpurL3WpPo3gNcJXk-6doCdKvo8CQ0VTsOm5fHkCurVMXLCVYuzgM8uVQ583riuQJVO6e3X9YI5Y57fU1rBBhcVZV7xWtTx_DFSw2yGPQ35yeWT92whD2H_ZwYlORvgXalwNTMqmbeXG69B804iVxk8Qs_bJR8AbhqZESYOpph4bzIULFwehVzp_cZN3eTeLIWqdxe_T6oeTEkCbin7p2hgLBNBvqL"} />
                </div>
              </div>
              <div className={"flex flex-wrap items-center gap-space-xs"}>
                <span className={"px-2.5 py-1 rounded-full bg-tertiary-fixed text-on-tertiary-fixed font-label-sm text-label-sm"}>
                  1KR-FE Shared Caliper Bracket
                </span>
                <span className={"px-2.5 py-1 rounded-full bg-surface-container-high text-on-surface-variant font-label-sm text-label-sm"}>
                  High Island Inventory
                </span>
              </div>
              <div className={"pt-2 flex items-baseline justify-between bg-surface-container-low/50 -mx-space-md -mb-space-md p-space-md rounded-b-xl"}>
                <div>
                  <span className={"font-label-sm text-label-sm text-on-surface-variant block uppercase tracking-wider"}>
                    Estimated Retail
                  </span>
                  <span className={"font-price-display text-price-display text-on-surface"}>
                    J$ 8,500 – 10,500
                  </span>
                </div>
                <button onClick={onPlugClick} className={"h-12 px-4 rounded-lg bg-surface-container-highest hover:bg-surface-container-high text-on-surface font-label-lg text-label-lg flex items-center gap-1.5 active:scale-95 transition-transform"} data-act={"find-stores-9-stores"}>
                  <span className={"material-symbols-outlined text-[20px] text-primary"}>
                    storefront
                  </span>
                  <span>
                    Find stores (9 stores)
                  </span>
                </button>
              </div>
            </div>
          </section>
          <section className={"space-y-space-sm pt-2"} id={"tier-4"}>
            <div className={"flex items-center justify-between"}>
              <div className={"flex items-center gap-space-xs"}>
                <div className={"w-7 h-7 rounded-lg bg-surface-container-high flex items-center justify-center text-primary-container"}>
                  <span className={"material-symbols-outlined text-[18px]"} style={{ fontVariationSettings: "'FILL' 1" }}>
                    build_circle
                  </span>
                </div>
                <h3 className={"font-headline-sm text-headline-sm text-on-surface"}>
                  4. Aftermarket Equivalent
                </h3>
              </div>
              <span className={"px-2.5 py-1 rounded-full bg-surface-container-high text-on-surface font-label-sm text-label-sm uppercase tracking-wide"}>
                Aftermarket Grade
              </span>
            </div>
            <p className={"font-body-sm text-body-sm text-on-surface-variant pl-9"}>
              Trusted international brands engineered to exact OEM specs (Akebono, Bosch, Denso, Ferodo).
            </p>
            <div className={"bg-surface-container-lowest rounded-xl p-space-md shadow-sm space-y-space-sm"}>
              <div className={"flex items-start justify-between gap-space-sm"}>
                <div className={"space-y-space-xs"}>
                  <span className={"inline-block px-2 py-0.5 rounded bg-surface-container-high text-on-surface-variant font-label-sm text-label-sm font-semibold"}>
                    Akebono Brake Industry
                  </span>
                  <h4 className={"font-headline-sm text-headline-sm text-on-surface"}>
                    Akebono Ultra-Premium Ceramic Pads
                  </h4>
                  <span className={"font-label-md text-label-md text-on-surface-variant font-mono block"}>
                    PN: AN-788WK
                  </span>
                </div>
                <span className={"px-2 py-1 rounded bg-secondary-container/10 text-secondary font-label-sm text-label-sm uppercase font-bold shrink-0"}>
                  Best Seller
                </span>
              </div>
              <div className={"flex flex-wrap items-center gap-space-xs"}>
                <span className={"px-2.5 py-1 rounded-full bg-surface-container-high text-on-surface-variant font-label-sm text-label-sm"}>
                  Ceramic • Low Dust
                </span>
                <span className={"px-2.5 py-1 rounded-full bg-surface-container-high text-on-surface-variant font-label-sm text-label-sm"}>
                  Heat Resistant (Island Tested)
                </span>
              </div>
              <div className={"flex items-baseline justify-between pt-1"}>
                <span className={"font-headline-sm text-headline-sm text-on-surface"}>
                  ~J$ 7,800 – 9,200
                </span>
                <span className={"font-body-sm text-body-sm text-primary"}>
                  In stock across 8 yards
                </span>
              </div>
            </div>
            <div className={"bg-surface-container-lowest rounded-xl p-space-md shadow-sm space-y-space-sm"}>
              <div className={"flex items-start justify-between gap-space-sm"}>
                <div className={"space-y-space-xs"}>
                  <span className={"inline-block px-2 py-0.5 rounded bg-surface-container-high text-on-surface-variant font-label-sm text-label-sm font-semibold"}>
                    Bosch Automotive
                  </span>
                  <h4 className={"font-headline-sm text-headline-sm text-on-surface"}>
                    Bosch Blue Disc Brake Pad Set
                  </h4>
                  <span className={"font-label-md text-label-md text-on-surface-variant font-mono block"}>
                    PN: BE1170H
                  </span>
                </div>
              </div>
              <div className={"flex flex-wrap items-center gap-space-xs"}>
                <span className={"px-2.5 py-1 rounded-full bg-surface-container-high text-on-surface-variant font-label-sm text-label-sm"}>
                  Semi-Metallic Tropical Spec
                </span>
                <span className={"px-2.5 py-1 rounded-full bg-surface-container-high text-on-surface-variant font-label-sm text-label-sm"}>
                  Includes Anti-Rattle Hardware
                </span>
              </div>
              <div className={"flex items-baseline justify-between pt-1"}>
                <span className={"font-headline-sm text-headline-sm text-on-surface"}>
                  ~J$ 6,500 – 8,000
                </span>
                <span className={"font-body-sm text-body-sm text-primary"}>
                  In stock across 4 yards
                </span>
              </div>
            </div>
            <button onClick={onPlugClick} className={"w-full h-12 rounded-lg bg-surface-container-highest hover:bg-surface-container-high text-on-surface font-label-lg text-label-lg flex items-center justify-center gap-2 shadow-sm active:scale-98 transition-transform"} data-act={"find-stores-near-me-12-stores-in-total"}>
              <span className={"material-symbols-outlined text-[20px] text-primary"}>
                storefront
              </span>
              <span>
                Find stores near me (12 stores in total)
              </span>
            </button>
          </section>
          <section className={"space-y-space-sm pt-2"} id={"tier-5"}>
            <div className={"flex items-center justify-between"}>
              <div className={"flex items-center gap-space-xs"}>
                <div className={"w-7 h-7 rounded-lg bg-surface-container-high flex items-center justify-center text-on-surface-variant"}>
                  <span className={"material-symbols-outlined text-[18px]"}>
                    straighten
                  </span>
                </div>
                <h3 className={"font-headline-sm text-headline-sm text-on-surface"}>
                  5. Universal Fit
                </h3>
              </div>
              <span className={"px-2.5 py-1 rounded-full bg-surface-container-high text-on-surface-variant font-label-sm text-label-sm uppercase tracking-wide"}>
                Spec Matched
              </span>
            </div>
            <p className={"font-body-sm text-body-sm text-on-surface-variant pl-9"}>
              Matched by universal size/spec (standard DOT 4 brake fluid, universal shims, caliper slider pins).
            </p>
            <div className={"bg-surface-container rounded-xl p-space-md shadow-sm transition-all duration-200"}>
              <div className={"flex items-start gap-space-sm"}>
                <div className={"w-9 h-9 rounded-full bg-surface-container-highest flex items-center justify-center shrink-0 text-on-surface-variant"}>
                  <span className={"material-symbols-outlined text-[20px]"}>
                    info
                  </span>
                </div>
                <div className={"space-y-space-xs flex-1"}>
                  <h4 className={"font-label-lg text-label-lg text-on-surface"}>
                    No universal friction pads
                  </h4>
                  <p className={"font-body-sm text-body-sm text-on-surface-variant"}>
                    None found for brake pads (front) — brake pads require vehicle-specific backing plate dimensions.
                  </p>
                </div>
              </div>
              <button onClick={onPlugClick} className={"w-full mt-space-sm pt-space-sm flex items-center justify-between text-primary font-label-md text-label-md"} id={"toggle-universal-btn"} data-act={"toggle-universal-btn"}>
                <span>
                  {"Tap to expand universal brake hardware & fluids"}
                </span>
                <span className={"material-symbols-outlined text-[20px] transition-transform duration-200"} id={"toggle-arrow"}>
                  expand_more
                </span>
              </button>
              <div className={"hidden mt-space-md pt-space-sm space-y-space-sm"} id={"universal-specs"}>
                <div className={"p-space-sm bg-surface-container-lowest rounded-lg flex items-center justify-between"}>
                  <div>
                    <h5 className={"font-label-md text-label-md text-on-surface"}>
                      DOT 4 Brake Fluid (Tropical Spec)
                    </h5>
                    <span className={"font-body-sm text-body-sm text-on-surface-variant"}>
                      Universal spec for 1KR-FE brake system
                    </span>
                  </div>
                  <span className={"font-label-lg text-label-lg text-primary"}>
                    ~J$ 1,200
                  </span>
                </div>
                <div className={"p-space-sm bg-surface-container-lowest rounded-lg flex items-center justify-between"}>
                  <div>
                    <h5 className={"font-label-md text-label-md text-on-surface"}>
                      High-Temp Caliper Synthetic Grease
                    </h5>
                    <span className={"font-body-sm text-body-sm text-on-surface-variant"}>
                      {"Guide pin & backing shim lube"}
                    </span>
                  </div>
                  <span className={"font-label-lg text-label-lg text-primary"}>
                    ~J$ 850
                  </span>
                </div>
              </div>
            </div>
          </section>
          <div className={"fixed bottom-0 inset-x-0 z-40 bg-surface/90 backdrop-blur-md px-gutter py-3 shadow-[0_-4px_16px_rgba(0,0,0,0.08)]"}>
            <div className={"max-w-md mx-auto flex items-center gap-space-sm"}>
              <button onClick={onPlugClick} className={"flex-1 h-12 rounded-lg bg-surface-container-highest text-on-surface font-label-lg text-label-lg flex items-center justify-center gap-1.5 shadow-sm active:scale-95 transition-transform"} data-act={"compare-tiers"}>
                <span className={"material-symbols-outlined text-[20px] text-primary"}>
                  compare_arrows
                </span>
                <span>
                  Compare Tiers
                </span>
              </button>
              <button onClick={onPlugClick} className={"flex-1 h-12 rounded-lg bg-primary hover:bg-primary-container text-on-primary font-label-lg text-label-lg shadow-md flex items-center justify-center gap-1.5 active:scale-95 transition-transform"} data-act={"view-on-parts-map"} data-way-out={"primary"}>
                <span className={"material-symbols-outlined text-[20px]"}>
                  map
                </span>
                <span>
                  View on Parts Map
                </span>
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
