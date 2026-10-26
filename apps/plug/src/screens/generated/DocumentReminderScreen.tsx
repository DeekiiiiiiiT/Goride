import { useEffect, useRef } from 'react';
import { onPlugClick } from '../../shell/actions';
import { bindScreen } from '../../shell/bind';


export function DocumentReminderScreen() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (ref.current) bindScreen("37-document-reminder.html", ref.current); }, []);
  return (
    <div ref={ref} data-plug-screen={"37-document-reminder.html"} className={"bg-surface font-body-md text-on-surface min-h-screen flex flex-col antialiased selection:bg-primary/20 selection:text-primary"}>
      <header className={"fixed top-0 w-full z-50 bg-surface/85 backdrop-blur-xl shadow-[0_1px_8px_rgba(28,25,23,0.04)] pt-safe"}>
        <div className={"h-16 px-space-sm flex items-center justify-between"}>
          <div className={"flex items-center gap-space-xs"}>
            <button onClick={onPlugClick} aria-label={"Go Back"} className={"w-11 h-11 flex items-center justify-center rounded-full text-on-surface hover:text-primary hover:bg-surface-container active:scale-95 transition-all"} data-act={"arrow-back"} data-way-out={"back"}>
              <span className={"material-symbols-outlined text-[24px]"}>
                arrow_back
              </span>
            </button>
            <h1 className={"font-headline-md text-headline-md text-on-surface tracking-tight font-headline-md line-clamp-1"}>
              Add / Edit Document Reminder
            </h1>
          </div>
          <div className={"flex items-center gap-space-xs"}>
            <button onClick={onPlugClick} aria-label={"Share Vehicle"} className={"w-11 h-11 flex items-center justify-center rounded-full text-on-surface-variant hover:text-primary hover:bg-surface-container active:scale-95 transition-all"} data-act={"share"}>
              <span className={"material-symbols-outlined text-[22px]"}>
                share
              </span>
            </button>
            <button onClick={onPlugClick} aria-label={"More Options"} className={"w-11 h-11 flex items-center justify-center rounded-full text-on-surface-variant hover:text-primary hover:bg-surface-container active:scale-95 transition-all"} data-act={"more-vert"}>
              <span className={"material-symbols-outlined text-[22px]"}>
                more_vert
              </span>
            </button>
            <div className={"w-8 h-8 rounded-full bg-primary flex items-center justify-center ml-space-xs shadow-sm"}>
              <span className={"material-symbols-outlined text-on-primary text-[18px]"}>
                person
              </span>
            </div>
          </div>
        </div>
      </header>
      <main className={"flex-1 w-full bg-surface pt-16 pb-safe"}>
        <div className={"flex flex-col w-full px-margin pb-space-xl"}>
          <div className={"mt-space-sm mb-space-md p-space-md rounded-xl bg-surface-container-low shadow-sm flex items-center gap-space-md"}>
            <div className={"w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 text-primary"}>
              <span className={"material-symbols-outlined text-[28px]"} style={{ fontVariationSettings: "'FILL' 1" }}>
                shield_with_heart
              </span>
            </div>
            <div className={"min-w-0 flex-1"}>
              <span className={"font-label-sm text-label-sm text-primary uppercase tracking-wider block"}>
                Statutory Compliance
              </span>
              <h2 className={"font-headline-sm text-headline-sm text-on-surface truncate"}>
                Never Miss a Parish Deadline
              </h2>
              <p className={"font-body-sm text-body-sm text-on-surface-variant truncate"}>
                {"ITA inspection & TAJ renewal sync"}
              </p>
            </div>
          </div>
          <form className={"flex flex-col gap-space-lg"} id={"reminder-form"}>
            <div className={"flex flex-col gap-space-sm"}>
              <div className={"flex items-center justify-between"}>
                <label className={"font-label-lg text-label-lg text-on-surface flex items-center gap-space-xs"}>
                  <span>
                    Document Type
                  </span>
                  <span className={"text-primary font-bold"}>
                    *
                  </span>
                </label>
                <span className={"font-label-sm text-label-sm text-on-surface-variant"}>
                  Tap to select
                </span>
              </div>
              <div className={"grid grid-cols-2 gap-gutter-sm"} id={"doc-type-group"}>
                <button onClick={onPlugClick} className={"doc-type-btn flex items-center gap-space-sm p-space-md rounded-xl bg-surface-container-lowest text-on-surface shadow-sm active:scale-95 transition-all text-left"} data-doc-type={"licence"} type={"button"} data-act={"driver-s-licence-personal-id"}>
                  <div className={"w-9 h-9 rounded-lg bg-surface-container-high flex items-center justify-center text-on-surface-variant shrink-0 icon-box"}>
                    <span className={"material-symbols-outlined text-[20px]"}>
                      badge
                    </span>
                  </div>
                  <div className={"min-w-0"}>
                    <span className={"font-label-md text-label-md block leading-tight truncate"}>
                      Driver's Licence
                    </span>
                    <span className={"font-body-sm text-body-sm text-on-surface-variant text-[12px] block truncate"}>
                      Personal ID
                    </span>
                  </div>
                </button>
                <button onClick={onPlugClick} className={"doc-type-btn flex items-center gap-space-sm p-space-md rounded-xl bg-surface-container-lowest text-on-surface shadow-sm active:scale-95 transition-all text-left"} data-doc-type={"taj"} type={"button"} data-act={"registration-tax-admin-taj"}>
                  <div className={"w-9 h-9 rounded-lg bg-surface-container-high flex items-center justify-center text-on-surface-variant shrink-0 icon-box"}>
                    <span className={"material-symbols-outlined text-[20px]"}>
                      description
                    </span>
                  </div>
                  <div className={"min-w-0"}>
                    <span className={"font-label-md text-label-md block leading-tight truncate"}>
                      Registration
                    </span>
                    <span className={"font-body-sm text-body-sm text-on-surface-variant text-[12px] block truncate"}>
                      Tax Admin (TAJ)
                    </span>
                  </div>
                </button>
                <button onClick={onPlugClick} className={"doc-type-btn selected flex items-center gap-space-sm p-space-md rounded-xl bg-primary-container text-on-primary-container shadow-md active:scale-95 transition-all text-left"} data-doc-type={"fitness"} type={"button"} data-act={"fitness-ita-roadworthiness"} data-way-out={"primary"}>
                  <div className={"w-9 h-9 rounded-lg bg-on-primary/20 flex items-center justify-center text-on-primary-container shrink-0 icon-box"}>
                    <span className={"material-symbols-outlined text-[20px]"} style={{ fontVariationSettings: "'FILL' 1" }}>
                      verified
                    </span>
                  </div>
                  <div className={"min-w-0"}>
                    <span className={"font-label-md text-label-md block leading-tight truncate"}>
                      Fitness (ITA)
                    </span>
                    <span className={"font-body-sm text-body-sm text-on-primary-container/80 text-[12px] block truncate"}>
                      Roadworthiness
                    </span>
                  </div>
                </button>
                <button onClick={onPlugClick} className={"doc-type-btn flex items-center gap-space-sm p-space-md rounded-xl bg-surface-container-lowest text-on-surface shadow-sm active:scale-95 transition-all text-left"} data-doc-type={"insurance"} type={"button"} data-act={"insurance-policy-coverage-certificate"}>
                  <div className={"w-9 h-9 rounded-lg bg-surface-container-high flex items-center justify-center text-on-surface-variant shrink-0 icon-box"}>
                    <span className={"material-symbols-outlined text-[20px]"}>
                      health_and_safety
                    </span>
                  </div>
                  <div className={"min-w-0"}>
                    <span className={"font-label-md text-label-md block leading-tight truncate"}>
                      Insurance Policy
                    </span>
                    <span className={"font-body-sm text-body-sm text-on-surface-variant text-[12px] block truncate"}>
                      Coverage certificate
                    </span>
                  </div>
                </button>
              </div>
              <button onClick={onPlugClick} className={"doc-type-btn w-full flex items-center justify-between p-space-sm px-space-md rounded-xl bg-surface-container-lowest text-on-surface shadow-sm active:scale-95 transition-all"} data-doc-type={"other"} type={"button"} data-act={"other-vehicle-permit-ppv-badge"}>
                <div className={"flex items-center gap-space-sm"}>
                  <div className={"w-7 h-7 rounded-lg bg-surface-container-high flex items-center justify-center text-on-surface-variant icon-box"}>
                    <span className={"material-symbols-outlined text-[16px]"}>
                      folder_open
                    </span>
                  </div>
                  <span className={"font-label-md text-label-md"}>
                    Other Vehicle Permit / PPV Badge
                  </span>
                </div>
                <span className={"material-symbols-outlined text-on-surface-variant text-[18px]"}>
                  chevron_right
                </span>
              </button>
            </div>
            <div className={"flex flex-col gap-space-sm"}>
              <label className={"font-label-lg text-label-lg text-on-surface flex items-center justify-between"}>
                <span>
                  Linked Vehicle
                </span>
                <span className={"font-label-sm text-label-sm text-primary font-normal"}>
                  Active fleet (2)
                </span>
              </label>
              <div className={"flex flex-col gap-space-xs"} id={"vehicle-radio-group"}>
                <label className={"vehicle-option relative flex items-center justify-between p-space-md rounded-xl bg-surface-container-lowest text-on-surface shadow-sm cursor-pointer select-none"}>
                  <input defaultChecked={true} className={"sr-only peer"} name={"linked_vehicle"} type={"radio"} defaultValue={""} />
                  <div className={"flex items-center gap-space-md min-w-0"}>
                    <div className={"w-10 h-10 rounded-xl bg-surface-container-high flex items-center justify-center text-primary shrink-0"}>
                      <span className={"material-symbols-outlined text-[22px]"}>
                        directions_car
                      </span>
                    </div>
                    <div className={"min-w-0"}>
                      <div className={"flex items-center gap-space-xs"}>
                        <span className={"font-label-lg text-label-lg text-on-surface truncate"} data-slot={"car"}>
                          Add a car</span>
                        <span className={"font-label-sm text-label-sm bg-surface-container-high px-space-xs py-0.5 rounded text-on-surface-variant font-bold"}>
                          PPV
                        </span>
                      </div>
                      <p className={"font-body-sm text-body-sm text-on-surface-variant"}>
                        Plate:
                        <span className={"font-bold text-on-surface"}>
                          
                        </span>
                        {"• Kingston & St. Andrew"}
                      </p>
                    </div>
                  </div>
                  <div className={"w-6 h-6 rounded-full bg-primary flex items-center justify-center text-on-primary shrink-0 vehicle-check"}>
                    <span className={"material-symbols-outlined text-[16px]"}>
                      check
                    </span>
                  </div>
                </label>
                <label className={"vehicle-option relative flex items-center justify-between p-space-md rounded-xl bg-surface-container-lowest text-on-surface shadow-sm cursor-pointer select-none opacity-80 hover:opacity-100 transition-opacity"}>
                  <input className={"sr-only peer"} name={"linked_vehicle"} type={"radio"} defaultValue={""} />
                  <div className={"flex items-center gap-space-md min-w-0"}>
                    <div className={"w-10 h-10 rounded-xl bg-surface-container-high flex items-center justify-center text-on-surface-variant shrink-0"}>
                      <span className={"material-symbols-outlined text-[22px]"}>
                        commute
                      </span>
                    </div>
                    <div className={"min-w-0"}>
                      <div className={"flex items-center gap-space-xs"}>
                        <span className={"font-label-lg text-label-lg text-on-surface truncate"}>
                          2016 Nissan AD Wagon
                        </span>
                        <span className={"font-label-sm text-label-sm bg-surface-container-high px-space-xs py-0.5 rounded text-on-surface-variant"}>
                          Route
                        </span>
                      </div>
                      <p className={"font-body-sm text-body-sm text-on-surface-variant"}>
                        Plate:
                        <span className={"font-bold text-on-surface"}>
                          PA 4910
                        </span>
                        • St. Catherine
                      </p>
                    </div>
                  </div>
                  <div className={"w-6 h-6 rounded-full bg-surface-container-high flex items-center justify-center text-transparent shrink-0 vehicle-check"}>
                    <span className={"material-symbols-outlined text-[16px]"}>
                      check
                    </span>
                  </div>
                </label>
                <label className={"vehicle-option relative flex items-center justify-between p-space-sm px-space-md rounded-xl bg-surface-container-lowest text-on-surface shadow-sm cursor-pointer select-none opacity-80 hover:opacity-100 transition-opacity"}>
                  <input className={"sr-only peer"} name={"linked_vehicle"} type={"radio"} defaultValue={"personal"} />
                  <div className={"flex items-center gap-space-md min-w-0"}>
                    <div className={"w-8 h-8 rounded-lg bg-surface-container-high flex items-center justify-center text-on-surface-variant shrink-0"}>
                      <span className={"material-symbols-outlined text-[18px]"}>
                        person
                      </span>
                    </div>
                    <div className={"min-w-0"}>
                      <span className={"font-label-md text-label-md text-on-surface truncate block"}>
                        Driver Personal
                      </span>
                      <p className={"font-body-sm text-body-sm text-on-surface-variant text-[12px]"}>
                        Not bound to an individual vehicle chassis
                      </p>
                    </div>
                  </div>
                  <div className={"w-6 h-6 rounded-full bg-surface-container-high flex items-center justify-center text-transparent shrink-0 vehicle-check"}>
                    <span className={"material-symbols-outlined text-[16px]"}>
                      check
                    </span>
                  </div>
                </label>
              </div>
            </div>
            <div className={"flex flex-col gap-space-md bg-surface-container-lowest p-space-md rounded-xl shadow-sm"}>
              <div className={"flex items-center justify-between"}>
                <h3 className={"font-headline-sm text-headline-sm text-on-surface"}>
                  {"Details & Reference"}
                </h3>
                <span className={"flex items-center gap-1 font-label-sm text-label-sm text-tertiary"}>
                  <span className={"material-symbols-outlined text-[14px]"}>
                    lock
                  </span>
                  Private Vault
                </span>
              </div>
              <div className={"flex flex-col gap-space-xs"}>
                <label className={"font-label-md text-label-md text-on-surface-variant"} htmlFor={"doc-number"}>
                  Document / Certificate Number
                  <span className={"font-normal opacity-70"}>
                    (Optional)
                  </span>
                </label>
                <div className={"relative flex items-center"}>
                  <span className={"absolute left-space-md text-on-surface-variant pointer-events-none material-symbols-outlined text-[20px]"}>
                    pin
                  </span>
                  <input className={"w-full h-12 pl-11 pr-space-md rounded-xl bg-surface-container-low font-body-md text-body-md text-on-surface placeholder:text-outline outline-none focus:bg-surface-container-lowest shadow-inner transition-colors"} id={"doc-number"} placeholder={"e.g. TF-94021-JM"} type={"text"} defaultValue={""} />
                </div>
              </div>
              <div className={"flex flex-col gap-space-xs"}>
                <label className={"font-label-md text-label-md text-on-surface-variant"} htmlFor={"issuing-authority"}>
                  Issuing Authority or Insurer
                </label>
                <div className={"relative flex items-center"}>
                  <span className={"absolute left-space-md text-on-surface-variant pointer-events-none material-symbols-outlined text-[20px]"}>
                    assured_workload
                  </span>
                  <input className={"w-full h-12 pl-11 pr-space-md rounded-xl bg-surface-container-low font-body-md text-body-md text-on-surface placeholder:text-outline outline-none focus:bg-surface-container-lowest shadow-inner transition-colors"} id={"issuing-authority"} placeholder={"e.g. Advantage General / ITA Swallowfield"} type={"text"} defaultValue={""} />
                </div>
              </div>
            </div>
            <div className={"flex flex-col gap-space-sm bg-surface-container-lowest p-space-md rounded-xl shadow-sm"}>
              <div className={"flex items-center justify-between"}>
                <label className={"font-label-lg text-label-lg text-on-surface flex items-center gap-space-xs"} htmlFor={"expiry-date-input"}>
                  <span>
                    Expiry Date
                  </span>
                  <span className={"text-primary font-bold"}>
                    *
                  </span>
                </label>
                <span className={"font-label-md text-label-md px-space-sm py-1 rounded-full bg-secondary-fixed text-on-secondary-fixed flex items-center gap-1 font-bold"} id={"countdown-badge"}>
                  <span className={"material-symbols-outlined text-[15px]"} style={{ fontVariationSettings: "'FILL' 1" }}>
                    timer
                  </span>
                  in 21 days
                </span>
              </div>
              <div className={"relative flex items-center"}>
                <div className={"absolute left-space-md flex items-center justify-center text-primary pointer-events-none"}>
                  <span className={"material-symbols-outlined text-[22px]"}>
                    calendar_month
                  </span>
                </div>
                <input className={"w-full h-14 pl-12 pr-space-md rounded-xl bg-surface-container-low font-headline-sm text-headline-sm text-on-surface outline-none focus:bg-surface-container-lowest shadow-inner cursor-pointer"} id={"expiry-date-input"} type={"date"} defaultValue={""} />
              </div>
              <div className={"flex items-center justify-between pt-space-xs text-on-surface-variant"}>
                <div className={"flex items-center gap-1 text-[12px] font-body-sm"}>
                  <span className={"material-symbols-outlined text-[16px] text-tertiary"}>
                    info
                  </span>
                  <span>
                    Formatted:
                    <strong className={"text-on-surface"} id={"formatted-preview"}>
                      Not set
                    </strong>
                  </span>
                </div>
                <span className={"font-label-sm text-label-sm text-primary font-bold"}>
                  Grace Period: None (ITA)
                </span>
              </div>
            </div>
            <div className={"flex flex-col gap-space-sm bg-surface-container-lowest p-space-md rounded-xl shadow-sm"}>
              <div className={"flex items-start justify-between gap-space-sm"}>
                <div>
                  <h3 className={"font-headline-sm text-headline-sm text-on-surface"}>
                    Reminder Triggers
                  </h3>
                  <p className={"font-body-sm text-body-sm text-on-surface-variant"}>
                    {"Push reminders on this device"}
                  </p>
                </div>
                <div className={"w-8 h-8 rounded-full bg-secondary-fixed/50 flex items-center justify-center text-secondary shrink-0"}>
                  <span className={"material-symbols-outlined text-[18px]"}>
                    notifications_active
                  </span>
                </div>
              </div>
              <div className={"flex flex-wrap gap-space-xs pt-space-xs"} id={"trigger-chips"}>
                <button onClick={onPlugClick} className={"schedule-chip active h-10 px-space-md rounded-full bg-primary text-on-primary font-label-md text-label-md flex items-center gap-space-xs shadow-sm transition-all active:scale-95"} data-schedule={"30"} type={"button"} data-act={"30-days-before"} data-way-out={"primary"}>
                  <span className={"material-symbols-outlined text-[16px]"}>
                    check_circle
                  </span>
                  <span>
                    30 days before
                  </span>
                </button>
                <button onClick={onPlugClick} className={"schedule-chip active h-10 px-space-md rounded-full bg-primary text-on-primary font-label-md text-label-md flex items-center gap-space-xs shadow-sm transition-all active:scale-95"} data-schedule={"14"} type={"button"} data-act={"14-days-before"} data-way-out={"primary"}>
                  <span className={"material-symbols-outlined text-[16px]"}>
                    check_circle
                  </span>
                  <span>
                    14 days before
                  </span>
                </button>
                <button onClick={onPlugClick} className={"schedule-chip active h-10 px-space-md rounded-full bg-primary text-on-primary font-label-md text-label-md flex items-center gap-space-xs shadow-sm transition-all active:scale-95"} data-schedule={"7"} type={"button"} data-act={"7-days-before"} data-way-out={"primary"}>
                  <span className={"material-symbols-outlined text-[16px]"}>
                    check_circle
                  </span>
                  <span>
                    7 days before
                  </span>
                </button>
                <button onClick={onPlugClick} className={"schedule-chip active h-10 px-space-md rounded-full bg-primary text-on-primary font-label-md text-label-md flex items-center gap-space-xs shadow-sm transition-all active:scale-95"} data-schedule={"1"} type={"button"} data-act={"1-day-before"} data-way-out={"primary"}>
                  <span className={"material-symbols-outlined text-[16px]"}>
                    check_circle
                  </span>
                  <span>
                    1 day before
                  </span>
                </button>
                <button onClick={onPlugClick} className={"schedule-chip h-10 px-space-md rounded-full bg-surface-container-high text-on-surface-variant font-label-md text-label-md flex items-center gap-space-xs transition-all active:scale-95"} data-schedule={"0"} type={"button"} data-act={"on-expiry-day"}>
                  <span className={"material-symbols-outlined text-[16px] opacity-40"}>
                    add_circle
                  </span>
                  <span>
                    On expiry day
                  </span>
                </button>
              </div>
              <div className={"mt-space-sm p-space-sm rounded-lg bg-surface-container-low flex items-start gap-space-sm"}>
                <span className={"material-symbols-outlined text-secondary text-[20px] shrink-0 mt-0.5"}>
                  verified_user
                </span>
                <p className={"font-body-sm text-body-sm text-on-surface-variant leading-snug"}>
                  Helps you avoid
                  <strong>
                    ITA roadside seizure penalties
                  </strong>
                  and
                  <strong>
                    TAJ late renewal fees
                  </strong>
                  along Highway 2000 and parish corridors.
                </p>
              </div>
            </div>
            <div className={"flex flex-col gap-space-sm bg-surface-container-lowest p-space-md rounded-xl shadow-sm"}>
              <div className={"flex items-center justify-between"}>
                <div>
                  <h3 className={"font-headline-sm text-headline-sm text-on-surface"}>
                    Attach Document Photo
                  </h3>
                  <p className={"font-body-sm text-body-sm text-on-surface-variant"}>
                    Front or back scan for quick road checks
                  </p>
                </div>
                <span className={"font-label-sm text-label-sm bg-surface-container-high px-space-xs py-0.5 rounded text-on-surface-variant"}>
                  Optional
                </span>
              </div>
              <div className={"relative group cursor-pointer rounded-xl bg-surface-container-low p-space-lg flex flex-col items-center justify-center text-center transition-all hover:bg-surface-container"} id={"dropzone"}>
                <div className={"w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center text-primary mb-space-sm group-hover:scale-110 transition-transform"}>
                  <span className={"material-symbols-outlined text-[32px]"}>
                    photo_camera
                  </span>
                </div>
                <h4 className={"font-label-lg text-label-lg text-on-surface"}>
                  {"Snap document front & back"}
                </h4>
                <p className={"font-body-sm text-body-sm text-on-surface-variant mt-1"}>
                  Take a fresh photo or
                  <span className={"text-primary font-bold underline"}>
                    browse gallery
                  </span>
                  (Max 5MB)
                </p>
                <input accept={"image/*"} className={"sr-only"} id={"file-uploader"} type={"file"} />
                <div className={"mt-space-md flex items-center gap-1.5 px-space-sm py-1 rounded-full bg-surface-container-lowest text-on-surface-variant shadow-sm text-[12px] font-label-md"}>
                  <span className={"material-symbols-outlined text-[14px] text-tertiary"} style={{ fontVariationSettings: "'FILL' 1" }}>
                    security
                  </span>
                  <span>
                    Stored with end-to-end encryption
                  </span>
                </div>
              </div>
              <div className={"flex items-center justify-between p-space-sm rounded-xl bg-surface-container-low shadow-inner"} id={"preview-container"}>
                <div className={"flex items-center gap-space-sm min-w-0"}>
                  <div className={"w-12 h-12 rounded-lg bg-surface-container overflow-hidden shrink-0"}>
                    <div className={"w-full h-full object-cover bg-surface-container flex items-center justify-center text-primary"} aria-hidden={"true"}><span className={"material-symbols-outlined text-[32px]"}>image</span></div>
                  </div>
                  <div className={"min-w-0"}>
                    <span className={"font-label-md text-label-md text-on-surface truncate block"}>
                      ita_fitness_cert_front.jpg
                    </span>
                    <span className={"font-body-sm text-body-sm text-on-surface-variant text-[12px]"}>
                      1.8 MB • Encrypted
                    </span>
                  </div>
                </div>
                <button onClick={onPlugClick} aria-label={"Remove attached document"} className={"w-9 h-9 rounded-full flex items-center justify-center text-error hover:bg-error-container/50 active:scale-95 transition-all"} type={"button"} data-act={"delete"}>
                  <span className={"material-symbols-outlined text-[20px]"}>
                    delete
                  </span>
                </button>
              </div>
            </div>
            <div className={"flex flex-col gap-space-sm pt-space-xs"}>
              <button onClick={onPlugClick} className={"w-full h-14 rounded-xl bg-gradient-to-r from-primary to-secondary-container text-on-primary font-label-lg text-label-lg flex items-center justify-center gap-space-xs shadow-lg active:scale-98 transition-all hover:brightness-105"} id={"save-reminder-btn"} type={"submit"} data-act={"save-reminder-btn"} data-way-out={"primary"}>
                <span className={"material-symbols-outlined text-[22px]"}>
                  notification_add
                </span>
                <span>
                  Save Reminder
                </span>
              </button>
              <button onClick={onPlugClick} className={"w-full h-12 rounded-xl text-on-surface-variant hover:text-on-surface font-label-lg text-label-lg flex items-center justify-center transition-colors active:scale-98"} type={"button"} data-act={"cancel-and-discard"}>
                Cancel and Discard
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
