import { useEffect, useRef } from 'react';
import { onPlugClick } from '../../shell/actions';
import { bindScreen } from '../../shell/bind';


export function PrivacyConsentScreen() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (ref.current) bindScreen("07-privacy-consent.html", ref.current); }, []);
  return (
    <div ref={ref} data-plug-screen={"07-privacy-consent.html"} className={"bg-surface font-body-md text-on-surface antialiased min-h-screen flex flex-col"}>
      <main className={"flex-1 flex flex-col relative w-full pt-safe pb-safe bg-surface"}>
        <div className={"flex flex-col w-full pb-6"}>
          <div className={"flex items-center justify-between px-margin py-space-sm"}>
            <button onClick={onPlugClick} aria-label={"Go Back"} className={"w-12 h-12 flex items-center justify-center rounded-full bg-surface-container-high text-on-surface active:scale-95 transition-transform duration-150"} type={"button"} data-act={"arrow-back"} data-way-out={"back"}>
              <span className={"material-symbols-outlined text-[22px]"}>
                arrow_back
              </span>
            </button>
            <div className={"inline-flex items-center gap-space-xs px-3 py-1 rounded-full bg-secondary-fixed text-on-secondary-fixed"}>
              <span className={"material-symbols-outlined text-[14px]"}>
                shield
              </span>
              <span className={"font-label-sm text-label-sm uppercase tracking-wider"}>
                {"DATA & PRIVACY"}
              </span>
            </div>
            <div className={"w-12 h-12"} />
          </div>
          <div className={"px-margin pt-space-md pb-space-sm"}>
            <div className={"inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-tertiary-fixed text-on-tertiary-fixed mb-space-xs"}>
              <span className={"material-symbols-outlined text-[14px]"} style={{ fontVariationSettings: "'FILL' 1" }}>
                verified_user
              </span>
              <span className={"font-label-sm text-label-sm"}>
                Driver Pledge
              </span>
            </div>
            <h1 className={"font-display-lg-mobile text-display-lg-mobile text-on-surface font-extrabold tracking-tight mt-1"}>
              Your data,
              <br />
              <span className={"text-primary"}>
                your choice
              </span>
            </h1>
            <p className={"font-body-md text-body-md text-on-surface-variant mt-2 leading-relaxed"}>
              Roam Plug is built for Jamaican drivers, not advertisers. Here is our simple privacy promise to you on the road.
            </p>
          </div>
          <div className={"mx-margin mt-space-xs mb-space-md p-space-md rounded-xl bg-surface-container-lowest shadow-sm flex items-center gap-space-md"}>
            <div className={"relative w-14 h-14 shrink-0 rounded-lg bg-surface-container flex items-center justify-center overflow-hidden"}>
              <svg className={"w-10 h-10 text-primary/70"} fill={"none"} stroke={"currentColor"} strokeLinecap={"round"} strokeLinejoin={"round"} strokeWidth={"1.8"} viewBox={"0 0 48 48"}>
                <path d={"M4 24c3-6 9-9 14-8 5 1 9-3 14-3 7 0 12 5 12 11s-6 8-11 9c-8 2-15-2-21 1-4 2-7-3-8-10z"} fill={"#ffdbce"} fillOpacity={"0.35"} />
                <circle cx={"16"} cy={"22"} fill={"#a33900"} r={"2.5"} />
                <circle cx={"34"} cy={"20"} fill={"#a33900"} r={"2.5"} />
                <path d={"M16 22 L24 28 L34 20"} stroke={"#a33900"} strokeDasharray={"2 2"} strokeWidth={"1.5"} />
              </svg>
              <div className={"absolute bottom-1 right-1 w-2.5 h-2.5 rounded-full bg-secondary-container animate-ping"} />
              <div className={"absolute bottom-1 right-1 w-2.5 h-2.5 rounded-full bg-secondary-container"} />
            </div>
            <div className={"flex-1 min-w-0"}>
              <div className={"flex items-center gap-1.5"}>
                <span className={"font-label-md text-label-md text-on-surface font-bold"}>
                  14 Parishes
                </span>
                <span className={"font-label-sm text-label-sm text-secondary-container px-1.5 py-0.2 rounded-full bg-secondary-fixed font-bold"}>
                  Protected
                </span>
              </div>
              <p className={"font-body-sm text-body-sm text-on-surface-variant truncate mt-0.5"}>
                Zero persistent background GPS trailing.
              </p>
            </div>
          </div>
          <div className={"px-margin flex flex-col gap-space-md"}>
            <div className={"bg-surface-container-lowest p-space-md rounded-xl shadow-sm transition-all duration-200 hover:shadow-md"}>
              <div className={"flex items-start gap-space-md"}>
                <div className={"w-12 h-12 shrink-0 rounded-xl bg-secondary-fixed flex items-center justify-center text-secondary"}>
                  <span className={"material-symbols-outlined text-[26px]"}>
                    explore
                  </span>
                </div>
                <div className={"flex-1 min-w-0"}>
                  <div className={"flex items-center justify-between"}>
                    <h2 className={"font-headline-sm text-headline-sm text-on-surface font-bold"}>
                      Local Station Discovery
                    </h2>
                    <span className={"material-symbols-outlined text-[18px] text-tertiary"}>
                      check_circle
                    </span>
                  </div>
                  <p className={"font-body-md text-body-md text-on-surface-variant mt-1.5 leading-snug"}>
                    We use your location to show nearby gas stations, current pump prices, and to map places you pin across all 14 parishes.
                  </p>
                  <div className={"flex items-center gap-2 mt-3 pt-2 text-on-surface-variant font-label-sm text-label-sm"}>
                    <span className={"inline-flex items-center gap-1 bg-surface-container px-2 py-0.5 rounded"}>
                      <span className={"material-symbols-outlined text-[13px] text-secondary"}>
                        my_location
                      </span>
                      Foreground only
                    </span>
                    <span className={"inline-flex items-center gap-1 bg-surface-container px-2 py-0.5 rounded"}>
                      <span className={"material-symbols-outlined text-[13px] text-secondary"}>
                        local_gas_station
                      </span>
                      JMD Price Feeds
                    </span>
                  </div>
                </div>
              </div>
            </div>
            <div className={"bg-surface-container-lowest p-space-md rounded-xl shadow-sm transition-all duration-200 hover:shadow-md"}>
              <div className={"flex items-start gap-space-md"}>
                <div className={"w-12 h-12 shrink-0 rounded-xl bg-primary-fixed flex items-center justify-center text-primary"}>
                  <span className={"material-symbols-outlined text-[26px]"} style={{ fontVariationSettings: "'FILL' 1" }}>
                    lock
                  </span>
                </div>
                <div className={"flex-1 min-w-0"}>
                  <div className={"flex items-center justify-between"}>
                    <h2 className={"font-headline-sm text-headline-sm text-on-surface font-bold"}>
                      Strictly Private Logs
                    </h2>
                    <span className={"material-symbols-outlined text-[18px] text-tertiary"}>
                      check_circle
                    </span>
                  </div>
                  <p className={"font-body-md text-body-md text-on-surface-variant mt-1.5 leading-snug"}>
                    Your fuel logs, odometer entries, and car maintenance history are 100% private to you and never shared or sold.
                  </p>
                  <div className={"flex items-center gap-2 mt-3 pt-2 text-on-surface-variant font-label-sm text-label-sm"}>
                    <span className={"inline-flex items-center gap-1 bg-surface-container px-2 py-0.5 rounded"}>
                      <span className={"material-symbols-outlined text-[13px] text-primary"}>
                        key
                      </span>
                      Device-Encrypted
                    </span>
                    <span className={"inline-flex items-center gap-1 bg-surface-container px-2 py-0.5 rounded"}>
                      <span className={"material-symbols-outlined text-[13px] text-primary"}>
                        no_accounts
                      </span>
                      No Ad Brokerage
                    </span>
                  </div>
                </div>
              </div>
            </div>
            <div className={"bg-surface-container-lowest p-space-md rounded-xl shadow-sm transition-all duration-200 hover:shadow-md"}>
              <div className={"flex items-start gap-space-md"}>
                <div className={"w-12 h-12 shrink-0 rounded-xl bg-tertiary-fixed flex items-center justify-center text-tertiary"}>
                  <span className={"material-symbols-outlined text-[26px]"}>
                    hub
                  </span>
                </div>
                <div className={"flex-1 min-w-0"}>
                  <div className={"flex items-center justify-between"}>
                    <h2 className={"font-headline-sm text-headline-sm text-on-surface font-bold"}>
                      Anonymous Map Intelligence
                    </h2>
                    <span className={"material-symbols-outlined text-[18px] text-tertiary"}>
                      check_circle
                    </span>
                  </div>
                  <p className={"font-body-md text-body-md text-on-surface-variant mt-1.5 leading-snug"}>
                    Only aggregated totals help build our island road map — never who you are, your phone number, or where you travelled.
                  </p>
                  <div className={"flex items-center gap-2 mt-3 pt-2 text-on-surface-variant font-label-sm text-label-sm"}>
                    <span className={"inline-flex items-center gap-1 bg-surface-container px-2 py-0.5 rounded"}>
                      <span className={"material-symbols-outlined text-[13px] text-tertiary"}>
                        visibility_off
                      </span>
                      De-identified
                    </span>
                    <span className={"inline-flex items-center gap-1 bg-surface-container px-2 py-0.5 rounded"}>
                      <span className={"material-symbols-outlined text-[13px] text-tertiary"}>
                        alt_route
                      </span>
                      Route Safety Only
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className={"px-margin mt-space-md"}>
            <div className={"bg-surface-container-low rounded-xl p-space-md shadow-sm"}>
              <div className={"flex items-start gap-space-sm"}>
                <div className={"w-8 h-8 shrink-0 rounded-full bg-secondary-fixed-dim flex items-center justify-center text-on-secondary-fixed-variant mt-0.5"}>
                  <span className={"material-symbols-outlined text-[18px]"}>
                    verified
                  </span>
                </div>
                <div className={"flex-1 min-w-0"}>
                  <p className={"font-body-md text-body-md text-on-surface font-medium leading-snug"}>
                    You can export or delete your data any time in Settings. Zero hidden trackers.
                  </p>
                  <button onClick={onPlugClick} className={"mt-2.5 inline-flex items-center gap-1 text-primary font-label-md text-label-md font-bold group"} type={"button"} data-act={"read-full-privacy-notice"}>
                    <span>
                      Read full privacy notice
                    </span>
                    <span className={"material-symbols-outlined text-[16px] transition-transform duration-150 group-hover:translate-x-0.5"}>
                      chevron_right
                    </span>
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div className={"px-margin mt-space-md"}>
            <div className={"bg-surface-container-lowest p-space-md rounded-xl shadow-sm flex items-center justify-between"}>
              <div className={"flex items-center gap-space-sm pr-2"}>
                <span className={"material-symbols-outlined text-secondary-container text-[24px]"}>
                  location_on
                </span>
                <div>
                  <span className={"font-label-lg text-label-lg text-on-surface block"}>
                    Precise Location for Gas Runs
                  </span>
                  <span className={"font-body-sm text-body-sm text-on-surface-variant block"}>
                    {"Shows closest petrol pump & live rate"}
                  </span>
                </div>
              </div>
              <button onClick={onPlugClick} aria-checked={"true"} className={"w-12 h-7 bg-primary rounded-full relative p-0.5 transition-colors duration-200 shrink-0"} id={"perm-toggle"} role={"switch"} type={"button"} data-act={"perm-toggle"} data-way-out={"primary"}>
                <span className={"block w-6 h-6 bg-surface-container-lowest rounded-full shadow-md transform translate-x-5 transition-transform duration-200"} id={"perm-handle"} />
              </button>
            </div>
          </div>
          <div className={"px-margin pt-space-lg pb-space-sm flex flex-col gap-space-sm"}>
            <button onClick={onPlugClick} className={"w-full min-h-[52px] h-14 rounded-xl bg-primary text-on-primary font-label-lg text-label-lg flex items-center justify-center gap-space-sm shadow-md active:bg-primary-container active:scale-[0.99] transition-all duration-150"} id={"agree-btn"} type={"button"} data-act={"agree-btn"} data-way-out={"primary"}>
              <span>
                {"I Agree & Continue"}
              </span>
              <span className={"material-symbols-outlined text-[20px]"}>
                arrow_forward
              </span>
            </button>
            <p className={"font-body-sm text-body-sm text-on-surface-variant text-center px-space-md leading-tight"}>
              By continuing, you agree to Roam Plug's community guidelines and transparent data pledge.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
