import type { ReactNode } from "react";
import type { Fp4ViewModel } from "../findPartsViewModels";
import { fp4PageTitle } from "../findPartsBuildFp4";
import { FindPartsStickyHeader } from "../FindPartsStickyHeader";
import { Fp4VehicleDiagram } from "../Fp4VehicleDiagram";

export type Fp4Actions = {
  onBack: () => void;
  onNext: () => void;
  onEditPartCategory: () => void;
  onSelectAxle: (id: string) => void;
  onSelectSide: (id: string) => void;
  onSelectFrontSide?: (id: string) => void;
  onSelectRearSide?: (id: string) => void;
  children?: ReactNode;
};

export function Fp4Screen({ actions, data }: { actions: Fp4Actions; data: Fp4ViewModel }) {
  const partTrail = data.partLabel !== "None yet" ? data.partLabel : "Part";
  const selectedAxleIds = data.axleRows.filter((a) => a.selected).map((a) => a.id);
  const frontActive = selectedAxleIds.includes("front") || selectedAxleIds.includes("both");
  const rearActive = selectedAxleIds.includes("rear") || selectedAxleIds.includes("both");
  return (
    <div className="find-parts-screen-root">
      <div className="fp-screen-root flex flex-col w-full">
        <FindPartsStickyHeader
          step={4}
          onBack={actions.onBack}
          vehicleLabel={data.vehicleLabel}
          plate={data.plate}
          versionTag={data.versionTag}
          partTrailLabel={partTrail}
          onNext={actions.onNext}
        />

        <div className="w-full py-space-xl flex flex-col gap-space-xl">
          <div className="mb-space-xl">
            <div className="flex items-baseline gap-2 mb-1">
              <span className="font-label-code text-caption text-on-surface-variant uppercase tracking-widest font-semibold">
                {data.fitmentEyebrow}
              </span>
            </div>
            <h1 className="font-headline-xl text-headline-xl text-on-surface tracking-tight font-bold">{fp4PageTitle(data.partLabel)}</h1>
            <p className="font-body-md text-body-md text-on-surface-variant mt-1">Pick the axle, then the side when this part is sold per wheel.</p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-gutter-desktop items-start">
            <div className="lg:col-span-5 flex flex-col gap-space-lg">
              <div className="bg-surface-container-lowest rounded-xl p-space-lg shadow-sm">
                <div className="flex items-center justify-between pb-space-sm mb-space-sm">
                  <span className="font-label-code text-caption text-on-surface-variant flex items-center gap-1">
                    <span className="material-symbols-outlined text-[14px]">navigation</span>
                    <span>Front of vehicle (Direction of travel)</span>
                  </span>
                  <span className="font-label-code text-caption px-1.5 py-0.5 rounded bg-surface-container-low text-on-surface-variant">{data.scaleLabel}</span>
                </div>
                <div className="relative w-full min-h-[280px] bg-surface-container-low rounded-xl flex items-center justify-center p-space-sm">
                  <Fp4VehicleDiagram frontActive={frontActive} rearActive={rearActive} />
                  <div className="absolute bottom-3 left-3 bg-surface-container-lowest/95 backdrop-blur-sm px-2.5 py-1 rounded shadow-sm flex items-center gap-1.5 font-label-code text-caption max-w-[min(100%,20rem)]">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0"></span>
                    <span className="font-semibold text-on-surface leading-snug">{data.diagramBadge}</span>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-space-sm">
                <div className="bg-surface-container-lowest rounded-xl p-space-md shadow-sm flex items-start gap-space-md">
                  <div className="w-8 h-8 rounded bg-primary text-on-primary flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-[18px]">radio_button_checked</span>
                  </div>
                  <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-label-code text-caption font-bold text-on-surface uppercase tracking-wider">{data.frontSpec.title}</span>
                      <span className="px-1.5 py-0.2 rounded bg-surface-container text-on-surface-variant font-label-code text-caption">{data.frontSpec.tag}</span>
                    </div>
                    <p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5">{data.frontSpec.description}</p>
                    <div className="flex items-center gap-3 mt-1.5 font-label-code text-caption text-on-surface-variant">
                      <span>rotor: {data.frontSpec.rotor}</span>
                      <span>·</span>
                      <span>piston: {data.frontSpec.piston}</span>
                    </div>
                  </div>
                </div>
                <div className="bg-surface-container-lowest rounded-xl p-space-md shadow-sm flex items-start gap-space-md">
                  <div className="w-8 h-8 rounded bg-surface-container-high text-on-surface-variant flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-[18px]">adjust</span>
                  </div>
                  <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-label-code text-caption font-bold text-on-surface uppercase tracking-wider">{data.rearSpec.title}</span>
                      <span className="px-1.5 py-0.2 rounded bg-surface-container text-on-surface-variant font-label-code text-caption">{data.rearSpec.tag}</span>
                    </div>
                    <p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5">{data.rearSpec.description}</p>
                    <div className="flex items-center gap-3 mt-1.5 font-label-code text-caption text-on-surface-variant">
                      <span>drum id: {data.rearSpec.drum}</span>
                      <span>·</span>
                      <span>cylinder: {data.rearSpec.cylinder}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="lg:col-span-7 flex flex-col gap-space-xl">
              <section className="flex flex-col">
                <div className="flex items-center justify-between mb-space-sm">
                  <span className="font-label-code text-caption font-bold text-on-surface uppercase tracking-wider">STEP A · CHOOSE AXLE</span>
                  <span className="font-label-code text-caption text-on-surface-variant">1 REQUIRED</span>
                </div>
                <div className="grid grid-cols-1 gap-space-sm">
                  {data.axleRows.map((row) => (
                    <button
                      key={row.id}
                      type="button"
                      className={`relative rounded-xl p-space-lg shadow-sm cursor-pointer transition-all text-left ${row.selected ? "ring-2 ring-primary bg-surface-container-lowest" : "bg-surface-container-lowest hover:bg-surface-container-low"}`}
                      onClick={() => actions.onSelectAxle(row.id)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-space-md">
                          <div className={`w-5 h-5 rounded-full flex items-center justify-center ${row.selected ? "bg-primary text-on-primary" : "bg-surface-container-highest text-transparent"}`}>
                            <span className="material-symbols-outlined text-[14px]">check</span>
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-headline-sm text-headline-sm text-on-surface font-semibold">{row.title}</span>
                              <span className="px-2 py-0.5 rounded-full bg-surface-container text-on-surface font-label-code text-caption font-medium">{row.typeTag}</span>
                            </div>
                            <p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5">{row.partTitle}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface-container font-label-code text-caption font-semibold text-on-surface">
                          <span className="w-1.5 h-1.5 rounded-full bg-on-surface"></span>
                          <span>{row.onFileLabel}</span>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </section>

              {data.showSideStep ? (
              <section className="flex flex-col gap-space-md">
                <div className="flex items-center justify-between">
                  <span className="font-label-code text-caption font-bold text-on-surface uppercase tracking-wider">STEP B · CHOOSE SIDE</span>
                  <span className="font-label-code text-caption text-on-surface-variant">Required</span>
                </div>
                {data.axleRows.some((a) => a.selected && a.id === "both") ? (
                  <>
                    <div className="flex flex-col gap-space-sm">
                      <span className="font-label-code text-caption text-on-surface-variant">Front side</span>
                      <div className="flex flex-wrap gap-space-sm">
                        {(data.frontSideOptions || data.sideOptions).map((side) => (
                          <button
                            key={`front-${side.id}`}
                            type="button"
                            className={`px-4 py-2 rounded-lg font-body-sm text-body-sm font-semibold transition-colors ${side.selected ? "bg-primary text-on-primary shadow-sm" : "bg-surface-container-lowest hover:bg-surface-container text-on-surface"}`}
                            onClick={() => actions.onSelectFrontSide?.(side.id)}
                          >
                            {side.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="flex flex-col gap-space-sm">
                      <span className="font-label-code text-caption text-on-surface-variant">Rear side</span>
                      <div className="flex flex-wrap gap-space-sm">
                        {(data.rearSideOptions || data.sideOptions).map((side) => (
                          <button
                            key={`rear-${side.id}`}
                            type="button"
                            className={`px-4 py-2 rounded-lg font-body-sm text-body-sm font-semibold transition-colors ${side.selected ? "bg-primary text-on-primary shadow-sm" : "bg-surface-container-lowest hover:bg-surface-container text-on-surface"}`}
                            onClick={() => actions.onSelectRearSide?.(side.id)}
                          >
                            {side.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="flex flex-wrap gap-space-sm">
                    {data.sideOptions.map((side) => (
                      <button
                        key={side.id}
                        type="button"
                        className={`px-4 py-2 rounded-lg font-body-sm text-body-sm font-semibold transition-colors ${side.selected ? "bg-primary text-on-primary shadow-sm" : "bg-surface-container-lowest hover:bg-surface-container text-on-surface"}`}
                        onClick={() => actions.onSelectSide(side.id)}
                      >
                        {side.label}
                      </button>
                    ))}
                  </div>
                )}
              </section>
              ) : data.axleSetAdvisory ? (
              <div className="bg-surface-container-low rounded-xl p-space-md flex gap-space-md">
                <span className="material-symbols-outlined text-on-surface-variant">info</span>
                <p className="font-body-sm text-body-sm text-on-surface-variant">{data.axleSetAdvisory}</p>
              </div>
              ) : null}

              <section className="bg-surface-container-lowest rounded-xl p-space-lg shadow-sm">
                <div className="font-label-code text-caption font-bold text-on-surface uppercase tracking-wider mb-space-md">Chassis fitment profile</div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-space-md font-label-code text-caption">
                  <div><span className="text-on-surface-variant block">Code</span><span className="text-on-surface font-semibold">{data.chassisProfile.code}</span></div>
                  <div><span className="text-on-surface-variant block">Drive system</span><span className="text-on-surface font-semibold">{data.chassisProfile.drive}</span></div>
                  <div><span className="text-on-surface-variant block">ABS channels</span><span className="text-on-surface font-semibold">{data.chassisProfile.abs}</span></div>
                  <div><span className="text-on-surface-variant block">Handbrake</span><span className="text-on-surface font-semibold">{data.chassisProfile.handbrake}</span></div>
                  <div><span className="text-on-surface-variant block">Pattern</span><span className="text-on-surface font-semibold">{data.chassisProfile.pattern}</span></div>
                </div>
              </section>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
