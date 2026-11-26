/**
 * Shared part-picture pieces for Dominion (docs/part-pictures-audit.md §4 S1–S3, Stitch screens in
 * docs/stitch/part-pictures/dominion/): the square frame, the state pill, the large view and the Remake confirmation.
 * Exact colours only (globals.css remaps colour names in dark mode).
 */
import { useEffect, useState } from "react";
import { D_MONO, D_MUTED, D_TXT, DIcon, DPill } from "../parts-database/add-parts/catalog/dominionKit";
import { PartsButton } from "../parts-database/PartsButton";
import {
  hidePartPicture,
  remakePartPicture,
  showPartPicture,
  type PartPicture,
  type PictureWaitReason,
} from "./partPicturesApi";

export const PICTURE_COST = 0.04;
export const AI_LINE = "Made by AI from the maker's diagram";
export const NO_DIAGRAM_LINE = "Upload the page again as a single file to remake this";

export function plainDay(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "America/Jamaica" });
}

export function waitingLine(reason: PictureWaitReason): string {
  switch (reason) {
    case "off":
      return "AI pictures are off";
    case "budget":
      return "Today's budget is used up";
    case "key_refused":
      return "The picture service refused the key";
    case "paused":
      return "Paused for now";
    default:
      return "Waiting its turn";
  }
}

/** The one-word state, or null when there is no picture and nothing to say. */
export type PictureWord = "Made" | "Making" | "Waiting" | "Failed" | "Hidden from Fleet" | "No diagram";

export function pictureWord(p: PartPicture | null, noDiagram = false): PictureWord | null {
  if (!p) return noDiagram ? "No diagram" : null;
  switch (p.status) {
    case "made":
      return "Made";
    case "being_made":
      return "Making";
    case "waiting":
      return "Waiting";
    case "failed":
      return "Failed";
    case "hidden":
      return "Hidden from Fleet";
  }
}

export function PictureStatePill({ word }: { word: PictureWord }) {
  if (word === "Made") return <DPill tone="green">Made</DPill>;
  if (word === "Making") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-[#dbe1ff] px-2.5 py-0.5 text-[12px] font-semibold text-[#0153dc] dark:bg-[#1e3a8a]/50 dark:text-[#93b4ff]">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#0153dc] motion-reduce:animate-none dark:bg-[#93b4ff]" />
        Making
      </span>
    );
  }
  if (word === "Waiting") return <DPill tone="amber" icon="pause">Waiting</DPill>;
  if (word === "Failed") return <DPill tone="red">Failed</DPill>;
  if (word === "Hidden from Fleet") return <DPill tone="grey" icon="visibility_off">Hidden from Fleet</DPill>;
  return (
    <span className="inline-flex items-center rounded-full border border-[#c5c6d0] px-2.5 py-0.5 text-[12px] font-semibold text-[#5d5f68] dark:border-[#334155] dark:text-[#94a3b8]">
      No diagram
    </span>
  );
}

/** Square picture frame. With no picture: tint fill + outline part icon, never an empty box. */
export function PartPictureFrame({
  picture,
  size,
  icon = "category",
  onOpen,
  className = "",
}: {
  picture: PartPicture | null;
  size: number | "full";
  icon?: string;
  onOpen?: () => void;
  className?: string;
}) {
  const dim = size === "full" ? { width: "100%" } : { width: size, height: size };
  const hidden = picture?.status === "hidden";
  const src = picture?.url;
  const box = `relative flex aspect-square shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[#f3f4f6] dark:bg-[#1e293b] ${className}`;
  if (!src) {
    const making = picture?.status === "being_made";
    return (
      <div className={`${box} bg-[#f3f4fb] dark:bg-[#0b1220]`} style={dim} aria-hidden="true">
        <DIcon
          name={icon}
          className={`text-[#c5c6d0] dark:text-[#475569] ${making ? "animate-pulse motion-reduce:animate-none" : ""}`}
        />
      </div>
    );
  }
  const img = (
    <img
      src={src.src}
      srcSet={src.srcSet || undefined}
      alt={picture.partName ? `${picture.partName} ${picture.partNumber}` : picture.partNumber}
      loading="lazy"
      className={`h-full w-full object-cover ${hidden ? "opacity-40" : ""}`}
    />
  );
  if (!onOpen) return <div className={box} style={dim}>{img}</div>;
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Open the picture of ${picture.partNumber}`}
      className={`${box} cursor-zoom-in focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0153dc]`}
      style={dim}
    >
      {img}
    </button>
  );
}

/** Remake / Hide / Show with the in-app confirmation for Remake (PP-28). Returns the fresh picture. */
export function usePictureActions(onChanged: (p: PartPicture) => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmFor, setConfirmFor] = useState<PartPicture | null>(null);
  const run = async (fn: () => Promise<{ picture?: PartPicture }>) => {
    setBusy(true);
    setError(null);
    try {
      const r = await fn();
      if (r.picture) onChanged(r.picture);
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't work");
    } finally {
      setBusy(false);
    }
  };
  return {
    busy,
    error,
    askRemake: (p: PartPicture) => setConfirmFor(p),
    hide: (p: PartPicture) => run(() => hidePartPicture(p.id)),
    show: (p: PartPicture) => run(() => showPartPicture(p.id)),
    confirm: confirmFor ? (
      <RemakeConfirm
        busy={busy}
        onCancel={() => setConfirmFor(null)}
        onRemake={async () => {
          const p = confirmFor;
          await run(() => remakePartPicture(p.id));
          setConfirmFor(null);
        }}
      />
    ) : null,
  };
}

export function PictureButtons({
  picture,
  busy,
  onRemake,
  onHide,
  onShow,
  short = false,
}: {
  picture: PartPicture;
  busy: boolean;
  onRemake: () => void;
  onHide: () => void;
  onShow: () => void;
  short?: boolean;
}) {
  if (picture.status === "being_made" || picture.status === "waiting") return null;
  if (picture.status === "hidden") {
    return (
      <PartsButton variant="secondary" disabled={busy} onClick={onShow}>
        <DIcon name="visibility" className="text-[18px]" /> Show in Fleet
      </PartsButton>
    );
  }
  const canRemake = picture.hasDiagram;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap gap-2">
        <PartsButton variant="secondary" disabled={busy || !canRemake} onClick={onRemake}>
          <DIcon name="refresh" className="text-[18px]" /> Remake
        </PartsButton>
        {picture.status === "made" ? (
          <PartsButton variant="danger" disabled={busy} onClick={onHide}>
            <DIcon name="visibility_off" className="text-[18px]" /> {short ? "Hide" : "Hide from Fleet"}
          </PartsButton>
        ) : null}
      </div>
      {!canRemake ? <span className={`text-[12px] ${D_MUTED}`}>{NO_DIAGRAM_LINE}</span> : null}
    </div>
  );
}

function Dialog({ children, onClose, width = 560, label }: { children: React.ReactNode; onClose: () => void; width?: number; label: string }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-[#0f172a]/40 p-4" role="dialog" aria-modal="true" aria-label={label}>
      <div className="max-h-[92vh] w-full overflow-y-auto rounded-[20px] bg-white p-8 shadow-xl dark:bg-[#111a2e]" style={{ maxWidth: width }}>
        {children}
      </div>
    </div>
  );
}

export function RemakeConfirm({ busy, onCancel, onRemake }: { busy: boolean; onCancel: () => void; onRemake: () => void }) {
  return (
    <Dialog onClose={onCancel} label="Make this picture again?">
      <span className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-full bg-[#dbe1ff] text-[#0153dc] dark:bg-[#1e3a8a]/50 dark:text-[#93b4ff]">
        <DIcon name="refresh" className="text-[28px]" />
      </span>
      <h2 className={`text-[22px] font-semibold ${D_TXT}`}>Make this picture again?</h2>
      <p className={`mt-2 text-[15px] ${D_MUTED}`}>About US${PICTURE_COST.toFixed(2)}. The old picture stays for 30 days.</p>
      <div className="mt-6 flex justify-end gap-3">
        <PartsButton variant="danger" onClick={onCancel} disabled={busy}>Cancel</PartsButton>
        <PartsButton variant="primary" onClick={onRemake} disabled={busy}>
          <DIcon name="refresh" className="text-[18px]" /> Remake
        </PartsButton>
      </div>
    </Dialog>
  );
}

/** Screen 7: the large view. */
export function PartPictureOverlay({
  picture,
  onClose,
  actions,
}: {
  picture: PartPicture;
  onClose: () => void;
  actions?: React.ReactNode;
}) {
  const src = picture.urlDetail ?? picture.url;
  const word = pictureWord(picture);
  return (
    <Dialog onClose={onClose} width={720} label={`Picture of ${picture.partNumber}`}>
      <div className="aspect-square w-full overflow-hidden rounded-2xl bg-[#f3f4f6] dark:bg-[#1e293b]">
        {src ? (
          <img
            src={src.src}
            srcSet={src.srcSet || undefined}
            alt={`${picture.partName} ${picture.partNumber}`}
            className={`h-full w-full object-contain ${picture.status === "hidden" ? "opacity-40" : ""}`}
          />
        ) : null}
      </div>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
        <h2 className={`text-[20px] font-semibold ${D_TXT}`}>
          {picture.partName} <span className={`ml-1 ${D_MONO}`}>{[picture.manufacturer, picture.partNumber].filter(Boolean).join(" ")}</span>
        </h2>
        {word ? <PictureStatePill word={word} /> : null}
      </div>
      <p className={`mt-1 text-[14px] ${D_MUTED}`}>
        {[
          AI_LINE,
          plainDay(picture.madeAt),
          `version ${picture.version}`,
          picture.catalogGroup && picture.templateVersion ? `${picture.catalogGroup.name} template version ${picture.templateVersion}` : null,
        ].filter(Boolean).join(" · ")}
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div>{actions}</div>
        <PartsButton variant="primary" onClick={onClose}>Close</PartsButton>
      </div>
    </Dialog>
  );
}
