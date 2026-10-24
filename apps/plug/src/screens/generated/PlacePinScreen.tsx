import { useEffect, useRef } from 'react';
import { onPlugClick } from '../../shell/actions';
import { bindScreen } from '../../shell/bind';
import { PinMap } from '../../live/maps';

export function PlacePinScreen() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (ref.current) bindScreen("43-place-pin.html", ref.current); }, []);
  return (
    <div ref={ref} data-plug-screen={"43-place-pin.html"} className={"bg-surface font-body-md text-on-surface h-screen w-screen flex flex-col overflow-hidden select-none"}>
      <main className={"relative flex-1 w-full h-full flex flex-col overflow-hidden bg-surface"}>
        <div className={"relative w-full flex-1 h-full bg-[#ebe7df] overflow-hidden"}>
          <PinMap />
          <div className={"absolute top-[175px] left-[32px] z-10 flex items-center gap-1.5 bg-surface/90 backdrop-blur-sm border border-outline-variant/60 px-2.5 py-1 rounded-full shadow-sm pointer-events-none"}>
            <span className={"material-symbols-outlined text-outline text-[14px]"}>
              build
            </span>
            <div className={"flex flex-col"}>
              <span className={"text-[11px] font-semibold text-on-surface leading-tight"}>
                Mario's Auto Parts
              </span>
              <span className={"text-[9px] text-outline leading-none"}>
                180m away
              </span>
            </div>
          </div>
          <div className={"absolute top-[320px] right-[24px] z-10 flex items-center gap-1.5 bg-surface/90 backdrop-blur-sm border border-outline-variant/60 px-2.5 py-1 rounded-full shadow-sm pointer-events-none"}>
            <span className={"material-symbols-outlined text-outline text-[14px]"}>
              fastfood
            </span>
            <div className={"flex flex-col"}>
              <span className={"text-[11px] font-semibold text-on-surface leading-tight"}>
                Tastee HWT
              </span>
              <span className={"text-[9px] text-outline leading-none"}>
                120m away
              </span>
            </div>
          </div>
          <div className={"absolute top-[230px] right-[112px] z-10 flex items-center gap-1 bg-surface-container-high/95 border border-outline/20 px-2 py-0.5 rounded-full shadow-sm pointer-events-none"}>
            <span className={"w-2 h-2 rounded-full bg-amber-600"} />
            <span className={"text-[10px] font-semibold text-on-surface-variant"}>
              Total HWT (25m)
            </span>
          </div>
          <div className={"absolute inset-0 flex items-center justify-center pointer-events-none z-20 -translate-y-8"}>
            <div className={"absolute w-44 h-44 rounded-full bg-[#ea580c]/10 animate-ping opacity-60"} />
            <div className={"absolute w-28 h-28 rounded-full bg-[#ea580c]/15 animate-pulse"} />
            <div className={"absolute w-14 h-14 rounded-full border border-[#ea580c]/40 bg-[#ea580c]/20"} />
            <div className={"absolute w-12 h-[1.5px] bg-[#ea580c]/70"} />
            <div className={"absolute h-12 w-[1.5px] bg-[#ea580c]/70"} />
            <div className={"flex flex-col items-center -translate-y-8"}>
              <div className={"mb-2 bg-inverse-surface/95 text-inverse-on-surface px-3 py-1.5 rounded-full shadow-lg flex items-center gap-1.5 whitespace-nowrap animate-bounce"}>
                <span className={"material-symbols-outlined text-secondary-fixed text-[16px]"}>
                  touch_app
                </span>
                <span className={"text-[11px] font-medium tracking-tight"}>
                  Drag map to align with station entrance
                </span>
              </div>
              <div className={"relative flex items-center justify-center"}>
                <div className={"absolute -bottom-2 w-7 h-2 bg-black/30 rounded-full blur-[2px]"} />
                <div className={"w-12 h-12 rounded-full bg-[#ea580c] text-white flex items-center justify-center shadow-2xl border-2 border-white"}>
                  <span className={"material-symbols-outlined text-[24px]"} style={{ fontVariationSettings: "'FILL' 1" }}>
                    local_gas_station
                  </span>
                </div>
              </div>
              <div className={"w-3.5 h-3.5 bg-[#ea580c] rotate-45 -mt-2 rounded-xs border-r border-b border-white"} />
              <div className={"w-2.5 h-2.5 rounded-full bg-[#ea580c] ring-2 ring-white mt-1 shadow-sm"} />
            </div>
          </div>
          <button onClick={onPlugClick} aria-label={"Re-center on current location"} className={"absolute right-4 bottom-[310px] z-20 w-11 h-11 rounded-full bg-surface-container-lowest text-on-surface flex items-center justify-center shadow-lg border border-outline-variant/40 active:scale-95 transition-transform"} type={"button"} data-act={"my-location"}>
            <span className={"material-symbols-outlined text-[#ea580c] text-[22px]"}>
              my_location
            </span>
          </button>
        </div>
        <div className={"absolute top-0 inset-x-0 z-30 pt-safe px-3 flex flex-col gap-2 pointer-events-auto"}>
          <div className={"w-full bg-surface-container-lowest/95 backdrop-blur-md rounded-2xl p-2.5 flex items-center justify-between shadow-md border border-outline-variant/30"}>
            <button onClick={onPlugClick} aria-label={"Close"} className={"w-9 h-9 rounded-full bg-surface-variant/70 text-on-surface flex items-center justify-center active:bg-surface-variant transition-colors"} type={"button"} data-act={"close"} data-way-out={"back"}>
              <span className={"material-symbols-outlined text-[20px]"}>
                close
              </span>
            </button>
            <div className={"flex items-center gap-1.5"}>
              <span className={"font-headline-sm text-[16px] font-bold text-on-surface"}>
                Map It
              </span>
              <span className={"text-outline text-[12px]"}>
                •
              </span>
              <span className={"font-headline-sm text-[16px] font-bold text-[#ea580c]"}>
                Position Pin
              </span>
            </div>
            <button onClick={onPlugClick} aria-label={"Information"} className={"w-9 h-9 rounded-full bg-surface-variant/70 text-on-surface flex items-center justify-center active:bg-surface-variant transition-colors"} type={"button"} data-act={"info"}>
              <span className={"material-symbols-outlined text-[20px]"}>
                info
              </span>
            </button>
          </div>
          <div className={"w-full bg-surface-container-lowest/95 backdrop-blur-md rounded-xl px-3 py-2 flex items-center justify-between shadow-sm border border-outline-variant/30"}>
            <div className={"flex items-center gap-2"}>
              <span className={"relative flex h-2.5 w-2.5"}>
                <span className={"animate-ping absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-75"} />
                <span className={"relative inline-flex rounded-full h-2.5 w-2.5 bg-green-600"} />
              </span>
              <span className={"text-[12px] font-bold text-on-surface"}>
                GPS Accuracy ±8 m
              </span>
            </div>
            <span className={"text-[11px] text-on-surface-variant font-medium"}>
              Move outside if signal degrades
            </span>
          </div>
        </div>
        <div className={"absolute bottom-0 inset-x-0 z-30 flex flex-col gap-2.5 px-3 pb-safe pointer-events-auto"}>
          <div className={"w-full bg-surface-container-lowest rounded-2xl p-4 shadow-xl border-2 border-amber-400 flex flex-col gap-3"}>
            <div className={"flex items-start gap-2.5"}>
              <div className={"w-9 h-9 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0"}>
                <span className={"material-symbols-outlined text-[22px]"}>
                  warning
                </span>
              </div>
              <div className={"flex-1 min-w-0"}>
                <div className={"flex items-center gap-1.5"}>
                  <span className={"text-[13px] font-bold text-on-surface tracking-tight"}>
                    ⚠️ Possible Match Detected
                  </span>
                </div>
                <p className={"text-[12px] text-on-surface-variant mt-0.5 leading-snug"}>
                  Is this
                  <strong className={"text-on-surface font-semibold"}>
                    Total Half-Way-Tree
                  </strong>
                  ? It's already on the map 25m away.
                </p>
              </div>
            </div>
            <div className={"grid grid-cols-2 gap-2 pt-0.5"}>
              <button onClick={onPlugClick} className={"w-full min-h-[42px] px-2.5 rounded-xl border border-outline/40 bg-surface-container-low text-on-surface text-[12px] font-semibold flex items-center justify-center gap-1 active:bg-surface-variant transition-colors"} type={"button"} data-act={"yes-that-s-it-update-info"}>
                <span className={"material-symbols-outlined text-[16px]"}>
                  edit_location
                </span>
                <span className={"truncate"}>
                  Yes, that's it (Update info)
                </span>
              </button>
              <button onClick={onPlugClick} className={"w-full min-h-[42px] px-2.5 rounded-xl bg-secondary-fixed text-on-secondary-fixed text-[12px] font-bold flex items-center justify-center gap-1 shadow-sm active:opacity-90 transition-opacity"} type={"button"} data-act={"no-it-s-a-different-place"}>
                <span className={"material-symbols-outlined text-[16px]"}>
                  add_location
                </span>
                <span className={"truncate"}>
                  No, it's a different place
                </span>
              </button>
            </div>
          </div>
          <div className={"w-full bg-surface-container-lowest rounded-2xl p-3.5 shadow-xl border border-outline-variant/30 flex flex-col gap-2.5"}>
            <div className={"flex items-center gap-2.5 bg-surface-container-low px-3 py-2 rounded-xl"}>
              <span className={"material-symbols-outlined text-[#ea580c] text-[20px] shrink-0"}>
                pin_drop
              </span>
              <div className={"flex-1 min-w-0"}>
                <p className={"text-[12px] font-semibold text-on-surface truncate"}>
                  {"Constant Spring Rd & Eastwood Park Rd, St. Andrew (Kingston 10)"}
                </p>
              </div>
              <span className={"material-symbols-outlined text-green-700 text-[18px] shrink-0"}>
                check_circle
              </span>
            </div>
            <button onClick={onPlugClick} className={"w-full min-h-[48px] py-3.5 rounded-xl bg-[#ea580c] hover:bg-[#c2410c] text-white font-bold text-[15px] tracking-wide flex items-center justify-center gap-2 shadow-md active:scale-[0.99] transition-transform"} type={"button"} data-act={"confirm-pin-location"}>
              <span className={"material-symbols-outlined text-[20px]"}>
                where_to_vote
              </span>
              <span>
                Confirm Pin Location
              </span>
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
