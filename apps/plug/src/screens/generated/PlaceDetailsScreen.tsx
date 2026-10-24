import { useEffect, useRef } from 'react';
import { onPlugClick } from '../../shell/actions';
import { bindScreen } from '../../shell/bind';


export function PlaceDetailsScreen() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (ref.current) bindScreen("44-place-details.html", ref.current); }, []);
  return (
    <div ref={ref} data-plug-screen={"44-place-details.html"} className={"bg-surface font-body-md text-on-surface flex flex-col min-h-screen"}>
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
                Screen 44: Place Details
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
        <div className={"flex flex-col w-full pb-8"}>
          <div className={"w-full pt-2 pb-4"}>
            <div className={"flex items-center justify-between mb-2"}>
              <span className={"font-label-md text-label-md text-primary uppercase tracking-wider font-bold"}>
                Step 3 of 3
              </span>
              <span className={"font-label-sm text-label-sm text-on-surface-variant font-medium"}>
                Place Details
              </span>
            </div>
            <div className={"w-full bg-surface-container-high h-2 rounded-full overflow-hidden flex"}>
              <div className={"bg-primary h-full w-full rounded-full transition-all duration-300"} />
            </div>
          </div>
          <div className={"w-full bg-surface-container-lowest rounded-xl p-space-md shadow-sm mb-space-md"}>
            <div className={"flex items-center justify-between mb-space-sm"}>
              <div className={"inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary-fixed text-on-primary-fixed font-label-md text-label-md"}>
                <span>
                  ⛽
                </span>
                <span className={"font-bold"}>
                  Gas Station
                </span>
              </div>
              <button onClick={onPlugClick} className={"font-label-md text-label-md text-primary font-bold hover:underline flex items-center gap-0.5"} type={"button"} data-act={"change"}>
                <span>
                  Change
                </span>
                <span className={"material-symbols-outlined text-[16px]"}>
                  edit
                </span>
              </button>
            </div>
            <div className={"flex items-start gap-space-sm pt-1"}>
              <span className={"material-symbols-outlined text-primary text-[20px] mt-0.5 shrink-0"} style={{ fontVariationSettings: "'FILL' 1" }}>
                location_on
              </span>
              <div className={"min-w-0"}>
                <p className={"font-label-lg text-label-lg text-on-surface font-semibold truncate"}>
                  Constant Spring Rd, Half-Way-Tree
                </p>
                <div className={"flex items-center gap-2 mt-0.5"}>
                  <span className={"font-body-sm text-body-sm text-on-surface-variant"}>
                    St. Andrew Parish
                  </span>
                  <span className={"inline-flex items-center gap-1 text-[11px] font-semibold text-tertiary bg-tertiary-fixed/60 px-2 py-0.5 rounded-full"}>
                    <span className={"material-symbols-outlined text-[12px]"}>
                      gps_fixed
                    </span>
                    ±8m accuracy
                  </span>
                </div>
              </div>
            </div>
          </div>
          <form className={"flex flex-col gap-space-lg"} id={"place-details-form"}>
            <div className={"flex flex-col gap-space-xs"}>
              <label className={"font-label-lg text-label-lg text-on-surface font-bold flex items-center justify-between"} htmlFor={"place-name"}>
                <span>
                  Place Name
                  <span className={"text-primary"}>
                    *
                  </span>
                </span>
                <span className={"font-body-sm text-body-sm text-on-surface-variant font-normal"}>
                  Official or local name
                </span>
              </label>
              <div className={"relative"}>
                <input className={"w-full h-12 px-4 rounded-xl bg-surface-container-lowest text-on-surface font-body-lg text-body-lg shadow-sm focus:outline-none focus:bg-surface-container-low transition-colors"} id={"place-name"} placeholder={"e.g. TotalEnergies Half-Way-Tree"} required={true} type={"text"} defaultValue={"TotalEnergies Half-Way-Tree"} />
                <span className={"material-symbols-outlined absolute right-3 top-3 text-secondary text-[22px]"}>
                  verified
                </span>
              </div>
            </div>
            <div className={"flex flex-col gap-space-xs"}>
              <label className={"font-label-lg text-label-lg text-on-surface font-bold"}>
                Brand / Network
                <span className={"text-primary"}>
                  *
                </span>
              </label>
              <div className={"grid grid-cols-2 gap-2"} id={"brand-selector"}>
                <button onClick={onPlugClick} className={"brand-btn h-12 px-3 rounded-xl bg-primary text-on-primary font-label-lg text-label-lg flex items-center justify-between shadow-sm transition-transform active:scale-95 text-left"} data-brand={"TotalEnergies"} type={"button"} data-act={"totalenergies"} data-way-out={"primary"}>
                  <span className={"font-bold truncate"}>
                    TotalEnergies
                  </span>
                  <span className={"material-symbols-outlined text-[18px]"}>
                    check_circle
                  </span>
                </button>
                <button onClick={onPlugClick} className={"brand-btn h-12 px-3 rounded-xl bg-surface-container-lowest text-on-surface font-label-lg text-label-lg flex items-center justify-between shadow-sm transition-transform active:scale-95 text-left"} data-brand={"Rubis"} type={"button"} data-act={"rubis"}>
                  <span className={"font-medium truncate"}>
                    Rubis
                  </span>
                  <span className={"material-symbols-outlined text-[18px] opacity-0"}>
                    check_circle
                  </span>
                </button>
                <button onClick={onPlugClick} className={"brand-btn h-12 px-3 rounded-xl bg-surface-container-lowest text-on-surface font-label-lg text-label-lg flex items-center justify-between shadow-sm transition-transform active:scale-95 text-left"} data-brand={"Texaco"} type={"button"} data-act={"texaco"}>
                  <span className={"font-medium truncate"}>
                    Texaco
                  </span>
                  <span className={"material-symbols-outlined text-[18px] opacity-0"}>
                    check_circle
                  </span>
                </button>
                <button onClick={onPlugClick} className={"brand-btn h-12 px-3 rounded-xl bg-surface-container-lowest text-on-surface font-label-lg text-label-lg flex items-center justify-between shadow-sm transition-transform active:scale-95 text-left"} data-brand={"Fesco"} type={"button"} data-act={"fesco"}>
                  <span className={"font-medium truncate"}>
                    Fesco
                  </span>
                  <span className={"material-symbols-outlined text-[18px] opacity-0"}>
                    check_circle
                  </span>
                </button>
                <button onClick={onPlugClick} className={"brand-btn h-12 px-3 rounded-xl bg-surface-container-lowest text-on-surface font-label-lg text-label-lg flex items-center justify-between shadow-sm transition-transform active:scale-95 text-left"} data-brand={"Petcom"} type={"button"} data-act={"petcom"}>
                  <span className={"font-medium truncate"}>
                    Petcom
                  </span>
                  <span className={"material-symbols-outlined text-[18px] opacity-0"}>
                    check_circle
                  </span>
                </button>
                <button onClick={onPlugClick} className={"brand-btn h-12 px-3 rounded-xl bg-surface-container-lowest text-on-surface font-label-lg text-label-lg flex items-center justify-between shadow-sm transition-transform active:scale-95 text-left"} data-brand={"Unipet"} type={"button"} data-act={"unipet"}>
                  <span className={"font-medium truncate"}>
                    Unipet
                  </span>
                  <span className={"material-symbols-outlined text-[18px] opacity-0"}>
                    check_circle
                  </span>
                </button>
                <button onClick={onPlugClick} className={"brand-btn col-span-2 h-12 px-3 rounded-xl bg-surface-container-lowest text-on-surface font-label-lg text-label-lg flex items-center justify-between shadow-sm transition-transform active:scale-95 text-left"} data-brand={"Independent"} type={"button"} data-act={"independent-other-local-dealer"}>
                  <span className={"font-medium truncate"}>
                    Independent / Other Local Dealer
                  </span>
                  <span className={"material-symbols-outlined text-[18px] opacity-0"}>
                    check_circle
                  </span>
                </button>
              </div>
            </div>
            <div className={"flex flex-col gap-space-sm bg-surface-container-lowest p-space-md rounded-xl shadow-sm"}>
              <div className={"flex flex-col"}>
                <h3 className={"font-headline-sm text-headline-sm text-on-surface font-bold"}>
                  What does this station have?
                </h3>
                <p className={"font-body-sm text-body-sm text-on-surface-variant"}>
                  Tap all fuels and motorist amenities available
                </p>
              </div>
              <div className={"flex flex-col gap-2 pt-2"}>
                <span className={"font-label-md text-label-md text-primary font-bold uppercase tracking-wider"}>
                  Fuel Grades Dispensed
                </span>
                <div className={"grid grid-cols-2 gap-2"} id={"fuels-group"}>
                  <label className={"amenity-chip cursor-pointer h-12 px-3 rounded-lg bg-surface-container flex items-center justify-between transition-colors active:scale-95 select-none"}>
                    <input defaultChecked={true} className={"hidden"} type={"checkbox"} />
                    <div className={"flex items-center gap-2 min-w-0"}>
                      <span className={"w-3 h-3 rounded-full bg-primary shrink-0"} />
                      <span className={"font-label-md text-label-md text-on-surface font-bold truncate"}>
                        E-10 87
                      </span>
                    </div>
                    <span className={"material-symbols-outlined text-primary text-[20px] check-icon"} style={{ fontVariationSettings: "'FILL' 1" }}>
                      check_box
                    </span>
                  </label>
                  <label className={"amenity-chip cursor-pointer h-12 px-3 rounded-lg bg-surface-container flex items-center justify-between transition-colors active:scale-95 select-none"}>
                    <input defaultChecked={true} className={"hidden"} type={"checkbox"} />
                    <div className={"flex items-center gap-2 min-w-0"}>
                      <span className={"w-3 h-3 rounded-full bg-error shrink-0"} />
                      <span className={"font-label-md text-label-md text-on-surface font-bold truncate"}>
                        E-10 90
                      </span>
                    </div>
                    <span className={"material-symbols-outlined text-primary text-[20px] check-icon"} style={{ fontVariationSettings: "'FILL' 1" }}>
                      check_box
                    </span>
                  </label>
                  <label className={"amenity-chip cursor-pointer h-12 px-3 rounded-lg bg-surface-container flex items-center justify-between transition-colors active:scale-95 select-none"}>
                    <input defaultChecked={true} className={"hidden"} type={"checkbox"} />
                    <div className={"flex items-center gap-2 min-w-0"}>
                      <span className={"w-3 h-3 rounded-full bg-on-surface shrink-0"} />
                      <span className={"font-label-md text-label-md text-on-surface font-bold truncate"}>
                        ULSD Diesel
                      </span>
                    </div>
                    <span className={"material-symbols-outlined text-primary text-[20px] check-icon"} style={{ fontVariationSettings: "'FILL' 1" }}>
                      check_box
                    </span>
                  </label>
                  <label className={"amenity-chip cursor-pointer h-12 px-3 rounded-lg bg-surface-container-low flex items-center justify-between transition-colors active:scale-95 select-none"}>
                    <input className={"hidden"} type={"checkbox"} />
                    <div className={"flex items-center gap-2 min-w-0"}>
                      <span className={"w-3 h-3 rounded-full bg-outline shrink-0"} />
                      <span className={"font-label-md text-label-md text-on-surface-variant font-medium truncate"}>
                        Auto-LPG
                      </span>
                    </div>
                    <span className={"material-symbols-outlined text-outline text-[20px] check-icon"}>
                      check_box_outline_blank
                    </span>
                  </label>
                </div>
              </div>
              <div className={"flex flex-col gap-2 pt-3"}>
                <span className={"font-label-md text-label-md text-primary font-bold uppercase tracking-wider"}>
                  Station Amenities
                </span>
                <div className={"grid grid-cols-2 gap-2"} id={"amenities-group"}>
                  <label className={"amenity-chip cursor-pointer h-12 px-3 rounded-lg bg-surface-container flex items-center justify-between transition-colors active:scale-95 select-none"}>
                    <input defaultChecked={true} className={"hidden"} type={"checkbox"} />
                    <div className={"flex items-center gap-1.5 min-w-0"}>
                      <span className={"material-symbols-outlined text-primary text-[18px]"}>
                        air
                      </span>
                      <span className={"font-label-md text-label-md text-on-surface font-semibold truncate"}>
                        Air Pump
                      </span>
                    </div>
                    <span className={"material-symbols-outlined text-primary text-[20px] check-icon"} style={{ fontVariationSettings: "'FILL' 1" }}>
                      check_box
                    </span>
                  </label>
                  <label className={"amenity-chip cursor-pointer h-12 px-3 rounded-lg bg-surface-container flex items-center justify-between transition-colors active:scale-95 select-none"}>
                    <input defaultChecked={true} className={"hidden"} type={"checkbox"} />
                    <div className={"flex items-center gap-1.5 min-w-0"}>
                      <span className={"material-symbols-outlined text-primary text-[18px]"}>
                        wc
                      </span>
                      <span className={"font-label-md text-label-md text-on-surface font-semibold truncate"}>
                        Restroom
                      </span>
                    </div>
                    <span className={"material-symbols-outlined text-primary text-[20px] check-icon"} style={{ fontVariationSettings: "'FILL' 1" }}>
                      check_box
                    </span>
                  </label>
                  <label className={"amenity-chip cursor-pointer h-12 px-3 rounded-lg bg-surface-container flex items-center justify-between transition-colors active:scale-95 select-none"}>
                    <input defaultChecked={true} className={"hidden"} type={"checkbox"} />
                    <div className={"flex items-center gap-1.5 min-w-0"}>
                      <span className={"material-symbols-outlined text-primary text-[18px]"}>
                        storefront
                      </span>
                      <span className={"font-label-md text-label-md text-on-surface font-semibold truncate"}>
                        24/7 Store
                      </span>
                    </div>
                    <span className={"material-symbols-outlined text-primary text-[20px] check-icon"} style={{ fontVariationSettings: "'FILL' 1" }}>
                      check_box
                    </span>
                  </label>
                  <label className={"amenity-chip cursor-pointer h-12 px-3 rounded-lg bg-surface-container-low flex items-center justify-between transition-colors active:scale-95 select-none"}>
                    <input className={"hidden"} type={"checkbox"} />
                    <div className={"flex items-center gap-1.5 min-w-0"}>
                      <span className={"material-symbols-outlined text-outline text-[18px]"}>
                        local_car_wash
                      </span>
                      <span className={"font-label-md text-label-md text-on-surface-variant font-medium truncate"}>
                        Car Wash Bay
                      </span>
                    </div>
                    <span className={"material-symbols-outlined text-outline text-[20px] check-icon"}>
                      check_box_outline_blank
                    </span>
                  </label>
                  <label className={"amenity-chip cursor-pointer h-12 px-3 rounded-lg bg-surface-container flex items-center justify-between transition-colors active:scale-95 select-none"}>
                    <input defaultChecked={true} className={"hidden"} type={"checkbox"} />
                    <div className={"flex items-center gap-1.5 min-w-0"}>
                      <span className={"material-symbols-outlined text-primary text-[18px]"}>
                        atm
                      </span>
                      <span className={"font-label-md text-label-md text-on-surface font-semibold truncate"}>
                        ATM / Cash
                      </span>
                    </div>
                    <span className={"material-symbols-outlined text-primary text-[20px] check-icon"} style={{ fontVariationSettings: "'FILL' 1" }}>
                      check_box
                    </span>
                  </label>
                  <label className={"amenity-chip cursor-pointer h-12 px-3 rounded-lg bg-surface-container-low flex items-center justify-between transition-colors active:scale-95 select-none"}>
                    <input className={"hidden"} type={"checkbox"} />
                    <div className={"flex items-center gap-1.5 min-w-0"}>
                      <span className={"material-symbols-outlined text-outline text-[18px]"}>
                        speed
                      </span>
                      <span className={"font-label-md text-label-md text-on-surface-variant font-medium truncate"}>
                        Tyre Gauge
                      </span>
                    </div>
                    <span className={"material-symbols-outlined text-outline text-[20px] check-icon"}>
                      check_box_outline_blank
                    </span>
                  </label>
                </div>
              </div>
            </div>
            <div className={"flex flex-col gap-space-xs"}>
              <label className={"font-label-lg text-label-lg text-on-surface font-bold"}>
                Operating Hours
              </label>
              <div className={"grid grid-cols-2 gap-2"} id={"hours-selector"}>
                <button onClick={onPlugClick} className={"hours-chip h-12 px-3 rounded-xl bg-primary text-on-primary font-label-md text-label-md font-bold flex items-center justify-center gap-1.5 shadow-sm"} data-hours={"247"} type={"button"} data-act={"open-24-7"} data-way-out={"primary"}>
                  <span className={"material-symbols-outlined text-[18px]"}>
                    schedule
                  </span>
                  <span>
                    Open 24/7
                  </span>
                </button>
                <button onClick={onPlugClick} className={"hours-chip h-12 px-2 rounded-xl bg-surface-container-lowest text-on-surface font-label-md text-label-md font-medium flex items-center justify-center gap-1 text-center shadow-sm"} data-hours={"standard"} type={"button"} data-act={"day-6-am-10-pm"}>
                  <span>
                    Day (6 AM - 10 PM)
                  </span>
                </button>
                <button onClick={onPlugClick} className={"hours-chip h-12 px-3 rounded-xl bg-surface-container-lowest text-on-surface font-label-md text-label-md font-medium flex items-center justify-center gap-1.5 shadow-sm"} data-hours={"custom"} type={"button"} data-act={"custom-hours"}>
                  <span className={"material-symbols-outlined text-[18px]"}>
                    tune
                  </span>
                  <span>
                    Custom Hours
                  </span>
                </button>
                <button onClick={onPlugClick} className={"hours-chip h-12 px-3 rounded-xl bg-surface-container-lowest text-on-surface font-label-md text-label-md font-medium flex items-center justify-center gap-1.5 shadow-sm"} data-hours={"unknown"} type={"button"} data-act={"not-sure"}>
                  <span className={"material-symbols-outlined text-[18px]"}>
                    help_outline
                  </span>
                  <span>
                    Not Sure
                  </span>
                </button>
              </div>
            </div>
            <div className={"flex flex-col gap-space-xs"}>
              <div className={"flex items-center justify-between"}>
                <label className={"font-label-lg text-label-lg text-on-surface font-bold"} htmlFor={"phone-number"}>
                  Phone Number
                </label>
                <span className={"font-body-sm text-body-sm text-on-surface-variant"}>
                  Optional
                </span>
              </div>
              <div className={"relative"}>
                <div className={"absolute left-3.5 top-3 flex items-center gap-1 text-on-surface-variant font-label-lg text-label-lg pointer-events-none"}>
                  <span>
                    🇯🇲
                  </span>
                  <span className={"font-bold text-on-surface"}>
                    +1 (876)
                  </span>
                </div>
                <input className={"w-full h-12 pl-28 pr-4 rounded-xl bg-surface-container-lowest text-on-surface font-body-lg text-body-lg shadow-sm focus:outline-none focus:bg-surface-container-low transition-colors"} id={"phone-number"} placeholder={"926 - 4820"} type={"tel"} />
              </div>
            </div>
            <div className={"flex flex-col gap-space-xs"}>
              <div className={"flex items-center justify-between"}>
                <label className={"font-label-lg text-label-lg text-on-surface font-bold"}>
                  Photo of Station
                </label>
                <span className={"font-label-sm text-label-sm font-bold text-secondary uppercase bg-secondary-fixed px-2 py-0.5 rounded-full"}>
                  Encouraged
                </span>
              </div>
              <div className={"flex items-center gap-2 p-space-sm bg-tertiary-fixed rounded-xl text-on-tertiary-fixed shadow-sm"}>
                <span className={"text-lg"}>
                  ⚡
                </span>
                <span className={"font-label-md text-label-md font-bold"}>
                  Photos get approved 3x faster by community scouts!
                </span>
              </div>
              <button onClick={onPlugClick} className={"w-full h-24 rounded-xl bg-surface-container-low flex flex-col items-center justify-center gap-1 text-primary hover:bg-surface-container transition-colors shadow-sm active:scale-98"} type={"button"} data-act={"snap-station-canopy-or-totem-price-board"}>
                <div className={"w-9 h-9 rounded-full bg-primary-fixed flex items-center justify-center text-primary"}>
                  <span className={"material-symbols-outlined text-[22px]"}>
                    add_a_photo
                  </span>
                </div>
                <span className={"font-label-md text-label-md font-bold text-on-surface"}>
                  Snap station canopy or totem price board
                </span>
              </button>
              <div className={"flex items-center justify-between p-2.5 bg-surface-container-lowest rounded-xl shadow-sm mt-1"}>
                <div className={"flex items-center gap-3 min-w-0"}>
                  <div className={"w-14 h-14 rounded-lg overflow-hidden shrink-0 bg-surface-container-highest"}>
                    <img className={"w-full h-full object-cover"} data-alt={"Close up photography of vibrant digital fuel pricing totem sign in Kingston Jamaica displaying glowing red and green LED numerals against bright sunny afternoon Caribbean sky"} src={"https://lh3.googleusercontent.com/aida-public/AB6AXuCeoiVO77zHxYHCMLD9vlpY4QIp8cRPrPPCff2x7oPRB70uOgcpgDhz8avDYf7sge45K3c6kTPNn5Zcpc2g4PKoPMkwioVwaYI0i3C5TKF9XS-s_iz5A5PgEn0RvNB-heXDHn0uY-j03pa9UpoW8tQsteoi6aSGsWMDAuY-1O9-RAzCDx3siyc76DDFH3IT_dJRrZLPNElMeMuGUEJsLQIqVb2Nuva55y4sLJu0nM2qWD8K98gnozbi"} />
                  </div>
                  <div className={"flex flex-col min-w-0"}>
                    <span className={"font-label-md text-label-md text-on-surface font-bold truncate"}>
                      totem_prices_hwt.jpg
                    </span>
                    <span className={"font-body-sm text-body-sm text-on-surface-variant"}>
                      1.8 MB • Ready to upload
                    </span>
                  </div>
                </div>
                <button onClick={onPlugClick} aria-label={"Remove photo"} className={"w-10 h-10 rounded-full flex items-center justify-center text-error hover:bg-error-container/40 transition-colors"} type={"button"} data-act={"delete"}>
                  <span className={"material-symbols-outlined text-[20px]"}>
                    delete
                  </span>
                </button>
              </div>
            </div>
            <div className={"flex flex-col gap-space-xs"}>
              <div className={"flex items-center justify-between"}>
                <label className={"font-label-lg text-label-lg text-on-surface font-bold"} htmlFor={"motorist-notes"}>
                  Notes / Motorist Tip
                </label>
                <span className={"font-body-sm text-body-sm text-on-surface-variant"}>
                  Optional
                </span>
              </div>
              <textarea className={"w-full p-3 rounded-xl bg-surface-container-lowest text-on-surface font-body-md text-body-md shadow-sm focus:outline-none focus:bg-surface-container-low transition-colors resize-none"} id={"motorist-notes"} placeholder={"e.g. Air pump is located behind the wash bay, accepts $100 coins or swipe debit card at cashier."} rows={3} />
            </div>
            <div className={"flex flex-col gap-space-xs pt-2"}>
              <button onClick={onPlugClick} className={"w-full h-14 rounded-full bg-primary hover:bg-primary-container text-on-primary font-headline-sm text-headline-sm flex items-center justify-center gap-2 shadow-md hover:shadow-lg transition-all active:scale-95"} id={"submit-btn"} type={"submit"} data-act={"submit-btn"} data-way-out={"primary"}>
                <span>
                  Submit for Review
                </span>
                <span className={"material-symbols-outlined text-[22px]"}>
                  arrow_forward
                </span>
              </button>
              <div className={"flex items-center justify-center gap-1.5 py-1 text-center"}>
                <span className={"material-symbols-outlined text-secondary text-[18px]"} style={{ fontVariationSettings: "'FILL' 1" }}>
                  stars
                </span>
                <p className={"font-label-md text-label-md text-on-surface-variant"}>
                  Earn
                  <span className={"font-bold text-primary"}>
                    +25 Scout Points
                  </span>
                  upon moderation approval.
                </p>
              </div>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
