import { useEffect, useRef } from 'react';
import { onPlugClick } from '../../shell/actions';
import { bindScreen } from '../../shell/bind';


export function EmptyGarageScreen() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (ref.current) bindScreen("29b-empty-garage.html", ref.current); }, []);
  return (
    <div ref={ref} data-plug-screen={"29b-empty-garage.html"} className={"min-h-screen bg-[#fff8f2] flex flex-col justify-between max-w-md mx-auto shadow-2xl relative select-none"}>
      <header className={"px-5 pt-4 pb-3 flex items-center justify-between border-b border-[#f0e6dc] bg-[#fff8f2]/90 backdrop-blur-md sticky top-0 z-20"}>
        <div>
          <h1 className={"text-2xl font-extrabold tracking-tight text-neutral-900"}>
            My Garage
          </h1>
          <p className={"text-xs font-semibold text-neutral-500 mt-0.5 flex items-center gap-1.5"}>
            <span className={"inline-block w-2 h-2 rounded-full bg-neutral-300"} />
            0 vehicles registered
          </p>
        </div>
        <div className={"flex items-center gap-2"}>
          <button onClick={onPlugClick} className={"w-10 h-10 rounded-full flex items-center justify-center text-neutral-700 hover:bg-neutral-200/50 active:scale-95 transition-all"} data-act={"notifications"}>
            <span className={"material-symbols-outlined text-[22px]"}>
              notifications
            </span>
          </button>
          <button onClick={onPlugClick} className={"w-10 h-10 rounded-full flex items-center justify-center text-neutral-700 hover:bg-neutral-200/50 active:scale-95 transition-all"} data-act={"settings"}>
            <span className={"material-symbols-outlined text-[22px]"}>
              settings
            </span>
          </button>
          <button onClick={onPlugClick} className={"w-9 h-9 rounded-full bg-[#ea580c] text-white flex items-center justify-center text-sm font-bold shadow-sm active:scale-95 transition-all ml-1"} data-act={"person"}>
            <span className={"material-symbols-outlined text-[20px]"}>
              person
            </span>
          </button>
        </div>
      </header>
      <main className={"flex-1 flex flex-col items-center justify-center px-6 py-8 text-center"}>
        <div className={"w-64 h-52 mb-6 flex items-center justify-center relative"}>
          <img src={"https://lh3.googleusercontent.com/aida/AEtjO1W4LXCNEYzrab8pTLfas5Gq3H_WXx0APsj4K4IDFTyK7gY2v5uQEFnfyfUbf0eNBRyO_nzX288ak3Xo1ptR-dkw5jrW3v3Kpnh3IgNpQjyBcFtvbCAGqBnmKzfJWuKyRRu0pUw3PHlBrW4HPN12WWzf9eTbiweFNyqHPVqtBrS_If-npaS1VPu6njPAWyda_dJDt1LWK4ECUW9uCwv6FpEtz1bE-MdtGW2NeSwp2R1uw7fcdr7EYt-nkDE"} alt={"Empty garage illustration"} className={"w-full h-full object-contain drop-shadow-sm"} />
        </div>
        <h2 className={"text-2xl font-extrabold text-neutral-900 tracking-tight mb-2.5"}>
          No vehicles yet
        </h2>
        <p className={"text-neutral-600 text-sm font-medium leading-relaxed max-w-[310px] mb-8"}>
          Add the car you drive so fuel logs and service reminders stay with it.
        </p>
        <button onClick={onPlugClick} className={"w-full max-w-[320px] bg-[#ea580c] hover:bg-[#c2410c] text-white font-bold py-3.5 px-6 rounded-2xl shadow-lg shadow-orange-500/25 active:scale-[0.98] transition-all flex items-center justify-center gap-2.5 group"} data-act={"add-a-vehicle"}>
          <span className={"material-symbols-outlined text-[22px] group-hover:scale-110 transition-transform"}>
            add_circle
          </span>
          <span className={"text-base tracking-wide"}>
            Add a vehicle
          </span>
        </button>
        <div className={"mt-8 pt-6 border-t border-[#f0e6dc]/80 w-full max-w-[320px] flex items-center justify-center gap-2 text-xs font-semibold text-neutral-500"}>
          <span className={"material-symbols-outlined text-[18px] text-[#ea580c]"}>
            verified_user
          </span>
          <span>
            {"Supports JDM imports, taxis & local models"}
          </span>
        </div>
      </main>
    </div>
  );
}
