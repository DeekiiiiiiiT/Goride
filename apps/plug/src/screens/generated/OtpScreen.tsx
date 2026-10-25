import { useEffect, useRef } from 'react';
import { onPlugClick } from '../../shell/actions';
import { bindScreen } from '../../shell/bind';


export function OtpScreen() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (ref.current) bindScreen("05-otp.html", ref.current); }, []);
  return (
    <div ref={ref} data-plug-screen={"05-otp.html"} className={"bg-surface text-on-surface antialiased flex flex-col min-h-screen"}>
      <main className={"flex-1 flex flex-col relative w-full pt-safe pb-safe bg-surface px-margin"}>
        <div className={"flex flex-col w-full pb-6 space-y-5"}>
          <div className={"flex items-center justify-between pt-2"}>
            <button onClick={onPlugClick} aria-label={"Go back"} className={"w-12 h-12 flex items-center justify-center rounded-full bg-surface-container-low text-on-surface active:bg-surface-container transition-colors"} type={"button"} data-act={"arrow-back"} data-way-out={"back"}>
              <span className={"material-symbols-outlined text-[22px]"}>
                arrow_back
              </span>
            </button>
            <div className={"flex flex-col items-center"}>
              <span className={"font-label-sm text-label-sm uppercase tracking-wider text-secondary font-bold"}>
                Step 2 of 3
              </span>
              <div className={"flex items-center gap-1.5 mt-1"}>
                <span className={"w-6 h-1 rounded-full bg-primary-container"} />
                <span className={"w-6 h-1 rounded-full bg-primary"} />
                <span className={"w-6 h-1 rounded-full bg-surface-container-highest"} />
              </div>
            </div>
            <button onClick={onPlugClick} className={"h-10 px-3.5 flex items-center justify-center rounded-full bg-surface-container-low text-secondary font-label-md text-label-md hover:bg-surface-container transition-colors"} type={"button"} data-act={"help"}>
              Help
            </button>
          </div>
          <div className={"flex flex-col items-center text-center px-1"}>
            <div className={"w-16 h-16 rounded-full bg-secondary-fixed flex items-center justify-center text-primary mb-3 shadow-sm"}>
              <span className={"material-symbols-outlined text-[32px]"} style={{ fontVariationSettings: "'FILL' 1" }}>
                phonelink_lock
              </span>
            </div>
            <h1 className={"font-headline-lg text-headline-lg text-on-surface tracking-tight"}>
              Verify your phone
            </h1>
            <p className={"font-body-md text-body-md text-on-surface-variant mt-1.5"}>
              We sent a 6-digit verification code via SMS to
            </p>
            <div className={"inline-flex items-center gap-2 mt-2 px-3.5 py-1.5 rounded-full bg-surface-container-high"}>
              <span className={"material-symbols-outlined text-primary text-[18px]"}>
                verified
              </span>
              <span className={"font-label-lg text-label-lg font-bold text-on-surface tracking-wide"}>
                +1 (876) 842-9104
              </span>
              <button onClick={onPlugClick} aria-label={"Edit phone number"} className={"flex items-center text-secondary hover:text-primary active:scale-95 transition-transform ml-0.5"} type={"button"} data-act={"edit"}>
                <span className={"material-symbols-outlined text-[16px]"}>
                  edit
                </span>
              </button>
            </div>
          </div>
          <div className={"w-full flex justify-between gap-2 pt-2"}>
            <div className={"flex-1 max-w-[52px] h-14 rounded-xl bg-surface-container-lowest shadow-sm flex flex-col items-center justify-center text-on-surface font-price-display text-price-display font-extrabold select-none"}>
              8
            </div>
            <div className={"flex-1 max-w-[52px] h-14 rounded-xl bg-surface-container-lowest shadow-sm flex flex-col items-center justify-center text-on-surface font-price-display text-price-display font-extrabold select-none"}>
              3
            </div>
            <div className={"flex-1 max-w-[52px] h-14 rounded-xl bg-surface-container-lowest shadow-sm flex flex-col items-center justify-center text-on-surface font-price-display text-price-display font-extrabold select-none"}>
              0
            </div>
            <div className={"flex-1 max-w-[52px] h-14 rounded-xl bg-surface-container-lowest shadow-sm flex flex-col items-center justify-center text-on-surface font-price-display text-price-display font-extrabold select-none"}>
              9
            </div>
            <div className={"flex-1 max-w-[52px] h-14 rounded-xl bg-surface-container-lowest shadow-md flex items-center justify-center relative overflow-hidden bg-gradient-to-b from-surface-container-lowest to-surface-container-low"} style={{ outline: "2px solid #a33900", outlineOffset: "-1px" }}>
              <span className={"w-0.5 h-6 bg-primary animate-pulse rounded-full"} />
            </div>
            <div className={"flex-1 max-w-[52px] h-14 rounded-xl bg-surface-container-low flex items-center justify-center text-surface-container-highest"}>
              <span className={"w-2.5 h-2.5 rounded-full bg-outline-variant/60"} />
            </div>
          </div>
          <div className={"rounded-xl bg-surface-container-low p-4 flex flex-col gap-3 shadow-sm"}>
            <div className={"flex items-center justify-between"}>
              <div className={"flex items-center gap-2"}>
                <span className={"material-symbols-outlined text-secondary text-[20px]"}>
                  timer
                </span>
                <span className={"font-body-md text-body-md text-on-surface-variant"}>
                  Didn't receive code?
                </span>
              </div>
              <div className={"flex items-center gap-1.5 font-label-md text-label-md font-bold text-secondary bg-surface-container px-2.5 py-1 rounded-full"}>
                <span className={"inline-block w-2 h-2 rounded-full bg-secondary animate-ping"} />
                <span id={"countdown-timer"}>
                  0:42
                </span>
              </div>
            </div>
            <div className={"flex items-center gap-2 pt-1"}>
              <button onClick={onPlugClick} className={"flex-1 min-h-[44px] rounded-lg bg-surface-container-high text-on-surface-variant/50 font-label-md text-label-md flex items-center justify-center gap-1.5 cursor-not-allowed"} disabled={true} title={"Wait for the timer, then the code can be sent again"} type={"button"} data-act={"resend-sms"}>
                <span className={"material-symbols-outlined text-[16px]"}>
                  sms
                </span>
                Resend SMS
              </button>
              <button onClick={onPlugClick} className={"flex-1 min-h-[44px] rounded-lg bg-surface-container text-secondary font-label-md text-label-md flex items-center justify-center gap-1.5 active:bg-surface-container-high transition-colors"} type={"button"} data-act={"call-me"}>
                <span className={"material-symbols-outlined text-[16px]"}>
                  phone_in_talk
                </span>
                Call Me
              </button>
            </div>
          </div>
          <div className={"pt-1"}>
            <button onClick={onPlugClick} className={"w-full min-h-[52px] rounded-xl bg-primary text-on-primary font-headline-sm text-headline-sm flex items-center justify-center gap-2 shadow-md active:bg-primary-container transition-colors group"} type={"button"} data-act={"verify-continue"} data-way-out={"primary"}>
              <span>
                {"Verify & Continue"}
              </span>
              <span className={"material-symbols-outlined text-[20px] transition-transform group-active:translate-x-1"}>
                arrow_forward
              </span>
            </button>
          </div>
          <div className={"rounded-xl bg-surface-container-lowest p-3.5 flex items-center gap-3 shadow-sm mt-1"}>
            <div className={"w-10 h-10 rounded-full bg-secondary-fixed flex items-center justify-center text-primary shrink-0"}>
              <span className={"material-symbols-outlined text-[22px]"}>
                lock_clock
              </span>
            </div>
            <div className={"flex flex-col min-w-0"}>
              <span className={"font-label-md text-label-md font-bold text-on-surface truncate"}>
                Instant Island Verification
              </span>
              <span className={"font-body-sm text-body-sm text-on-surface-variant truncate"}>
                {"Direct Jamaican Digicel & Flow SMS gateways"}
              </span>
            </div>
          </div>
          <div className={"w-full bg-surface-container-low rounded-xl p-3 shadow-sm"}>
            <div className={"grid grid-cols-3 gap-2"}>
              <button onClick={onPlugClick} className={"h-12 rounded-lg bg-surface-container-lowest shadow-sm flex flex-col items-center justify-center active:bg-surface-container-high transition-colors"} type={"button"} data-act={"1-jam"}>
                <span className={"font-headline-sm text-headline-sm font-bold text-on-surface leading-none"}>
                  1
                </span>
                <span className={"font-label-sm text-[12px] text-on-surface-variant tracking-widest leading-none mt-0.5"}>
                  JAM
                </span>
              </button>
              <button onClick={onPlugClick} className={"h-12 rounded-lg bg-surface-container-lowest shadow-sm flex flex-col items-center justify-center active:bg-surface-container-high transition-colors"} type={"button"} data-act={"2-abc"}>
                <span className={"font-headline-sm text-headline-sm font-bold text-on-surface leading-none"}>
                  2
                </span>
                <span className={"font-label-sm text-[12px] text-on-surface-variant tracking-widest leading-none mt-0.5"}>
                  ABC
                </span>
              </button>
              <button onClick={onPlugClick} className={"h-12 rounded-lg bg-surface-container-lowest shadow-sm flex flex-col items-center justify-center active:bg-surface-container-high transition-colors"} type={"button"} data-act={"3-def"}>
                <span className={"font-headline-sm text-headline-sm font-bold text-on-surface leading-none"}>
                  3
                </span>
                <span className={"font-label-sm text-[12px] text-on-surface-variant tracking-widest leading-none mt-0.5"}>
                  DEF
                </span>
              </button>
              <button onClick={onPlugClick} className={"h-12 rounded-lg bg-surface-container-lowest shadow-sm flex flex-col items-center justify-center active:bg-surface-container-high transition-colors"} type={"button"} data-act={"4-ghi"}>
                <span className={"font-headline-sm text-headline-sm font-bold text-on-surface leading-none"}>
                  4
                </span>
                <span className={"font-label-sm text-[12px] text-on-surface-variant tracking-widest leading-none mt-0.5"}>
                  GHI
                </span>
              </button>
              <button onClick={onPlugClick} className={"h-12 rounded-lg bg-surface-container-lowest shadow-sm flex flex-col items-center justify-center active:bg-surface-container-high transition-colors"} type={"button"} data-act={"5-jkl"}>
                <span className={"font-headline-sm text-headline-sm font-bold text-on-surface leading-none"}>
                  5
                </span>
                <span className={"font-label-sm text-[12px] text-on-surface-variant tracking-widest leading-none mt-0.5"}>
                  JKL
                </span>
              </button>
              <button onClick={onPlugClick} className={"h-12 rounded-lg bg-surface-container-lowest shadow-sm flex flex-col items-center justify-center active:bg-surface-container-high transition-colors"} type={"button"} data-act={"6-mno"}>
                <span className={"font-headline-sm text-headline-sm font-bold text-on-surface leading-none"}>
                  6
                </span>
                <span className={"font-label-sm text-[12px] text-on-surface-variant tracking-widest leading-none mt-0.5"}>
                  MNO
                </span>
              </button>
              <button onClick={onPlugClick} className={"h-12 rounded-lg bg-surface-container-lowest shadow-sm flex flex-col items-center justify-center active:bg-surface-container-high transition-colors"} type={"button"} data-act={"7-pqrs"}>
                <span className={"font-headline-sm text-headline-sm font-bold text-on-surface leading-none"}>
                  7
                </span>
                <span className={"font-label-sm text-[12px] text-on-surface-variant tracking-widest leading-none mt-0.5"}>
                  PQRS
                </span>
              </button>
              <button onClick={onPlugClick} className={"h-12 rounded-lg bg-surface-container-lowest shadow-sm flex flex-col items-center justify-center active:bg-surface-container-high transition-colors"} type={"button"} data-act={"8-tuv"}>
                <span className={"font-headline-sm text-headline-sm font-bold text-on-surface leading-none"}>
                  8
                </span>
                <span className={"font-label-sm text-[12px] text-on-surface-variant tracking-widest leading-none mt-0.5"}>
                  TUV
                </span>
              </button>
              <button onClick={onPlugClick} className={"h-12 rounded-lg bg-surface-container-lowest shadow-sm flex flex-col items-center justify-center active:bg-surface-container-high transition-colors"} type={"button"} data-act={"9-wxyz"}>
                <span className={"font-headline-sm text-headline-sm font-bold text-on-surface leading-none"}>
                  9
                </span>
                <span className={"font-label-sm text-[12px] text-on-surface-variant tracking-widest leading-none mt-0.5"}>
                  WXYZ
                </span>
              </button>
              <div className={"h-12 flex items-center justify-center text-on-surface-variant"}>
                <span className={"material-symbols-outlined text-[18px]"}>
                  verified_user
                </span>
              </div>
              <button onClick={onPlugClick} className={"h-12 rounded-lg bg-surface-container-lowest shadow-sm flex flex-col items-center justify-center active:bg-surface-container-high transition-colors"} type={"button"} data-act={"0"}>
                <span className={"font-headline-sm text-headline-sm font-bold text-on-surface leading-none"}>
                  0
                </span>
                <span className={"font-label-sm text-[12px] text-on-surface-variant tracking-widest leading-none mt-0.5"}>
                  +
                </span>
              </button>
              <button onClick={onPlugClick} aria-label={"Delete"} className={"h-12 rounded-lg bg-surface-container-high shadow-sm flex items-center justify-center text-on-surface active:bg-surface-container-highest transition-colors"} type={"button"} data-act={"backspace"}>
                <span className={"material-symbols-outlined text-[20px]"}>
                  backspace
                </span>
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
