import { useEffect, useRef } from 'react';
import { onPlugClick } from '../../shell/actions';
import { bindScreen } from '../../shell/bind';


export function ServiceItemScreen() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (ref.current) bindScreen("32-service-item.html", ref.current); }, []);
  return (
    <div ref={ref} data-plug-screen={"32-service-item.html"} className={"bg-surface font-body-md text-on-surface flex flex-col min-h-screen"}>
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
                Service Item Detail
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
        <div className={"flex flex-col w-full pb-8 space-y-space-md"}>
          <div className={"flex items-center justify-between pt-space-xs"}>
            <div className={"flex items-center gap-space-xs bg-surface-container px-3 py-1.5 rounded-full"}>
              <span className={"material-symbols-outlined text-[16px] text-tertiary"} style={{ fontVariationSettings: "'FILL' 1" }}>
                security
              </span>
              <span className={"font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant"}>
                {"Braking & Safety System"}
              </span>
            </div>
            <div className={"flex items-center gap-1.5 bg-tertiary-fixed text-on-tertiary-fixed px-2.5 py-1 rounded-full shadow-sm"}>
              <span className={"w-2 h-2 rounded-full bg-tertiary animate-pulse"} />
              <span className={"font-label-sm text-label-sm font-bold"}>
                </span>
            </div>
          </div>
          <div className={"flex flex-col space-y-1"}>
            <h2 className={"font-headline-lg text-headline-lg text-on-surface tracking-tight"}>
              {"Front Brake Pads & Rotors"}
            </h2>
            <div className={"flex items-center gap-2 text-on-surface-variant font-label-md text-label-md"}>
              <span data-slot={"car"}>
                Add a car</span>
              <span>
                •
              </span>
              <span className={"text-primary font-semibold"}>
                Odo: 
              </span>
            </div>
          </div>
          <div className={"bg-surface-container-lowest rounded-xl p-space-md shadow-sm space-y-space-sm"}>
            <div className={"flex items-center justify-between"}>
              <div className={"flex items-center gap-2"}>
                <div className={"w-8 h-8 rounded-lg bg-surface-container-high flex items-center justify-center text-primary"}>
                  <span className={"material-symbols-outlined text-[20px]"}>
                    speed
                  </span>
                </div>
                <div>
                  <p className={"font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider"}>
                    Interval Wear Life
                  </p>
                  <p className={"font-headline-sm text-headline-sm text-on-surface"} />
                </div>
              </div>
              <div className={"text-right"}>
                <span className={"font-label-sm text-label-sm text-on-surface-variant block"}>
                  Target Replace
                </span>
                <span className={"font-headline-sm text-headline-sm text-primary font-bold"}>
                  
                </span>
              </div>
            </div>
            <div className={"space-y-1.5 pt-1"}>
              <div className={"h-3 w-full bg-surface-container-highest rounded-full overflow-hidden p-0.5 flex"}>
              </div>
              <div className={"flex justify-between items-center text-on-surface-variant font-label-sm text-label-sm px-0.5"}>
                <span className={"text-primary font-semibold"}>
                  Current:
                </span>
              </div>
            </div>
            <div className={"grid grid-cols-2 gap-space-sm pt-2"}>
              <div className={"bg-surface-container-low rounded-lg p-2.5"}>
                <span className={"font-label-sm text-label-sm text-on-surface-variant block"}>
                  Spec Interval
                </span>
                <span className={"font-label-lg text-label-lg text-on-surface font-semibold"} />
              </div>
              <div className={"bg-surface-container-low rounded-lg p-2.5"}>
                <span className={"font-label-sm text-label-sm text-on-surface-variant block"}>
                  Projected Service
                </span>
                <span className={"font-label-lg text-label-lg text-on-surface font-semibold"} data-slot={"projected-service"} />
              </div>
            </div>
          </div>
          <div className={"bg-surface-container rounded-xl p-space-md shadow-sm relative overflow-hidden"}>
            <div className={"flex items-start gap-3"}>
              <div className={"w-10 h-10 rounded-full bg-secondary-fixed flex items-center justify-center shrink-0 text-on-secondary-fixed"}>
                <span className={"material-symbols-outlined text-[22px]"}>
                  terrain
                </span>
              </div>
              <div className={"space-y-1"}>
                <div className={"flex items-center gap-1.5"}>
                  <h3 className={"font-label-lg text-label-lg text-on-surface font-bold"}>
                    Why It Matters on Island Roads
                  </h3>
                  <span className={"bg-secondary-fixed-variant/10 text-secondary font-label-sm text-label-sm px-1.5 py-0.5 rounded"}>
                    Island Route Note
                  </span>
                </div>
                <p className={"font-body-md text-body-md text-on-surface-variant leading-relaxed"}>
                  Crucial for downhill braking control through Mount Rosser and Junction road descents. Tropical wet heat causes faster pad glazing on stop-and-go Jamaican routes.
                </p>
              </div>
            </div>
          </div>
          <div className={"hidden bg-surface-container-lowest rounded-xl p-space-md shadow-sm space-y-space-sm"} data-slot-row={"last-service"} style={{ display: "none" }}>
            <h3 className={"font-label-lg text-label-lg text-on-surface font-bold flex items-center gap-1.5"}>
              <span className={"material-symbols-outlined text-primary text-[20px]"}>
                history_edu
              </span>
              Last Service Record
            </h3>
            <p className={"font-label-md text-label-md text-on-surface-variant"} data-slot={"last-service-date"} />
            <p className={"font-body-md text-body-md text-on-surface"} data-slot={"last-service-shop"} data-slot-row={"last-service-shop"} />
          </div>
          <div className={"space-y-space-xs"}>
            <h3 className={"font-headline-sm text-headline-sm text-on-surface px-1"}>
              Island Fast Tracks
            </h3>
            <div className={"grid grid-cols-1 gap-space-sm"}>
              <button onClick={onPlugClick} className={"w-full text-left bg-surface-container-lowest rounded-xl p-space-md shadow-sm active:scale-[0.99] transition-transform"} data-act={"find-pads-rotors-in-stock-mario-s-auto-parts-con"}>
                <div className={"flex items-center justify-between"}>
                  <div className={"flex items-center gap-3"}>
                    <div className={"w-10 h-10 rounded-full bg-primary-fixed flex items-center justify-center text-on-primary-fixed"}>
                      <span className={"material-symbols-outlined text-[20px]"}>
                        shopping_bag
                      </span>
                    </div>
                    <div>
                      <div className={"flex items-center gap-1.5"}>
                        <span className={"font-label-lg text-label-lg text-on-surface font-bold"}>
                          {"Find Pads & Rotors"}
                        </span>
                        <span className={"bg-surface-container text-on-surface-variant font-label-sm text-label-sm px-1.5 rounded"}>
                          In Stock
                        </span>
                      </div>
                      <p className={"font-body-sm text-body-sm text-on-surface-variant mt-0.5"}>
                         • OEM Ready
                      </p>
                    </div>
                  </div>
                  <span className={"material-symbols-outlined text-primary text-[20px]"}>
                    chevron_right
                  </span>
                </div>
              </button>
              <button onClick={onPlugClick} className={"w-full text-left bg-surface-container-lowest rounded-xl p-space-md shadow-sm active:scale-[0.99] transition-transform"} data-act={"find-a-mechanic-4-nearby-precision-auto-works-1-"}>
                <div className={"flex items-center justify-between"}>
                  <div className={"flex items-center gap-3"}>
                    <div className={"w-10 h-10 rounded-full bg-secondary-fixed flex items-center justify-center text-on-secondary-fixed"}>
                      <span className={"material-symbols-outlined text-[20px]"}>
                        build_circle
                      </span>
                    </div>
                    <div>
                      <div className={"flex items-center gap-1.5"}>
                        <span className={"font-label-lg text-label-lg text-on-surface font-bold"}>
                          Find a Mechanic
                        </span>
                        <span className={"bg-secondary-fixed-variant/10 text-secondary font-label-sm text-label-sm px-1.5 rounded"}>
                          4 Nearby
                        </span>
                      </div>
                      <p className={"font-body-sm text-body-sm text-on-surface-variant mt-0.5"}>
                         •  away in Kingston
                      </p>
                    </div>
                  </div>
                  <span className={"material-symbols-outlined text-secondary text-[20px]"}>
                    chevron_right
                  </span>
                </div>
              </button>
            </div>
          </div>
          <div className={"pt-space-sm space-y-3"}>
            <button onClick={onPlugClick} className={"w-full h-12 bg-primary hover:bg-primary-container text-on-primary font-label-lg text-label-lg font-bold rounded-xl shadow-md flex items-center justify-center gap-2 active:scale-95 transition-all"} data-act={"mark-as-done-log-service"} data-way-out={"primary"}>
              <span className={"material-symbols-outlined text-[20px]"}>
                check_circle
              </span>
              <span>
                Mark as Done / Log Service
              </span>
            </button>
            <button onClick={onPlugClick} className={"w-full h-12 bg-surface-container hover:bg-surface-container-high text-on-surface-variant font-label-lg text-label-lg font-semibold rounded-xl flex items-center justify-center gap-2 active:scale-95 transition-all"} data-act={"add-to-to-do-remind-me-in-3-000-km"}>
              <span className={"material-symbols-outlined text-[20px]"}>
                alarm
              </span>
              <span>
                Add to To-Do / Remind me in 
              </span>
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
