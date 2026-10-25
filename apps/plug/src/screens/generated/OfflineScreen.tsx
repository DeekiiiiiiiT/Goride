import { useEffect, useRef } from 'react';
import { onPlugClick } from '../../shell/actions';
import { bindScreen } from '../../shell/bind';


export function OfflineScreen() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (ref.current) bindScreen("57-offline.html", ref.current); }, []);
  return (
    <div ref={ref} data-plug-screen={"57-offline.html"} className={"bg-surface font-body-md text-on-surface flex flex-col min-h-screen"}>
      <header className={"fixed top-0 inset-x-0 z-50 bg-surface/85 backdrop-blur-xl shadow-[0_1px_8px_rgba(0,0,0,0.04)] pt-safe"}>
        <div className={"h-16 px-space-md flex items-center justify-between"}>
          <div className={"flex items-center gap-space-sm"}>
            <div className={"w-10 h-10 rounded-xl bg-primary flex items-center justify-center text-on-primary shadow-[0_4px_12px_rgba(163,57,0,0.25)]"}>
              <span className={"material-symbols-outlined text-[22px]"}>
                local_gas_station
              </span>
            </div>
            <div className={"flex flex-col"}>
              <span className={"font-label-sm text-label-sm text-primary tracking-wider uppercase"}>
                Roam Plug
              </span>
              <h1 className={"font-headline-sm text-headline-sm text-on-surface leading-tight"}>
                Offline / No Connection
              </h1>
            </div>
          </div>
          <div className={"flex items-center gap-space-xs"}>
            <button onClick={onPlugClick} aria-label={"Parish Selection & Alerts"} className={"w-11 h-11 min-h-[44px] min-w-[44px] rounded-full flex items-center justify-center text-on-surface-variant hover:text-primary transition-colors"} data-act={"notifications"}>
              <span className={"material-symbols-outlined text-[24px]"}>
                notifications
              </span>
            </button>
            <div className={"w-8 h-8 rounded-full bg-primary flex items-center justify-center"}>
              <span className={"material-symbols-outlined text-on-primary text-[18px]"}>
                person
              </span>
            </div>
          </div>
        </div>
      </header>
      <main className={"flex flex-col relative w-full pt-16 pb-28 bg-surface min-h-screen"}>
        <div className={"flex flex-col w-full"}>
          <div className={"px-space-md pt-space-sm pb-space-xs"}>
            <div className={"bg-tertiary-fixed text-on-tertiary-fixed rounded-xl p-space-md shadow-sm flex items-start gap-space-sm"}>
              <div className={"w-10 h-10 rounded-lg bg-tertiary flex items-center justify-center text-on-tertiary flex-shrink-0"}>
                <span className={"material-symbols-outlined text-[24px]"}>
                  wifi_off
                </span>
              </div>
              <div className={"flex-1 min-w-0"}>
                <div className={"flex items-center justify-between gap-space-xs"}>
                  <span className={"font-headline-sm text-headline-sm leading-tight font-bold"}>
                    No internet connection
                  </span>
                  <button onClick={onPlugClick} aria-label={"Retry connection"} className={"flex items-center gap-1 bg-surface-container-lowest px-2.5 py-1.5 rounded-full text-tertiary font-label-md text-label-md active:scale-95 transition-transform flex-shrink-0 shadow-sm"} id={"retry-top-btn"} data-act={"retry-top-btn"}>
                    <span className={"material-symbols-outlined text-[16px] transition-transform duration-500"} id={"retry-top-icon"}>
                      refresh
                    </span>
                    <span>
                      Retry
                    </span>
                  </button>
                </div>
                <p className={"font-body-sm text-body-sm text-on-tertiary-fixed-variant mt-0.5"}>
                  Cached map area and prices shown • Last updated 20 min ago
                </p>
              </div>
            </div>
          </div>
          <div className={"px-space-md py-space-xs"}>
            <div className={"bg-surface-container rounded-xl p-space-md shadow-sm flex flex-col gap-space-xs"}>
              <div className={"flex items-center justify-between"}>
                <div className={"flex items-center gap-1.5"}>
                  <span className={"material-symbols-outlined text-primary text-[20px]"} style={{ fontVariationSettings: "'FILL' 1" }}>
                    cloud_sync
                  </span>
                  <span className={"font-label-lg text-label-lg text-on-surface"}>
                    Offline Mode Ready
                  </span>
                </div>
                <span className={"bg-secondary-fixed text-on-secondary-fixed font-label-sm text-label-sm px-2 py-0.5 rounded-full flex items-center gap-1"}>
                  <span className={"w-1.5 h-1.5 rounded-full bg-secondary"} />
                  2 logs queued locally
                </span>
              </div>
              <p className={"font-body-md text-body-md text-on-surface-variant"}>
                You can still log fuel and pin places — we’ll automatically sync them to Roam Plug as soon as your signal catches up.
              </p>
            </div>
          </div>
          <div className={"px-space-md pt-space-xs pb-space-sm"}>
            <div className={"relative w-full h-44 rounded-xl overflow-hidden shadow-sm"}>
              <div className={"w-full h-full bg-surface-container flex items-center justify-center text-primary"} aria-hidden={"true"}><span className={"material-symbols-outlined text-[32px]"}>image</span></div>
              <div className={"absolute inset-0 bg-surface-dim/40 backdrop-blur-[1px] flex flex-col justify-between p-space-md pointer-events-none"}>
                <div className={"flex items-center justify-between"}>
                  <span className={"inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface-container-lowest/90 backdrop-blur-md text-on-surface font-label-md text-label-md shadow-sm"}>
                    <span className={"material-symbols-outlined text-secondary text-[16px]"}>
                      download_done
                    </span>
                    {"Cached Sector: Kingston & St. Andrew"}
                  </span>
                  <span className={"inline-flex items-center justify-center w-8 h-8 rounded-full bg-surface-container-lowest/90 backdrop-blur-md text-on-surface shadow-sm"}>
                    <span className={"material-symbols-outlined text-[18px]"}>
                      gps_fixed
                    </span>
                  </span>
                </div>
                <div className={"flex items-center justify-between"}>
                  <div className={"bg-surface-container-lowest/95 backdrop-blur-md px-3 py-1.5 rounded-lg flex items-center gap-2 shadow-sm"}>
                    <span className={"w-2.5 h-2.5 rounded-full bg-secondary animate-pulse"} />
                    <span className={"font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider"}>
                      Storage Vault Active
                    </span>
                  </div>
                  <span className={"font-label-sm text-label-sm text-on-surface-variant bg-surface-container-lowest/80 px-2 py-1 rounded"}>
                    Offline GPS Tracking
                  </span>
                </div>
              </div>
            </div>
          </div>
          <div className={"px-space-md pb-space-sm"}>
            <div className={"w-full bg-surface-container-lowest rounded-xl p-space-sm px-space-md flex items-center gap-space-sm shadow-sm"}>
              <span className={"material-symbols-outlined text-outline text-[20px]"}>
                search
              </span>
              <span className={"font-body-md text-body-md text-on-surface-variant flex-1 truncate"}>
                Searching cached spots in parish...
              </span>
              <span className={"bg-surface-container-high text-on-surface-variant text-[12px] font-label-sm px-2 py-1 rounded"}>
                LOCAL ONLY
              </span>
            </div>
          </div>
          <div className={"px-space-md pb-space-md"}>
            <div className={"grid grid-cols-2 gap-space-sm"}>
              <button onClick={onPlugClick} aria-label={"Log Fuel Offline"} className={"bg-primary text-on-primary rounded-xl p-space-md flex items-center justify-center gap-2 shadow-md active:scale-95 transition-transform min-h-[48px]"} data-act={"log-fuel-offline"} data-way-out={"primary"}>
                <span className={"material-symbols-outlined text-[20px]"}>
                  local_gas_station
                </span>
                <span className={"font-label-lg text-label-lg"}>
                  Log Fuel Offline
                </span>
              </button>
              <button onClick={onPlugClick} aria-label={"Pin a Place Offline"} className={"bg-surface-container text-on-surface rounded-xl p-space-md flex items-center justify-center gap-2 shadow-sm active:scale-95 transition-transform min-h-[48px]"} data-act={"pin-a-place"}>
                <span className={"material-symbols-outlined text-secondary text-[20px]"}>
                  pin_drop
                </span>
                <span className={"font-label-lg text-label-lg"}>
                  Pin a Place
                </span>
              </button>
            </div>
          </div>
          <div className={"px-space-md pb-space-xs flex items-center justify-between"}>
            <div className={"flex items-center gap-1.5"}>
              <span className={"material-symbols-outlined text-secondary text-[18px]"}>
                history
              </span>
              <h2 className={"font-headline-sm text-headline-sm text-on-surface"}>
                Cached Fuel Rates
              </h2>
            </div>
            <span className={"font-label-md text-label-md text-on-surface-variant"}>
              3 Stations Stored
            </span>
          </div>
          <div className={"px-space-md flex flex-col gap-space-sm pb-space-md"}>
            <div className={"bg-surface-container-lowest rounded-xl p-space-md shadow-sm flex flex-col gap-space-sm"}>
              <div className={"flex items-start justify-between"}>
                <div className={"flex items-center gap-space-sm"}>
                  <div className={"w-10 h-10 rounded-xl bg-surface-container flex items-center justify-center flex-shrink-0"}>
                    <span className={"material-symbols-outlined text-primary text-[24px]"}>
                      local_gas_station
                    </span>
                  </div>
                  <div>
                    <div className={"flex items-center gap-1"}>
                      <h3 className={"font-headline-sm text-headline-sm text-on-surface leading-tight"}>
                        Rubis Waterloo Road
                      </h3>
                      <span className={"material-symbols-outlined text-secondary text-[16px]"} title={"Saved on Device"}>
                        offline_pin
                      </span>
                    </div>
                    <p className={"font-body-sm text-body-sm text-on-surface-variant"}>
                      Waterloo Rd • Kingston 10
                    </p>
                  </div>
                </div>
                <span className={"font-label-md text-label-md text-primary bg-primary-fixed px-2.5 py-0.5 rounded-full flex-shrink-0"}>
                  1.2 km
                </span>
              </div>
              <div className={"flex items-center justify-between bg-surface-container-low rounded-lg p-space-sm"}>
                <div className={"flex items-center gap-2"}>
                  <span className={"bg-surface-container-highest text-on-surface font-label-sm text-label-sm px-2 py-0.5 rounded"}>
                    E-10 87
                  </span>
                  <span className={"font-price-display text-price-display text-on-surface"}>
                    J$ 204.85
                  </span>
                </div>
                <div className={"flex items-center gap-1 text-on-surface-variant font-body-sm text-body-sm"}>
                  <span className={"material-symbols-outlined text-[14px]"}>
                    schedule
                  </span>
                  <span>
                    Cached 20m ago
                  </span>
                </div>
              </div>
              <div className={"flex items-center justify-between pt-0.5"}>
                <span className={"font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider"}>
                  Queue: Light • Diesel J$ 212.00
                </span>
                <button onClick={onPlugClick} aria-label={"Route to Rubis Waterloo"} className={"flex items-center gap-1 font-label-md text-label-md text-secondary"} data-act={"offline-route"}>
                  <span className={"material-symbols-outlined text-[16px]"}>
                    near_me
                  </span>
                  <span>
                    Offline Route
                  </span>
                </button>
              </div>
            </div>
            <div className={"bg-surface-container-lowest rounded-xl p-space-md shadow-sm flex flex-col gap-space-sm"}>
              <div className={"flex items-start justify-between"}>
                <div className={"flex items-center gap-space-sm"}>
                  <div className={"w-10 h-10 rounded-xl bg-surface-container flex items-center justify-center flex-shrink-0"}>
                    <span className={"material-symbols-outlined text-primary text-[24px]"}>
                      local_gas_station
                    </span>
                  </div>
                  <div>
                    <div className={"flex items-center gap-1"}>
                      <h3 className={"font-headline-sm text-headline-sm text-on-surface leading-tight"}>
                        TotalEnergies HWT
                      </h3>
                      <span className={"material-symbols-outlined text-secondary text-[16px]"} title={"Saved on Device"}>
                        offline_pin
                      </span>
                    </div>
                    <p className={"font-body-sm text-body-sm text-on-surface-variant"}>
                      Half-Way-Tree Clock Tower • Kingston
                    </p>
                  </div>
                </div>
                <span className={"font-label-md text-label-md text-primary bg-primary-fixed px-2.5 py-0.5 rounded-full flex-shrink-0"}>
                  2.1 km
                </span>
              </div>
              <div className={"flex items-center justify-between bg-surface-container-low rounded-lg p-space-sm"}>
                <div className={"flex items-center gap-2"}>
                  <span className={"bg-surface-container-highest text-on-surface font-label-sm text-label-sm px-2 py-0.5 rounded"}>
                    E-10 87
                  </span>
                  <span className={"font-price-display text-price-display text-on-surface"}>
                    J$ 205.10
                  </span>
                </div>
                <div className={"flex items-center gap-1 text-on-surface-variant font-body-sm text-body-sm"}>
                  <span className={"material-symbols-outlined text-[14px]"}>
                    schedule
                  </span>
                  <span>
                    Cached 20m ago
                  </span>
                </div>
              </div>
              <div className={"flex items-center justify-between pt-0.5"}>
                <span className={"font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider"}>
                  E-10 90: J$ 218.40 • Verified
                </span>
                <button onClick={onPlugClick} aria-label={"Route to Total Half-Way-Tree"} className={"flex items-center gap-1 font-label-md text-label-md text-secondary"} data-act={"offline-route-2"}>
                  <span className={"material-symbols-outlined text-[16px]"}>
                    near_me
                  </span>
                  <span>
                    Offline Route
                  </span>
                </button>
              </div>
            </div>
            <div className={"bg-surface-container-lowest rounded-xl p-space-md shadow-sm flex flex-col gap-space-sm"}>
              <div className={"flex items-start justify-between"}>
                <div className={"flex items-center gap-space-sm"}>
                  <div className={"w-10 h-10 rounded-xl bg-surface-container flex items-center justify-center flex-shrink-0"}>
                    <span className={"material-symbols-outlined text-primary text-[24px]"}>
                      local_gas_station
                    </span>
                  </div>
                  <div>
                    <div className={"flex items-center gap-1"}>
                      <h3 className={"font-headline-sm text-headline-sm text-on-surface leading-tight"}>
                        Texaco Dunrobin Ave
                      </h3>
                      <span className={"material-symbols-outlined text-secondary text-[16px]"} title={"Saved on Device"}>
                        offline_pin
                      </span>
                    </div>
                    <p className={"font-body-sm text-body-sm text-on-surface-variant"}>
                      Dunrobin Avenue • St. Andrew
                    </p>
                  </div>
                </div>
                <span className={"font-label-md text-label-md text-primary bg-primary-fixed px-2.5 py-0.5 rounded-full flex-shrink-0"}>
                  2.8 km
                </span>
              </div>
              <div className={"flex items-center justify-between bg-surface-container-low rounded-lg p-space-sm"}>
                <div className={"flex items-center gap-2"}>
                  <span className={"bg-surface-container-highest text-on-surface font-label-sm text-label-sm px-2 py-0.5 rounded"}>
                    E-10 87
                  </span>
                  <span className={"font-price-display text-price-display text-on-surface"}>
                    J$ 206.20
                  </span>
                </div>
                <div className={"flex items-center gap-1 text-on-surface-variant font-body-sm text-body-sm"}>
                  <span className={"material-symbols-outlined text-[14px]"}>
                    schedule
                  </span>
                  <span>
                    Cached 20m ago
                  </span>
                </div>
              </div>
              <div className={"flex items-center justify-between pt-0.5"}>
                <span className={"font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider"}>
                  {"Air Pump • Cash & Card (Offline)"}
                </span>
                <button onClick={onPlugClick} aria-label={"Route to Texaco Dunrobin"} className={"flex items-center gap-1 font-label-md text-label-md text-secondary"} data-act={"offline-route-3"}>
                  <span className={"material-symbols-outlined text-[16px]"}>
                    near_me
                  </span>
                  <span>
                    Offline Route
                  </span>
                </button>
              </div>
            </div>
          </div>
          <div className={"px-space-md pt-space-xs pb-space-lg"}>
            <div className={"bg-surface-container-high rounded-xl p-space-md flex flex-col gap-space-sm"}>
              <div className={"flex items-start gap-space-xs"}>
                <span className={"material-symbols-outlined text-error text-[18px] mt-0.5 flex-shrink-0"}>
                  sync_problem
                </span>
                <div className={"flex-1"}>
                  <p className={"font-body-sm text-body-sm text-on-surface font-medium leading-tight"}>
                    Last sync attempt failed 2m ago • Auto-retrying when cellular or Wi-Fi signal recovers
                  </p>
                  <p className={"font-label-sm text-label-sm text-on-surface-variant mt-0.5"}>
                    Digicel / Flow cellular towers unreachable in current pocket.
                  </p>
                </div>
              </div>
              <div className={"flex items-center gap-space-sm pt-1"}>
                <button onClick={onPlugClick} className={"flex-1 bg-surface-container-lowest text-on-surface rounded-lg py-2.5 px-space-md font-label-lg text-label-lg shadow-sm flex items-center justify-center gap-2 active:scale-98 transition-transform min-h-[44px]"} id={"force-sync-btn"} data-act={"force-sync-btn"}>
                  <span className={"material-symbols-outlined text-primary text-[18px]"} id={"force-sync-icon"}>
                    sync
                  </span>
                  <span id={"force-sync-label"}>
                    Force Sync Now
                  </span>
                </button>
                <button onClick={onPlugClick} aria-label={"Offline Diagnostics"} className={"w-11 h-11 rounded-lg bg-surface-container-lowest text-on-surface-variant flex items-center justify-center shadow-sm flex-shrink-0 active:scale-95 transition-transform"} data-act={"tune"}>
                  <span className={"material-symbols-outlined text-[20px]"}>
                    tune
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
