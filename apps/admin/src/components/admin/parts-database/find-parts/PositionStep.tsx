// Stitch: dominion-redesign/S42d (find_parts_front_or_back/code.html)
import { useMemo, useState } from "react";
import { AxleGeometryDiagram } from "./AxleGeometryDiagram";
import { MatchTypeStrip } from "./MatchTypeStrip";

function isBrakePart(partName: string) {
  return partName.toLowerCase().includes("brake");
}

function positionHeading(partName: string) {
  return isBrakePart(partName) ? "Which brakes?" : `Which ${partName.toLowerCase()}?`;
}

export function PositionStep({
  partName,
  partCount,
  geometryTitle,
  onChoose,
  onBack,
}: {
  partName: string;
  partCount: number | null;
  geometryTitle: string;
  onChoose: (position: "front" | "rear" | "both", side: "left" | "right" | "both") => void;
  onBack: () => void;
}) {
  const [axle, setAxle] = useState<"front" | "rear" | "both">("front");
  const [hand, setHand] = useState<"left" | "right" | "both">("both");
  const brake = isBrakePart(partName);

  const cards = useMemo(() => {
    if (brake) {
      return [
        {
          id: "front" as const,
          title: "Front",
          badge: "Primary axle",
          badgeHot: true,
          detail: "Disc brake pads · Most common wear item",
          note: "Front axle (left & right set) · Caliper mount · Ventilated disc profile",
        },
        {
          id: "rear" as const,
          title: "Back",
          badge: "Secondary axle",
          badgeHot: false,
          detail: "Rear brake shoes / pads",
          note: "Rear axle (left & right set) · Drum assembly trailing shoe spec",
        },
        {
          id: "both" as const,
          title: "Both",
          badge: "Complete set",
          badgeHot: false,
          detail: "Show front and rear brake parts side by side",
          note: "Complete vehicle brake service · Split axle view with unified taxonomy",
        },
      ];
    }
    return [
      {
        id: "front" as const,
        title: "Front",
        badge: "Primary axle",
        badgeHot: true,
        detail: `Front ${partName.toLowerCase()} · Most common wear item`,
        note: "Front axle (left and right set)",
      },
      {
        id: "rear" as const,
        title: "Back",
        badge: "Secondary axle",
        badgeHot: false,
        detail: `Rear ${partName.toLowerCase()}`,
        note: "Rear axle (left and right set)",
      },
      {
        id: "both" as const,
        title: "Both",
        badge: "Complete set",
        badgeHot: false,
        detail: `Show front and back ${partName.toLowerCase()} side by side`,
        note: "Complete vehicle service",
      },
    ];
  }, [brake, partName]);

  const disambiguationNote = brake
    ? "Front axle uses ventilated rotor disc pads, while many rear setups use drum or different pad specs. Parts are strictly non-interchangeable."
    : `Front and back ${partName.toLowerCase()} are different parts. Parts are not interchangeable.`;

  function submit() {
    onChoose(axle, hand);
  }

  return (
    <div className="w-full flex flex-col gap-space-lg max-w-[1440px] mx-auto">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg">
        <div className="lg:col-span-5 flex flex-col bg-surface-container-lowest p-space-lg rounded-xl shadow-sm justify-between">
          <div className="flex items-center justify-between pb-space-md gap-space-md flex-wrap">
            <div className="flex flex-col">
              <span className="font-label-xs text-label-xs uppercase tracking-wider text-secondary">Axle geometry map</span>
              <span className="font-headline-md text-headline-md text-on-surface font-semibold">{geometryTitle}</span>
            </div>
            <span className="px-2 py-0.5 rounded bg-primary-fixed text-primary font-mono-sm text-mono-sm font-semibold shrink-0">FWD architecture</span>
          </div>
          <AxleGeometryDiagram highlight={axle} side={hand} />
          <div className="mt-space-md p-space-sm bg-surface-container-low rounded-lg flex items-start gap-space-sm">
            <span className="material-symbols-outlined text-primary text-[18px] mt-0.5 shrink-0">info</span>
            <div className="flex flex-col">
              <span className="font-label-md text-label-md text-on-surface font-semibold">Mechanical disambiguation reason</span>
              <span className="font-body-sm text-body-sm text-secondary">{disambiguationNote}</span>
            </div>
          </div>
        </div>

        <div className="lg:col-span-7 flex flex-col justify-between gap-space-lg">
          <div className="bg-surface-container-lowest p-space-xl rounded-xl shadow-sm flex flex-col gap-space-lg flex-1">
            <div>
              <h2 className="font-headline-xl text-headline-xl text-on-surface font-semibold">{positionHeading(partName)}</h2>
              <p className="font-body-md text-body-md text-secondary mt-1">
                Front and back {partName.toLowerCase()} are different parts. Select the installation point to filter exact catalog fitments.
              </p>
            </div>
            <div className="flex flex-col gap-space-md">
              {cards.map((card) => {
                const on = axle === card.id;
                return (
                  <button
                    key={card.id}
                    type="button"
                    className={"group relative text-left p-space-lg rounded-xl transition-all duration-150 " + (on ? "bg-primary-fixed/20 shadow-sm ring-2 ring-primary-container" : "bg-surface-container-low hover:bg-surface-container")}
                    onClick={() => setAxle(card.id)}
                  >
                    <div className="flex items-start justify-between gap-space-md">
                      <div className="flex items-start gap-space-md min-w-0">
                        <div className={"w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 " + (on ? "bg-primary-container text-on-primary" : "bg-surface-container-highest text-secondary group-hover:text-on-surface")}>
                          <span className="material-symbols-outlined text-[16px]">{on ? "radio_button_checked" : "radio_button_unchecked"}</span>
                        </div>
                        <div className="flex flex-col min-w-0">
                          <div className="flex items-center gap-space-sm flex-wrap">
                            <span className={"font-headline-lg text-headline-lg text-on-surface " + (on ? "font-bold" : "font-semibold")}>{card.title}</span>
                            <span className={"font-mono-sm text-mono-sm px-2 py-0.5 rounded font-semibold " + (on && card.badgeHot ? "bg-primary-container text-on-primary" : "bg-surface-container-high text-secondary")}>
                              {card.badge.toUpperCase()}
                            </span>
                          </div>
                          <span className={"font-body-md text-body-md mt-0.5 " + (on ? "text-on-surface font-medium" : "text-secondary")}>{card.detail}</span>
                          <span className="font-mono-sm text-mono-sm text-secondary mt-1">{card.note}</span>
                        </div>
                      </div>
                      {partCount != null && on ? (
                        <div className="hidden sm:flex flex-col items-end shrink-0">
                          <span className="font-mono-md text-mono-md font-semibold text-primary">{partCount.toLocaleString()} on file</span>
                        </div>
                      ) : null}
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="grid grid-cols-3 gap-space-sm">
              {(["left", "right", "both"] as const).map((id) => (
                <button
                  key={id}
                  type="button"
                  className={"rounded-xl p-space-md text-left font-label-md text-label-md transition-colors " + (hand === id ? "bg-primary-container text-on-primary" : "bg-surface-container-low text-on-surface hover:bg-surface-container")}
                  onClick={() => setHand(id)}
                >
                  {id === "both" ? "Both sides" : id === "left" ? "Left" : "Right"}
                </button>
              ))}
            </div>

            <div className="pt-space-md flex items-center justify-between gap-space-md">
              <button type="button" className="h-9 px-space-lg rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface font-label-md text-label-md flex items-center gap-space-xs transition-colors" onClick={onBack}>
                <span className="material-symbols-outlined text-[18px]">arrow_back</span>
                Back
              </button>
              <button type="button" className="h-9 px-space-xl rounded-lg bg-primary-container hover:bg-primary text-on-primary font-label-md text-label-md flex items-center gap-space-sm shadow-sm transition-colors" onClick={submit}>
                Show parts
                <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
              </button>
            </div>
          </div>
        </div>
      </div>
      <MatchTypeStrip reference />
    </div>
  );
}
