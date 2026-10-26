import { useEffect, useRef } from 'react';
import { onPlugClick } from '../../shell/actions';
import { bindScreen } from '../../shell/bind';


export function PrivacyDataScreen() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (ref.current) bindScreen("53-privacy-data.html", ref.current); }, []);
  return (
    <div ref={ref} data-plug-screen={"53-privacy-data.html"} className={"bg-surface font-body-md text-on-surface flex flex-col min-h-screen selection:bg-secondary-fixed selection:text-on-secondary-fixed"}>
      <header className={"fixed top-0 inset-x-0 z-50 bg-surface/85 backdrop-blur-xl pt-safe shadow-[0_1px_8px_rgba(28,25,23,0.04)]"}>
        <div className={"h-16 px-margin flex items-center justify-between"}>
          <div className={"flex items-center gap-space-sm"}>
            <button onClick={onPlugClick} aria-label={"Go Back"} className={"w-12 h-12 -ml-2 rounded-full flex items-center justify-center text-on-surface hover:bg-surface-container active:scale-95 transition-all"} type={"button"} data-act={"arrow-back"} data-way-out={"back"}>
              <span className={"material-symbols-outlined text-[24px]"}>
                arrow_back
              </span>
            </button>
            <h1 className={"font-headline-sm text-headline-sm text-on-surface tracking-tight truncate max-w-[210px]"}>
              {"Privacy & Data"}
            </h1>
          </div>
          <div className={"flex items-center gap-space-xs"}>
            <div className={"w-8 h-8 rounded-full bg-primary flex items-center justify-center shrink-0 shadow-sm"}>
              <span className={"material-symbols-outlined text-on-primary text-[18px]"}>
                person
              </span>
            </div>
          </div>
        </div>
      </header>
      <main className={"flex-1 flex flex-col relative w-full pt-16 pb-safe bg-surface"}>
        <div className={"flex flex-col w-full pb-10"}>
          <div className={"px-margin pt-4 pb-2"}>
            <div className={"flex items-center gap-space-xs text-primary mb-1"}>
              <span className={"material-symbols-outlined text-[18px]"}>
                verified_user
              </span>
              <span className={"font-label-md text-label-md uppercase tracking-wider"}>
                Driver Data Charter
              </span>
            </div>
            <p className={"font-body-md text-body-md text-on-surface-variant leading-relaxed"}>
              Transparency first. You have complete ownership over your motoring data and location permissions across Jamaica.
            </p>
          </div>
          <div className={"px-margin flex flex-col gap-space-md mt-2"}>
            <div className={"bg-surface-container-lowest p-space-md rounded-xl shadow-sm flex flex-col gap-space-sm relative overflow-hidden"}>
              <div className={"flex items-start justify-between gap-space-sm"}>
                <div className={"flex items-center gap-space-sm"}>
                  <div className={"w-10 h-10 rounded-full bg-surface-container flex items-center justify-center shrink-0 text-primary"}>
                    <span className={"material-symbols-outlined text-[22px]"}>
                      near_me
                    </span>
                  </div>
                  <div>
                    <div className={"font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider"}>
                      GPS Permission
                    </div>
                    <div className={"font-headline-sm text-headline-sm text-on-surface flex items-center gap-1.5 mt-0.5"}>
                      <span>
                        While Using App
                      </span>
                      <span className={"inline-flex items-center justify-center w-4 h-4 rounded-full bg-emerald-600 text-white"}>
                        <span className={"material-symbols-outlined text-[12px] font-bold"}>
                          check
                        </span>
                      </span>
                    </div>
                  </div>
                </div>
                <span className={"px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-800 font-label-md text-label-md flex items-center gap-1"}>
                  <span className={"w-2 h-2 rounded-full bg-emerald-600"} />
                  Active
                </span>
              </div>
              <p className={"font-body-sm text-body-sm text-on-surface-variant"}>
                Precise location is only accessed when logging fuel at pumps or pinning new automotive spots in your parish.
              </p>
              <div className={"pt-1"}>
                <button onClick={onPlugClick} className={"w-full h-12 rounded-lg bg-surface-container hover:bg-surface-container-high active:scale-[0.98] transition-all flex items-center justify-center gap-2 text-primary font-label-lg text-label-lg"} type={"button"} data-act={"change-in-phone-settings"}>
                  <span>
                    Change in phone settings
                  </span>
                  <span className={"material-symbols-outlined text-[18px]"}>
                    open_in_new
                  </span>
                </button>
              </div>
            </div>
            <div className={"bg-surface-container-lowest p-space-md rounded-xl shadow-sm flex flex-col gap-space-md"}>
              <div className={"flex items-start gap-space-sm"}>
                <div className={"w-10 h-10 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0"}>
                  <span className={"material-symbols-outlined text-[22px]"} style={{ fontVariationSettings: "'FILL' 1" }}>
                    shield
                  </span>
                </div>
                <div>
                  <div className={"font-headline-sm text-headline-sm text-on-surface"}>
                    What we keep strictly private
                  </div>
                  <p className={"font-body-sm text-body-sm text-on-surface-variant mt-0.5"}>
                    Stored encrypted and never shared with third parties, insurers, or Jamaican advertising networks:
                  </p>
                </div>
              </div>
              <div className={"flex flex-col gap-space-sm"}>
                <div className={"p-3 rounded-lg bg-surface-container-low flex items-start gap-space-sm"}>
                  <div className={"w-7 h-7 rounded-full bg-surface-container-highest flex items-center justify-center shrink-0 mt-0.5 text-on-surface"}>
                    <span className={"material-symbols-outlined text-[16px]"}>
                      directions_car
                    </span>
                  </div>
                  <div className={"min-w-0"}>
                    <div className={"font-label-lg text-label-lg text-on-surface"}>
                      {"Vehicles & License plates"}
                    </div>
                    <p className={"font-body-sm text-body-sm text-on-surface-variant"}>
                      Your car, registration, and chassis number
                    </p>
                  </div>
                </div>
                <div className={"p-3 rounded-lg bg-surface-container-low flex items-start gap-space-sm"}>
                  <div className={"w-7 h-7 rounded-full bg-surface-container-highest flex items-center justify-center shrink-0 mt-0.5 text-on-surface"}>
                    <span className={"material-symbols-outlined text-[16px]"}>
                      local_gas_station
                    </span>
                  </div>
                  <div className={"min-w-0"}>
                    <div className={"font-label-lg text-label-lg text-on-surface"}>
                      {"Fuel logs & spend history"}
                    </div>
                    <p className={"font-body-sm text-body-sm text-on-surface-variant"}>
                      {"Fill volumes, J$ total expenditure, personal odometer & fuel economy"}
                    </p>
                  </div>
                </div>
                <div className={"p-3 rounded-lg bg-surface-container-low flex items-start gap-space-sm"}>
                  <div className={"w-7 h-7 rounded-full bg-surface-container-highest flex items-center justify-center shrink-0 mt-0.5 text-on-surface"}>
                    <span className={"material-symbols-outlined text-[16px]"}>
                      folder_shared
                    </span>
                  </div>
                  <div className={"min-w-0"}>
                    <div className={"font-label-lg text-label-lg text-on-surface"}>
                      {"Vehicle documents & renewal dates"}
                    </div>
                    <p className={"font-body-sm text-body-sm text-on-surface-variant"}>
                      Island traffic fitness certificates, insurance policy numbers, and disc photo scans
                    </p>
                  </div>
                </div>
                <div className={"p-3 rounded-lg bg-surface-container-low flex items-start gap-space-sm"}>
                  <div className={"w-7 h-7 rounded-full bg-surface-container-highest flex items-center justify-center shrink-0 mt-0.5 text-on-surface"}>
                    <span className={"material-symbols-outlined text-[16px]"}>
                      build_circle
                    </span>
                  </div>
                  <div className={"min-w-0"}>
                    <div className={"font-label-lg text-label-lg text-on-surface"}>
                      {"Service & repair history"}
                    </div>
                    <p className={"font-body-sm text-body-sm text-on-surface-variant"}>
                      Mechanic invoices, parts procurement, and custom service intervals
                    </p>
                  </div>
                </div>
              </div>
              <div className={"flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-container font-label-md text-label-md text-on-surface-variant"}>
                <span className={"material-symbols-outlined text-[18px] text-emerald-700"}>
                  lock
                </span>
                <span>
                  Zero telematics sharing with insurance providers
                </span>
              </div>
            </div>
            <div className={"bg-surface-container-lowest p-space-md rounded-xl shadow-sm flex flex-col gap-space-md"}>
              <div className={"flex items-start gap-space-sm"}>
                <div className={"w-10 h-10 rounded-full bg-secondary-fixed text-on-secondary-fixed flex items-center justify-center shrink-0"}>
                  <span className={"material-symbols-outlined text-[22px]"}>
                    public
                  </span>
                </div>
                <div>
                  <div className={"font-headline-sm text-headline-sm text-on-surface"}>
                    What powers the community
                  </div>
                  <p className={"font-body-sm text-body-sm text-on-surface-variant mt-0.5"}>
                    {"Crowdsourced data contributed to help fellow Jamaican motorists navigate safely & affordably:"}
                  </p>
                </div>
              </div>
              <div className={"flex flex-col gap-space-sm"}>
                <div className={"p-3 rounded-lg bg-surface-container-low flex items-start gap-space-sm"}>
                  <div className={"w-7 h-7 rounded-full bg-secondary-container/20 text-secondary flex items-center justify-center shrink-0 mt-0.5"}>
                    <span className={"material-symbols-outlined text-[16px]"}>
                      payments
                    </span>
                  </div>
                  <div className={"min-w-0"}>
                    <div className={"font-label-lg text-label-lg text-on-surface"}>
                      Anonymous station fuel prices
                    </div>
                    <p className={"font-body-sm text-body-sm text-on-surface-variant"}>
                      Aggregated to compute fair parish gas averages (E10 87, E10 90, ULSD)
                    </p>
                  </div>
                </div>
                <div className={"p-3 rounded-lg bg-surface-container-low flex items-start gap-space-sm"}>
                  <div className={"w-7 h-7 rounded-full bg-secondary-container/20 text-secondary flex items-center justify-center shrink-0 mt-0.5"}>
                    <span className={"material-symbols-outlined text-[16px]"}>
                      add_location_alt
                    </span>
                  </div>
                  <div className={"min-w-0"}>
                    <div className={"font-label-lg text-label-lg text-on-surface"}>
                      {"Approved pins & verified spots"}
                    </div>
                    <p className={"font-body-sm text-body-sm text-on-surface-variant"}>
                      Air compressor spots, alignment shops, and local auto parts vendors
                    </p>
                  </div>
                </div>
                <div className={"p-3 rounded-lg bg-surface-container-low flex items-start gap-space-sm"}>
                  <div className={"w-7 h-7 rounded-full bg-secondary-container/20 text-secondary flex items-center justify-center shrink-0 mt-0.5"}>
                    <span className={"material-symbols-outlined text-[16px]"}>
                      warning
                    </span>
                  </div>
                  <div className={"min-w-0"}>
                    <div className={"font-label-lg text-label-lg text-on-surface"}>
                      {"Road hazard & station amenities"}
                    </div>
                    <p className={"font-body-sm text-body-sm text-on-surface-variant"}>
                      {"Real-time reports on pump queues, working tire pressure gauges & potholes"}
                    </p>
                  </div>
                </div>
              </div>
              <div className={"p-3 rounded-lg bg-surface-container-high flex items-start gap-2 text-on-surface"}>
                <span className={"material-symbols-outlined text-[18px] text-primary shrink-0 mt-0.5"}>
                  info
                </span>
                <p className={"font-body-sm text-body-sm font-semibold"}>
                  Your personal identity and vehicle registration are never connected to public road or fuel price posts.
                </p>
              </div>
            </div>
            <div className={"bg-surface-container-lowest p-space-md rounded-xl shadow-sm flex flex-col gap-space-sm"}>
              <div className={"flex items-center gap-space-sm"}>
                <div className={"w-10 h-10 rounded-full bg-tertiary-fixed text-on-tertiary-fixed flex items-center justify-center shrink-0"}>
                  <span className={"material-symbols-outlined text-[20px]"}>
                    download
                  </span>
                </div>
                <div>
                  <div className={"font-headline-sm text-headline-sm text-on-surface"}>
                    Export Your Motoring Archive
                  </div>
                  <div className={"font-label-md text-label-md text-on-surface-variant"}>
                    Take your vehicle data anytime
                  </div>
                </div>
              </div>
              <p className={"font-body-sm text-body-sm text-on-surface-variant"}>
                Request a full export of all your vehicle specs, fuel receipts, JMD pump logs, and garage service records in standard JSON or spreadsheet format.
              </p>
              <div className={"pt-2"}>
                <button onClick={onPlugClick} className={"w-full h-12 rounded-lg bg-primary hover:bg-primary-container active:scale-[0.98] transition-all flex items-center justify-center gap-2 text-on-primary font-label-lg text-label-lg shadow-sm"} id={"exportBtn"} type={"button"} data-act={"exportBtn"} data-way-out={"primary"}>
                  <span className={"material-symbols-outlined text-[20px]"}>
                    file_download
                  </span>
                  <span id={"exportText"}>
                    Download My Data (CSV / JSON)
                  </span>
                </button>
              </div>
            </div>
            <div className={"bg-surface-container-lowest p-space-md rounded-xl shadow-sm flex flex-col gap-space-sm"}>
              <div className={"flex items-center gap-space-sm text-error"}>
                <div className={"w-10 h-10 rounded-full bg-error-container text-on-error-container flex items-center justify-center shrink-0"}>
                  <span className={"material-symbols-outlined text-[20px]"}>
                    delete_forever
                  </span>
                </div>
                <div>
                  <div className={"font-headline-sm text-headline-sm text-on-surface"}>
                    {"Delete Account & Data"}
                  </div>
                  <div className={"font-label-md text-label-md text-error"}>
                    {"Permanent & Irreversible"}
                  </div>
                </div>
              </div>
              <p className={"font-body-sm text-body-sm text-on-surface-variant"}>
                Permanently remove your profile, registered cars, and maintenance records. Approved map pins stay on the map without your name.
              </p>
              <div className={"pt-2"}>
                <button onClick={onPlugClick} className={"w-full h-12 rounded-lg bg-surface-container-high hover:bg-error-container hover:text-on-error-container active:scale-[0.98] transition-all flex items-center justify-center gap-2 text-error font-label-lg text-label-lg"} type={"button"} data-act={"delete-my-account-and-data"}>
                  <span className={"material-symbols-outlined text-[20px]"}>
                    heart_broken
                  </span>
                  <span>
                    Delete My Account and Data
                  </span>
                </button>
              </div>
            </div>
            <div className={"text-center py-2"}>
              <p className={"font-body-sm text-body-sm text-on-surface-variant flex items-center justify-center gap-1"}>
                <span>
                  Protected under Jamaica Data Protection Act (JDPA)
                </span>
                <span className={"material-symbols-outlined text-[14px]"}>
                  gavel
                </span>
              </p>
            </div>
          </div>
          <div className={"hidden fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4"} id={"deleteModal"}>
            <div className={"w-full max-w-sm bg-surface-container-lowest rounded-xl p-space-lg flex flex-col gap-space-md shadow-2xl animate-in fade-in zoom-in-95 duration-150"}>
              <div className={"w-12 h-12 rounded-full bg-error-container text-on-error-container flex items-center justify-center mx-auto"}>
                <span className={"material-symbols-outlined text-[28px]"}>
                  warning
                </span>
              </div>
              <div className={"text-center"}>
                <h3 className={"font-headline-sm text-headline-sm text-on-surface"}>
                  Delete all Roam Plug data?
                </h3>
                <p className={"font-body-sm text-body-sm text-on-surface-variant mt-2"}>
                  This will purge your odometer logs, Jamaica fitness documents, and vehicle garage records immediately. You cannot undo this action.
                </p>
              </div>
              <div className={"flex flex-col gap-2 pt-2"}>
                <button onClick={onPlugClick} className={"w-full h-12 rounded-lg bg-error text-on-error font-label-lg text-label-lg flex items-center justify-center gap-1 active:scale-95 transition-all"} type={"button"} data-act={"yes-permanently-delete"}>
                  <span>
                    Yes, permanently delete
                  </span>
                </button>
                <button onClick={onPlugClick} className={"w-full h-12 rounded-lg bg-surface-container text-on-surface font-label-lg text-label-lg flex items-center justify-center active:scale-95 transition-all"} type={"button"} data-act={"cancel-keep-my-data"}>
                  <span>
                    {"Cancel & keep my data"}
                  </span>
                </button>
              </div>
            </div>
          </div>
          <div className={"fixed bottom-6 inset-x-4 max-w-xs mx-auto z-50 pointer-events-none opacity-0 transition-opacity duration-300 flex items-center gap-2 p-3 rounded-lg bg-inverse-surface text-inverse-on-surface shadow-xl"} id={"feedbackToast"}>
            <span className={"material-symbols-outlined text-[18px] text-tertiary-fixed"}>
              info
            </span>
            <span className={"font-label-md text-label-md"} id={"toastMsg"}>
              Action triggered
            </span>
          </div>
        </div>
      </main>
    </div>
  );
}
