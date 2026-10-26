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
                Parts
              </h1>
              <span className={"font-label-md text-label-md text-on-surface-variant truncate"} data-slot={"car"}>
                Add a car</span>
            </div>
          </div>
        </div>
      </header>
      <main className={"flex-1 flex flex-col relative w-full px-gutter pt-16 pb-safe bg-surface"}>
        <div className={"flex flex-col w-full pb-10 space-y-space-md"}>
          <section className={"w-full bg-surface-container-lowest rounded-xl p-space-md shadow-sm"}>
            <h2 className={"font-headline-sm text-headline-sm text-on-surface"}>
              Parts for this car are not listed yet
            </h2>
            <p className={"font-body-md text-body-md text-on-surface-variant mt-space-xs"}>
              Parts show here after they are in the catalog for your car.
            </p>
          </section>
          <button onClick={onPlugClick} data-add-car="" data-act={"add-a-car"} data-way-out={"primary"} className={"w-full min-h-12 rounded-lg bg-surface-container-high text-on-surface font-label-lg text-label-lg flex items-center justify-center gap-space-sm active:scale-95 transition-transform"}>
            Add a car
          </button>
          <button onClick={onPlugClick} className={"w-full min-h-12 rounded-lg bg-primary text-on-primary font-label-lg text-label-lg flex items-center justify-center gap-space-sm active:scale-95 transition-transform"} data-act={"find-parts-stores-near-me"} data-way-out={"primary"}>
            <span className={"material-symbols-outlined text-[20px]"}>
              storefront
            </span>
            <span>
              Find Parts Stores Near Me
            </span>
          </button>
        </div>
      </main>
    </div>
  );
}
