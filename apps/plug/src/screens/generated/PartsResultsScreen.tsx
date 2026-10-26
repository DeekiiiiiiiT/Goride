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
                Parts
              </h1>
              <span className={"font-label-md text-label-md text-on-surface-variant truncate"} data-slot={"car"}>
                Add a car</span>
            </div>
          </div>
        </div>
      </header>
      <main className={"flex-1 flex flex-col relative w-full px-gutter pt-16 pb-safe bg-surface"}>
        <div className={"flex flex-col w-full pb-28 space-y-space-md"}>
          <p className={"font-label-md text-label-md text-on-surface-variant"} data-slot={"parts-count"} data-slot-row="" style={{ display: "none" }} />
          <section data-parts-empty="" className={"bg-surface-container-lowest rounded-xl p-space-md shadow-sm"}>
            <h2 className={"font-headline-sm text-headline-sm text-on-surface"}>
              No parts listed for this car yet
            </h2>
            <p className={"font-body-md text-body-md text-on-surface-variant mt-space-xs"}>
              When a part is in the catalog for your car, it shows here.
            </p>
          </section>
          <div data-parts-list="" className={"flex flex-col gap-space-md"} />
          <a onClick={onPlugClick} href={"#part"} data-act={"open-part"} data-part-template="" className={"w-full min-h-12 rounded-xl bg-surface-container-lowest p-space-md shadow-sm text-left flex flex-col gap-1"} style={{ display: "none" }}>
            <h4 className={"font-headline-sm text-headline-sm text-on-surface"} data-slot={"part-name"} />
            <p className={"font-label-md text-label-md text-primary"} data-slot={"part-number"} data-slot-row="" style={{ display: "none" }} />
            <p className={"font-body-sm text-body-sm text-on-surface-variant"} data-slot={"fit-reason"} />
          </a>
          <button onClick={onPlugClick} className={"w-full min-h-12 rounded-lg bg-primary text-on-primary font-label-lg text-label-lg flex items-center justify-center gap-space-sm active:scale-95 transition-transform"} data-act={"parts-stores"} data-way-out={"primary"}>
            <span className={"material-symbols-outlined text-[20px]"}>
              storefront
            </span>
            <span>
              Parts stores
            </span>
          </button>
        </div>
      </main>
    </div>
  );
}
