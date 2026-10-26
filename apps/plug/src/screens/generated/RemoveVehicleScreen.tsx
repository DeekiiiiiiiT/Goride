import { useEffect, useRef } from 'react';
import { onPlugClick } from '../../shell/actions';
import { bindScreen } from '../../shell/bind';


export function RemoveVehicleScreen() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (ref.current) bindScreen("30b-remove-vehicle.html", ref.current); }, []);
  return (
    <div ref={ref} data-plug-screen={"30b-remove-vehicle.html"} className={"bg-background text-on-surface antialiased font-body-md min-h-screen flex items-center justify-center p-0 select-none sm:p-4"}>
      <div className={"relative w-full max-w-md h-[884px] max-h-[920px] bg-background overflow-hidden shadow-2xl flex flex-col sm:rounded-[40px] sm:border-[8px] sm:border-neutral-900"}>
        <div className={"bg-surface pt-safe shadow-sm border-b border-outline-variant/30 flex justify-between items-center w-full px-4 min-h-14 max-w-md mx-auto z-10"}>
          <button onClick={onPlugClick} aria-label={"Back"} className={"w-10 h-10 flex items-center justify-center rounded-full hover:bg-surface-container-high/50 transition-colors text-primary active:scale-95"} data-act={"arrow-back"} data-way-out={"back"}>
            <span className={"material-symbols-outlined text-primary"}>
              arrow_back
            </span>
          </button>
          <h1 className={"text-headline-sm font-headline-sm font-extrabold text-primary tracking-tight"}>
            Add a car
          </h1>
          <button onClick={onPlugClick} aria-label={"Share"} className={"w-10 h-10 flex items-center justify-center rounded-full hover:bg-surface-container-high/50 transition-colors text-primary active:scale-95"} data-act={"share"}>
            <span className={"material-symbols-outlined text-primary"}>
              share
            </span>
          </button>
        </div>
        <div aria-hidden={"true"} className={"flex-1 overflow-y-auto px-4 pb-20 pt-2 space-y-4 pointer-events-none"}>
          <div className={"relative rounded-2xl overflow-hidden bg-surface-container-lowest border border-outline-variant/30 shadow-sm"}>
            <div className={"h-44 w-full relative overflow-hidden bg-surface-container-high"}>
              <div className={"w-full h-full object-cover bg-surface-container flex items-center justify-center text-primary"} aria-hidden={"true"}><span className={"material-symbols-outlined text-[32px]"}>image</span></div>
              <div className={"absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent"} />
              <div className={"absolute top-3 right-3 bg-surface-container-lowest/95 backdrop-blur-sm px-2.5 py-1 rounded-full text-label-sm font-label-sm font-bold text-on-surface border border-outline-variant/40 flex items-center gap-1"}>
                <span className={"w-2 h-2 rounded-full bg-emerald-600"} />
                Active Taxi
              </div>
              <div className={"absolute bottom-3 left-4 right-4 text-white"}>
                <div className={"text-label-sm font-label-sm uppercase tracking-wider text-orange-200"}>
                  Add a car
                </div>
                <div className={"flex items-center justify-between mt-0.5"}>
                  <span className={"text-headline-md font-headline-md font-extrabold tracking-tight"}>
                    
                  </span>
                  <span className={"text-label-md font-label-md bg-white/20 backdrop-blur-md px-2.5 py-0.5 rounded-md font-mono"}>
                    Kingston, JA
                  </span>
                </div>
              </div>
            </div>
            <div className={"grid grid-cols-3 divide-x divide-outline-variant/20 py-3 bg-surface-container-lowest"}>
              <div className={"text-center px-2"}>
                <p className={"text-label-sm font-label-sm text-on-surface-variant uppercase"}>
                  Odometer
                </p>
                <p className={"text-label-lg font-label-lg font-bold text-on-surface mt-0.5"}>
                  
                </p>
              </div>
              <div className={"text-center px-2"}>
                <p className={"text-label-sm font-label-sm text-on-surface-variant uppercase"}>
                  Efficiency
                </p>
                <p className={"text-label-lg font-label-lg font-bold text-primary mt-0.5"}>
                  /L
                </p>
              </div>
              <div className={"text-center px-2"}>
                <p className={"text-label-sm font-label-sm text-on-surface-variant uppercase"}>
                  Fuel Type
                </p>
                <p className={"text-label-lg font-label-lg font-bold text-on-surface mt-0.5"}>
                  E-10 87
                </p>
              </div>
            </div>
          </div>
          <div className={"flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar"}>
            <button onClick={onPlugClick} className={"px-4 py-2 rounded-full bg-primary text-on-primary text-label-md font-label-md font-bold shadow-sm whitespace-nowrap"} data-act={"overview"} data-way-out={"primary"}>
              Overview
            </button>
            <button onClick={onPlugClick} className={"px-4 py-2 rounded-full bg-surface-container-lowest text-on-surface-variant border border-outline-variant/40 text-label-md font-label-md whitespace-nowrap"} data-act={"service"}>
              Service
            </button>
            <button onClick={onPlugClick} className={"px-4 py-2 rounded-full bg-surface-container-lowest text-on-surface-variant border border-outline-variant/40 text-label-md font-label-md whitespace-nowrap"} data-act={"fuel-logs"}>
              Fuel Logs
            </button>
            <button onClick={onPlugClick} className={"px-4 py-2 rounded-full bg-surface-container-lowest text-on-surface-variant border border-outline-variant/40 text-label-md font-label-md whitespace-nowrap"} data-act={"docs-tax"}>
              {"Docs & Tax"}
            </button>
          </div>
          <div className={"p-3.5 rounded-2xl bg-amber-50 border-l-4 border-amber-500 border border-amber-200/60 shadow-sm flex items-start gap-3"}>
            <span className={"material-symbols-outlined text-amber-600 mt-0.5"} data-weight={"fill"}>
              warning
            </span>
            <div className={"flex-1"}>
              <div className={"flex items-center justify-between"}>
                <h4 className={"text-label-lg font-label-lg font-bold text-amber-950"}>
                  Statutory Fitness Certificate
                </h4>
                <span className={"text-label-sm font-label-sm font-bold bg-amber-200/80 text-amber-900 px-2 py-0.5 rounded-full"}>
                  18 days
                </span>
              </div>
              <p className={"text-body-sm font-body-sm text-amber-900 mt-0.5"}>
                
              </p>
            </div>
          </div>
          <div className={"p-4 rounded-2xl bg-surface-container-lowest border border-outline-variant/30 shadow-sm"}>
            <div className={"flex justify-between items-center mb-2"}>
              <div className={"flex items-center gap-2"}>
                <span className={"material-symbols-outlined text-primary text-[20px]"}>
                  build_circle
                </span>
                <span className={"text-label-lg font-label-lg font-bold text-on-surface"}>
                  {"Oil & CVT Fluid Flush"}
                </span>
              </div>
              <span className={"text-label-sm font-label-sm text-on-surface-variant"}>
                2 weeks ago
              </span>
            </div>
            <p className={"text-body-sm font-body-sm text-on-surface-variant"}>
              {"Shell Helix Ultra 0W-20 & Genuine Toyota TC Transmission oil replacement at TotalEnergies Half-Way-Tree."}
            </p>
            <div className={"mt-2.5 pt-2.5 border-t border-outline-variant/20 flex justify-between items-center text-label-sm font-label-sm"}>
              <span className={"text-on-surface-variant"}>
                Cost: JMD $19,450
              </span>
              <span className={"text-primary font-bold"}>
                Verified Receipt
              </span>
            </div>
          </div>
        </div>
        <div className={"absolute inset-0 z-40 bg-inverse-surface/60 backdrop-blur-[6px] transition-opacity duration-300 flex items-center justify-center p-4"}>
          <div className={"w-full max-w-sm bg-surface-container-lowest rounded-3xl p-6 shadow-2xl border border-outline-variant/40 relative transform transition-all animate-in fade-in zoom-in-95 duration-200"}>
            <button onClick={onPlugClick} aria-label={"Close modal"} className={"absolute top-4 right-4 w-9 h-9 rounded-full bg-surface-container-low text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors flex items-center justify-center active:scale-95"} data-act={"close"} data-way-out={"back"}>
              <span className={"material-symbols-outlined text-[20px]"}>
                close
              </span>
            </button>
            <div className={"flex flex-col items-center text-center"}>
              <div className={"w-14 h-14 rounded-full bg-error-container/60 text-error flex items-center justify-center mb-4 ring-8 ring-error-container/20"}>
                <span className={"material-symbols-outlined text-[30px]"} data-weight={"fill"}>
                  delete_outline
                </span>
              </div>
              <h2 className={"text-headline-sm font-headline-sm font-bold text-on-surface tracking-tight"}>
                Remove this vehicle?
              </h2>
              <p className={"text-label-lg font-label-lg text-primary font-bold mt-1.5"}>
                Fuel logs stay, the car leaves your garage.
              </p>
              <div className={"mt-3.5 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface-container border border-outline-variant/50 shadow-xs"}>
                <span className={"material-symbols-outlined text-[16px] text-on-surface-variant"}>
                  directions_car
                </span>
                <span className={"text-label-md font-label-md font-bold text-on-surface"}>
                  Add a car
                </span>
              </div>
              <div className={"mt-4 p-3 rounded-xl bg-surface-container-low border border-outline-variant/30 text-left"}>
                <div className={"flex items-start gap-2"}>
                  <span className={"material-symbols-outlined text-secondary text-[18px] mt-0.5"}>
                    info
                  </span>
                  <p className={"text-body-sm font-body-sm text-on-surface-variant leading-relaxed"}>
                    Past fuel fill-ups and expense statistics will remain saved in your motoring history under this vehicle's archive, but it will no longer appear in your active garage.
                  </p>
                </div>
              </div>
              <div className={"w-full mt-6 space-y-2.5"}>
                <button onClick={onPlugClick} className={"w-full bg-error text-on-error font-label-lg font-bold py-3.5 px-4 rounded-xl shadow-sm hover:bg-red-700 active:scale-[0.98] transition-all flex items-center justify-center gap-2"} data-act={"delete-vehicle"}>
                  <span className={"material-symbols-outlined text-[20px]"}>
                    delete
                  </span>
                  <span>
                    Delete Vehicle
                  </span>
                </button>
                <button onClick={onPlugClick} className={"w-full bg-surface-container-low text-on-surface hover:bg-surface-container active:scale-[0.98] transition-all py-3.5 px-4 rounded-xl font-label-lg font-semibold border border-outline-variant/50 text-center"} data-act={"cancel"}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
        <div className={"absolute bottom-0 left-0 right-0 h-5 flex justify-center items-center pointer-events-none z-50"}>
          <div className={"w-32 h-1 bg-on-surface/30 rounded-full"} />
        </div>
      </div>
    </div>
  );
}
