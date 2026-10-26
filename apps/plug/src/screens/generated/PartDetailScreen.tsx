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
        </div>
      </header>
      <main className={"flex-1 flex flex-col relative w-full px-gutter pt-16 pb-safe bg-surface"}>
        <div className={"flex flex-col w-full pb-10 space-y-space-md"}>
          <section data-part-missing="" className={"w-full bg-surface-container-lowest rounded-xl p-space-md shadow-sm"}>
            <h2 className={"font-headline-sm text-headline-sm text-on-surface"}>
              This part isn't listed yet
            </h2>
            <p className={"font-body-md text-body-md text-on-surface-variant mt-space-xs"}>
              It shows here when the catalog has it for your car.
            </p>
          </section>
          <section data-part-facts="" className={"w-full bg-surface-container-lowest rounded-xl p-space-md shadow-sm"} style={{ display: "none" }}>
            <div data-slot-row="" className={"inline-flex items-center px-2.5 py-1 rounded-full bg-surface-container-low mb-space-sm"} style={{ display: "none" }}>
              <span className={"font-label-md text-label-md text-on-surface font-bold"} data-slot={"fit-claim"} />
            </div>
            <h2 className={"font-headline-md text-headline-md text-on-surface tracking-tight"} data-slot={"part-name"} data-slot-row="" style={{ display: "none" }} />
            <p className={"font-body-md text-body-md text-on-surface-variant mt-space-xs"} data-slot={"part-description"} data-slot-row="" style={{ display: "none" }} />
            <p className={"font-label-md text-label-md text-on-surface-variant mt-space-xs"} data-slot={"manufacturer"} data-slot-row="" style={{ display: "none" }} />
            <div data-slot-row="" className={"mt-space-md p-space-md bg-surface-container rounded-lg flex items-center justify-between gap-space-sm"} style={{ display: "none" }}>
              <div className={"flex flex-col min-w-0"}>
                <span className={"font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider"}>
                  Part number
                </span>
                <span className={"font-price-display text-price-display text-primary tracking-wide select-all"} data-slot={"part-number"} id={"main-part-no"} />
              </div>
              <button onClick={onPlugClick} aria-label={"Copy part number"} className={"h-12 px-space-md rounded-lg bg-primary text-on-primary font-label-lg text-label-lg flex items-center gap-1.5 active:scale-95 shadow-sm transition-transform"} data-act={"copy"}>
                <span className={"material-symbols-outlined text-[20px]"}>
                  content_copy
                </span>
                <span>
                  Copy
                </span>
              </button>
            </div>
          </section>
          <section data-slot-row="" className={"w-full bg-surface-container-lowest rounded-xl p-space-md shadow-sm"} style={{ display: "none" }}>
            <h3 className={"font-headline-sm text-headline-sm text-on-surface mb-space-xs"}>
              Fit
            </h3>
            <p className={"font-body-md text-body-md text-on-surface-variant"} data-slot={"fit-reason"} />
          </section>
          <section data-slot-row="" className={"w-full bg-surface-container-lowest rounded-xl p-space-md shadow-sm"} style={{ display: "none" }}>
            <h3 className={"font-headline-sm text-headline-sm text-on-surface mb-space-xs"}>
              Also known as
            </h3>
            <div className={"flex flex-col gap-space-xs"} data-slot={"also-known"} />
          </section>
          <section data-slot-row="" className={"w-full bg-surface-container-lowest rounded-xl p-space-md shadow-sm"} style={{ display: "none" }}>
            <h3 className={"font-headline-sm text-headline-sm text-on-surface mb-space-xs"}>
              Specs
            </h3>
            <p className={"font-body-md text-body-md text-on-surface"} data-slot={"position"} />
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
        </div>
      </main>
    </div>
  );
}
