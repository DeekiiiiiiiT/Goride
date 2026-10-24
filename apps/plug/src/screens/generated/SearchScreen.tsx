import { useEffect, useRef } from 'react';
import { onPlugClick } from '../../shell/actions';
import { bindScreen } from '../../shell/bind';
import { SearchBody } from '../../shell/bind';

export function SearchScreen() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (ref.current) bindScreen("49-search.html", ref.current); }, []);
  return (
    <div ref={ref} data-plug-screen={"49-search.html"} className={"bg-surface font-body-md text-on-surface flex flex-col min-h-screen"}>
      <header className={"fixed top-0 w-full z-50 pt-safe bg-surface/90 backdrop-blur-xl shadow-[0_1px_8px_rgba(0,0,0,0.04)]"}>
        <div className={"h-16 px-gutter flex items-center gap-space-sm"}>
          <button onClick={onPlugClick} aria-label={"Go back"} className={"w-12 h-12 flex-shrink-0 flex items-center justify-center rounded-full text-on-surface hover:bg-surface-container active:bg-surface-container-high transition-colors"} type={"button"} data-act={"arrow-back"} data-way-out={"back"}>
            <span className={"material-symbols-outlined text-[24px]"}>
              arrow_back
            </span>
          </button>
          <form className={"flex-1 relative flex items-center min-w-0"}>
            <span className={"material-symbols-outlined text-[20px] text-on-surface-variant absolute left-3 pointer-events-none"}>
              search
            </span>
            <input onClick={onPlugClick} aria-label={"Search query"} className={"w-full h-11 pl-10 pr-10 rounded-full bg-surface-container-lowest text-on-surface font-body-md placeholder:text-outline border border-outline-variant/60 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary shadow-sm"} placeholder={"Search tolls, highways, exits..."} type={"search"} defaultValue={"Highway 2000"} data-act={"input"} />
            <button onClick={onPlugClick} aria-label={"Clear search"} className={"absolute right-1 w-9 h-9 flex items-center justify-center rounded-full text-on-surface-variant hover:text-on-surface hover:bg-surface-container active:bg-surface-container-high transition-colors"} type={"button"} data-act={"close"} data-way-out={"back"}>
              <span className={"material-symbols-outlined text-[18px]"}>
                close
              </span>
            </button>
          </form>
        </div>
      </header>
      <SearchBody />
    </div>
  );
}
