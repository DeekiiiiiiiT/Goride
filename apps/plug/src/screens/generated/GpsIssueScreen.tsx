import { useEffect, useRef } from 'react';
import { onPlugClick } from '../../shell/actions';
import { bindScreen } from '../../shell/bind';


export function GpsIssueScreen() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (ref.current) bindScreen("56-gps-issue.html", ref.current); }, []);
  return (
    <div ref={ref} data-plug-screen={"56-gps-issue.html"} className={"bg-surface font-body-md text-on-surface flex flex-col min-h-screen pt-safe pb-safe"}>
      <main className={"flex-1 flex flex-col relative w-full bg-surface"}>
        <div className={"flex flex-col w-full relative overflow-hidden select-none"}>
          <div className={"relative w-full h-80 overflow-hidden"}>
            <div className={"w-full h-full bg-cover bg-center filter blur-[2px] brightness-[0.72] scale-105 transition-transform duration-700"} data-location={"Kingston, Jamaica"} style={{ backgroundImage: "url('https://lh3.googleusercontent.com/aida-public/AB6AXuC7cgJkoiDjsDFoO6mvtjHK0Kiic3Jgzsbc09u5d0iBGjg3iqCp3mKxcaRGbEcpNEwLwePTVdflplbFYrC0q1QOzmBLQ77PALAewO5i3FxG1xj6stUGB83E9TuC8AaIO8hLjzHAz8aoM-xpf1WspsbAHAXSww3Sr_GM1RS0WCYit32_-ZYFBOlqxgYBgCd3Uq9CoStUpWysCFS1-unwNt3RoPtkQc7eOlgJTNx1Xguy5EKtggBfgN7b')" }} />
            <div className={"absolute inset-0 bg-gradient-to-b from-inverse-surface/40 via-surface/70 to-surface"} />
            <div className={"absolute top-0 left-0 right-0 p-margin flex items-center justify-between z-10"}>
              <div className={"inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface-container-lowest/90 backdrop-blur-md shadow-sm"}>
                <span className={"w-2.5 h-2.5 rounded-full bg-error animate-ping"} />
                <span className={"w-2.5 h-2.5 rounded-full bg-error -ml-4"} />
                <span className={"font-label-sm text-on-surface uppercase tracking-wider"}>
                  No GPS Fix
                </span>
              </div>
              <button onClick={onPlugClick} aria-label={"Dismiss issue sheet"} className={"w-10 h-10 rounded-full bg-surface-container-lowest/90 text-on-surface flex items-center justify-center shadow-sm active:scale-95 transition-transform"} type={"button"} data-act={"close"} data-way-out={"back"}>
                <span className={"material-symbols-outlined text-[20px]"}>
                  close
                </span>
              </button>
            </div>
            <div className={"absolute inset-0 flex items-center justify-center pointer-events-none pb-8"}>
              <div className={"relative flex items-center justify-center"}>
                <div className={"absolute w-28 h-28 rounded-full bg-secondary-container/20 animate-ping duration-1000"} />
                <div className={"absolute w-20 h-20 rounded-full bg-primary/15 animate-pulse"} />
                <div className={"relative w-16 h-16 rounded-full bg-primary-container text-on-primary-container flex items-center justify-center shadow-lg shadow-primary/30"}>
                  <span className={"material-symbols-outlined text-[32px]"}>
                    location_off
                  </span>
                </div>
              </div>
            </div>
          </div>
          <div className={"-mt-10 px-margin pb-margin-lg flex flex-col z-20"}>
            <div className={"w-full bg-surface-container-lowest rounded-xl shadow-xl shadow-inverse-surface/5 p-margin-lg flex flex-col gap-space-md"}>
              <div className={"flex flex-col gap-1 text-center items-center"}>
                <div className={"inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-error-container text-on-error-container mb-1"}>
                  <span className={"material-symbols-outlined text-[16px]"} style={{ fontVariationSettings: "'FILL' 1" }}>
                    warning
                  </span>
                  <span className={"font-label-sm uppercase tracking-wide"}>
                    Telemetry Paused
                  </span>
                </div>
                <h1 className={"font-headline-md text-on-surface"}>
                  We can't find your location
                </h1>
                <p className={"font-body-md text-on-surface-variant max-w-sm mt-1 leading-snug"}>
                  Roam Plug needs your GPS location to verify nearby gas station prices and let you pin local motoring spots across Jamaica.
                </p>
              </div>
              <div className={"w-full bg-surface-container-low rounded-lg p-space-sm flex items-center justify-between px-3"}>
                <div className={"flex items-center gap-2"}>
                  <span className={"material-symbols-outlined text-secondary text-[18px]"}>
                    satellite_alt
                  </span>
                  <span className={"font-label-md text-on-surface-variant"}>
                    Lock: 0/12
                  </span>
                </div>
                <div className={"w-1 h-1 rounded-full bg-outline-variant"} />
                <div className={"flex items-center gap-1.5"}>
                  <span className={"w-2 h-2 rounded-full bg-tertiary-container"} />
                  <span className={"font-label-md text-on-surface-variant"}>
                    Mode: Standby
                  </span>
                </div>
                <div className={"w-1 h-1 rounded-full bg-outline-variant"} />
                <div className={"flex items-center gap-1 text-error"}>
                  <span className={"material-symbols-outlined text-[16px]"}>
                    signal_cellular_off
                  </span>
                  <span className={"font-label-md font-semibold"}>
                    Unavailable
                  </span>
                </div>
              </div>
              <div className={"flex flex-col gap-2.5"}>
                <div className={"w-full bg-surface-container rounded-lg p-3.5 flex items-start gap-3 transition-colors active:bg-surface-container-high"}>
                  <div className={"w-9 h-9 rounded-full bg-secondary-fixed text-on-secondary-fixed flex items-center justify-center flex-shrink-0 mt-0.5"}>
                    <span className={"material-symbols-outlined text-[20px]"}>
                      my_location
                    </span>
                  </div>
                  <div className={"flex flex-col min-w-0"}>
                    <div className={"flex items-center gap-2"}>
                      <span className={"font-label-sm bg-surface-container-highest text-on-surface-variant px-1.5 py-0.5 rounded-full"}>
                        Step 1
                      </span>
                      <h2 className={"font-label-lg text-on-surface truncate"}>
                        Turn on location services
                      </h2>
                    </div>
                    <p className={"font-body-sm text-on-surface-variant mt-0.5"}>
                      Ensure Location / GPS is toggled ON in your phone's quick settings.
                    </p>
                  </div>
                </div>
                <div className={"w-full bg-surface-container rounded-lg p-3.5 flex items-start gap-3 transition-colors active:bg-surface-container-high"}>
                  <div className={"w-9 h-9 rounded-full bg-primary-fixed text-on-primary-fixed flex items-center justify-center flex-shrink-0 mt-0.5"}>
                    <span className={"material-symbols-outlined text-[20px]"}>
                      security
                    </span>
                  </div>
                  <div className={"flex flex-col min-w-0"}>
                    <div className={"flex items-center gap-2"}>
                      <span className={"font-label-sm bg-surface-container-highest text-on-surface-variant px-1.5 py-0.5 rounded-full"}>
                        Step 2
                      </span>
                      <h2 className={"font-label-lg text-on-surface truncate"}>
                        Allow Roam Plug permissions
                      </h2>
                    </div>
                    <p className={"font-body-sm text-on-surface-variant mt-0.5"}>
                      Set location permission to “While Using App” or “Always” in settings.
                    </p>
                  </div>
                </div>
                <div className={"w-full bg-surface-container rounded-lg p-3.5 flex items-start gap-3 transition-colors active:bg-surface-container-high"}>
                  <div className={"w-9 h-9 rounded-full bg-tertiary-fixed text-on-tertiary-fixed flex items-center justify-center flex-shrink-0 mt-0.5"}>
                    <span className={"material-symbols-outlined text-[20px]"}>
                      explore
                    </span>
                  </div>
                  <div className={"flex flex-col min-w-0"}>
                    <div className={"flex items-center gap-2"}>
                      <span className={"font-label-sm bg-surface-container-highest text-on-surface-variant px-1.5 py-0.5 rounded-full"}>
                        Step 3
                      </span>
                      <h2 className={"font-label-lg text-on-surface truncate"}>
                        Clear concrete obstructions
                      </h2>
                    </div>
                    <p className={"font-body-sm text-on-surface-variant mt-0.5"}>
                      Tall buildings, dense concrete car parks, or hills can block satellite reception.
                    </p>
                  </div>
                </div>
              </div>
              <div className={"flex flex-col gap-2.5 mt-2"}>
                <button onClick={onPlugClick} className={"w-full min-h-[48px] bg-primary text-on-primary rounded-xl font-label-lg flex items-center justify-center gap-2 shadow-md shadow-primary/25 active:bg-on-primary-fixed-variant transition-all"} id={"btn-settings"} type={"button"} data-act={"btn-settings"} data-way-out={"primary"}>
                  <span className={"material-symbols-outlined text-[20px]"}>
                    settings
                  </span>
                  <span>
                    Open Settings
                  </span>
                </button>
                <button onClick={onPlugClick} className={"w-full min-h-[48px] bg-surface-container-high text-on-surface rounded-xl font-label-lg flex items-center justify-center gap-2 active:bg-surface-dim transition-all"} id={"btn-retry"} type={"button"} data-act={"btn-retry"}>
                  <span className={"material-symbols-outlined text-[20px] transition-transform"} id={"retry-icon"}>
                    sync
                  </span>
                  <span id={"retry-text"}>
                    Retry GPS Lock
                  </span>
                </button>
                <button onClick={onPlugClick} className={"w-full py-2.5 text-center font-label-md text-on-surface-variant hover:text-primary transition-colors flex items-center justify-center gap-1.5"} type={"button"} data-act={"continue-in-offline-mode-map-cached-data"} data-way-out={"primary"}>
                  <span className={"material-symbols-outlined text-[16px]"}>
                    cloud_off
                  </span>
                  <span>
                    {"Continue in Offline Mode (Map & Cached Data)"}
                  </span>
                </button>
              </div>
              <div className={"w-full bg-surface-container-low rounded-lg p-3 flex items-center justify-between"}>
                <div className={"flex items-center gap-2"}>
                  <div className={"w-6 h-6 rounded-full bg-surface-container-highest flex items-center justify-center"}>
                    <span className={"material-symbols-outlined text-[14px] text-secondary"}>
                      local_gas_station
                    </span>
                  </div>
                  <span className={"font-body-sm text-on-surface-variant"}>
                    Last known parish:
                    <strong className={"text-on-surface font-semibold"}>
                      St. Andrew
                    </strong>
                  </span>
                </div>
                <span className={"font-label-sm text-secondary bg-secondary-fixed/50 px-2 py-0.5 rounded-full"}>
                  14.2 km cached
                </span>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
