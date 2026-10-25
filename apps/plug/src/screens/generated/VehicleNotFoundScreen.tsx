import { useEffect, useRef } from 'react';
import { onPlugClick } from '../../shell/actions';
import { bindScreen } from '../../shell/bind';


export function VehicleNotFoundScreen() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (ref.current) bindScreen("11-vehicle-not-found.html", ref.current); }, []);
  return (
    <div ref={ref} data-plug-screen={"11-vehicle-not-found.html"} className={"bg-surface text-on-surface font-body-md text-body-md min-h-screen flex flex-col pt-safe pb-safe antialiased selection:bg-primary/20"}>
      <main className={"flex-1 flex flex-col relative w-full bg-surface"}>
        <div className={"flex flex-col w-full pb-10"}>
          <div className={"flex items-center justify-between px-space-md py-space-sm bg-surface"}>
            <button onClick={onPlugClick} aria-label={"Go back"} className={"w-12 h-12 flex items-center justify-center rounded-full bg-surface-container-high text-on-surface hover:bg-surface-container-highest transition-colors active:scale-95"} type={"button"} data-act={"arrow-back"} data-way-out={"back"}>
              <span className={"material-symbols-outlined text-[22px]"}>
                arrow_back
              </span>
            </button>
            <div className={"flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary-fixed text-on-primary-fixed"}>
              <span className={"material-symbols-outlined text-[14px]"} style={{ fontVariationSettings: "'FILL' 1" }}>
                directions_car
              </span>
              <span className={"font-label-sm text-label-sm tracking-wider uppercase"}>
                Garage Registry
              </span>
            </div>
            <button onClick={onPlugClick} className={"h-12 px-3 flex items-center justify-center text-on-surface-variant font-label-lg text-label-lg hover:text-primary transition-colors"} type={"button"} data-act={"cancel"}>
              Cancel
            </button>
          </div>
          <div className={"px-space-md flex flex-col gap-5 mt-2"}>
            <div className={"flex flex-col gap-1.5"}>
              <div className={"flex items-center gap-2"}>
                <h1 className={"font-display-lg-mobile text-display-lg-mobile text-on-surface"}>
                  Tell us about your car
                </h1>
              </div>
              <p className={"font-body-md text-body-md text-on-surface-variant"}>
                Can't find your exact trim or Japanese domestic import spec? Send the specs and our Jamaican automotive team will index it.
              </p>
            </div>
            <div className={"rounded-xl p-4 bg-tertiary-fixed text-on-tertiary-fixed shadow-sm flex flex-col gap-2"}>
              <div className={"flex items-center justify-between"}>
                <span className={"font-label-sm text-label-sm uppercase tracking-wider bg-on-tertiary-fixed text-tertiary-fixed px-2 py-0.5 rounded-full"}>
                  Instant Access
                </span>
                <div className={"flex items-center gap-1 font-label-md text-label-md text-on-tertiary-fixed-variant"}>
                  <span className={"material-symbols-outlined text-[16px]"}>
                    bolt
                  </span>
                  <span>
                    Zero Waiting
                  </span>
                </div>
              </div>
              <p className={"font-body-sm text-body-sm text-on-tertiary-fixed leading-relaxed"}>
                {"We'll add your ride to Jamaica's master catalog within 24 hours. You can track fuel & tolls right now — your parish-spec service schedule unlocks upon verification!"}
              </p>
            </div>
            <div className={"bg-surface-container-lowest rounded-xl p-space-md shadow-sm flex flex-col gap-4"}>
              <div className={"flex items-center justify-between pb-1"}>
                <span className={"font-headline-sm text-headline-sm text-on-surface"}>
                  Vehicle Details
                </span>
                <span className={"font-label-sm text-label-sm text-primary uppercase"}>
                  Quick Verification
                </span>
              </div>
              <div className={"flex flex-col gap-1.5"}>
                <label className={"font-label-md text-label-md text-on-surface"} htmlFor={"car-make"}>
                  Make
                </label>
                <div className={"relative flex items-center"}>
                  <input className={"w-full h-12 px-3.5 rounded-lg bg-surface-container-low text-on-surface font-body-md text-body-md focus:bg-surface-container-lowest outline-none shadow-sm"} id={"car-make"} placeholder={"e.g. Toyota, Honda, Subaru, BYD"} type={"text"} defaultValue={"Toyota"} />
                  <span className={"material-symbols-outlined absolute right-3 text-secondary text-[20px]"}>
                    check_circle
                  </span>
                </div>
              </div>
              <div className={"flex flex-col gap-1.5"}>
                <label className={"font-label-md text-label-md text-on-surface"} htmlFor={"car-model"}>
                  Model / Chassis Trim
                </label>
                <input className={"w-full h-12 px-3.5 rounded-lg bg-surface-container-low text-on-surface font-body-md text-body-md focus:bg-surface-container-lowest outline-none shadow-sm"} id={"car-model"} placeholder={"e.g. Probox, Succeed, Passo, Axio, Fit Shuttle"} type={"text"} defaultValue={"Succeed Hybrid"} />
              </div>
              <div className={"grid grid-cols-2 gap-3"}>
                <div className={"flex flex-col gap-1.5"}>
                  <label className={"font-label-md text-label-md text-on-surface"} htmlFor={"car-year"}>
                    Model Year
                  </label>
                  <div className={"relative flex items-center"}>
                    <select className={"w-full h-12 px-3 rounded-lg bg-surface-container-low text-on-surface font-body-md text-body-md appearance-none outline-none shadow-sm pr-8"} id={"car-year"}>
                      <option value={"2024"}>
                        2024
                      </option>
                      <option value={"2023"}>
                        2023
                      </option>
                      <option value={"2022"}>
                        2022
                      </option>
                      <option value={"2021"}>
                        2021
                      </option>
                      <option value={"2020"}>
                        2020
                      </option>
                      <option value={"2019"}>
                        2019
                      </option>
                      <option selected={true} value={"2018"}>
                        2018
                      </option>
                      <option value={"2017"}>
                        2017
                      </option>
                      <option value={"2016"}>
                        2016
                      </option>
                      <option value={"2015"}>
                        2015
                      </option>
                      <option value={"older"}>
                        Older (Classic / Route spec)
                      </option>
                    </select>
                    <span className={"material-symbols-outlined absolute right-2.5 pointer-events-none text-on-surface-variant text-[20px]"}>
                      expand_more
                    </span>
                  </div>
                </div>
                <div className={"flex flex-col gap-1.5"}>
                  <label className={"font-label-md text-label-md text-on-surface"} htmlFor={"car-engine"}>
                    Displacement
                  </label>
                  <input className={"w-full h-12 px-3 rounded-lg bg-surface-container-low text-on-surface font-body-md text-body-md focus:bg-surface-container-lowest outline-none shadow-sm"} id={"car-engine"} placeholder={"e.g. 1.5L 1NZ-FXE"} type={"text"} defaultValue={"1.5L"} />
                </div>
              </div>
              <div className={"flex flex-col gap-2 pt-1"}>
                <label className={"font-label-md text-label-md text-on-surface"}>
                  Recommended Fuel Grade in Jamaica
                </label>
                <div className={"grid grid-cols-2 gap-2"} id={"fuel-group"}>
                  <button onClick={onPlugClick} className={"fuel-chip h-12 px-3 rounded-lg bg-surface-container-low text-on-surface flex items-center justify-between active:scale-[0.98] transition-transform"} data-fuel={"87"} type={"button"} data-act={"e-10-87"}>
                    <span className={"font-label-lg text-label-lg"}>
                      E-10 87
                    </span>
                    <span className={"w-3.5 h-3.5 rounded-full bg-surface-variant"} />
                  </button>
                  <button onClick={onPlugClick} className={"fuel-chip h-12 px-3 rounded-lg bg-primary-container text-on-primary-container shadow-sm flex items-center justify-between active:scale-[0.98] transition-transform"} data-fuel={"90"} type={"button"} data-act={"e-10-90"} data-way-out={"primary"}>
                    <span className={"font-label-lg text-label-lg font-bold"}>
                      E-10 90
                    </span>
                    <span className={"material-symbols-outlined text-[18px]"}>
                      check
                    </span>
                  </button>
                  <button onClick={onPlugClick} className={"fuel-chip h-12 px-3 rounded-lg bg-surface-container-low text-on-surface flex items-center justify-between active:scale-[0.98] transition-transform"} data-fuel={"diesel"} type={"button"} data-act={"ulsd-diesel"}>
                    <span className={"font-label-lg text-label-lg"}>
                      ULSD Diesel
                    </span>
                    <span className={"w-3.5 h-3.5 rounded-full bg-surface-variant"} />
                  </button>
                  <button onClick={onPlugClick} className={"fuel-chip h-12 px-3 rounded-lg bg-surface-container-low text-on-surface flex items-center justify-between active:scale-[0.98] transition-transform"} data-fuel={"hybrid"} type={"button"} data-act={"hybrid-ev"}>
                    <span className={"font-label-lg text-label-lg"}>
                      Hybrid / EV
                    </span>
                    <span className={"w-3.5 h-3.5 rounded-full bg-surface-variant"} />
                  </button>
                </div>
              </div>
              <div className={"flex flex-col gap-2 pt-1"}>
                <label className={"font-label-md text-label-md text-on-surface"}>
                  Transmission
                </label>
                <div className={"grid grid-cols-2 gap-2"} id={"trans-group"}>
                  <button onClick={onPlugClick} className={"trans-chip h-12 rounded-lg bg-on-surface text-surface flex items-center justify-center gap-2 font-label-lg text-label-lg"} data-trans={"auto"} type={"button"} data-act={"automatic-cvt"}>
                    <span className={"material-symbols-outlined text-[18px]"}>
                      auto_transmission
                    </span>
                    <span>
                      Automatic / CVT
                    </span>
                  </button>
                  <button onClick={onPlugClick} className={"trans-chip h-12 rounded-lg bg-surface-container-low text-on-surface flex items-center justify-center gap-2 font-label-lg text-label-lg"} data-trans={"manual"} type={"button"} data-act={"manual-stick"}>
                    <span className={"material-symbols-outlined text-[18px]"}>
                      save_as
                    </span>
                    <span>
                      Manual Stick
                    </span>
                  </button>
                </div>
              </div>
            </div>
            <div className={"bg-surface-container-lowest rounded-xl p-space-md shadow-sm flex flex-col gap-3"}>
              <div className={"flex items-center gap-2"}>
                <div className={"w-8 h-8 rounded-full bg-secondary-fixed flex items-center justify-center text-on-secondary-fixed"}>
                  <span className={"material-symbols-outlined text-[18px]"}>
                    photo_camera
                  </span>
                </div>
                <div>
                  <span className={"font-label-lg text-label-lg text-on-surface"}>
                    Add Vehicle Photo (Optional)
                  </span>
                  <span className={"font-label-sm text-label-sm text-secondary block"}>
                    Speeds up catalogue approval
                  </span>
                </div>
              </div>
              <div className={"relative w-full h-36 rounded-lg bg-surface-container overflow-hidden flex flex-col items-center justify-center cursor-pointer group shadow-inner"}>
                <div className={"absolute inset-0 w-full h-full object-cover opacity-20 group-hover:opacity-30 transition-opacity bg-surface-container flex items-center justify-center text-primary"} aria-hidden={"true"}><span className={"material-symbols-outlined text-[32px]"}>image</span></div>
                <div className={"relative z-10 flex flex-col items-center text-center px-4"}>
                  <div className={"w-12 h-12 rounded-full bg-surface-container-lowest shadow-md flex items-center justify-center text-primary mb-2"}>
                    <span className={"material-symbols-outlined text-[24px]"}>
                      add_a_photo
                    </span>
                  </div>
                  <p className={"font-label-md text-label-md text-on-surface font-semibold"}>
                    Snap Door Jamb or Chassis Plate
                  </p>
                  <p className={"font-body-sm text-body-sm text-on-surface-variant max-w-[240px] mt-0.5"}>
                    Gives us your Japanese chassis code (e.g. NCP160, DBA-ZVW52) for 100% correct part specs.
                  </p>
                </div>
              </div>
            </div>
            <div className={"rounded-xl p-3.5 bg-surface-container-low shadow-sm flex items-start gap-3"}>
              <div className={"w-9 h-9 rounded-full bg-tertiary-fixed-dim text-on-tertiary-fixed flex items-center justify-center shrink-0 shadow-xs"}>
                <span className={"material-symbols-outlined text-[20px]"} style={{ fontVariationSettings: "'FILL' 1" }}>
                  verified_user
                </span>
              </div>
              <div className={"flex flex-col"}>
                <span className={"font-label-md text-label-md text-on-surface font-bold"}>
                  Local Parts Guarantee
                </span>
                <p className={"font-body-sm text-body-sm text-on-surface-variant mt-0.5"}>
                  Indexing your engine lets mechanics from Montego Bay to Downtown Kingston match genuine oil filters, brake pads, and spark plugs without guessing.
                </p>
              </div>
            </div>
            <div className={"flex flex-col gap-2 pt-2"}>
              <button onClick={onPlugClick} className={"w-full h-12 rounded-xl bg-primary text-on-primary font-headline-sm text-headline-sm flex items-center justify-center gap-2 shadow-md active:bg-primary-container transition-all"} id={"submit-car-btn"} type={"button"} data-act={"submit-car-btn"} data-way-out={"primary"}>
                <span>
                  {"Submit & Continue"}
                </span>
                <span className={"material-symbols-outlined text-[20px]"}>
                  arrow_forward
                </span>
              </button>
              <div className={"flex items-center justify-center gap-1.5 text-center text-on-surface-variant"}>
                <span className={"material-symbols-outlined text-[14px]"}>
                  save
                </span>
                <span className={"font-body-sm text-body-sm"}>
                  {"Saves draft vehicle & proceeds to odometer calibration"}
                </span>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
