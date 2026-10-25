import { useEffect, useRef } from 'react';
import { OdometerScanner, type ScanResult } from '../../../../../packages/ui/src/odometer-scanner';
import { onPlugClick } from '../../shell/actions';
import { bindScreen } from '../../shell/bind';
import { scanPlugPhoto } from '../../shell/scan';
import { lastOdometer } from '../../shell/facts';
import { getPlugRuntime } from '../../shell/click';


export function OdometerScanScreen() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (ref.current) bindScreen("24-odometer-scan.html", ref.current); }, []);
  return (
    <>
    <OdometerScanner
      embedded
      isFleetDriver={false}
      lastOdometer={lastOdometer()}
      scanPhoto={scanPlugPhoto}
      onCancel={() => { getPlugRuntime().go(sessionStorage.getItem('plug-fuel-from') || '/explore'); }}
      onScanComplete={(result: ScanResult) => {
        sessionStorage.setItem('plug-odometer', String(result.reading));
        getPlugRuntime().go('/fuel/confirm');
      }}
    />
    <div ref={ref} data-plug-screen={"24-odometer-scan.html"} className={"bg-surface font-body-md text-on-surface flex flex-col min-h-screen pt-safe pb-safe"}>
      <main className={"flex-1 flex flex-col relative w-full bg-surface"}>
        <div className={"flex flex-col w-full relative select-none"}>
          <div className={"relative w-full overflow-hidden rounded-xl bg-inverse-surface min-h-[640px] flex flex-col justify-between p-margin shadow-xl"}>
            <div className={"absolute inset-0 bg-surface-container flex items-center justify-center text-primary filter blur-[1.5px] scale-105 opacity-80"} aria-hidden={"true"}><span className={"material-symbols-outlined text-[32px]"}>image</span></div>
            <div className={"absolute inset-0 bg-gradient-to-b from-inverse-surface/90 via-transparent to-inverse-surface/95 pointer-events-none"} />
            <div className={"absolute inset-0 bg-radial from-transparent via-inverse-surface/20 to-inverse-surface/80 pointer-events-none"} />
            <div className={"relative z-20 flex flex-col items-center w-full space-y-space-sm pt-space-xs"}>
              <div className={"w-full flex items-center justify-between"}>
                <button onClick={onPlugClick} aria-label={"Cancel scan"} className={"w-12 h-12 rounded-full bg-inverse-surface/60 backdrop-blur-md flex items-center justify-center text-inverse-on-surface active:scale-95 transition-transform duration-150"} type={"button"} data-act={"close"} data-way-out={"back"}>
                  <span className={"material-symbols-outlined text-headline-sm"}>
                    close
                  </span>
                </button>
                <div className={"flex flex-col items-center"}>
                  <button onClick={onPlugClick} className={"flex items-center space-x-1.5 px-space-md py-1.5 rounded-full bg-inverse-surface/80 backdrop-blur-md shadow-md text-inverse-on-surface active:scale-95 transition-transform duration-150"} id={"vehicle-dropdown-btn"} type={"button"} data-act={"vehicle-dropdown-btn"}>
                    <span className={"material-symbols-outlined text-secondary-container"} style={{ fontVariationSettings: "'FILL' 1" }}>
                      directions_car
                    </span>
                    <span className={"font-label-lg text-label-lg tracking-tight"} data-slot={"car"}>
                      Add a car</span>
                    <span className={"material-symbols-outlined text-label-md text-surface-variant"}>
                      expand_more
                    </span>
                  </button>
                  <div className={"mt-1 px-2.5 py-0.5 rounded-full bg-inverse-surface/90 backdrop-blur-sm"}>
                    <span className={"font-label-sm text-label-sm text-surface-variant uppercase tracking-wider"}>
                      Last:
                      <strong className={"text-inverse-on-surface"} data-slot={"last-reading"}>
                        No reading yet
                      </strong>
                    </span>
                  </div>
                  <div className={"hidden mt-1 px-2.5 py-0.5 rounded-full bg-inverse-surface/90 backdrop-blur-sm"} data-slot-row={"gps"} style={{ display: "none" }}>
                    <span className={"font-label-sm text-label-sm text-surface-variant"} data-slot={"gps"} />
                  </div>
                </div>
                <button onClick={onPlugClick} aria-label={"Toggle dash torch"} className={"w-12 h-12 rounded-full bg-inverse-surface/60 backdrop-blur-md flex items-center justify-center text-inverse-on-surface active:scale-95 transition-transform duration-150"} id={"torch-toggle"} type={"button"} data-act={"torch-toggle"}>
                  <span className={"material-symbols-outlined text-headline-sm"} id={"torch-icon"}>
                    flash_on
                  </span>
                </button>
              </div>
            </div>
            <div className={"relative z-20 w-full flex flex-col items-center justify-center my-auto px-space-xs"}>
              <div className={"mb-3 px-space-md py-1.5 rounded-full bg-inverse-surface/80 backdrop-blur-md flex items-center space-x-1.5 shadow-sm"}>
                <span className={"material-symbols-outlined text-secondary-container text-body-md"} style={{ fontVariationSettings: "'FILL' 1" }}>
                  crop_free
                </span>
                <span className={"font-label-md text-label-md text-inverse-on-surface"}>
                  Line up odometer digits in box
                </span>
              </div>
              <div className={"relative w-full max-w-[320px] h-32 rounded-xl bg-inverse-surface/20 backdrop-blur-[1px] flex items-center justify-center overflow-hidden"}>
                <div className={"absolute top-0 left-0 w-6 h-6 rounded-tl-lg border-t-[3px] border-l-[3px] border-secondary-container shadow-[0_0_12px_rgba(253,118,26,0.6)]"} />
                <div className={"absolute top-0 right-0 w-6 h-6 rounded-tr-lg border-t-[3px] border-r-[3px] border-secondary-container shadow-[0_0_12px_rgba(253,118,26,0.6)]"} />
                <div className={"absolute bottom-0 left-0 w-6 h-6 rounded-bl-lg border-b-[3px] border-l-[3px] border-secondary-container shadow-[0_0_12px_rgba(253,118,26,0.6)]"} />
                <div className={"absolute bottom-0 right-0 w-6 h-6 rounded-br-lg border-b-[3px] border-r-[3px] border-secondary-container shadow-[0_0_12px_rgba(253,118,26,0.6)]"} />
                <div className={"absolute inset-x-0 h-0.5 bg-gradient-to-r from-transparent via-secondary-container to-transparent opacity-75 shadow-[0_0_8px_rgba(253,118,26,0.8)] animate-pulse"} />
                <div className={"flex items-center space-x-2 px-space-md py-1 rounded bg-inverse-surface/70 backdrop-blur-sm"}>
                  <span className={"font-label-sm text-label-sm text-secondary-fixed tracking-widest uppercase"}>
                    Auto-Detect
                  </span>
                  <span className={"w-1.5 h-1.5 rounded-full bg-secondary-container animate-ping"} />
                </div>
              </div>
              <div className={"mt-3 flex items-center space-x-1.5"}>
                <span className={"material-symbols-outlined text-label-sm text-secondary-fixed"}>
                  wb_sunny
                </span>
                <span className={"font-label-sm text-label-sm text-inverse-on-surface/90 font-medium"}>
                  HDR High-Glance Engine Active
                </span>
              </div>
            </div>
            <div className={"relative z-20 w-full flex flex-col items-center space-y-space-md pb-space-xs"}>
              <div className={"w-full flex items-center justify-around max-w-[280px]"}>
                <button onClick={onPlugClick} aria-label={"Upload from gallery"} className={"w-12 h-12 rounded-full bg-inverse-surface/70 backdrop-blur-md flex items-center justify-center text-inverse-on-surface active:scale-90 transition-transform"} type={"button"} data-act={"photo-library"}>
                  <span className={"material-symbols-outlined text-headline-sm"}>
                    photo_library
                  </span>
                </button>
                <button onClick={onPlugClick} aria-label={"Capture Odometer Reading"} className={"relative w-20 h-20 rounded-full p-1 bg-gradient-to-tr from-primary to-secondary-container shadow-[0_8px_20px_-4px_rgba(234,88,12,0.4)] flex items-center justify-center active:scale-95 transition-transform duration-100"} id={"capture-shutter-btn"} type={"button"} data-act={"capture-shutter-btn"}>
                  <div className={"w-full h-full rounded-full bg-surface-container-lowest flex items-center justify-center"}>
                    <div className={"w-14 h-14 rounded-full bg-gradient-to-tr from-primary to-secondary-container flex items-center justify-center"}>
                      <span className={"material-symbols-outlined text-on-primary text-headline-md"}>
                        speed
                      </span>
                    </div>
                  </div>
                </button>
                <button onClick={onPlugClick} aria-label={"Torch brightness"} className={"w-12 h-12 rounded-full bg-inverse-surface/70 backdrop-blur-md flex items-center justify-center text-inverse-on-surface active:scale-90 transition-transform"} type={"button"} data-act={"highlight"}>
                  <span className={"material-symbols-outlined text-headline-sm"}>
                    highlight
                  </span>
                </button>
              </div>
              <button onClick={onPlugClick} className={"group flex items-center space-x-1 text-secondary-container active:opacity-80 py-1 px-2"} type={"button"} data-act={"type-it-instead"}>
                <span className={"font-label-lg text-label-lg underline underline-offset-4 decoration-secondary-container"}>
                  Type it instead
                </span>
                <span className={"material-symbols-outlined text-body-md group-hover:translate-x-0.5 transition-transform"}>
                  chevron_right
                </span>
              </button>
              <div className={"w-full max-w-sm px-space-md py-2 rounded-xl bg-inverse-surface/85 backdrop-blur-md flex items-center justify-center space-x-2 text-center"}>
                <span className={"material-symbols-outlined text-secondary-container text-body-md"} style={{ fontVariationSettings: "'FILL' 1" }}>
                  auto_awesome
                </span>
                <span className={"font-body-sm text-body-sm text-surface-container-high"}>
                  AI reads digits in sunlight or dark dash clusters
                </span>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
    </>
  );
}
