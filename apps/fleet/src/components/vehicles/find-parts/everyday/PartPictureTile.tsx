/**
 * F1 — the part picture in every Find parts answer (docs/part-pictures-audit.md §4 F1, Stitch screens in
 * docs/stitch/part-pictures/fleet/, Keep / Drop / Add in §4b). One shared tile: the AI photo with its caption,
 * or today's drawing when there is none (never an empty box, never a broken image). Tap → in-app large view.
 */
import { useEffect, useState, type ReactNode } from "react";
import { MONO, MUTED, SBtn, TILE, TXT } from "./stitchKit";

export type FleetPartPicture = { url: { src: string; srcSet: string }; urlDetail: { src: string; srcSet: string } } | null;

export const PICTURE_CAPTION = "Picture made by AI from the maker's diagram — the real part may look different.";

export function PartPictureTile({
  picture,
  fallback,
  partName,
  partNumber,
  className = "",
  minHeight = 260,
  square = false,
}: {
  picture: FleetPartPicture | undefined;
  fallback: ReactNode;
  partName: string;
  partNumber: string;
  className?: string;
  minHeight?: number;
  /** Multi-card answers: the drawing tile is the same square as a photo, with a large drawing (never a near-empty box). */
  square?: boolean | "small";
}) {
  const [loaded, setLoaded] = useState(false);
  const [broken, setBroken] = useState(false);
  const [open, setOpen] = useState(false);
  const src = picture?.url;
  useEffect(() => {
    setLoaded(false);
    setBroken(false);
  }, [src?.src]);
  const showPhoto = Boolean(src) && !broken;

  return (
    <div className={`flex w-full flex-col gap-2 ${className}`} data-testid="part-picture-tile">
      {showPhoto ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={`See the picture of ${partName} larger`}
          className={`${TILE} relative flex aspect-square w-full items-center justify-center overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-[#030213] dark:bg-[#3a3a3d] dark:focus-visible:ring-[#fafafa]`}
        >
          {!loaded ? <span className="absolute inset-0 flex items-center justify-center p-6">{fallback}</span> : null}
          <img
            src={src!.src}
            srcSet={src!.srcSet || undefined}
            alt={`${partName} ${partNumber}`}
            loading="lazy"
            onLoad={() => setLoaded(true)}
            onError={() => setBroken(true)}
            className={`h-full w-full object-cover transition-opacity ${loaded ? "opacity-100" : "opacity-0"}`}
          />
        </button>
      ) : (
        <div
          className={`${TILE} group relative flex w-full flex-col items-center justify-center overflow-hidden p-6 dark:bg-[#2a2a2d] ${square === "small" ? "aspect-square p-2 [&_.material-symbols-outlined]:!text-[48px] [&_.material-symbols-outlined]:!text-[#94a3b8]" : square ? "aspect-square [&_.material-symbols-outlined]:!text-[96px] [&_.material-symbols-outlined]:!text-[#94a3b8] dark:[&_.material-symbols-outlined]:!text-[#71717a]" : ""}`}
          style={square ? undefined : { minHeight }}
        >
          {fallback}
        </div>
      )}
      {showPhoto ? (
        <p className={`text-[13px] leading-snug ${MUTED}`} data-testid="part-picture-caption">{PICTURE_CAPTION}</p>
      ) : null}
      {open && picture ? (
        <PartPictureLargeView picture={picture} partName={partName} partNumber={partNumber} onClose={() => setOpen(false)} />
      ) : null}
    </div>
  );
}

function PartPictureLargeView({
  picture,
  partName,
  partNumber,
  onClose,
}: {
  picture: NonNullable<FleetPartPicture>;
  partName: string;
  partNumber: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const src = picture.urlDetail ?? picture.url;
  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-[#0b1c30]/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Picture of ${partName}`}
      data-testid="part-picture-large-view"
    >
      <div className="max-h-[94vh] w-full max-w-[680px] overflow-y-auto rounded-[24px] bg-white p-6 shadow-xl dark:bg-[#2a2a2d]">
        <div className="aspect-square w-full overflow-hidden rounded-2xl bg-[#f1f5f9] dark:bg-[#3a3a3d]">
          <img src={src.src} srcSet={src.srcSet || undefined} alt={`${partName} ${partNumber}`} className="h-full w-full object-contain" />
        </div>
        <p className={`mt-4 text-[20px] font-semibold ${TXT}`}>{partName}</p>
        <p className={`${MONO} text-[18px] ${TXT}`}>{partNumber}</p>
        <p className={`mt-2 text-[14px] ${MUTED}`}>{PICTURE_CAPTION}</p>
        <div className="mt-5 flex justify-end">
          <SBtn kind="primary" onClick={onClose}>Close</SBtn>
        </div>
      </div>
    </div>
  );
}
