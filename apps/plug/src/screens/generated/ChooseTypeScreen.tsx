import { useEffect, useRef } from 'react';
import { onPlugClick } from '../../shell/actions';
import { bindScreen } from '../../shell/bind';


export function ChooseTypeScreen() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (ref.current) bindScreen("42-choose-type.html", ref.current); }, []);
  return (
    <div ref={ref} data-plug-screen={"42-choose-type.html"} className={"bg-surface font-body-md text-on-surface flex flex-col min-h-screen"}>
      <header className={"fixed top-0 w-full z-50 pt-safe bg-surface/85 backdrop-blur-xl shadow-[0_1px_8px_rgba(0,0,0,0.04)]"}>
        <div className={"h-16 px-gutter flex items-center justify-between gap-space-sm"}>
          <div className={"flex items-center gap-space-sm min-w-0"}>
            <button onClick={onPlugClick} aria-label={"Go back or close"} className={"w-11 h-11 rounded-full flex items-center justify-center text-on-surface hover:bg-surface-container-high transition-colors active:scale-95"} data-act={"close"} data-way-out={"back"}>
              <span className={"material-symbols-outlined text-[24px]"}>
                close
              </span>
            </button>
            <div className={"flex flex-col min-w-0"}>
              <h1 className={"font-headline-sm text-headline-sm text-on-surface truncate"}>
                Screen 42: Choose Place Type
              </h1>
              <span className={"font-label-md text-label-md text-primary font-semibold truncate"}>
                Map It • Crowd Contribution
              </span>
            </div>
          </div>
          <div className={"flex items-center gap-space-xs"}>
            <button onClick={onPlugClick} aria-label={"Help"} className={"w-11 h-11 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container-high transition-colors"} data-act={"help-outline"}>
              <span className={"material-symbols-outlined text-[20px]"}>
                help_outline
              </span>
            </button>
          </div>
        </div>
      </header>
      <main className={"flex-1 flex flex-col relative w-full px-gutter pt-16 pb-safe bg-surface"}>
        <div className={"flex flex-col w-full pb-36"}>
          <section className={"flex flex-col gap-space-sm pt-space-xs"}>
            <div className={"flex items-center gap-space-xs"}>
              <span className={"inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-primary-fixed text-on-primary-fixed font-label-sm text-label-sm uppercase tracking-wider"}>
                <span className={"material-symbols-outlined text-[14px]"}>
                  public
                </span>
                Community Mapping
              </span>
              <span className={"text-on-surface-variant font-label-sm text-label-sm"}>
                • Step 1 of 3
              </span>
            </div>
            <div>
              <h2 className={"font-headline-lg text-headline-lg text-on-surface"}>
                What are you mapping?
              </h2>
              <p className={"font-body-md text-body-md text-on-surface-variant mt-0.5"}>
                Pick the amenity to help Jamaican motorists find authentic road services.
              </p>
            </div>
            <div className={"relative overflow-hidden rounded-xl bg-surface-container-high p-space-md shadow-sm"}>
              <div className={"flex items-start gap-space-sm"}>
                <div className={"w-10 h-10 rounded-full bg-primary-container text-on-primary-container flex items-center justify-center shrink-0 shadow-sm"}>
                  <span className={"material-symbols-outlined text-[20px]"} style={{ fontVariationSettings: "'FILL' 1" }}>
                    my_location
                  </span>
                </div>
                <div className={"flex flex-col min-w-0 pr-2"}>
                  <span className={"font-label-lg text-label-lg text-on-surface"}>
                    Physical presence required
                  </span>
                  <p className={"font-body-sm text-body-sm text-on-surface-variant mt-0.5 leading-relaxed"}>
                    You must be at the place to pin it. Roam Plug uses on-device GPS to verify genuine locations.
                  </p>
                </div>
              </div>
              <div className={"absolute -right-4 -bottom-4 w-20 h-20 rounded-full bg-primary/10 pointer-events-none blur-xl"} />
            </div>
          </section>
          <section className={"mt-space-lg"}>
            <div className={"flex items-center justify-between mb-space-sm"}>
              <span className={"font-label-md text-label-md text-on-surface-variant uppercase tracking-wider"}>
                Select Category
              </span>
              <span className={"font-label-sm text-label-sm text-primary font-semibold"}>
                8 Available
              </span>
            </div>
            <div aria-label={"Roadside place categories"} className={"grid grid-cols-2 gap-space-sm"} id={"categoryGrid"} role={"radiogroup"}>
              <button onClick={onPlugClick} aria-checked={"false"} aria-label={"Fuel station"} data-kind={"fuel"} className={"category-card group relative text-left p-space-md rounded-xl bg-surface-container-lowest shadow-md transition-all duration-200 active:scale-[0.98] cursor-pointer flex flex-col justify-between min-h-[148px]"} data-title={"Fuel station"} data-type={"fuel"} role={"radio"} type={"button"} data-act={"gas-station-petrol-diesel-kerosene-pump-services"}>
                <div className={"selection-indicator absolute top-3 right-3 w-6 h-6 rounded-full bg-primary text-on-primary flex items-center justify-center shadow-sm"}>
                  <span className={"material-symbols-outlined text-[16px]"}>
                    check
                  </span>
                </div>
                <div className={"icon-bubble w-12 h-12 rounded-xl bg-primary text-on-primary flex items-center justify-center shadow-sm mb-space-sm transition-colors"}>
                  <span className={"material-symbols-outlined text-[26px]"}>
                    local_gas_station
                  </span>
                </div>
                <div className={"flex flex-col"}>
                  <span className={"card-title font-headline-sm text-headline-sm text-primary font-bold"}>
                    Fuel station
                  </span>
                  <span className={"card-desc font-body-sm text-body-sm text-on-surface line-clamp-2 mt-0.5"}>
                    {"Petrol, diesel, kerosene & pump services"}
                  </span>
                </div>
              </button>
              <button onClick={onPlugClick} aria-checked={"false"} className={"category-card group relative text-left p-space-md rounded-xl bg-surface-container shadow-sm hover:shadow-md transition-all duration-200 active:scale-[0.98] cursor-pointer flex flex-col justify-between min-h-[148px]"} aria-label={"Parts store"} data-kind={"parts_store"} data-title={"Parts store"} data-type={"parts_store"} role={"radio"} type={"button"} data-act={"auto-parts-spares-filters-japanese-import-stock"}>
                <div className={"selection-indicator hidden absolute top-3 right-3 w-6 h-6 rounded-full bg-primary text-on-primary items-center justify-center shadow-sm"}>
                  <span className={"material-symbols-outlined text-[16px]"}>
                    check
                  </span>
                </div>
                <div className={"icon-bubble w-12 h-12 rounded-xl bg-surface-container-highest text-on-surface-variant flex items-center justify-center shadow-sm mb-space-sm transition-colors"}>
                  <span className={"material-symbols-outlined text-[26px]"}>
                    settings_suggest
                  </span>
                </div>
                <div className={"flex flex-col"}>
                  <span className={"card-title font-headline-sm text-headline-sm text-on-surface font-semibold"}>
                    Parts store
                  </span>
                  <span className={"card-desc font-body-sm text-body-sm text-on-surface-variant line-clamp-2 mt-0.5"}>
                    Spares, filters, Japanese import stock
                  </span>
                </div>
              </button>
              <button onClick={onPlugClick} aria-checked={"false"} className={"category-card group relative text-left p-space-md rounded-xl bg-surface-container shadow-sm hover:shadow-md transition-all duration-200 active:scale-[0.98] cursor-pointer flex flex-col justify-between min-h-[148px]"} aria-label={"Mechanic"} data-kind={"mechanic"} data-title={"Mechanic"} data-type={"mechanic"} role={"radio"} type={"button"} data-act={"mechanic-servicing-diagnostics-bay-repairs"}>
                <div className={"selection-indicator hidden absolute top-3 right-3 w-6 h-6 rounded-full bg-primary text-on-primary items-center justify-center shadow-sm"}>
                  <span className={"material-symbols-outlined text-[16px]"}>
                    check
                  </span>
                </div>
                <div className={"icon-bubble w-12 h-12 rounded-xl bg-surface-container-highest text-on-surface-variant flex items-center justify-center shadow-sm mb-space-sm transition-colors"}>
                  <span className={"material-symbols-outlined text-[26px]"}>
                    build
                  </span>
                </div>
                <div className={"flex flex-col"}>
                  <span className={"card-title font-headline-sm text-headline-sm text-on-surface font-semibold"}>
                    Mechanic
                  </span>
                  <span className={"card-desc font-body-sm text-body-sm text-on-surface-variant line-clamp-2 mt-0.5"}>
                    Servicing, diagnostics, bay repairs
                  </span>
                </div>
              </button>
              <button onClick={onPlugClick} aria-checked={"false"} className={"category-card group relative text-left p-space-md rounded-xl bg-surface-container shadow-sm hover:shadow-md transition-all duration-200 active:scale-[0.98] cursor-pointer flex flex-col justify-between min-h-[148px]"} aria-label={"Tyres & air"} data-kind={"tyre_air"} data-title={"Tyres & air"} data-type={"tyre_air"} role={"radio"} type={"button"} data-act={"air-pump-free-or-paid-gauge-tire-inflation"}>
                <div className={"selection-indicator hidden absolute top-3 right-3 w-6 h-6 rounded-full bg-primary text-on-primary items-center justify-center shadow-sm"}>
                  <span className={"material-symbols-outlined text-[16px]"}>
                    check
                  </span>
                </div>
                <div className={"icon-bubble w-12 h-12 rounded-xl bg-surface-container-highest text-on-surface-variant flex items-center justify-center shadow-sm mb-space-sm transition-colors"}>
                  <span className={"material-symbols-outlined text-[26px]"}>
                    air
                  </span>
                </div>
                <div className={"flex flex-col"}>
                  <span className={"card-title font-headline-sm text-headline-sm text-on-surface font-semibold"}>
                    Tyres & air
                  </span>
                  <span className={"card-desc font-body-sm text-body-sm text-on-surface-variant line-clamp-2 mt-0.5"}>
                    Free or paid gauge tire inflation
                  </span>
                </div>
              </button>
              <button onClick={onPlugClick} aria-checked={"false"} className={"category-card group relative text-left p-space-md rounded-xl bg-surface-container shadow-sm hover:shadow-md transition-all duration-200 active:scale-[0.98] cursor-pointer flex flex-col justify-between min-h-[148px]"} aria-label={"Restroom"} data-kind={"restroom"} data-title={"Restroom"} data-type={"restroom"} role={"radio"} type={"button"} data-act={"restroom-public-customer-only-depot-stops"}>
                <div className={"selection-indicator hidden absolute top-3 right-3 w-6 h-6 rounded-full bg-primary text-on-primary items-center justify-center shadow-sm"}>
                  <span className={"material-symbols-outlined text-[16px]"}>
                    check
                  </span>
                </div>
                <div className={"icon-bubble w-12 h-12 rounded-xl bg-surface-container-highest text-on-surface-variant flex items-center justify-center shadow-sm mb-space-sm transition-colors"}>
                  <span className={"material-symbols-outlined text-[26px]"}>
                    wc
                  </span>
                </div>
                <div className={"flex flex-col"}>
                  <span className={"card-title font-headline-sm text-headline-sm text-on-surface font-semibold"}>
                    Restroom
                  </span>
                  <span className={"card-desc font-body-sm text-body-sm text-on-surface-variant line-clamp-2 mt-0.5"}>
                    Public, customer-only, depot stops
                  </span>
                </div>
              </button>
              <button onClick={onPlugClick} aria-checked={"false"} className={"category-card group relative text-left p-space-md rounded-xl bg-surface-container shadow-sm hover:shadow-md transition-all duration-200 active:scale-[0.98] cursor-pointer flex flex-col justify-between min-h-[148px]"} aria-label={"Car wash"} data-kind={"car_wash"} data-title={"Car wash"} data-type={"car_wash"} role={"radio"} type={"button"} data-act={"car-wash-hand-wash-pressure-detailing-bay"}>
                <div className={"selection-indicator hidden absolute top-3 right-3 w-6 h-6 rounded-full bg-primary text-on-primary items-center justify-center shadow-sm"}>
                  <span className={"material-symbols-outlined text-[16px]"}>
                    check
                  </span>
                </div>
                <div className={"icon-bubble w-12 h-12 rounded-xl bg-surface-container-highest text-on-surface-variant flex items-center justify-center shadow-sm mb-space-sm transition-colors"}>
                  <span className={"material-symbols-outlined text-[26px]"}>
                    local_car_wash
                  </span>
                </div>
                <div className={"flex flex-col"}>
                  <span className={"card-title font-headline-sm text-headline-sm text-on-surface font-semibold"}>
                    Car wash
                  </span>
                  <span className={"card-desc font-body-sm text-body-sm text-on-surface-variant line-clamp-2 mt-0.5"}>
                    Hand wash, pressure detailing bay
                  </span>
                </div>
              </button>
              <button onClick={onPlugClick} aria-checked={"false"} className={"category-card group relative text-left p-space-md rounded-xl bg-surface-container shadow-sm hover:shadow-md transition-all duration-200 active:scale-[0.98] cursor-pointer flex flex-col justify-between min-h-[148px]"} aria-label={"Toll"} data-kind={"toll"} data-title={"Toll"} data-type={"toll"} role={"radio"} type={"button"} data-act={"ev-charging-level-2-dc-fast-charging-plugs"}>
                <div className={"selection-indicator hidden absolute top-3 right-3 w-6 h-6 rounded-full bg-primary text-on-primary items-center justify-center shadow-sm"}>
                  <span className={"material-symbols-outlined text-[16px]"}>
                    check
                  </span>
                </div>
                <div className={"icon-bubble w-12 h-12 rounded-xl bg-surface-container-highest text-on-surface-variant flex items-center justify-center shadow-sm mb-space-sm transition-colors"}>
                  <span className={"material-symbols-outlined text-[26px]"}>
                    electric_bolt
                  </span>
                </div>
                <div className={"flex flex-col"}>
                  <span className={"card-title font-headline-sm text-headline-sm text-on-surface font-semibold"}>
                    Toll
                  </span>
                  <span className={"card-desc font-body-sm text-body-sm text-on-surface-variant line-clamp-2 mt-0.5"}>
                    {"Level 2 & DC fast charging plugs"}
                  </span>
                </div>
              </button>
              <button onClick={onPlugClick} aria-checked={"false"} className={"category-card group relative text-left p-space-md rounded-xl bg-surface-container shadow-sm hover:shadow-md transition-all duration-200 active:scale-[0.98] cursor-pointer flex flex-col justify-between min-h-[148px]"} aria-label={"Roadside help"} data-kind={"roadside"} data-title={"Roadside help"} data-type={"roadside"} role={"radio"} type={"button"} data-act={"tyre-shop-vulcanizing-patching-used-tyres"}>
                <div className={"selection-indicator hidden absolute top-3 right-3 w-6 h-6 rounded-full bg-primary text-on-primary items-center justify-center shadow-sm"}>
                  <span className={"material-symbols-outlined text-[16px]"}>
                    check
                  </span>
                </div>
                <div className={"icon-bubble w-12 h-12 rounded-xl bg-surface-container-highest text-on-surface-variant flex items-center justify-center shadow-sm mb-space-sm transition-colors"}>
                  <span className={"material-symbols-outlined text-[26px]"}>
                    tire_repair
                  </span>
                </div>
                <div className={"flex flex-col"}>
                  <span className={"card-title font-headline-sm text-headline-sm text-on-surface font-semibold"}>
                    Roadside help
                  </span>
                  <span className={"card-desc font-body-sm text-body-sm text-on-surface-variant line-clamp-2 mt-0.5"}>
                    Vulcanizing, patching, used tyres
                  </span>
                </div>
              </button>
            </div>
          </section>
          <section className={"mt-space-lg mb-space-md"}>
            <div className={"rounded-xl bg-surface-container-low p-space-md flex items-center gap-space-sm shadow-sm"}>
              <div className={"w-8 h-8 rounded-full bg-tertiary-fixed text-on-tertiary-fixed flex items-center justify-center shrink-0"}>
                <span className={"material-symbols-outlined text-[18px]"}>
                  workspace_premium
                </span>
              </div>
              <p className={"font-body-sm text-body-sm text-on-surface-variant"}>
                Mapping gives you
                <strong className={"text-on-surface font-semibold"}>
                  +25 Roam Points
                </strong>
                once confirmed by 2 community members on route.
              </p>
            </div>
          </section>
          <div className={"fixed bottom-0 left-0 right-0 z-40 px-gutter pb-safe pt-space-sm bg-surface/95 backdrop-blur-md shadow-[0_-8px_24px_rgba(30,27,23,0.08)]"}>
            <div className={"max-w-md mx-auto flex flex-col gap-space-xs pb-space-sm"}>
              <div className={"flex items-center justify-between px-1"}>
                <div className={"flex items-center gap-1.5"}>
                  <span className={"w-2 h-2 rounded-full bg-primary animate-pulse"} />
                  <span className={"font-label-md text-label-md text-on-surface-variant"}>
                    Selected:
                  </span>
                  <span className={"font-label-md text-label-md text-primary font-bold"} id={"selectedLabel"}>
                    Choose a type
                  </span>
                </div>
                <span className={"font-label-sm text-label-sm text-on-surface-variant"}>
                  GPS Status: Ready
                </span>
              </div>
              <button onClick={onPlugClick} className={"w-full h-12 rounded-xl bg-primary hover:bg-primary-container text-on-primary font-label-lg text-label-lg flex items-center justify-center gap-space-sm shadow-[0_8px_20px_-4px_rgba(234,88,12,0.3)] transition-all duration-150 active:scale-[0.98]"} id={"continueBtn"} type={"button"} data-act={"continueBtn"} data-way-out={"primary"}>
                <span>
                  Continue to Pin Location
                </span>
                <span className={"material-symbols-outlined text-[20px] transition-transform group-hover:translate-x-1"}>
                  arrow_forward
                </span>
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
