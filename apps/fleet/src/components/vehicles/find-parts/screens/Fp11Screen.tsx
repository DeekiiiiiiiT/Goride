import type { ReactNode } from "react";
import type { Fp11PreviewTab, Fp11ViewModel } from "../findPartsViewModels";

export type Fp11Actions = {
  onRetry: () => void;
  onAskRoam: () => void;
  onRequestAccess: () => void;
  onBack: () => void;
  onCheckConnection: () => void;
  onPreviewTab?: (tab: Fp11PreviewTab) => void;
  onSelectVehicle: () => void;
  children?: ReactNode;
};

export function Fp11Screen({ actions, data }: { actions: Fp11Actions; data: Fp11ViewModel }) {
  const state = data.state;

  if (state === "loading") {
    return (
      <div className="find-parts-screen-root">
        <div className="fp-screen-root w-full py-space-xl">
          <section className="state-section flex flex-col gap-space-md" id="state-section-loading">
            <div className="flex items-center justify-between pb-space-xs">
              <div className="flex items-center gap-space-sm">
                <span className="px-2 py-0.5 rounded bg-surface-container-high font-label-code text-caption text-on-surface font-semibold">STATE 01</span>
                <h2 className="font-headline-sm text-headline-sm text-on-surface">Skeleton & Fitment Matching Stream</h2>
              </div>
              <div className="flex items-center gap-space-xs text-on-surface-variant font-label-code text-caption">
                <span className="w-2 h-2 rounded-full bg-primary-fixed-dim animate-ping"></span>
                <span>DISPATCH RESOLVER: RUNNING</span>
              </div>
            </div>
            <div className="bg-surface-container-lowest p-space-lg rounded-xl shadow-sm flex flex-col gap-space-lg">
              <div className="flex items-center gap-2 px-space-md py-1.5 rounded-lg bg-surface-container-low font-body-sm text-body-sm text-on-surface-variant">
                <span className="material-symbols-outlined text-[16px] text-on-tertiary-container animate-spin">sync</span>
                <span>Matching fitment against catalog items...</span>
              </div>
              <div className="relative overflow-hidden bg-surface-container-low rounded-xl p-space-lg">
                <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-primary"></div>
                <div className="h-7 w-3/4 bg-surface-container-highest rounded animate-pulse"></div>
                <div className="h-4 w-1/2 bg-surface-container mt-2 rounded animate-pulse"></div>
              </div>
            </div>
          </section>
        </div>
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="find-parts-screen-root">
        <div className="fp-screen-root w-full py-space-xl">
          <section className="state-section flex flex-col gap-space-md" id="state-section-error">
            <div className="flex items-center justify-between pb-space-xs">
              <div className="flex items-center gap-space-sm">
                <span className="px-2 py-0.5 rounded bg-error-container font-label-code text-caption text-on-error-container font-semibold">STATE 02</span>
                <h2 className="font-headline-sm text-headline-sm text-on-surface">Network / Service Disruption</h2>
              </div>
              <span className="font-label-code text-caption text-error font-medium">{data.httpStatusLine}</span>
            </div>
            <div className="bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden">
              <div className="bg-error-container/40 p-space-xl flex flex-col lg:flex-row items-start justify-between gap-space-lg">
                <div className="flex items-start gap-space-md">
                  <div className="w-12 h-12 rounded-xl bg-error-container flex items-center justify-center text-error shrink-0">
                    <span className="material-symbols-outlined text-[28px]">error</span>
                  </div>
                  <div className="flex flex-col gap-1 max-w-2xl">
                    <div className="font-headline-lg text-headline-lg text-on-surface font-semibold tracking-tight">
                      Could not load parts. Nothing was changed.
                    </div>
                    <p className="font-body-md text-body-md text-on-surface-variant">{data.errorMessage}</p>
                    <div className="mt-space-md flex flex-wrap items-center gap-space-xs font-label-code text-caption text-on-surface-variant">
                      <span className="px-2 py-1 bg-surface-container rounded text-on-surface">VEHICLE: {data.vehicleChip}</span>
                      <span className="px-2 py-1 bg-surface-container rounded text-on-surface">SECTION: {data.sectionChip}</span>
                    </div>
                  </div>
                </div>
                <div className="flex flex-col sm:flex-row lg:flex-col items-stretch lg:items-end gap-space-sm shrink-0 w-full sm:w-auto">
                  <button type="button" className="bg-primary text-on-primary hover:bg-surface-tint active:scale-[0.98] transition-all px-space-xl py-2 rounded-lg font-body-sm text-body-sm font-semibold flex items-center justify-center gap-2" onClick={actions.onRetry}>
                    <span className="material-symbols-outlined text-[18px]">refresh</span>
                    <span>Retry</span>
                  </button>
                  <button type="button" className="font-label-code text-caption text-on-surface-variant hover:text-on-surface text-center lg:text-right underline flex items-center justify-center lg:justify-end gap-1 pt-1" onClick={actions.onCheckConnection}>
                    <span>{data.connectionStatusLabel}</span>
                    <span className="material-symbols-outlined text-[14px]">open_in_new</span>
                  </button>
                </div>
              </div>
              <div className="bg-surface-container-low px-space-xl py-space-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-space-xs font-label-code text-caption text-on-surface-variant">
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-error"></span>
                  <span>LOCAL CACHE: PRESERVED</span>
                </div>
                <span>{data.attemptLabel}</span>
              </div>
            </div>
          </section>
        </div>
      </div>
    );
  }

  if (state === "unlisted") {
    return (
      <div className="find-parts-screen-root">
        <div className="fp-screen-root w-full py-space-xl">
          <section className="state-section flex flex-col gap-space-md" id="state-section-unlisted">
            <div className="flex items-center justify-between pb-space-xs">
              <div className="flex items-center gap-space-sm">
                <span className="px-2 py-0.5 rounded bg-surface-container-high font-label-code text-caption text-on-surface font-semibold">STATE 03</span>
                <h2 className="font-headline-sm text-headline-sm text-on-surface">Unlisted Vehicle / Model Missing</h2>
              </div>
              <span className="font-label-code text-caption text-on-tertiary-container font-medium">JDM MANUAL FITMENT TIER</span>
            </div>
            <div className="bg-surface-container-lowest rounded-xl shadow-sm p-space-xl flex flex-col lg:flex-row items-center justify-between gap-space-xl">
              <div className="flex flex-col sm:flex-row items-start gap-space-lg max-w-3xl">
                <div className="w-16 h-16 rounded-2xl bg-surface-container-low flex items-center justify-center relative shrink-0">
                  <span className="material-symbols-outlined text-[36px] text-on-surface-variant">directions_car</span>
                  <div className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-primary text-on-primary flex items-center justify-center font-label-code text-caption font-bold">?</div>
                </div>
                <div className="flex flex-col gap-space-xs">
                  <h3 className="font-headline-lg text-headline-lg text-on-surface font-semibold tracking-tight">
                    We don&apos;t have the {data.missingModel || data.vehicleLabel} in our car list yet.
                  </h3>
                  <p className="font-body-md text-body-md text-on-surface-variant mt-1">
                    Pre-2002 Japanese domestic market models require custom manual cataloging for chassis fitment.
                  </p>
                  <div className="mt-space-md self-start inline-flex items-center gap-2 px-space-md py-1.5 rounded-full bg-tertiary-fixed text-on-tertiary-fixed font-caption text-caption">
                    <span className="material-symbols-outlined text-[16px]">schedule</span>
                    <span className="font-semibold">Takes 2–4 hours for Jamaican parts desk verification</span>
                  </div>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row lg:flex-col items-stretch lg:items-end gap-space-sm w-full lg:w-auto shrink-0">
                <button type="button" className="bg-primary text-on-primary hover:bg-surface-tint active:scale-[0.98] transition-all px-space-xl py-2.5 rounded-lg font-body-sm text-body-sm font-semibold flex items-center justify-center gap-2" onClick={actions.onAskRoam}>
                  <span className="material-symbols-outlined text-[18px]">add_circle</span>
                  <span>Ask Roam to add it</span>
                </button>
                <button type="button" className="bg-surface-container-low text-on-surface hover:bg-surface-container-high transition-all px-space-lg py-2 rounded-lg font-body-sm text-body-sm text-center" onClick={actions.onSelectVehicle}>
                  Select another vehicle
                </button>
              </div>
            </div>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="find-parts-screen-root">
      <div className="fp-screen-root w-full py-space-xl">
        <section className="state-section flex flex-col gap-space-md" id="state-section-noperm">
          <div className="flex items-center justify-between pb-space-xs">
            <div className="flex items-center gap-space-sm">
              <span className="px-2 py-0.5 rounded bg-surface-container-high font-label-code text-caption text-on-surface font-semibold">STATE 04</span>
              <h2 className="font-headline-sm text-headline-sm text-on-surface">Role Authorization Gate</h2>
            </div>
            <span className="font-label-code text-caption text-on-surface-variant">POLICY: RBAC-MAINT-403</span>
          </div>
          <div className="bg-surface-container-lowest rounded-xl shadow-sm p-space-xl flex flex-col gap-space-xl">
            <div className="flex flex-col lg:flex-row items-start justify-between gap-space-xl">
              <div className="flex flex-col sm:flex-row items-start gap-space-lg max-w-3xl">
                <div className="w-16 h-16 rounded-2xl bg-secondary-container flex items-center justify-center relative shrink-0">
                  <span className="material-symbols-outlined text-[34px] text-primary">lock</span>
                </div>
                <div className="flex flex-col gap-space-xs">
                  <h3 className="font-headline-lg text-headline-lg text-on-surface font-semibold tracking-tight">
                    You don&apos;t have access to vehicle parts. Ask your fleet admin.
                  </h3>
                  <p className="font-body-md text-body-md text-on-surface-variant mt-1">
                    Your role (<strong className="text-on-surface font-semibold">{data.roleLabel}</strong>) allows viewing schedules and reporting issues, but parts requisitioning and quoting require <strong className="text-on-surface font-semibold">&apos;Fleet Manager&apos;</strong> or <strong className="text-on-surface font-semibold">&apos;Purchasing&apos;</strong> permissions.
                  </p>
                  <div className="mt-space-md flex flex-wrap items-center gap-space-md text-body-sm text-on-surface-variant">
                    <div className="flex items-center gap-1.5 font-label-code text-caption">
                      <span className="material-symbols-outlined text-[16px] text-primary">verified_user</span>
                      <span>ACTIVE PROFILE: {data.userEmail}</span>
                    </div>
                    <div className="flex items-center gap-1.5 font-label-code text-caption">
                      <span className="material-symbols-outlined text-[16px] text-outline">location_on</span>
                      <span>DEPOT: {data.hubLabel}</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row lg:flex-col items-stretch lg:items-end gap-space-sm w-full lg:w-auto shrink-0">
                <button type="button" className="bg-primary text-on-primary hover:bg-surface-tint active:scale-[0.98] transition-all px-space-xl py-2.5 rounded-lg font-body-sm text-body-sm font-semibold flex items-center justify-center gap-2" onClick={actions.onRequestAccess}>
                  <span className="material-symbols-outlined text-[18px]">key</span>
                  <span>Request access from {data.adminContactLine !== "None yet" ? data.adminContactLine : data.adminLabel}</span>
                </button>
                <button type="button" className="bg-surface-container-low text-on-surface hover:bg-surface-container-high transition-all px-space-lg py-2 rounded-lg font-body-sm text-body-sm text-center" onClick={actions.onBack}>
                  Back to Fleet maintenance
                </button>
              </div>
            </div>
            <div className="bg-surface-container-low rounded-lg p-space-md flex flex-col md:flex-row items-start md:items-center justify-between gap-space-md font-body-sm text-body-sm">
              <div>
                <span className="font-semibold text-on-surface">{data.hubLabel} Administrator:</span>
                <span className="text-on-surface-variant"> {data.adminContactLine}</span>
              </div>
              <div className="flex items-center gap-2 text-on-surface-variant font-label-code text-caption">
                <span className="material-symbols-outlined text-[16px]">schedule</span>
                <span>Avg. authorization response: ~12 minutes</span>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
