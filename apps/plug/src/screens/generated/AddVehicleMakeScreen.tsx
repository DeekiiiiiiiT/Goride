import { useEffect, useRef } from 'react';
import { onPlugClick } from '../../shell/actions';
import { bindScreen } from '../../shell/bind';


export function AddVehicleMakeScreen() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (ref.current) bindScreen("09-add-vehicle-make.html", ref.current); }, []);
  return (
    <div ref={ref} data-plug-screen={"09-add-vehicle-make.html"} className={"bg-surface font-body-md text-on-surface antialiased min-h-screen flex flex-col"}>
      <header className={"fixed top-0 w-full z-50 bg-surface/80 backdrop-blur-xl pt-safe"}>
        <div className={"h-12 px-margin flex items-center justify-between text-on-surface"}>
          <span className={"font-label-md text-label-md font-bold tracking-tight"}>
            9:41
          </span>
          <div className={"flex items-center gap-space-xs text-on-surface"}>
            <span className={"material-symbols-outlined text-[18px]"}>
              signal_cellular_4_bar
            </span>
            <span className={"material-symbols-outlined text-[18px]"}>
              wifi
            </span>
            <span className={"material-symbols-outlined text-[20px]"}>
              battery_full
            </span>
          </div>
        </div>
      </header>
      <main className={"flex-1 flex flex-col relative w-full pt-12 pb-safe bg-surface"}>
        <div className={"flex flex-col w-full pb-8"}>
          <div className={"px-margin pt-2 pb-space-sm flex flex-col gap-space-sm"}>
            <div className={"flex items-center justify-between min-h-[48px]"}>
              <button onClick={onPlugClick} aria-label={"Go back"} className={"flex items-center justify-center w-12 h-12 -ml-2 rounded-full active:bg-surface-container transition-colors text-on-surface"} type={"button"} data-act={"arrow-back"} data-way-out={"back"}>
                <span className={"material-symbols-outlined text-[24px]"}>
                  arrow_back
                </span>
              </button>
              <div className={"flex flex-col items-center"}>
                <span className={"font-label-sm text-label-sm tracking-wider uppercase text-on-surface-variant font-bold"}>
                  Step 1 of 3
                </span>
              </div>
              <button onClick={onPlugClick} className={"flex items-center justify-center min-h-[48px] px-space-xs font-label-md text-label-md text-secondary font-bold active:opacity-70"} type={"button"} data-act={"skip"}>
                Skip
              </button>
            </div>
            <div className={"flex items-center gap-1.5 w-full"}>
              <div className={"h-1.5 flex-1 rounded-full bg-primary-container"} />
              <div className={"h-1.5 flex-1 rounded-full bg-surface-container-high"} />
              <div className={"h-1.5 flex-1 rounded-full bg-surface-container-high"} />
            </div>
          </div>
          <div className={"px-margin pt-space-md pb-space-sm flex flex-col"}>
            <div className={"flex items-center gap-space-xs mb-1"}>
              <span className={"px-2 py-0.5 rounded-full bg-secondary-fixed text-on-secondary-fixed-variant font-label-sm text-label-sm uppercase"}>
                Garage Setup
              </span>
            </div>
            <h1 className={"font-headline-lg text-headline-lg text-on-surface"}>
              Add your vehicle
            </h1>
            <p className={"font-body-md text-body-md text-on-surface-variant mt-1.5 leading-relaxed"}>
              Track island gas rates, schedule routine parish road fitness, and match genuine replacement parts.
            </p>
          </div>
          <div className={"px-margin pt-space-sm pb-space-md"}>
            <div className={"relative flex items-center w-full min-h-[50px] bg-surface-container-lowest rounded-xl shadow-sm"}>
              <div className={"absolute left-3.5 flex items-center pointer-events-none text-on-surface-variant"}>
                <span className={"material-symbols-outlined text-[22px]"}>
                  search
                </span>
              </div>
              <input onClick={onPlugClick} className={"w-full h-[50px] pl-11 pr-11 bg-transparent text-on-surface font-body-md text-body-md placeholder:text-on-surface-variant/60 focus:outline-none"} id={"make-search-input"} placeholder={"Search make (e.g. Toyota, Nissan...)"} type={"text"} defaultValue={""} data-act={"make-search-input"} />
              <button onClick={onPlugClick} aria-label={"Clear search"} className={"absolute right-1 w-10 h-10 flex items-center justify-center text-on-surface-variant rounded-full active:bg-surface-container transition-opacity"} id={"clear-search-btn"} type={"button"} data-act={"clear-search-btn"}>
                <span className={"material-symbols-outlined text-[18px]"}>
                  cancel
                </span>
              </button>
            </div>
          </div>
          <div className={"px-margin pb-space-md"}>
            <div className={"flex items-center gap-space-sm p-space-sm rounded-xl bg-surface-container-low shadow-sm"}>
              <div className={"w-10 h-10 rounded-lg bg-tertiary-fixed flex items-center justify-center shrink-0 text-on-tertiary-fixed"}>
                <span className={"material-symbols-outlined text-[20px]"} style={{ fontVariationSettings: "'FILL' 1" }}>
                  local_gas_station
                </span>
              </div>
              <div className={"flex flex-col min-w-0 pr-1"}>
                <span className={"font-label-md text-label-md text-on-surface font-bold truncate"}>
                  {"Jamaica Route & Fleet Index"}
                </span>
                <span className={"font-body-sm text-body-sm text-on-surface-variant"}>
                  {"Optimized for route taxis, pickups & commuter cars"}
                </span>
              </div>
            </div>
          </div>
          <div className={"px-margin flex items-baseline justify-between pt-1 pb-space-sm"}>
            <div>
              <h2 className={"font-label-lg text-label-lg uppercase tracking-wider text-on-surface font-bold"}>
                Popular in Jamaica
              </h2>
              <p className={"font-body-sm text-body-sm text-on-surface-variant"}>
                {"Common island fleet & commuter vehicles"}
              </p>
            </div>
            <span className={"font-label-sm text-label-sm text-primary font-bold"}>
              10 Makes
            </span>
          </div>
          <div className={"px-margin pb-space-lg"}>
            <div className={"grid grid-cols-2 gap-space-sm"} id={"makes-grid"}>
              <div onClick={onPlugClick} className={"make-card relative flex flex-col p-space-md rounded-2xl bg-secondary-fixed text-on-secondary-fixed transition-all cursor-pointer shadow-md select-none"} data-make={"Toyota"} role={"button"} tabIndex={0} data-act={"toyota-1-in-jamaica-axio-probox-voxy-hiace"}>
                <div className={"absolute top-3 right-3 w-6 h-6 rounded-full bg-primary flex items-center justify-center text-on-primary shadow-sm checkmark-badge"}>
                  <span className={"material-symbols-outlined text-[16px] font-bold"}>
                    check
                  </span>
                </div>
                <div className={"w-12 h-12 rounded-xl bg-surface-container-lowest flex items-center justify-center shadow-sm mb-3 text-primary"}>
                  <span className={"material-symbols-outlined text-[28px]"}>
                    directions_car
                  </span>
                </div>
                <span className={"font-headline-sm text-headline-sm font-bold text-on-surface"}>
                  Toyota
                </span>
                <span className={"font-label-sm text-label-sm text-primary font-bold mt-0.5"}>
                  #1 in Jamaica
                </span>
                <span className={"font-body-sm text-body-sm text-on-surface-variant mt-1 truncate"}>
                  Axio, Probox, Voxy, Hiace
                </span>
              </div>
              <div onClick={onPlugClick} className={"make-card relative flex flex-col p-space-md rounded-2xl bg-surface-container-lowest text-on-surface transition-all cursor-pointer shadow-sm select-none active:scale-[0.98]"} data-make={"Honda"} role={"button"} tabIndex={0} data-act={"honda-high-resale-fit-vezel-civic-cr-v"}>
                <div className={"absolute top-3 right-3 w-6 h-6 rounded-full bg-primary items-center justify-center text-on-primary shadow-sm checkmark-badge hidden"}>
                  <span className={"material-symbols-outlined text-[16px] font-bold"}>
                    check
                  </span>
                </div>
                <div className={"w-12 h-12 rounded-xl bg-surface-container flex items-center justify-center mb-3 text-on-surface"}>
                  <span className={"material-symbols-outlined text-[28px]"}>
                    commute
                  </span>
                </div>
                <span className={"font-headline-sm text-headline-sm font-bold text-on-surface"}>
                  Honda
                </span>
                <span className={"font-label-sm text-label-sm text-on-surface-variant font-medium mt-0.5"}>
                  High Resale
                </span>
                <span className={"font-body-sm text-body-sm text-on-surface-variant mt-1 truncate"}>
                  Fit, Vezel, Civic, CR-V
                </span>
              </div>
              <div onClick={onPlugClick} className={"make-card relative flex flex-col p-space-md rounded-2xl bg-surface-container-lowest text-on-surface transition-all cursor-pointer shadow-sm select-none active:scale-[0.98]"} data-make={"Nissan"} role={"button"} tabIndex={0} data-act={"nissan-route-essential-ad-wagon-note-sylphy"}>
                <div className={"absolute top-3 right-3 w-6 h-6 rounded-full bg-primary items-center justify-center text-on-primary shadow-sm checkmark-badge hidden"}>
                  <span className={"material-symbols-outlined text-[16px] font-bold"}>
                    check
                  </span>
                </div>
                <div className={"w-12 h-12 rounded-xl bg-surface-container flex items-center justify-center mb-3 text-on-surface"}>
                  <span className={"material-symbols-outlined text-[28px]"}>
                    minor_crash
                  </span>
                </div>
                <span className={"font-headline-sm text-headline-sm font-bold text-on-surface"}>
                  Nissan
                </span>
                <span className={"font-label-sm text-label-sm text-on-surface-variant font-medium mt-0.5"}>
                  Route Essential
                </span>
                <span className={"font-body-sm text-body-sm text-on-surface-variant mt-1 truncate"}>
                  AD Wagon, Note, Sylphy
                </span>
              </div>
              <div onClick={onPlugClick} className={"make-card relative flex flex-col p-space-md rounded-2xl bg-surface-container-lowest text-on-surface transition-all cursor-pointer shadow-sm select-none active:scale-[0.98]"} data-make={"Suzuki"} role={"button"} tabIndex={0} data-act={"suzuki-island-compact-swift-jimny-vitara"}>
                <div className={"absolute top-3 right-3 w-6 h-6 rounded-full bg-primary items-center justify-center text-on-primary shadow-sm checkmark-badge hidden"}>
                  <span className={"material-symbols-outlined text-[16px] font-bold"}>
                    check
                  </span>
                </div>
                <div className={"w-12 h-12 rounded-xl bg-surface-container flex items-center justify-center mb-3 text-on-surface"}>
                  <span className={"material-symbols-outlined text-[28px]"}>
                    electric_car
                  </span>
                </div>
                <span className={"font-headline-sm text-headline-sm font-bold text-on-surface"}>
                  Suzuki
                </span>
                <span className={"font-label-sm text-label-sm text-on-surface-variant font-medium mt-0.5"}>
                  Island Compact
                </span>
                <span className={"font-body-sm text-body-sm text-on-surface-variant mt-1 truncate"}>
                  Swift, Jimny, Vitara
                </span>
              </div>
              <div onClick={onPlugClick} className={"make-card relative flex flex-col p-space-md rounded-2xl bg-surface-container-lowest text-on-surface transition-all cursor-pointer shadow-sm select-none active:scale-[0.98]"} data-make={"Mazda"} role={"button"} tabIndex={0} data-act={"mazda-popular-hatch-demio-axela-cx-5"}>
                <div className={"absolute top-3 right-3 w-6 h-6 rounded-full bg-primary items-center justify-center text-on-primary shadow-sm checkmark-badge hidden"}>
                  <span className={"material-symbols-outlined text-[16px] font-bold"}>
                    check
                  </span>
                </div>
                <div className={"w-12 h-12 rounded-xl bg-surface-container flex items-center justify-center mb-3 text-on-surface"}>
                  <span className={"material-symbols-outlined text-[28px]"}>
                    speed
                  </span>
                </div>
                <span className={"font-headline-sm text-headline-sm font-bold text-on-surface"}>
                  Mazda
                </span>
                <span className={"font-label-sm text-label-sm text-on-surface-variant font-medium mt-0.5"}>
                  Popular Hatch
                </span>
                <span className={"font-body-sm text-body-sm text-on-surface-variant mt-1 truncate"}>
                  Demio, Axela, CX-5
                </span>
              </div>
              <div onClick={onPlugClick} className={"make-card relative flex flex-col p-space-md rounded-2xl bg-surface-container-lowest text-on-surface transition-all cursor-pointer shadow-sm select-none active:scale-[0.98]"} data-make={"Mitsubishi"} role={"button"} tabIndex={0} data-act={"mitsubishi-rugged-hills-outlander-l200-pajero"}>
                <div className={"absolute top-3 right-3 w-6 h-6 rounded-full bg-primary items-center justify-center text-on-primary shadow-sm checkmark-badge hidden"}>
                  <span className={"material-symbols-outlined text-[16px] font-bold"}>
                    check
                  </span>
                </div>
                <div className={"w-12 h-12 rounded-xl bg-surface-container flex items-center justify-center mb-3 text-on-surface"}>
                  <span className={"material-symbols-outlined text-[28px]"}>
                    terrain
                  </span>
                </div>
                <span className={"font-headline-sm text-headline-sm font-bold text-on-surface"}>
                  Mitsubishi
                </span>
                <span className={"font-label-sm text-label-sm text-on-surface-variant font-medium mt-0.5"}>
                  Rugged Hills
                </span>
                <span className={"font-body-sm text-body-sm text-on-surface-variant mt-1 truncate"}>
                  Outlander, L200, Pajero
                </span>
              </div>
              <div onClick={onPlugClick} className={"make-card relative flex flex-col p-space-md rounded-2xl bg-surface-container-lowest text-on-surface transition-all cursor-pointer shadow-sm select-none active:scale-[0.98]"} data-make={"Hyundai"} role={"button"} tabIndex={0} data-act={"hyundai-growing-choice-tucson-elantra-santa-fe"}>
                <div className={"absolute top-3 right-3 w-6 h-6 rounded-full bg-primary items-center justify-center text-on-primary shadow-sm checkmark-badge hidden"}>
                  <span className={"material-symbols-outlined text-[16px] font-bold"}>
                    check
                  </span>
                </div>
                <div className={"w-12 h-12 rounded-xl bg-surface-container flex items-center justify-center mb-3 text-on-surface"}>
                  <span className={"material-symbols-outlined text-[28px]"}>
                    car_repair
                  </span>
                </div>
                <span className={"font-headline-sm text-headline-sm font-bold text-on-surface"}>
                  Hyundai
                </span>
                <span className={"font-label-sm text-label-sm text-on-surface-variant font-medium mt-0.5"}>
                  Growing Choice
                </span>
                <span className={"font-body-sm text-body-sm text-on-surface-variant mt-1 truncate"}>
                  Tucson, Elantra, Santa Fe
                </span>
              </div>
              <div onClick={onPlugClick} className={"make-card relative flex flex-col p-space-md rounded-2xl bg-surface-container-lowest text-on-surface transition-all cursor-pointer shadow-sm select-none active:scale-[0.98]"} data-make={"Kia"} role={"button"} tabIndex={0} data-act={"kia-modern-crossover-sportage-cerato-rio"}>
                <div className={"absolute top-3 right-3 w-6 h-6 rounded-full bg-primary items-center justify-center text-on-primary shadow-sm checkmark-badge hidden"}>
                  <span className={"material-symbols-outlined text-[16px] font-bold"}>
                    check
                  </span>
                </div>
                <div className={"w-12 h-12 rounded-xl bg-surface-container flex items-center justify-center mb-3 text-on-surface"}>
                  <span className={"material-symbols-outlined text-[28px]"}>
                    sensor_occupied
                  </span>
                </div>
                <span className={"font-headline-sm text-headline-sm font-bold text-on-surface"}>
                  Kia
                </span>
                <span className={"font-label-sm text-label-sm text-on-surface-variant font-medium mt-0.5"}>
                  Modern Crossover
                </span>
                <span className={"font-body-sm text-body-sm text-on-surface-variant mt-1 truncate"}>
                  Sportage, Cerato, Rio
                </span>
              </div>
              <div onClick={onPlugClick} className={"make-card relative flex flex-col p-space-md rounded-2xl bg-surface-container-lowest text-on-surface transition-all cursor-pointer shadow-sm select-none active:scale-[0.98]"} data-make={"Isuzu"} role={"button"} tabIndex={0} data-act={"isuzu-heavy-workhorse-d-max-elf-truck"}>
                <div className={"absolute top-3 right-3 w-6 h-6 rounded-full bg-primary items-center justify-center text-on-primary shadow-sm checkmark-badge hidden"}>
                  <span className={"material-symbols-outlined text-[16px] font-bold"}>
                    check
                  </span>
                </div>
                <div className={"w-12 h-12 rounded-xl bg-surface-container flex items-center justify-center mb-3 text-on-surface"}>
                  <span className={"material-symbols-outlined text-[28px]"}>
                    local_shipping
                  </span>
                </div>
                <span className={"font-headline-sm text-headline-sm font-bold text-on-surface"}>
                  Isuzu
                </span>
                <span className={"font-label-sm text-label-sm text-on-surface-variant font-medium mt-0.5"}>
                  Heavy Workhorse
                </span>
                <span className={"font-body-sm text-body-sm text-on-surface-variant mt-1 truncate"}>
                  D-Max, Elf Truck
                </span>
              </div>
              <div onClick={onPlugClick} className={"make-card relative flex flex-col p-space-md rounded-2xl bg-surface-container-lowest text-on-surface transition-all cursor-pointer shadow-sm select-none active:scale-[0.98]"} data-make={"Subaru"} role={"button"} tabIndex={0} data-act={"subaru-awd-mountain-run-forester-xv-impreza"}>
                <div className={"absolute top-3 right-3 w-6 h-6 rounded-full bg-primary items-center justify-center text-on-primary shadow-sm checkmark-badge hidden"}>
                  <span className={"material-symbols-outlined text-[16px] font-bold"}>
                    check
                  </span>
                </div>
                <div className={"w-12 h-12 rounded-xl bg-surface-container flex items-center justify-center mb-3 text-on-surface"}>
                  <span className={"material-symbols-outlined text-[28px]"}>
                    all_inclusive
                  </span>
                </div>
                <span className={"font-headline-sm text-headline-sm font-bold text-on-surface"}>
                  Subaru
                </span>
                <span className={"font-label-sm text-label-sm text-on-surface-variant font-medium mt-0.5"}>
                  AWD Mountain Run
                </span>
                <span className={"font-body-sm text-body-sm text-on-surface-variant mt-1 truncate"}>
                  Forester, XV, Impreza
                </span>
              </div>
            </div>
          </div>
          <div className={"px-margin pb-space-lg flex flex-col items-center"}>
            <button onClick={onPlugClick} className={"min-h-[48px] px-space-md py-2 flex items-center justify-center gap-space-xs text-secondary active:opacity-75 font-label-lg text-label-lg font-bold"} type={"button"} data-act={"can-t-find-your-make-enter-manually"}>
              <span className={"material-symbols-outlined text-[20px]"}>
                edit_note
              </span>
              <span>
                Can't find your make? Enter manually
              </span>
            </button>
          </div>
          <div className={"mt-auto px-margin pt-space-md pb-space-md flex flex-col gap-space-sm bg-surface/90 backdrop-blur-md"}>
            <button onClick={onPlugClick} className={"w-full min-h-[52px] rounded-xl bg-primary text-on-primary font-label-lg text-label-lg font-bold flex items-center justify-center gap-2 shadow-lg active:bg-primary-container transition-all"} id={"submit-make-btn"} type={"button"} data-act={"submit-make-btn"} data-way-out={"primary"}>
              <span id={"btn-text"}>
                Continue with Toyota
              </span>
              <span className={"material-symbols-outlined text-[20px]"}>
                arrow_forward
              </span>
            </button>
            <button onClick={onPlugClick} className={"w-full min-h-[48px] rounded-xl text-on-surface-variant font-body-md text-body-md font-medium flex items-center justify-center active:bg-surface-container transition-colors"} type={"button"} data-act={"skip-for-now-can-add-later"}>
              Skip for now (can add later)
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
