import { useEffect, useRef } from 'react';
import { onPlugClick } from '../../shell/actions';
import { bindScreen } from '../../shell/bind';


export function SubmittedToastScreen() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (ref.current) bindScreen("45c-submitted-toast.html", ref.current); }, []);
  return (
    <div ref={ref} data-plug-screen={"45c-submitted-toast.html"} className={"bg-background text-on-surface antialiased flex flex-col justify-between min-h-screen font-body-md overflow-x-hidden"}>
      <div className={"fixed top-0 left-0 right-0 z-50 px-margin safe-top pointer-events-none"}>
        <div className={"pointer-events-auto mt-2 mx-auto max-w-sm flex items-center justify-between gap-3 bg-surface-container-lowest/95 backdrop-blur-md px-4 py-2.5 rounded-full border border-outline-variant shadow-lg"}>
          <div className={"flex items-center gap-2.5"}>
            <div className={"w-6 h-6 rounded-full bg-emerald-600 flex items-center justify-center text-white shrink-0 shadow-sm"}>
              <span className={"material-symbols-outlined text-[16px]"} style={{ fontVariationSettings: "'FILL' 1" }}>
                check
              </span>
            </div>
            <div className={"flex items-baseline gap-1.5"}>
              <span className={"font-headline-sm text-label-lg font-bold text-on-surface tracking-tight"}>
                Submitted
              </span>
              <span className={"font-body-sm text-body-sm text-on-surface-variant font-medium"}>
                to Island Grid
              </span>
            </div>
          </div>
          <span className={"font-label-sm text-label-sm bg-emerald-50 text-emerald-800 px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider border border-emerald-200"}>
            Live Sync
          </span>
        </div>
      </div>
      <main className={"w-full max-w-md mx-auto pt-24 pb-28 px-margin flex flex-col gap-space-md"}>
        <div className={"flex items-center justify-between pt-1"}>
          <div>
            <div className={"flex items-center gap-1.5 text-primary"}>
              <span className={"material-symbols-outlined text-[18px]"}>
                verified
              </span>
              <span className={"font-label-md text-label-md uppercase tracking-wider font-bold"}>
                Contribution Logged
              </span>
            </div>
            <h1 className={"font-headline-lg-mobile text-headline-lg text-on-surface mt-0.5 tracking-tight"}>
              {""}
            </h1>
          </div>
          <div className={"shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-50 border border-amber-200 text-amber-900 shadow-sm"}>
            <span className={"w-2 h-2 rounded-full bg-amber-500 animate-pulse"} />
            <span className={"font-label-md text-label-md font-bold tracking-tight"}>
              Pending Review
            </span>
          </div>
        </div>
        <div className={"bg-surface-container-lowest rounded-xl p-3.5 border border-outline-variant shadow-sm flex items-center justify-between"}>
          <div className={"flex items-center gap-3"}>
            <div className={"w-10 h-10 rounded-lg bg-tertiary-fixed/60 text-tertiary flex items-center justify-center shrink-0"}>
              <span className={"material-symbols-outlined text-[24px]"} style={{ fontVariationSettings: "'FILL' 1" }}>
                local_fire_department
              </span>
            </div>
            <div>
              <div className={"flex items-center gap-1.5"}>
                <span className={"font-headline-sm text-label-lg font-bold text-primary"}>
                  
                </span>
              </div>
              <p className={"font-body-sm text-body-sm text-on-surface-variant"}>
                
              </p>
            </div>
          </div>
          <div className={"text-right pl-2 border-l border-surface-container-high"}>
            <span className={"font-label-sm text-label-sm uppercase text-on-surface-variant font-bold block"}>
              Scout Score
            </span>
            <span className={"font-headline-sm text-headline-sm font-bold text-on-surface"}>
              340
              <span className={"font-body-sm text-body-sm font-normal text-on-surface-variant"}>
                / 500
              </span>
            </span>
          </div>
        </div>
        <div className={"bg-surface-container-lowest rounded-xl p-4 border border-outline-variant shadow-sm flex flex-col gap-3.5"}>
          <div className={"flex items-center justify-between pb-3 border-b border-surface-container-high"}>
            <div className={"flex items-center gap-2"}>
              <span className={"inline-flex items-center gap-1 font-label-md text-label-md font-bold px-2.5 py-1 rounded bg-surface-container text-on-surface"}>
                <span className={"material-symbols-outlined text-[16px] text-primary"}>
                  car_repair
                </span>
                {"Tyre & Vulcanizing / Mechanic"}
              </span>
            </div>
            <span className={"font-body-sm text-body-sm text-on-surface-variant flex items-center gap-1"}>
              <span className={"material-symbols-outlined text-[14px]"}>
                schedule
              </span>
              Just now
            </span>
          </div>
          <div className={"flex items-start gap-3"}>
            <div className={"w-8 h-8 rounded-lg bg-surface-container flex items-center justify-center text-primary shrink-0 mt-0.5"}>
              <span className={"material-symbols-outlined text-[20px]"}>
                location_on
              </span>
            </div>
            <div className={"flex-1 min-w-0"}>
              <h2 className={"font-headline-sm text-label-lg font-bold text-on-surface truncate"}>
              </h2>
              <p className={"font-body-md text-body-md text-on-surface-variant"}>
                Half-Way-Tree, St. Andrew
              </p>
            </div>
          </div>
          <div className={"bg-surface-container-low rounded-lg p-2.5 flex items-center justify-between border border-outline-variant/60"}>
            <div className={"flex items-center gap-2"}>
              <span className={"material-symbols-outlined text-[18px] text-on-surface-variant"}>
                my_location
              </span>
              <span className={"font-body-sm text-body-sm text-on-surface font-mono font-medium"}>
                18.0125° N, 76.7993° W
              </span>
            </div>
            <span className={"font-label-sm text-label-sm bg-surface-container px-2 py-0.5 rounded text-on-surface-variant font-bold"}>
              ±6m accuracy
            </span>
          </div>
          <div className={"space-y-1.5 pt-1"}>
            <div className={"flex items-center justify-between"}>
              <span className={"font-label-md text-label-md text-on-surface-variant font-bold uppercase tracking-wider"}>
                Submitted Photos (2)
              </span>
              <span className={"font-label-sm text-label-sm text-primary font-bold"}>
                Geo-tagged
              </span>
            </div>
            <div className={"grid grid-cols-2 gap-2.5"}>
              <div className={"relative h-28 rounded-lg overflow-hidden border border-outline-variant bg-surface-container"}>
                <div className={"w-full h-full object-cover bg-surface-container flex items-center justify-center text-primary"} aria-hidden={"true"}><span className={"material-symbols-outlined text-[32px]"}>image</span></div>
                <span className={"absolute bottom-1.5 left-1.5 bg-black/75 backdrop-blur-sm text-white px-2 py-0.5 rounded font-label-sm text-label-sm"}>
                  Storefront
                </span>
              </div>
              <div className={"relative h-28 rounded-lg overflow-hidden border border-outline-variant bg-surface-container"}>
                <div className={"w-full h-full object-cover bg-surface-container flex items-center justify-center text-primary"} aria-hidden={"true"}><span className={"material-symbols-outlined text-[32px]"}>image</span></div>
                <span className={"absolute bottom-1.5 left-1.5 bg-black/75 backdrop-blur-sm text-white px-2 py-0.5 rounded font-label-sm text-label-sm"}>
                  Service Bay
                </span>
              </div>
            </div>
          </div>
        </div>
        <div className={"bg-amber-50/70 rounded-xl p-4 border border-amber-200/80 flex items-start gap-3.5"}>
          <div className={"w-8 h-8 rounded-full bg-amber-100 text-amber-900 flex items-center justify-center shrink-0"}>
            <span className={"material-symbols-outlined text-[20px]"}>
              info
            </span>
          </div>
          <div className={"flex-1 space-y-1"}>
            <h3 className={"font-headline-sm text-label-lg font-bold text-amber-950"}>
              Waiting for Roam
            </h3>
            <p className={"font-body-sm text-body-sm text-amber-900/90 leading-relaxed"}>
              Roam reviews every place.
            </p>
          </div>
        </div>
        <div className={"flex flex-col gap-2.5 pt-1"}>
          <button onClick={onPlugClick} className={"w-full h-12 bg-primary-container hover:bg-primary active:scale-[0.98] transition-all duration-150 rounded-xl text-on-primary font-label-lg text-label-lg font-bold flex items-center justify-center gap-2 shadow-md"} type={"button"} data-act={"map-another-place"} data-way-out={"primary"}>
            <span className={"material-symbols-outlined text-[20px]"}>
              add_location_alt
            </span>
            <span>
              Map Another Place
            </span>
          </button>
          <div className={"grid grid-cols-2 gap-2.5"}>
            <button onClick={onPlugClick} className={"w-full h-11 bg-surface-container-lowest border border-outline-variant active:scale-[0.98] transition-all duration-150 rounded-xl text-on-surface font-label-md text-label-md font-bold flex items-center justify-center gap-1.5 hover:bg-surface-container-low"} type={"button"} data-act={"back-to-island-map"}>
              <span className={"material-symbols-outlined text-[18px] text-primary"}>
                map
              </span>
              <span>
                Back to Island Map
              </span>
            </button>
            <button onClick={onPlugClick} className={"w-full h-11 bg-surface-container-lowest border border-outline-variant active:scale-[0.98] transition-all duration-150 rounded-xl text-on-surface font-label-md text-label-md font-bold flex items-center justify-center gap-1.5 hover:bg-surface-container-low"} type={"button"} data-act={"my-contributions"}>
              <span className={"material-symbols-outlined text-[18px] text-on-surface-variant"}>
                history_edu
              </span>
              <span>
                My Contributions
              </span>
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
