/**
 * "Pick a part" — Stitch service-items-fleet screen 2. Parts that fit this car come from the car's
 * catalogue (the server re-checks the pick); "fits by size" parts and "Type it in instead" only fill
 * brand and part number. No part numbers are shown (plan 6a).
 */
import React, { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { api } from "../../../../services/api";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "../../../ui/responsive-dialog";
import type { CompatiblePartsResponse } from "../../../../types/partSourcing";
import type { LineItemDraft } from "../../../../types/maintenance";
import { ACCENT } from "./ItemsUsedSection";
import { RoamLooksItUpLine } from "./unknownParts";

export type PickedPart = Pick<LineItemDraft, "partId" | "brand" | "partNumber" | "partLabel" | "partFit">;

type Choice = {
  key: string;
  title: string;
  verified: boolean;
  picked: PickedPart;
};

const COPY = {
  title: "Pick a part",
  subtitle: (part: string, car: string) => `${part} for your ${car}`,
  fitsYourCar: "Fits your car",
  fitsBySize: "Fits by size",
  verified: "Verified",
  checkBeforeBuying: "Check before buying",
  typeItIn: "Type it in instead",
  brand: "Brand",
  partNumber: "Part number (optional)",
  cancel: "Cancel",
  use: "Use this part",
  loadFail: "Couldn't load parts for this car.",
  tryAgain: "Try again",
  none: "No parts are listed for this car yet. Type it in instead.",
} as const;

function titleOf(brand: string | null | undefined, name: string | null | undefined): string {
  return [brand?.trim(), name?.trim()].filter(Boolean).join(" · ") || "Part";
}

export function choicesFromResponse(res: CompatiblePartsResponse | null): { car: Choice[]; size: Choice[] } {
  if (!res) return { car: [], size: [] };
  const car: Choice[] = (res.items ?? []).map((it) => {
    const brand = it.part.manufacturer ?? null;
    const title = titleOf(brand, it.part.name);
    return {
      key: `car:${it.part.id}`,
      title,
      verified: it.confirmedFit === true,
      picked: {
        partId: it.part.id,
        brand,
        partNumber: it.part.oem_part_number ?? null,
        partLabel: title,
        partFit: "car",
      },
    };
  });
  const size: Choice[] = (res.universal ?? []).flatMap((sec) =>
    sec.items.map((u) => {
      const title = titleOf(u.manufacturer, u.name);
      return {
        key: `size:${u.id}`,
        title,
        verified: false,
        picked: {
          partId: null,
          brand: u.manufacturer ?? null,
          partNumber: u.partNumber ?? null,
          partLabel: title,
          partFit: "size" as const,
        },
      };
    }),
  );
  return { car, size };
}

export function PickPartDialog({
  open,
  onClose,
  vehicleId,
  vehicleLabel,
  partTypeId,
  partTypeName,
  current,
  onUse,
  gapsEnabled,
}: {
  /** LS-18: "Roam will look this part up…" under the typed-in form (Stitch F3). */
  gapsEnabled?: boolean;
  open: boolean;
  onClose: () => void;
  vehicleId: string;
  vehicleLabel: string;
  partTypeId: string | null;
  partTypeName: string;
  current: PickedPart | null;
  onUse: (picked: PickedPart) => void;
}) {
  const [res, setRes] = useState<CompatiblePartsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [typing, setTyping] = useState(false);
  const [brand, setBrand] = useState("");
  const [partNumber, setPartNumber] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!open) return;
    setSelected(current?.partId ? `car:${current.partId}` : null);
    // Reopen on the typed-in form only when a part was typed in before.
    setTyping(Boolean(current?.partLabel && !current.partId && !current.partFit));
    setBrand(current?.brand ?? "");
    setPartNumber(current?.partNumber ?? "");
  }, [open, current]);

  useEffect(() => {
    if (!open || !partTypeId) return;
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    api
      .getCompatibleParts(vehicleId, partTypeId)
      .then((r) => !cancelled && setRes(r))
      .catch(() => !cancelled && setFailed(true))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [open, vehicleId, partTypeId, attempt]);

  const { car, size } = choicesFromResponse(res);
  const all = [...car, ...size];
  const chosen = all.find((c) => c.key === selected) ?? null;
  const canUse = typing ? brand.trim().length > 0 : Boolean(chosen);

  const row = (c: Choice) => {
    const on = !typing && selected === c.key;
    return (
      <button
        key={c.key}
        type="button"
        role="radio"
        aria-checked={on}
        onClick={() => {
          setTyping(false);
          setSelected(c.key);
        }}
        className={`w-full text-left rounded-xl p-4 flex items-start justify-between gap-3 transition-colors ${
          on ? "bg-surface-container-high" : "bg-surface-container-lowest hover:bg-surface-container-low shadow-xs"
        }`}
      >
        <span className="flex items-center gap-3 min-w-0">
          <span
            className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
              on ? "border-black" : "border-outline-variant"
            }`}
          >
            {on ? <span className="w-2 h-2 rounded-full bg-black" /> : null}
          </span>
          <span className="text-sm font-medium text-on-surface">{c.title}</span>
        </span>
        <span
          className="text-[11px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1 shrink-0"
          style={
            c.verified
              ? { backgroundColor: `${ACCENT.greenFixed}66`, color: ACCENT.green }
              : { backgroundColor: ACCENT.peach, color: ACCENT.deepOrange }
          }
        >
          <span className="material-symbols-outlined text-[14px]">{c.verified ? "check" : "error"}</span>
          {c.verified ? COPY.verified : COPY.checkBeforeBuying}
        </span>
      </button>
    );
  };

  const heading = (t: string) => (
    <p className="text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant mt-2">{t}</p>
  );

  return (
    <ResponsiveDialog open={open} onOpenChange={(o) => !o && onClose()}>
      <ResponsiveDialogContent className="sm:max-w-[540px] rounded-2xl gap-3" data-testid="pick-part-dialog">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle className="text-xl font-semibold">{COPY.title}</ResponsiveDialogTitle>
          <ResponsiveDialogDescription>{COPY.subtitle(partTypeName, vehicleLabel)}</ResponsiveDialogDescription>
        </ResponsiveDialogHeader>

        <div className="flex flex-col gap-2 max-h-[55vh] overflow-y-auto" role="radiogroup">
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-stitch-secondary" />
            </div>
          ) : failed ? (
            <div className="rounded-xl bg-error-container/60 p-3 flex items-center justify-between gap-2">
              <span className="text-sm text-on-surface">{COPY.loadFail}</span>
              <button
                type="button"
                onClick={() => setAttempt((a) => a + 1)}
                className="bg-surface-container-lowest px-3 py-1.5 rounded-lg text-sm font-semibold"
              >
                {COPY.tryAgain}
              </button>
            </div>
          ) : (
            <>
              {car.length ? (
                <>
                  {heading(COPY.fitsYourCar)}
                  {car.map(row)}
                </>
              ) : null}
              {size.length ? (
                <>
                  {heading(COPY.fitsBySize)}
                  {size.map(row)}
                </>
              ) : null}
              {!all.length ? <p className="text-sm text-on-surface-variant py-2">{COPY.none}</p> : null}
            </>
          )}

          <button
            type="button"
            aria-pressed={typing}
            onClick={() => {
              setTyping((t) => !t);
              setSelected(null);
            }}
            className={`mt-1 w-full rounded-xl py-3 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
              typing ? "bg-surface-container-high text-on-surface" : "bg-surface-container-low hover:bg-surface-container text-on-surface"
            }`}
          >
            <span className="material-symbols-outlined text-[18px]">edit_note</span>
            {COPY.typeItIn}
          </button>
          {typing ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2" data-testid="pick-part-type-in">
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-on-surface-variant">{COPY.brand}</span>
                <input
                  autoFocus
                  className="h-10 px-3 rounded-lg bg-surface-container-low text-sm text-on-surface focus:outline-none"
                  value={brand}
                  maxLength={80}
                  onChange={(e) => setBrand(e.target.value)}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-on-surface-variant">{COPY.partNumber}</span>
                <input
                  className="h-10 px-3 rounded-lg bg-surface-container-low text-sm text-on-surface focus:outline-none"
                  value={partNumber}
                  maxLength={60}
                  onChange={(e) => setPartNumber(e.target.value)}
                />
              </label>
              {gapsEnabled ? <RoamLooksItUpLine className="sm:col-span-2" /> : null}
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-between pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-semibold text-error rounded-lg hover:bg-error-container/40">
            {COPY.cancel}
          </button>
          <button
            type="button"
            disabled={!canUse}
            onClick={() => {
              if (typing) {
                onUse({
                  partId: null,
                  brand: brand.trim(),
                  partNumber: partNumber.trim() || null,
                  partLabel: brand.trim(),
                  partFit: null,
                });
              } else if (chosen) {
                onUse(chosen.picked);
              }
            }}
            className="bg-black text-white px-5 py-2.5 rounded-lg text-sm font-semibold flex items-center gap-1.5 disabled:opacity-40"
          >
            {COPY.use}
            <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
          </button>
        </div>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
