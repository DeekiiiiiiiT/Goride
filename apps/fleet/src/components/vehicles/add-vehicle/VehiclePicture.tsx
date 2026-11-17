/**
 * The shared studio picture for one vehicle (audit §3.6), used by the vehicle page (Stitch F14)
 * and the vehicle list cards (F16). Not ready → grey outline + the status wording.
 */
import React, { useEffect, useState } from "react";
import { Palette } from "lucide-react";
import { toast } from "sonner";
import { pictureStateLabel, vehiclePictureSrc } from "@roam/roam-shared";
import { api } from "../../../services/api";
import type { Vehicle } from "../../../types/vehicle";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../ui/dialog";
import { cn } from "../../ui/utils";
import { CarOutline, ColorDot, FlowButton, StatusChip } from "./AddVehicleUi";
import { VEHICLE_COLORS, colorLabel, isVehicleColor, type VehicleColor } from "./vehicleColors";

type Picture = NonNullable<Vehicle["picture"]>;

function labelFor(picture: Picture | undefined): string {
  const st = picture?.status ?? "none";
  if (st === "queued" || st === "generating") return "Picture coming";
  return pictureStateLabel(st as Parameters<typeof pictureStateLabel>[0]) || "";
}

const POLL_MS = 5_000;
const POLL_FOR_MS = 3 * 60_000;

/**
 * 4:3 picture or outline. `slot` picks the Cloudflare size (card 480/960, detail 1200/2400).
 * With `vehicleId`, a picture that is still being made is checked every 5 s (for up to 3 min) and
 * appears without a page refresh.
 */
export function VehiclePicture({
  picture: given,
  slot,
  className,
  showStatusChip,
  vehicleId,
}: {
  picture: Vehicle["picture"];
  slot: "card" | "detail";
  className?: string;
  showStatusChip?: boolean;
  vehicleId?: string;
}) {
  const [live, setLive] = useState<Vehicle["picture"] | null>(null);
  const picture = live ?? given;
  const making = picture?.status === "queued" || picture?.status === "generating";
  useEffect(() => {
    setLive(null);
  }, [given?.status, given?.url, vehicleId]);
  useEffect(() => {
    if (!vehicleId || !making) return;
    let stopped = false;
    const started = Date.now();
    const timer = setInterval(async () => {
      if (Date.now() - started > POLL_FOR_MS) {
        clearInterval(timer);
        return;
      }
      try {
        const next = await api.getVehiclePicture(vehicleId);
        if (stopped) return;
        if (next.status !== picture?.status || next.url !== picture?.url) {
          setLive({ ...(picture ?? {}), ...next } as Vehicle["picture"]);
        }
      } catch {
        // keep showing "Picture coming"; the next tick tries again
      }
    }, POLL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [vehicleId, making, picture?.status, picture?.url]);
  const ready = picture?.status === "ready" && picture.url;
  const src = ready ? vehiclePictureSrc(picture!.url, slot) : null;
  const label = labelFor(picture);
  return (
    <div
      className={cn(
        "relative aspect-[4/3] w-full overflow-hidden rounded-2xl border border-black/[0.06] bg-white dark:border-[#3a3a3d] dark:bg-[#1c1c1e]",
        className,
      )}
      data-testid="vehicle-picture"
    >
      {showStatusChip && ready ? (
        <div className="absolute left-3 top-3 z-10">
          <StatusChip tone="green">Picture ready</StatusChip>
        </div>
      ) : null}
      {src ? (
        <img
          src={src.src}
          srcSet={src.srcSet || undefined}
          sizes={slot === "card" ? "(max-width: 640px) 100vw, 480px" : "(max-width: 768px) 100vw, 1200px"}
          alt="Studio picture of this car"
          loading="lazy"
          className="h-full w-full object-contain"
        />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-[#f8fafc] p-4 dark:bg-[#1c1c1e]">
          <CarOutline />
          {label ? (
            <span className="rounded-full bg-white px-3 py-1 text-center text-[12px] font-medium text-[#475569] shadow-sm dark:bg-[#2a2a2d] dark:text-[#a1a1aa]">
              {label}
            </span>
          ) : null}
        </div>
      )}
    </div>
  );
}

/** Colour chip + "Change colour" (Stitch F14). Saving unlinks the old picture; the new look is looked up. */
export function VehicleColorRow({
  vehicle,
  onUpdated,
}: {
  vehicle: Vehicle;
  onUpdated?: (v: Vehicle) => void;
}) {
  const current = isVehicleColor(vehicle.colorStandard) ? (vehicle.colorStandard as VehicleColor) : null;
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState<VehicleColor | null>(current);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!pick) return;
    setBusy(true);
    try {
      const picture = await api.setVehicleColor(vehicle.id, pick);
      onUpdated?.({ ...vehicle, colorStandard: pick, picture });
      toast.success(`Colour changed to ${colorLabel(pick)}`);
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not change the colour");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="vehicle-colour-row">
      {current ? (
        <span className="inline-flex items-center gap-2 rounded-full bg-[#eff4ff] px-3 py-1.5 text-[15px] font-medium text-[#0b1c30] dark:bg-[#2a2a2d] dark:text-[#fafafa]">
          <ColorDot color={current} size={16} />
          {colorLabel(current)}
        </span>
      ) : (
        <span className="inline-flex items-center gap-2 rounded-full bg-[#fffbeb] px-3 py-1 text-[13px] font-medium text-[#b45309] dark:bg-[#451a03] dark:text-[#fbbf24]">
          Pick this vehicle's colour to get its picture
        </span>
      )}
      <FlowButton
        tone="secondary"
        className="min-h-9 rounded-full border-[#e2e8f0] px-3 text-[14px] font-medium shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
        onClick={() => {
          setPick(current);
          setOpen(true);
        }}
      >
        <Palette className="h-4 w-4" aria-hidden />
        Change colour
      </FlowButton>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Change colour</DialogTitle>
            <DialogDescription>The picture changes to this colour. It may take a few seconds.</DialogDescription>
          </DialogHeader>
          <ul role="listbox" aria-label="Colour" className="grid max-h-80 grid-cols-2 gap-2 overflow-y-auto">
            {VEHICLE_COLORS.map((c) => (
              <li key={c}>
                <button
                  type="button"
                  role="option"
                  aria-selected={c === pick}
                  onClick={() => setPick(c)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-left text-[15px]",
                    c === pick
                      ? "border-[#030213] bg-[#f8fafc] font-medium dark:border-[#fafafa] dark:bg-[#3a3a3d]"
                      : "border-black/[0.08] dark:border-[#3a3a3d]",
                  )}
                >
                  <ColorDot color={c} />
                  {colorLabel(c)}
                </button>
              </li>
            ))}
          </ul>
          <DialogFooter className="gap-2">
            <FlowButton tone="danger" onClick={() => setOpen(false)}>
              Cancel
            </FlowButton>
            <FlowButton tone="primary" busy={busy} disabled={!pick || pick === current} onClick={() => void save()}>
              Save
            </FlowButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export { CarOutline };

/** Small list thumbnail: the picture when ready, otherwise a grey car outline (no label at this size). */
export function VehicleThumb({ picture }: { picture: Vehicle["picture"] }) {
  const ready = picture?.status === "ready" && picture.url;
  const src = ready ? vehiclePictureSrc(picture!.url, "card") : null;
  return src ? (
    <img src={src.src} alt="" loading="lazy" className="h-full w-full bg-white object-contain" />
  ) : (
    <div className="flex h-full w-full items-center justify-center bg-[#f8fafc] p-1 dark:bg-[#1c1c1e]" aria-hidden>
      <CarOutline />
    </div>
  );
}
