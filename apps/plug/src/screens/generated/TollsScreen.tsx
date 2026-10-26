import { useEffect, useRef } from 'react';
import { onPlugClick } from '../../shell/actions';
import { bindScreen } from '../../shell/bind';


export function TollsScreen() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (ref.current) bindScreen("48-tolls.html", ref.current); }, []);
  return (
    <div ref={ref} data-plug-screen={"48-tolls.html"} className={"bg-surface font-body-md text-on-surface flex flex-col min-h-screen"}>
      <header className={"fixed top-0 w-full z-50 pt-safe bg-surface/80 backdrop-blur-xl shadow-[0_1px_8px_rgba(0,0,0,0.04)]"}>
        <div className={"h-16 px-gutter flex items-center justify-between"}>
          <div className={"flex items-center gap-space-sm min-w-0 pr-space-sm"}>
            <button onClick={onPlugClick} aria-label={"Go back"} className={"w-12 h-12 flex-shrink-0 flex items-center justify-center rounded-full text-on-surface hover:bg-surface-container active:bg-surface-container-high transition-colors"} type={"button"} data-act={"arrow-back"} data-way-out={"back"}>
              <span className={"material-symbols-outlined text-[24px]"}>
                arrow_back
              </span>
            </button>
            <h1 className={"font-headline-sm text-headline-sm text-on-surface tracking-tight truncate"}>
              Highway Tolls
            </h1>
          </div>
          <div className={"flex items-center gap-space-xs flex-shrink-0"}>
            <button onClick={onPlugClick} aria-label={"Toll Rates & Info"} className={"w-12 h-12 flex items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container active:bg-surface-container-high transition-colors"} type={"button"} data-act={"info"}>
              <span className={"material-symbols-outlined text-[22px]"}>
                info
              </span>
            </button>
          </div>
        </div>
      </header>
            <main className={"flex flex-col relative w-full pt-16 bg-surface min-h-screen pb-safe"}>
        <div data-live-list={"tolls"} className={"flex flex-col gap-3 px-4 pt-4 pb-28"}>
          <p data-slot={"tolls-empty"}>Toll rates are not published yet.</p>
        </div>
      </main>
    </div>
  );
}
