import type { ReactNode } from "react";
import type { Fp9ViewModel } from "../findPartsViewModels";

export type Fp9Actions = {
  onBack: () => void;
  onSwitchUnit: () => void;
  onLinkNow: () => void;
  onSearchByMmy: () => void;
  onNotifyAdmin: () => void;
  onConfirmMap: () => void;
  onPickTrim: (id: string) => void;
  onCloseLinkModal: () => void;
  onChassisInputChange: (value: string) => void;
  chassisInput: string;
  onVerifyChassis: () => void;
  verifyFeedback: string;
  children?: ReactNode;
};

export function Fp9Screen({
  actions,
  data,
  linkModalOpen = false,
}: {
  actions: Fp9Actions;
  data: Fp9ViewModel;
  linkModalOpen?: boolean;
}) {
  const trimCount = data.trims.filter((t) => t.id !== "any").length || data.trims.length;
  return (
    <div className="find-parts-screen-root">
<div className="fp-screen-root"><div className="flex flex-col w-full">

<section className="w-full px-margin-desktop py-space-xl">
<div className="max-w-[1400px] mx-auto flex flex-col gap-space-xl">

<div className="bg-surface-container-lowest rounded-xl shadow-sm p-space-md flex flex-col sm:flex-row sm:items-center justify-between gap-space-md">
<div className="flex items-center gap-space-md">
<div className="w-10 h-10 rounded-lg bg-surface-container flex items-center justify-center text-secondary shrink-0">
<span className="material-symbols-outlined text-[22px]">directions_car</span>
</div>
<div className="flex flex-wrap items-center gap-x-space-md gap-y-1">
<span className="font-headline-sm text-headline-sm text-on-surface">{data.vehicleLabel} 2016</span>
<div className="flex items-center gap-space-xs bg-surface-container px-2 py-0.5 rounded">
<span className="material-symbols-outlined text-[14px] text-secondary">pin</span>
<span className="font-label-plate text-label-plate text-on-surface">{data.plate}</span>
</div>
<span className="font-body-sm text-body-sm text-secondary">{data.hubLabel} Fleet Unit #14</span>
</div>
</div>
<div className="flex items-center gap-space-sm self-start sm:self-auto">
<div className="inline-flex items-center gap-space-xs px-space-md py-1 rounded-full bg-tertiary-container/10 text-on-tertiary-container font-label-code text-caption font-semibold">
<span className="material-symbols-outlined text-[15px]">warning</span>
<span>Missing catalog trim</span>
</div>
<button type="button" className="text-secondary hover:text-on-surface text-[12px] font-label-code px-2 py-1 rounded bg-surface-container hover:bg-surface-container-high transition-colors" onClick={actions.onSwitchUnit}>
            Switch unit
          </button>
</div>
</div>

<div className="grid grid-cols-1 lg:grid-cols-12 gap-space-xl">

<div className="lg:col-span-8 flex flex-col gap-space-xl">
<div className="bg-surface-container-lowest rounded-xl shadow-sm p-space-xl flex flex-col gap-space-lg relative overflow-hidden">

<div className="absolute top-0 left-0 right-0 h-1.5 bg-on-tertiary-container"></div>
<div className="flex items-start gap-space-lg pt-space-xs">
<div className="w-12 h-12 rounded-xl bg-tertiary-container/10 flex items-center justify-center shrink-0">
<span className="material-symbols-outlined text-on-tertiary-container text-[28px]">error</span>
</div>
<div className="flex flex-col gap-1">
<div className="flex items-center gap-2">
<span className="font-label-code text-caption font-bold tracking-wider uppercase text-on-tertiary-container">Fitment Disambiguation Required</span>
<span className="w-1.5 h-1.5 rounded-full bg-outline-variant"></span>
<span className="font-label-code text-caption text-secondary">UNMAPPED VIN/CHASSIS</span>
</div>
<h2 className="font-headline-xl text-headline-xl text-on-surface tracking-tight">We need to know exactly which {data.vehicleLabel} this is</h2>
<p className="font-body-lg text-body-lg text-on-surface-variant">Link it once and every parts search for this car is instant.</p>
</div>
</div>

<div className="grid grid-cols-1 md:grid-cols-3 gap-space-md pt-space-sm">
<div className="bg-surface-container-low rounded-lg p-space-md flex flex-col gap-space-xs">
<div className="flex items-center gap-space-xs text-on-surface">
<span className="material-symbols-outlined text-[18px] text-on-tertiary-container">bolt</span>
<span className="font-body-sm text-body-sm font-semibold">Chassis Code Specifics</span>
</div>
<p className="font-caption text-caption text-on-surface-variant">
                  {data.alternateTrimsLine !== "None yet"
                    ? `Differentiates ${data.alternateTrimsLine} platforms.`
                    : "Differentiates standard trim variants across this model year."}
                </p>
</div>
</div>

<div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-space-md pt-space-md">
<button type="button" className="px-space-xl py-space-md rounded-lg bg-primary text-on-primary font-body-md text-body-md font-semibold shadow-sm hover:opacity-95 active:scale-[0.99] transition-all flex items-center justify-center gap-space-sm" id="openLinkModalBtn" onClick={actions.onLinkNow}>
<span className="material-symbols-outlined text-[20px]">link</span>
<span>Link it now</span>
</button>
<button type="button" className="px-space-xl py-space-md rounded-lg bg-surface-container text-on-surface font-body-md text-body-md hover:bg-surface-container-high transition-colors flex items-center justify-center gap-space-sm" onClick={actions.onSearchByMmy}>
<span className="material-symbols-outlined text-[20px] text-secondary">search</span>
<span>Search by make, model and year instead</span>
</button>
</div>

<div className="mt-space-sm rounded-lg bg-surface-container p-space-md flex flex-col sm:flex-row sm:items-center justify-between gap-space-md">
<div className="flex items-start sm:items-center gap-space-sm">
<div className="w-7 h-7 rounded bg-surface-container-highest flex items-center justify-center shrink-0">
<span className="material-symbols-outlined text-[18px] text-secondary">admin_panel_settings</span>
</div>
<div className="flex flex-col">
<span className="font-body-sm text-body-sm font-semibold text-on-surface">Staff / Driver view</span>
<span className="font-caption text-caption text-on-surface-variant">No write permission on vehicle trim profiles? Notify your fleet administrator to map this unit.</span>
</div>
</div>
<button type="button" className="shrink-0 px-space-md py-space-xs rounded bg-surface-container-lowest text-on-surface font-body-sm text-body-sm shadow-sm hover:bg-surface hover:text-primary transition-all flex items-center gap-space-xs" id="notifyAdminBtn" onClick={actions.onNotifyAdmin}>
<span className="material-symbols-outlined text-[16px] text-on-tertiary-container">outgoing_mail</span>
<span id="notifyBtnText">Send notification to Fleet Admin JD</span>
</button>
</div>
</div>

<div className="bg-surface-container-lowest rounded-xl shadow-sm p-space-lg flex flex-col gap-space-md">
<div className="flex items-center justify-between">
<div className="flex items-center gap-space-sm">
<span className="material-symbols-outlined text-secondary text-[20px]">account_tree</span>
<span className="font-headline-sm text-headline-sm text-on-surface">Candidate Trim Platforms</span>
</div>
<span className="font-label-code text-caption text-secondary">{trimCount} potential matches</span>
</div>
<div className="grid grid-cols-1 md:grid-cols-3 gap-space-md">
{data.trims.map((trim) => (
<div key={trim.id} className="bg-surface-container-low hover:bg-surface-container rounded-lg p-space-md transition-colors flex flex-col justify-between gap-space-md">
<div className="flex flex-col gap-space-xs">
<div className="flex items-center justify-between">
<span className="font-label-code text-caption text-on-surface font-bold">{trim.title}</span>
<span className="px-1.5 py-0.5 rounded bg-surface-container-highest text-secondary font-label-code text-caption">{trim.fleetShareLabel}</span>
</div>
<div className="font-body-md text-body-md font-semibold text-on-surface">{trim.subtitle}</div>
<div className="font-caption text-caption text-on-surface-variant">{trim.engineLine}</div>
</div>
<div className="flex items-center justify-between pt-space-xs">
<span className="font-label-price text-label-price text-on-surface">{trim.title}</span>
<button type="button" className="font-label-code text-caption text-on-tertiary-container font-semibold hover:underline" onClick={() => { actions.onPickTrim(trim.id); actions.onLinkNow(); }}>Select →</button>
</div>
</div>
))}
</div>
</div>
</div>

<div className="lg:col-span-4 flex flex-col gap-space-lg">

<div className="bg-surface-container-lowest rounded-xl shadow-sm p-space-lg flex flex-col gap-space-md">
<div className="flex items-center justify-between">
<div className="flex items-center gap-space-xs">
<span className="material-symbols-outlined text-[20px] text-on-surface">location_searching</span>
<span className="font-headline-sm text-headline-sm text-on-surface">Chassis Plate Locator</span>
</div>
<span className="font-label-code text-caption text-secondary">JDM Spec</span>
</div>
<p className="font-body-sm text-body-sm text-on-surface-variant">
              For Japanese domestic market vehicles, inspect the stamped aluminum firewall plate or the base of the passenger side B-pillar door aperture.
            </p>

<div className="bg-surface-container-high rounded-lg p-space-md flex flex-col gap-space-sm font-label-code text-caption">
<div className="flex items-center justify-between text-secondary pb-1 border-b border-outline-variant/30">
<span className="font-bold tracking-widest text-[10px]">TOYOTA MOTOR CORPORATION</span>
<span className="text-[10px]">MADE IN JAPAN</span>
</div>
<div className="grid grid-cols-2 gap-2 pt-1">
<div>
<div className="text-[10px] text-secondary uppercase">Model</div>
<div className="text-on-surface font-bold text-label-code text-[12px]">DBE-{data.trimLabel}V-EXXCK</div>
</div>
<div>
<div className="text-[10px] text-secondary uppercase">Engine</div>
<div className="text-on-surface font-bold text-label-code text-[12px]">{data.trims[0]?.engineLine.replace(/^Engine:\s*/, "") || "None yet"}</div>
</div>
</div>
<div className="bg-surface-container-lowest p-2 rounded flex flex-col gap-0.5 mt-1">
<div className="flex items-center justify-between">
<span className="text-[10px] text-on-tertiary-container font-bold uppercase tracking-wider">Frame No. (Chassis ID)</span>
<span className="material-symbols-outlined text-on-tertiary-container text-[14px]">touch_app</span>
</div>
<div className="text-on-surface font-bold text-[14px] tracking-widest text-label-code">
                  {data.trimLabel}-0019284
                </div>
</div>
<div className="grid grid-cols-2 gap-2 text-[10px] text-secondary pt-1">
<div>COLOR/TRIM: <span className="text-on-surface font-semibold">058 / FC10</span></div>
<div>TRANS: <span className="text-on-surface font-semibold">K314 -01A</span></div>
</div>
</div>

<div className="relative w-full h-32 rounded-lg bg-surface-container overflow-hidden flex items-center justify-center">
{data.schematicPhotoUrl ? (
<img className="w-full h-full object-cover opacity-60 mix-blend-multiply" alt="" src={data.schematicPhotoUrl} />
) : (
<span className="material-symbols-outlined text-[40px] text-on-surface-variant">directions_car</span>
)}
<div className="absolute inset-0 bg-gradient-to-t from-surface-container-lowest/80 to-transparent flex items-end p-space-sm">
<div className="flex items-center gap-space-xs text-on-surface font-label-code text-caption font-semibold">
<span className="w-2 h-2 rounded-full bg-on-tertiary-container animate-pulse"></span>
<span>Primary: Engine bulkhead center-left</span>
</div>
</div>
</div>

<div className="flex flex-col gap-space-xs pt-space-xs">
<label className="font-body-sm text-body-sm font-semibold text-on-surface">Fast Stamped Code Input</label>
<div className="flex gap-space-xs">
<input className="w-full bg-surface-container-low px-space-md py-space-sm rounded font-label-code text-label-code text-on-surface focus:outline-none focus:ring-1 focus:ring-primary uppercase" id="quickChassisInput" placeholder={`e.g. ${data.trimLabel}-0019284`} type="text" value={actions.chassisInput} onChange={(e) => actions.onChassisInputChange(e.target.value)} />
<button type="button" className="px-space-md py-space-sm bg-primary text-on-primary rounded font-label-code text-caption font-bold shrink-0 hover:opacity-90" id="verifyChassisBtn" onClick={actions.onVerifyChassis}>
                  Verify
                </button>
</div>
<span className="font-caption text-caption text-secondary" id="quickInputFeedback">{actions.verifyFeedback || "Accepts standard Ministry of Transport import format."}</span>
</div>
</div>

</div>
</div>
</div>
</section>

<div className="px-margin-desktop pb-space-xl">
<button type="button" className="px-space-md py-space-sm rounded-lg text-on-surface hover:bg-surface-container font-body-sm text-body-sm font-semibold flex items-center gap-2" onClick={actions.onBack}>
<span className="material-symbols-outlined text-[18px]">arrow_back</span>
<span>Back to Fleet maintenance</span>
</button>
</div>

<div className={`fixed inset-0 z-50 bg-primary-container/40 backdrop-blur-sm flex items-center justify-center p-space-md ${linkModalOpen ? "" : "hidden"}`} id="trimModalBackdrop">
<div className="bg-surface-container-lowest rounded-xl shadow-xl w-full max-w-xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">

<div className="px-space-xl py-space-lg bg-surface-container-low flex items-center justify-between">
<div className="flex items-center gap-space-sm">
<div className="w-8 h-8 rounded bg-primary text-on-primary flex items-center justify-center">
<span className="material-symbols-outlined text-[18px]">verified_user</span>
</div>
<div className="flex flex-col">
<span className="font-headline-sm text-headline-sm text-on-surface">Classify {data.plate}</span>
<span className="font-label-code text-caption text-secondary">2016 {data.vehicleLabel} Van</span>
</div>
</div>
<button type="button" className="text-secondary hover:text-on-surface p-1 rounded hover:bg-surface-container" id="closeModalBtn" onClick={actions.onCloseLinkModal}>
<span className="material-symbols-outlined text-[20px]">close</span>
</button>
</div>

<div className="p-space-xl flex flex-col gap-space-lg">
<p className="font-body-md text-body-md text-on-surface-variant">
          Select the exact model production code stamping as found on the vehicle bulkhead to lock fitment rules.
        </p>

<div className="flex flex-col gap-space-sm">
{data.trims.map((trim) => (
<label key={trim.id} className="flex items-start gap-space-md p-space-md rounded-lg bg-surface-container-low hover:bg-surface-container cursor-pointer transition-colors">
<input checked={trim.selected} className="mt-1 accent-primary" name="trim_selection" readOnly type="radio" value={trim.id} onClick={() => actions.onPickTrim(trim.id)} />
<div className="flex flex-col">
<span className="font-body-md text-body-md font-semibold text-on-surface">{trim.title}</span>
<span className="font-caption text-caption text-on-surface-variant">{trim.subtitle}</span>
<span className="font-label-code text-[11px] text-secondary mt-1">{trim.engineLine}</span>
</div>
</label>
))}
</div>
<div className="bg-surface-container p-space-md rounded-lg flex items-center gap-space-sm text-secondary font-caption text-caption">
<span className="material-symbols-outlined text-[18px]">lock</span>
<span>Linking this vehicle will immediately unblock parts purchasing for all dispatch drivers assigned to this plate.</span>
</div>
</div>

<div className="px-space-xl py-space-md bg-surface-container-low flex items-center justify-end gap-space-md">
<button type="button" className="px-space-lg py-space-sm rounded font-body-sm text-body-sm text-secondary hover:text-on-surface" id="cancelModalBtn" onClick={actions.onCloseLinkModal}>
          Cancel
        </button>
<button type="button" className="px-space-xl py-space-sm rounded bg-primary text-on-primary font-body-sm text-body-sm font-semibold shadow hover:opacity-90" id="confirmLinkBtn" onClick={actions.onConfirmMap}>
          Confirm & Map Vehicle
        </button>
</div>
</div>
</div>

</div></div>





    </div>
  );
}
