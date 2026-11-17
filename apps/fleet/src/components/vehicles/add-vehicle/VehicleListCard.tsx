/**
 * Vehicles page card, ported from Stitch F16 `vehicles_list_with_pictures`:
 * 4:3 picture frame (or outline + status wording), maker logo, name · plate, subtitle,
 * colour chip and Active / Inactive chip. Whole card opens the vehicle.
 */
import React from "react";
import { Camera, Clock, Info, Pause, Trash2 } from "lucide-react";
import { pictureStateLabel, vehiclePictureSrc } from "@roam/roam-shared";
import type { Vehicle } from "../../../types/vehicle";
import { MakerLogo } from "../find-parts/everyday/EverydayShared";
import { CarOutline } from "./AddVehicleUi";
import { COLOR_SWATCH, colorLabel, isVehicleColor } from "./vehicleColors";
import { cn } from "../../ui/utils";

function stateLine(status: string): { text: string; Icon: typeof Camera } | null {
  if (status === "queued" || status === "generating") return { text: "Picture coming", Icon: Camera };
  if (status === "limited") return { text: pictureStateLabel("limited"), Icon: Clock };
  if (status === "paused") return { text: pictureStateLabel("paused"), Icon: Pause };
  if (status === "failed") return { text: pictureStateLabel("failed"), Icon: Info };
  return null;
}

export function vehicleCardSubtitle(v: Pick<Vehicle, "year" | "bodyType" | "vehicle_catalog_generation_hint">) {
  return [v.year, v.vehicle_catalog_generation_hint, v.bodyType].filter((x) => x && String(x).trim()).join(" ");
}

export function VehicleListCard({
  vehicle,
  onOpen,
  badge,
  onDelete,
}: {
  vehicle: Vehicle;
  onOpen: (id: string) => void;
  /** Shows a delete button; the page asks to confirm in its own dialog. */
  onDelete?: (id: string) => void;
  /** Extra chip next to the status (e.g. "Waiting for Roam to check this car"). */
  badge?: React.ReactNode;
}) {
  const picture = vehicle.picture;
  const status = picture?.status ?? "none";
  const src = status === "ready" && picture?.url ? vehiclePictureSrc(picture.url, "card") : null;
  const line = src ? null : stateLine(status);
  const colour = isVehicleColor(vehicle.colorStandard) ? vehicle.colorStandard : null;
  const active = vehicle.status === "Active";
  const subtitle = vehicleCardSubtitle(vehicle);

  return (
    <article
      className="group flex cursor-pointer flex-col rounded-[20px] bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(15,23,42,0.04)] transition-all hover:shadow-[0_4px_16px_rgba(0,0,0,0.08)] md:p-6 dark:bg-[#1c1c1e] dark:shadow-none dark:ring-1 dark:ring-[#3a3a3d]"
      onClick={() => onOpen(vehicle.id)}
      data-testid="vehicle-list-card"
    >
      <div className="relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-[16px] bg-[#eff4ff] dark:bg-[#111113]">
        {src ? (
          <>
            <img
              src={src.src}
              srcSet={src.srcSet || undefined}
              sizes="(max-width: 768px) 100vw, 480px"
              alt={`${colour ? colorLabel(colour) + " " : ""}${vehicle.make} ${vehicle.model}`}
              loading="lazy"
              className="h-full w-full bg-white object-contain p-2 transition-transform duration-500 group-hover:scale-[1.03] motion-reduce:transform-none"
            />
            <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-semibold text-[#069669] shadow-[0_1px_4px_rgba(0,0,0,0.08)] backdrop-blur-md dark:bg-[#1c1c1e]/90 dark:text-[#34d399]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#069669] dark:bg-[#34d399]" />
              Picture ready
            </span>
          </>
        ) : (
          <div className="flex flex-col items-center gap-4 px-4 text-[#94a3b8] dark:text-[#52525b]">
            <div className="w-32"><CarOutline /></div>
            {line ? (
              <span className="inline-flex max-w-[240px] items-center gap-1.5 rounded-full bg-white px-3 py-1 text-center text-[11px] font-medium leading-snug text-[#47464c] shadow-[0_1px_2px_rgba(0,0,0,0.06)] dark:bg-[#2a2a2d] dark:text-[#a1a1aa]">
                <line.Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
                {line.text}
              </span>
            ) : null}
          </div>
        )}
      </div>

      <div className="flex flex-col pt-4">
        <div className="mb-2.5 flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#eff4ff] shadow-[0_1px_2px_rgba(0,0,0,0.04)] dark:bg-[#2a2a2d]">
            <MakerLogo make={vehicle.make} size={22} />
          </span>
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                className="truncate text-left text-[18px] font-semibold text-[#0b1c30] hover:underline focus-visible:underline dark:text-[#fafafa]"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpen(vehicle.id);
                }}
              >
                {vehicle.make} {vehicle.model}
              </button>
              <span className="text-[#c9c5cd]" aria-hidden>·</span>
              <span className="rounded bg-[#e5eeff] px-1.5 py-0.5 font-mono text-[13px] font-bold tracking-wider text-[#0b1c30] dark:bg-[#2a2a2d] dark:text-[#fafafa]">
                {vehicle.licensePlate}
              </span>
            </div>
            {subtitle ? <span className="text-[13px] text-[#47464c] dark:text-[#a1a1aa]">{subtitle}</span> : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
          {colour ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#e5eeff] px-2.5 py-1 text-[12px] font-medium text-[#0b1c30] dark:bg-[#2a2a2d] dark:text-[#fafafa]">
              <span
                className="h-2 w-2 rounded-full shadow-[inset_0_0_0_1px_rgba(0,0,0,0.2)]"
                style={{ background: COLOR_SWATCH[colour] }}
                aria-hidden
              />
              {colorLabel(colour)}
            </span>
          ) : (
            <span className="inline-flex items-center rounded-full bg-[#fffbeb] px-2.5 py-1 text-[12px] font-medium text-[#b45309] dark:bg-[#451a03] dark:text-[#fbbf24]">
              Colour not set
            </span>
          )}
          <div className="flex items-center gap-1.5">
            {onDelete ? (
              <button
                type="button"
                aria-label={`Delete ${vehicle.make} ${vehicle.model} ${vehicle.licensePlate}`}
                title="Delete vehicle"
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#fecaca] bg-white text-[#b91c1c] transition-colors hover:bg-[#fef2f2] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b91c1c] dark:border-[#7f1d1d] dark:bg-[#2a2a2d] dark:text-[#f87171] dark:hover:bg-[#450a0a]"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(vehicle.id);
                }}
              >
                <Trash2 className="h-4 w-4" aria-hidden />
              </button>
            ) : null}
            {badge}
            <span
              className={cn(
                "inline-flex items-center rounded-full px-2.5 py-1 text-[12px] font-semibold",
                active
                  ? "bg-[#85f8c4]/30 text-[#069669] dark:bg-[#064e3b] dark:text-[#34d399]"
                  : "bg-[#e5eeff] text-[#47464c] dark:bg-[#2a2a2d] dark:text-[#a1a1aa]",
              )}
            >
              {vehicle.status || "Inactive"}
            </span>
          </div>
        </div>
      </div>
    </article>
  );
}
