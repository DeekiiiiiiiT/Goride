/**
 * Dominion → Vehicles → Vehicle pictures (audit §5.2 D1–D7, Stitch Keep/Drop/Add §18.1).
 * Rev 6 rule: Dominion shows only its own data — no fleet names, plates, drivers, vehicle counts or "used by".
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { D_CARD, D_MUTED, D_TINT, D_TXT, DIcon, DPill } from "../../parts-database/add-parts/catalog/dominionKit";
import { PartsButton } from "../../parts-database/PartsButton";
import {
  getPicture,
  listPictures,
  previewRemake,
  ratePicture,
  regeneratePicture,
  removePicture,
  replacePicture,
  restorePicture,
  setAiPictures,
  startRemake,
  type AdminPicture,
  type AdminPictureDetail,
  type AdminPictureList,
  type PictureFilters,
  type RemakePreview,
} from "./vehiclePicturesApi";
import "../../parts-database/partsDatabase.css";

export const PICTURE_COLOURS = [
  "white", "pearl white", "black", "silver", "grey", "dark grey", "blue", "dark blue",
  "red", "maroon", "green", "brown", "beige", "gold", "yellow", "orange",
] as const;

const SWATCH: Record<string, string> = {
  white: "#ffffff", "pearl white": "#f7f4ec", black: "#111111", silver: "#c0c4c8", grey: "#8a8f96",
  "dark grey": "#4b5058", blue: "#2563eb", "dark blue": "#1e3a8a", red: "#dc2626", maroon: "#7f1d1d",
  green: "#15803d", brown: "#78350f", beige: "#d6c7a1", gold: "#c9a227", yellow: "#facc15", orange: "#f97316",
};

const PAGE_SIZE = 24;
const PICTURE_COST = 0.04;

export const colourName = (c: string) => c.replace(/\b\w/g, (ch) => ch.toUpperCase());

export function plainDay(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
}

const money = (n: number) => `US$${n.toFixed(2)}`;

const UPPER_MAKES = new Set(["bmw", "mg", "byd", "gmc", "jac", "baic", "gac", "faw", "dfsk"]);

/** Picture rows keep names lower case (they are part of the look key); show them as people write them. */
function displayName(raw: string, isMake: boolean): string {
  return raw.trim().split(/\s+/).map((word) => {
    if (isMake && UPPER_MAKES.has(word.toLowerCase())) return word.toUpperCase();
    return word.split("-").map((part) => {
      if (/\d/.test(part) || (/^[a-z]{1,2}$/i.test(part) && word.includes("-"))) return part.toUpperCase();
      return part.charAt(0).toUpperCase() + part.slice(1);
    }).join("-");
  }).join(" ");
}

export function carTitle(p: Pick<AdminPicture, "make" | "model">) {
  return `${displayName(p.make, true)} ${displayName(p.model, false)}`;
}

export function carLine(p: Pick<AdminPicture, "generation" | "startYear" | "endYear" | "bodyType">) {
  const years = p.startYear ? `${p.startYear}–${p.endYear ?? "now"}` : "";
  return [p.generation, years, p.bodyType].filter(Boolean).join(" · ");
}

/** "Made 16 Nov 2026 · AI" / "Queued · AI" / "Being made · AI". */
export function madeLine(p: AdminPicture) {
  const how = p.source === "upload" ? "Uploaded" : "AI";
  if (p.status === "queued") return `Queued · ${how}`;
  if (p.status === "generating") return `Being made · ${how}`;
  if (!p.madeAt) return how;
  return `Made ${plainDay(p.madeAt)} · ${how}`;
}

/** Restore is offered while the newest retired version still has its file and is ≤ 30 days old (§3.7). */
export function restorableVersion(d: AdminPictureDetail, now = new Date()) {
  const retired = d.versions
    .filter((v) => v.retiredAt && v.url)
    .sort((a, b) => b.version - a.version)[0];
  if (!retired?.retiredAt) return null;
  const age = now.getTime() - new Date(retired.retiredAt).getTime();
  return age <= 30 * 24 * 60 * 60 * 1000 ? retired : null;
}

// ─── small pieces ─────────────────────────────────────────────

function ColourChip({ colour }: { colour: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-[13px] ${D_TXT}`}>
      <span
        className="h-3 w-3 shrink-0 rounded-full border border-[#c9ccd6] dark:border-[#475569]"
        style={{ background: SWATCH[colour] ?? "#e6e7ee" }}
        aria-hidden
      />
      {colourName(colour)}
    </span>
  );
}

function StatusPill({ status }: { status: AdminPicture["status"] }) {
  if (status === "ready") return <DPill tone="green" icon="check_circle">Ready</DPill>;
  if (status === "failed") return <DPill tone="red" icon="error">Failed</DPill>;
  return <DPill tone="blue">{status === "queued" ? "Queued" : "Being made"}</DPill>;
}

function RatingPill({ rating }: { rating: AdminPicture["rating"] }) {
  if (rating === "good") return <DPill tone="green" icon="thumb_up">Looks good</DPill>;
  if (rating === "wrong") return <DPill tone="red" icon="thumb_down">Looks wrong</DPill>;
  return null;
}

function CarOutline({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 160 70" className={className} fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
      <path d="M12 50 L18 34 Q22 28 32 27 L52 25 Q62 12 82 12 L104 12 Q118 12 128 26 L144 30 Q152 32 152 42 L152 50" strokeLinejoin="round" />
      <path d="M8 50 H152" strokeLinecap="round" />
      <circle cx="42" cy="52" r="9" />
      <circle cx="122" cy="52" r="9" />
      <path d="M60 25 H122" />
    </svg>
  );
}

function PictureBox({ p, large }: { p: AdminPicture; large?: boolean }) {
  const ratio = "aspect-[4/3]";
  if (p.status === "ready" && p.url) {
    return (
      <div className={`${ratio} w-full overflow-hidden rounded-xl bg-[#f7f8fc] dark:bg-[#0b1220]`}>
        <img
          src={p.url.src}
          srcSet={p.url.srcSet || undefined}
          sizes={large ? "560px" : "(min-width: 1024px) 25vw, 100vw"}
          alt={`Studio picture of a ${colourName(p.color)} ${carTitle(p)}`}
          className="h-full w-full object-contain"
          loading="lazy"
        />
      </div>
    );
  }
  if (p.status === "failed") {
    return (
      <div className={`${ratio} flex w-full flex-col items-center justify-center gap-2 rounded-xl bg-[#fdecec] text-[#a83836] dark:bg-[#450a0a]/60 dark:text-[#f87171]`}>
        <DIcon name="warning" className="text-[28px]" />
        <span className="text-[14px] font-medium">Picture failed</span>
      </div>
    );
  }
  const making = p.status === "queued" || p.status === "generating";
  return (
    <div className={`${ratio} flex w-full flex-col items-center justify-center gap-3 rounded-xl bg-[#f3f4fb] text-[#a4a7b3] dark:bg-[#0b1220] dark:text-[#475569]`}>
      <CarOutline className="w-1/2" />
      {making ? (
        <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[#0153dc] dark:text-[#93b4ff]">
          <span className="h-2 w-2 rounded-full bg-[#0153dc] motion-safe:animate-pulse dark:bg-[#93b4ff]" />
          {p.status === "queued" ? "Waiting its turn" : "Making the picture…"}
        </span>
      ) : null}
    </div>
  );
}

function Overlay({ children, label, onClose }: { children: ReactNode; label: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-[#090d16]/45 p-4 backdrop-blur-[2px]" role="dialog" aria-modal="true" aria-label={label}>
      <div className={`${D_CARD} w-full max-w-[560px] p-6 shadow-xl`}>{children}</div>
    </div>
  );
}

function DialogHead({ icon, title, onClose }: { icon: string; title: string; onClose: () => void }) {
  return (
    <div className="mb-5 flex items-start gap-4">
      <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#dbe1ff] text-[#0153dc] dark:bg-[#1e3a8a]/40 dark:text-[#93b4ff]">
        <DIcon name={icon} className="text-[24px]" />
      </span>
      <h2 className={`flex-1 pt-2 text-[20px] font-semibold ${D_TXT}`}>{title}</h2>
      <PartsButton variant="icon" aria-label="Close" onClick={onClose}>
        <DIcon name="close" className="text-[20px]" />
      </PartsButton>
    </div>
  );
}

function PictureRow({ p }: { p: AdminPicture }) {
  return (
    <div className={`${D_TINT} mb-5 flex items-center gap-4 p-3`}>
      <div className="w-28 shrink-0"><PictureBox p={p} /></div>
      <div className="min-w-0">
        <div className={`truncate text-[15px] font-semibold ${D_TXT}`}>{carTitle(p)}</div>
        <div className={`truncate text-[13px] ${D_MUTED}`}>{carLine(p)}</div>
        <div className="mt-1"><ColourChip colour={p.color} /></div>
      </div>
    </div>
  );
}

function ErrorLine({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <p role="alert" className="mt-3 rounded-lg bg-[#fdecec] px-3 py-2 text-[13px] text-[#a83836] dark:bg-[#450a0a] dark:text-[#f87171]">
      {text}
    </p>
  );
}

// ─── dialogs D3, D5, Remake ───────────────────────────────────

function RegenerateDialog({ p, onClose, onDone }: { p: AdminPicture; onClose: () => void; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const go = async () => {
    setBusy(true);
    setErr(null);
    try {
      await regeneratePicture(p.id);
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not start a new picture");
      setBusy(false);
    }
  };
  return (
    <Overlay label="Make a new picture" onClose={onClose}>
      <DialogHead icon="auto_fix_high" title="Make a new picture?" onClose={onClose} />
      <PictureRow p={p} />
      <p className={`text-[15px] leading-relaxed ${D_TXT}`}>
        Make a new picture for {colourName(p.color)} {carTitle(p)}{p.generation ? ` (${p.generation})` : ""}? About US$0.04.
        The new one replaces it everywhere. You can restore this one for 30 days.
      </p>
      <ErrorLine text={err} />
      <div className="mt-6 flex justify-end gap-2">
        <PartsButton variant="danger" onClick={onClose}>Cancel</PartsButton>
        <PartsButton variant="primary" disabled={busy} onClick={go}>
          {busy ? "Starting…" : "Make new picture"}
        </PartsButton>
      </div>
    </Overlay>
  );
}

function RemoveDialog({ p, onClose, onDone }: { p: AdminPicture; onClose: () => void; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const go = async () => {
    setBusy(true);
    setErr(null);
    try {
      await removePicture(p.id);
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not remove the picture");
      setBusy(false);
    }
  };
  return (
    <Overlay label="Remove picture" onClose={onClose}>
      <DialogHead icon="delete" title="Remove this picture?" onClose={onClose} />
      <PictureRow p={p} />
      <p className={`text-[15px] leading-relaxed ${D_TXT}`}>
        Remove this picture? It will be deleted after 30 days. If it's needed again later, Roam will make a new one.
      </p>
      <ErrorLine text={err} />
      <div className="mt-6 flex justify-end gap-2">
        <PartsButton variant="secondary" onClick={onClose}>Cancel</PartsButton>
        <PartsButton variant="danger" confirm disabled={busy} onClick={go}>
          {busy ? "Removing…" : "Remove picture"}
        </PartsButton>
      </div>
    </Overlay>
  );
}

/** "about N will finish this month, the rest from 1 Dec" (§5.2 D1). */
export function remakeBudgetSentence(preview: RemakePreview, spend: { usedUsd: number; budgetUsd: number }, now = new Date()) {
  const left = Math.max(0, spend.budgetUsd - spend.usedUsd);
  if (preview.fitsThisMonth) return null;
  const fit = Math.floor(left / PICTURE_COST);
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const nextLabel = next.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  return `This month has ${money(left)} of picture budget left. About ${fit.toLocaleString()} pictures will be remade this month; the rest continue from ${nextLabel}.`;
}

function hoursLabel(h: number) {
  if (h < 1) return `About ${Math.max(1, Math.round(h * 60))} minutes`;
  return `About ${Math.round(h)} hour${Math.round(h) === 1 ? "" : "s"}`;
}

function RemakeDialog({
  spend,
  onClose,
  onDone,
}: {
  spend: { usedUsd: number; budgetUsd: number };
  onClose: () => void;
  onDone: (queued: number) => void;
}) {
  const [preview, setPreview] = useState<RemakePreview | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    previewRemake().then(setPreview, (e) => setErr(e instanceof Error ? e.message : "Could not count the pictures"));
  }, []);
  const go = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await startRemake();
      onDone(r.queued);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not start remaking");
      setBusy(false);
    }
  };
  const warn = preview ? remakeBudgetSentence(preview, spend) : null;
  const pct = spend.budgetUsd > 0 ? Math.min(100, (spend.usedUsd / spend.budgetUsd) * 100) : 0;
  return (
    <Overlay label="Remake older pictures" onClose={onClose}>
      <DialogHead icon="auto_fix_high" title="Remake older pictures?" onClose={onClose} />
      {!preview && !err ? <p className={`text-[14px] ${D_MUTED}`}>Counting pictures…</p> : null}
      {preview ? (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Tile big={preview.count.toLocaleString()} small={preview.count === 1 ? "picture" : "pictures"} />
            <Tile big={`About ${money(preview.costUsd)}`} small="Estimated cost" note="~US$0.04 / picture" />
            <Tile big={hoursLabel(preview.hours)} small="Time to finish" />
          </div>
          {warn ? (
            <div className="mt-4 rounded-xl bg-[#fff4dc] p-4 text-[14px] text-[#5c3d00] dark:bg-[#451a03] dark:text-[#fde68a]">
              <div className="flex gap-2">
                <DIcon name="schedule" className="text-[20px]" />
                <p>{warn}</p>
              </div>
              <div className="mt-3 flex justify-between text-[12px]">
                <span>Spent: {money(spend.usedUsd)} / {money(spend.budgetUsd)}</span>
                <span>{money(Math.max(0, spend.budgetUsd - spend.usedUsd))} left</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[#f6dfae] dark:bg-[#78350f]">
                <div className="h-full rounded-full bg-[#c2410c]" style={{ width: `${pct}%` }} />
              </div>
            </div>
          ) : null}
          <p className={`mt-4 text-[15px] leading-relaxed ${D_TXT}`}>
            New pictures always come first — this runs in the background. Every picture can be restored for 30 days.
          </p>
        </>
      ) : null}
      <ErrorLine text={err} />
      <div className="mt-6 flex justify-end gap-2">
        <PartsButton variant="danger" onClick={onClose}>Cancel</PartsButton>
        <PartsButton variant="primary" disabled={!preview || preview.count === 0 || busy} onClick={go}>
          {busy ? "Starting…" : "Start remaking"}
        </PartsButton>
      </div>
    </Overlay>
  );
}

function Tile({ big, small, note }: { big: string; small: string; note?: string }) {
  return (
    <div className={`${D_TINT} p-4`}>
      <div className={`text-[22px] font-semibold ${D_TXT}`}>{big}</div>
      <div className={`text-[13px] ${D_MUTED}`}>{small}</div>
      {note ? <div className="mt-2 inline-block rounded bg-[#e6f4ea] px-1.5 py-0.5 text-[12px] text-[#006e31] dark:bg-[#14532d]/60 dark:text-[#4ade80]">{note}</div> : null}
    </div>
  );
}

// ─── D4 upload replacement (inside the drawer) ────────────────

const UPLOAD_TYPES = ["image/png", "image/jpeg", "image/webp"];
const UPLOAD_MAX = 5 * 1024 * 1024;

export function uploadProblem(file: File): string | null {
  if (!UPLOAD_TYPES.includes(file.type)) return "Use a PNG, JPEG or WebP picture.";
  if (file.size > UPLOAD_MAX) return "That picture is bigger than 5 MB.";
  return null;
}

function ReplacePanel({ p, onCancel, onDone }: { p: AdminPicture; onCancel: () => void; onDone: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const pick = (f: File | undefined) => {
    if (!f) return;
    const problem = uploadProblem(f);
    setErr(problem);
    if (problem) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };
  const go = async () => {
    if (!file) return;
    setBusy(true);
    setErr(null);
    try {
      await replacePicture(p.id, file);
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not upload the picture");
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-col gap-5">
      <h3 className={`flex items-center gap-2 text-[18px] font-semibold ${D_TXT}`}>
        <DIcon name="add_photo_alternate" className="text-[22px] text-[#0153dc]" /> Upload a replacement picture
      </h3>
      <div
        className="flex flex-col items-center gap-2 rounded-xl border-2 border-[#e6e7ee] bg-[#f8f9ff] p-6 text-center dark:border-[#334155] dark:bg-[#0b1220]"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          pick(e.dataTransfer.files?.[0]);
        }}
      >
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-[#dbe1ff] text-[#0153dc] dark:bg-[#1e3a8a]/40 dark:text-[#93b4ff]">
          <DIcon name="cloud_upload" className="text-[24px]" />
        </span>
        <div className={`text-[15px] font-semibold ${D_TXT}`}>Drop a PNG, JPEG or WebP here</div>
        <div className={`text-[13px] ${D_MUTED}`}>Up to 5 MB</div>
        <PartsButton variant="primary" onClick={() => input.current?.click()}>
          <DIcon name="upload" className="text-[18px]" /> Choose file
        </PartsButton>
        <input
          ref={input}
          type="file"
          accept={UPLOAD_TYPES.join(",")}
          aria-label="Choose picture file"
          className="sr-only"
          onChange={(e) => pick(e.target.files?.[0])}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className={`${D_TINT} p-3`}>
          <div className={`mb-2 text-[13px] font-medium ${D_TXT}`}>Now</div>
          <PictureBox p={p} />
        </div>
        <div className={`${D_TINT} p-3`}>
          <div className={`mb-2 text-[13px] font-medium ${D_TXT}`}>New</div>
          {preview ? (
            <div className="aspect-[4/3] w-full overflow-hidden rounded-xl bg-[#f7f8fc] dark:bg-[#0b1220]">
              <img src={preview} alt="New picture" className="h-full w-full object-contain" />
            </div>
          ) : (
            <div className={`flex aspect-[4/3] items-center justify-center rounded-xl bg-white text-[13px] dark:bg-[#111a2e] ${D_MUTED}`}>
              No file yet
            </div>
          )}
        </div>
      </div>
      <p className={`flex gap-2 rounded-xl bg-[#f3f4fb] p-3 text-[13px] dark:bg-[#0b1220] ${D_TXT}`}>
        <DIcon name="info" className="text-[18px] text-[#0153dc]" />
        Best results: the car facing right, level, on a plain clean white background.
      </p>
      <ErrorLine text={err} />
      <div className="flex justify-end gap-2">
        <PartsButton variant="danger" onClick={onCancel}>Cancel</PartsButton>
        <PartsButton variant="primary" disabled={!file || busy} onClick={go}>
          {busy ? "Uploading…" : "Use this picture"}
        </PartsButton>
      </div>
    </div>
  );
}

// ─── D2 drawer ────────────────────────────────────────────────

function PictureDrawer({
  id,
  onClose,
  onChanged,
}: {
  id: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [detail, setDetail] = useState<AdminPictureDetail | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [actionErr, setActionErr] = useState<string | null>(null);
  const [mode, setMode] = useState<"view" | "replace">("view");
  const [dialog, setDialog] = useState<"regenerate" | "remove" | null>(null);
  const [offerRegen, setOfferRegen] = useState(false);

  const load = useCallback(() => {
    setLoadErr(null);
    getPicture(id).then(setDetail, (e) => setLoadErr(e instanceof Error ? e.message : "Could not load this picture"));
  }, [id]);
  useEffect(load, [load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !dialog && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dialog, onClose]);

  const afterChange = () => {
    setDialog(null);
    setMode("view");
    onChanged();
    load();
  };

  const rate = async (rating: "good" | "wrong") => {
    setActionErr(null);
    try {
      await ratePicture(id, rating);
      setOfferRegen(rating === "wrong");
      setDetail((d) => (d ? { ...d, picture: { ...d.picture, rating } } : d));
      onChanged();
    } catch (e) {
      setActionErr(e instanceof Error ? e.message : "Could not save");
    }
  };

  const restore = async () => {
    setActionErr(null);
    try {
      await restorePicture(id);
      afterChange();
    } catch (e) {
      setActionErr(e instanceof Error ? e.message : "Could not restore");
    }
  };

  const p = detail?.picture;
  const previous = detail ? restorableVersion(detail) : null;
  const how = detail?.howMade;

  return (
    <>
      <div className="fixed inset-0 z-[80] bg-[#090d16]/40 backdrop-blur-[2px]" onClick={onClose} aria-hidden />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Picture"
        className="fixed inset-y-0 right-0 z-[85] flex w-full max-w-[640px] flex-col bg-white shadow-2xl dark:bg-[#0f172a]"
      >
        <header className="flex items-start gap-3 border-b border-[#e6e7ee] p-5 dark:border-[#1e293b]">
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#f3f4fb] text-[#30323b] dark:bg-[#1e293b] dark:text-[#e2e8f0]">
            <DIcon name="directions_car" className="text-[22px]" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className={`text-[19px] font-semibold ${D_TXT}`}>{p ? carTitle(p) : "Picture"}</h2>
            {p ? <div className={`text-[14px] ${D_MUTED}`}>{carLine(p)}</div> : null}
            {p ? (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-[#e6e7ee] px-2.5 py-0.5 dark:border-[#334155]"><ColourChip colour={p.color} /></span>
                <StatusPill status={p.status} />
                <RatingPill rating={p.rating} />
                {p.stale ? <DPill tone="amber">Stale look</DPill> : null}
              </div>
            ) : null}
          </div>
          <PartsButton variant="icon" aria-label="Close" onClick={onClose}>
            <DIcon name="close" className="text-[20px]" />
          </PartsButton>
        </header>

        <div className="flex-1 overflow-y-auto p-5">
          {loadErr ? (
            <div className={`${D_CARD} flex flex-col items-center gap-3 p-6 text-center`}>
              <p className={D_TXT}>{loadErr}</p>
              <PartsButton variant="secondary" onClick={load}>Try again</PartsButton>
            </div>
          ) : !detail || !p ? (
            <div className="aspect-[4/3] w-full animate-pulse rounded-xl bg-[#eef0f6] dark:bg-[#1e293b]" />
          ) : mode === "replace" ? (
            <ReplacePanel p={p} onCancel={() => setMode("view")} onDone={afterChange} />
          ) : (
            <div className="flex flex-col gap-5">
              <div className={`${D_CARD} p-4`}>
                <PictureBox p={{ ...p, url: detail.versions.find((v) => !v.retiredAt)?.url ?? p.url }} large />
                {p.status === "ready" ? (
                  <div className={`${D_TINT} mt-4 p-4`}>
                    <div className={`mb-3 text-[15px] font-semibold ${D_TXT}`}>Is this picture right?</div>
                    <div className="grid grid-cols-2 gap-2">
                      <PartsButton variant="secondary" aria-pressed={p.rating === "good"} onClick={() => rate("good")}>
                        <DIcon name="thumb_up" className="text-[18px] text-[#006e31]" /> Looks good
                      </PartsButton>
                      <PartsButton variant="secondary" aria-pressed={p.rating === "wrong"} onClick={() => rate("wrong")}>
                        <DIcon name="thumb_down" className="text-[18px] text-[#a83836]" /> Looks wrong
                      </PartsButton>
                    </div>
                    {offerRegen ? (
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[#fff4dc] px-3 py-2 text-[13px] text-[#5c3d00] dark:bg-[#451a03] dark:text-[#fde68a]">
                        Marked as wrong. Make a new one?
                        <PartsButton variant="primary" onClick={() => setDialog("regenerate")}>Regenerate</PartsButton>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>

              <section className={`${D_CARD} p-4`}>
                <h3 className={`mb-3 text-[15px] font-semibold ${D_TXT}`}>How it was made</h3>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[14px]">
                  <Fact label="Made by" value={p.source === "upload" ? "Uploaded by Roam staff" : "AI"} />
                  <Fact label="Made on" value={plainDay(how?.madeAt) || "Not yet"} />
                  <Fact label="Prompt version" value={how?.promptVersion != null ? String(how.promptVersion) : "—"} />
                  <Fact label="Model" value={how?.aiModel || "—"} />
                  <Fact label="Cost" value={how?.costUsd != null ? money(Number(how.costUsd)) : "—"} />
                  <Fact label="Tries" value={how?.attempts != null ? String(how.attempts) : "—"} />
                </dl>
                {how?.lastError ? (
                  <p className="mt-3 rounded-lg bg-[#fdecec] px-3 py-2 text-[13px] text-[#a83836] dark:bg-[#450a0a] dark:text-[#f87171]">
                    Last problem: {how.lastError}
                  </p>
                ) : null}
              </section>

              <section className={`${D_CARD} p-4`}>
                <h3 className={`mb-3 text-[15px] font-semibold ${D_TXT}`}>Versions</h3>
                {detail.versions.length === 0 ? (
                  <p className={`text-[14px] ${D_MUTED}`}>No earlier versions.</p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {[...detail.versions].sort((a, b) => b.version - a.version).map((v) => (
                      <li key={v.version} className={`${D_TINT} flex items-center gap-3 p-2`}>
                        <div className="w-20 shrink-0">
                          {v.url ? (
                            <img src={v.url.src} alt={`Version ${v.version}`} className="aspect-[4/3] w-full rounded-lg bg-white object-contain dark:bg-[#111a2e]" />
                          ) : (
                            <div className={`flex aspect-[4/3] items-center justify-center rounded-lg bg-white text-[11px] dark:bg-[#111a2e] ${D_MUTED}`}>Deleted</div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1 text-[14px]">
                          <div className={`font-medium ${D_TXT}`}>Version {v.version} · {v.source === "upload" ? "Uploaded" : "AI"}</div>
                          <div className={D_MUTED}>{plainDay(v.createdAt)}</div>
                        </div>
                        {v.retiredAt ? <DPill tone="grey">Previous</DPill> : <DPill tone="green">Current</DPill>}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
              <ErrorLine text={actionErr} />
            </div>
          )}
        </div>

        {detail && p && mode === "view" ? (
          <footer className="flex flex-col gap-2 border-t border-[#e6e7ee] p-4 dark:border-[#1e293b]">
            <div className="flex flex-wrap items-center gap-2">
              <PartsButton variant="secondary" onClick={() => setDialog("regenerate")}>
                <DIcon name="auto_fix_high" className="text-[18px]" /> Regenerate
              </PartsButton>
              <PartsButton variant="secondary" onClick={() => setMode("replace")}>
                <DIcon name="upload" className="text-[18px]" /> Upload replacement
              </PartsButton>
              {previous ? (
                <PartsButton variant="secondary" onClick={restore}>
                  <DIcon name="history" className="text-[18px]" /> Restore previous
                </PartsButton>
              ) : null}
              <PartsButton
                variant="danger"
                disabled={detail.inUse}
                aria-describedby={detail.inUse ? "remove-hint" : undefined}
                onClick={() => setDialog("remove")}
              >
                Remove picture
              </PartsButton>
              <PartsButton variant="secondary" className="ml-auto" onClick={onClose}>Close</PartsButton>
            </div>
            {detail.inUse ? (
              <p id="remove-hint" className={`text-[13px] ${D_MUTED}`}>
                Apps already use this picture — regenerate or replace it instead.
              </p>
            ) : null}
          </footer>
        ) : null}
      </aside>
      {dialog === "regenerate" && p ? <RegenerateDialog p={p} onClose={() => setDialog(null)} onDone={afterChange} /> : null}
      {dialog === "remove" && p ? (
        <RemoveDialog
          p={p}
          onClose={() => setDialog(null)}
          onDone={() => {
            setDialog(null);
            onChanged();
            onClose();
          }}
        />
      ) : null}
    </>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className={`text-[12px] ${D_MUTED}`}>{label}</dt>
      <dd className={`font-medium ${D_TXT}`}>{value}</dd>
    </div>
  );
}

// ─── D1 gallery ───────────────────────────────────────────────

function CountTile({
  label,
  value,
  tone,
  active,
  onClick,
}: {
  label: string;
  value: number;
  tone: "green" | "blue" | "red" | "amber";
  active: boolean;
  onClick: () => void;
}) {
  const bar = { green: "bg-[#006e31]", blue: "bg-[#0153dc]", red: "bg-[#a83836]", amber: "bg-[#d97706]" }[tone];
  const icon = { green: "check_circle", blue: "autorenew", red: "error", amber: "history" }[tone];
  const iconColour = {
    green: "text-[#006e31] dark:text-[#4ade80]",
    blue: "text-[#0153dc] dark:text-[#93b4ff]",
    red: "text-[#a83836] dark:text-[#f87171]",
    amber: "text-[#d97706] dark:text-[#fbbf24]",
  }[tone];
  const num = tone === "red" && value > 0 ? "text-[#a83836] dark:text-[#f87171]" : D_TXT;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`${D_CARD} relative overflow-hidden p-5 pl-6 text-left transition-shadow hover:shadow-md ${active ? "ring-2 ring-[#0153dc]" : ""}`}
    >
      <span className={`absolute inset-y-0 left-0 w-1 ${bar}`} aria-hidden />
      <div className="flex items-center justify-between gap-2">
        <span className={`text-[14px] ${D_TXT}`}>{label}</span>
        <DIcon name={icon} className={`text-[18px] ${iconColour}`} />
      </div>
      <div className={`mt-3 text-[34px] font-semibold leading-none tabular-nums ${num}`}>{value.toLocaleString()}</div>
    </button>
  );
}

function Banner({ tone, children, action }: { tone: "amber" | "red" | "grey"; children: ReactNode; action?: ReactNode }) {
  const cls = {
    amber: "bg-[#fff4dc] text-[#5c3d00] dark:bg-[#451a03] dark:text-[#fde68a]",
    red: "bg-[#fdecec] text-[#7a1f1d] dark:bg-[#450a0a] dark:text-[#fecaca]",
    grey: "bg-[#eef0f6] text-[#30323b] dark:bg-[#1e293b] dark:text-[#e2e8f0]",
  }[tone];
  return (
    <div role="status" className={`flex flex-wrap items-center gap-3 rounded-2xl px-4 py-3 ${cls}`}>
      <DIcon name="warning" className="text-[20px]" />
      <div className="min-w-0 flex-1 text-[15px] font-medium">{children}</div>
      {action}
    </div>
  );
}

function timeOfDay(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<[string, string]>;
}) {
  return (
    <label className="relative">
      <span className="sr-only">{label}</span>
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`h-11 appearance-none rounded-xl border border-[#d6d8e1] bg-white pl-3 pr-9 text-[14px] dark:border-[#334155] dark:bg-[#111a2e] ${D_TXT}`}
      >
        {options.map(([v, l]) => (
          <option key={v} value={v}>{l}</option>
        ))}
      </select>
      <DIcon name="expand_more" className={`pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[20px] ${D_MUTED}`} />
    </label>
  );
}

export function VehiclePicturesPage({ isOwner, onBack }: { isOwner: boolean; onBack: () => void }) {
  const [filters, setFilters] = useState<PictureFilters>({ page: 1 });
  const [searchText, setSearchText] = useState("");
  const [data, setData] = useState<AdminPictureList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [remakeOpen, setRemakeOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [toggleBusy, setToggleBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    listPictures(filters).then(
      (d) => {
        setData(d);
        setLoading(false);
      },
      (e) => {
        setError(e instanceof Error ? e.message : "Could not load vehicle pictures");
        setLoading(false);
      },
    );
  }, [filters]);
  useEffect(load, [load]);

  useEffect(() => {
    const t = setTimeout(() => {
      setFilters((f) => (f.search === searchText ? f : { ...f, search: searchText, page: 1 }));
    }, 300);
    return () => clearTimeout(t);
  }, [searchText]);

  const set = (patch: Partial<PictureFilters>) => setFilters((f) => ({ ...f, ...patch, page: patch.page ?? 1 }));

  const toggleAi = async () => {
    if (!data) return;
    setToggleBusy(true);
    try {
      const r = await setAiPictures(!data.aiPicturesOn);
      setData({ ...data, aiPicturesOn: r.aiPicturesOn });
    } catch (e) {
      setToast(e instanceof Error ? e.message : "Could not change the setting");
    } finally {
      setToggleBusy(false);
    }
  };

  const spend = data?.pictureSpend ?? { usedUsd: 0, budgetUsd: 0 };
  const spendPct = spend.budgetUsd > 0 ? Math.min(100, (spend.usedUsd / spend.budgetUsd) * 100) : 0;
  const total = data?.total ?? 0;
  const from = total === 0 ? 0 : (filters.page - 1) * PAGE_SIZE + 1;
  const to = Math.min(total, filters.page * PAGE_SIZE);
  const filtered = Boolean(filters.search || filters.color || filters.status || filters.rating || filters.stale);

  return (
    // Own background: Dominion's main area stays light grey even in dark mode, so the page paints itself.
    <div className="parts-database-stitch mx-auto w-full max-w-[1400px] rounded-3xl bg-[#f8f9ff] px-4 py-6 sm:px-8 dark:bg-[#0b1220]">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Breadcrumb" className={`flex items-center gap-2 text-[15px] ${D_MUTED}`}>
          <button type="button" className="rounded px-1 hover:underline" onClick={onBack}>Vehicles</button>
          <DIcon name="chevron_right" className="text-[18px]" />
          <span className={`font-medium ${D_TXT}`}>Vehicle pictures</span>
        </nav>
        <PartsButton variant="secondary" onClick={onBack}>
          <DIcon name="arrow_back" className="text-[18px]" /> Back to Vehicles
        </PartsButton>
      </div>
      <h1 className={`text-[30px] font-semibold tracking-tight ${D_TXT}`}>Vehicle pictures</h1>
      <p className={`mb-6 text-[16px] ${D_MUTED}`}>One studio picture per car and colour.</p>

      {error && !data ? (
        <div className={`${D_CARD} mx-auto flex max-w-[560px] flex-col items-center gap-3 p-10 text-center`}>
          <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-[#fdecec] text-[#a83836] dark:bg-[#450a0a] dark:text-[#f87171]">
            <DIcon name="cloud_off" className="text-[28px]" />
          </span>
          <h2 className={`text-[20px] font-semibold ${D_TXT}`}>Couldn't load vehicle pictures</h2>
          <p className={`text-[15px] ${D_MUTED}`}>{error}</p>
          <PartsButton variant="primary" onClick={load}>Try again</PartsButton>
        </div>
      ) : !data ? (
        <LoadingState />
      ) : (
        <>
          <div className="mb-5 flex flex-col gap-3">
            {data.pause?.reason === "key" ? (
              <Banner tone="red">Picture service key rejected — check GEMINI_API_KEY. Roam tries again at {timeOfDay(data.pause.until)}.</Banner>
            ) : data.pause ? (
              <Banner
                tone="grey"
                action={isOwner && data.aiPicturesOn ? <PartsButton variant="danger" onClick={toggleAi}>Turn AI pictures off</PartsButton> : undefined}
              >
                Paused: the picture service keeps failing. Roam will try again at {timeOfDay(data.pause.until)}.
              </Banner>
            ) : null}
            {!data.aiPicturesOn ? <Banner tone="grey">AI pictures are off. New cars wait until they're turned on.</Banner> : null}
            {spendPct >= 80 ? <Banner tone="amber">80% of the picture budget used this month ({money(spend.usedUsd)} of {money(spend.budgetUsd)}).</Banner> : null}
            {data.remakePausedLeft ? (
              <Banner tone="amber">
                Remake paused at the monthly budget — {data.remakePausedLeft.toLocaleString()} left, resumes{" "}
                {new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() + 1, 1)).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })}.
              </Banner>
            ) : null}
          </div>

          <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_380px]">
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <CountTile label="Ready" value={data.counts.ready} tone="green" active={filters.status === "ready"} onClick={() => set({ status: filters.status === "ready" ? undefined : "ready", stale: false })} />
              <CountTile label="Being made" value={data.counts.beingMade} tone="blue" active={filters.status === "generating"} onClick={() => set({ status: filters.status === "generating" ? undefined : "generating", stale: false })} />
              <CountTile label="Failed" value={data.counts.failed} tone="red" active={filters.status === "failed"} onClick={() => set({ status: filters.status === "failed" ? undefined : "failed", stale: false })} />
              <CountTile label="Stale" value={data.counts.stale} tone="amber" active={Boolean(filters.stale)} onClick={() => set({ stale: !filters.stale, status: undefined })} />
            </div>
            <section className={`${D_CARD} flex flex-col`} aria-label="AI settings">
              <div className="flex-1 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className={`flex items-center gap-2 text-[17px] font-semibold ${D_TXT}`}>
                    <DIcon name="auto_awesome" className="text-[20px] text-[#0153dc]" /> AI settings
                  </h2>
                  <DPill tone="grey">Owner only</DPill>
                </div>
                <div className="flex justify-between text-[14px]">
                  <span className={D_TXT}>Pictures this month</span>
                  <span className={D_TXT}>
                    <b>{money(spend.usedUsd)}</b> <span className={D_MUTED}>/ {money(spend.budgetUsd)}</span>
                  </span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#eef0f6] dark:bg-[#1e293b]" role="progressbar" aria-label="Picture spend" aria-valuenow={Math.round(spendPct)} aria-valuemin={0} aria-valuemax={100}>
                  <div className={`h-full rounded-full ${spendPct >= 80 ? "bg-[#d97706]" : "bg-[#0153dc]"}`} style={{ width: `${spendPct}%` }} />
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 border-t border-[#e6e7ee] bg-[#f7f8fc] px-4 py-3 dark:border-[#1e293b] dark:bg-[#0b1220]">
                <button
                  type="button"
                  role="switch"
                  aria-checked={data.aiPicturesOn}
                  aria-label="AI pictures"
                  disabled={!isOwner || toggleBusy}
                  onClick={toggleAi}
                  className={`relative h-6 w-11 rounded-full transition-colors disabled:opacity-50 ${data.aiPicturesOn ? "bg-[#0153dc]" : "bg-[#c9ccd6] dark:bg-[#334155]"}`}
                >
                  <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${data.aiPicturesOn ? "left-[22px]" : "left-0.5"}`} />
                </button>
                <span className={`text-[14px] ${D_TXT}`}>
                  AI pictures: <b className={data.aiPicturesOn ? "text-[#006e31] dark:text-[#4ade80]" : ""}>{data.aiPicturesOn ? "On" : "Off"}</b>
                </span>
                <PartsButton variant="secondary" className="ml-auto" disabled={!isOwner} onClick={() => setRemakeOpen(true)}>
                  <DIcon name="refresh" className="text-[18px]" /> Remake all from older prompt
                </PartsButton>
              </div>
            </section>
          </div>

          <div className="mb-6 flex flex-wrap items-center gap-2">
            <label className="relative min-w-[220px] flex-1">
              <span className="sr-only">Search a car</span>
              <DIcon name="search" className={`pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[20px] ${D_MUTED}`} />
              <input
                type="search"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="Search a car…"
                className={`h-11 w-full rounded-xl border border-[#d6d8e1] bg-white pl-10 pr-3 text-[14px] dark:border-[#334155] dark:bg-[#111a2e] ${D_TXT}`}
              />
            </label>
            <Select label="Colour" value={filters.color ?? ""} onChange={(v) => set({ color: v || undefined })} options={[["", "Colour: All"], ...PICTURE_COLOURS.map((c) => [c, colourName(c)] as [string, string])]} />
            <Select
              label="Status"
              value={filters.status ?? ""}
              onChange={(v) => set({ status: v || undefined })}
              options={[["", "Status: All"], ["ready", "Ready"], ["queued", "Waiting"], ["generating", "Being made"], ["failed", "Failed"]]}
            />
            <Select label="Rating" value={filters.rating ?? ""} onChange={(v) => set({ rating: v || undefined })} options={[["", "Rating: Any"], ["good", "Looks good"], ["wrong", "Looks wrong"]]} />
            <PartsButton variant="secondary" aria-pressed={Boolean(filters.stale)} onClick={() => set({ stale: !filters.stale })} className={filters.stale ? "ring-2 ring-[#0153dc]" : ""}>
              <DIcon name="history" className="text-[18px]" /> Stale look
            </PartsButton>
          </div>

          {error ? <ErrorLine text={error} /> : null}

          {data.items.length === 0 ? (
            <div className={`${D_CARD} mx-auto flex max-w-[620px] flex-col items-center gap-3 p-10 text-center`}>
              <div className="w-56 text-[#a4a7b3] dark:text-[#475569]"><CarOutline /></div>
              <h2 className={`text-[22px] font-semibold ${D_TXT}`}>{filtered ? "No pictures match" : "No pictures yet"}</h2>
              <p className={`text-[15px] ${D_MUTED}`}>{filtered ? "Try a different search or filter." : "Roam makes them as cars are added."}</p>
              {filtered ? (
                <PartsButton
                  variant="secondary"
                  onClick={() => {
                    setSearchText("");
                    setFilters({ page: 1 });
                  }}
                >
                  Clear filters
                </PartsButton>
              ) : null}
            </div>
          ) : (
            <div className={`grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4 ${loading ? "opacity-60" : ""}`} aria-busy={loading}>
              {data.items.map((p) => (
                <article key={p.id} className={`${D_CARD} flex flex-col p-3`}>
                  <div className="relative">
                    <PictureBox p={p} />
                    {/* Chips sit on the picture: a white backing keeps them readable in dark mode too. */}
                    <div className="absolute right-2 top-2 flex flex-wrap justify-end gap-1 [&>span]:shadow-[0_1px_4px_rgba(0,0,0,0.12)] [&>span]:ring-2 [&>span]:ring-white dark:[&>span]:bg-[#0f172a] dark:[&>span]:ring-[#0f172a]">
                      <StatusPill status={p.status} />
                      <RatingPill rating={p.rating} />
                      {p.stale ? <DPill tone="amber">Stale</DPill> : null}
                    </div>
                  </div>
                  <div className="flex flex-1 flex-col gap-1 px-1 pt-3">
                    <h3 className={`text-[17px] font-semibold ${D_TXT}`}>{carTitle(p)}</h3>
                    <div className={`text-[13px] ${D_MUTED}`}>{carLine(p)}</div>
                    <ColourChip colour={p.color} />
                    <div className={`flex items-center gap-1 text-[13px] ${D_MUTED}`}>
                      <DIcon name={p.status === "queued" ? "hourglass_empty" : "auto_awesome"} className="text-[15px]" />
                      {madeLine(p)}
                    </div>
                  </div>
                  <PartsButton variant="secondary" className="mt-3 w-full" onClick={() => setOpenId(p.id)}>Open</PartsButton>
                </article>
              ))}
            </div>
          )}

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <span className={`text-[15px] ${D_MUTED}`}>
              Showing <b className={D_TXT}>{from}–{to}</b> of <b className={D_TXT}>{total.toLocaleString()}</b>
            </span>
            <div className="flex gap-2">
              <PartsButton variant="secondary" disabled={filters.page <= 1} onClick={() => set({ page: filters.page - 1 })}>
                <DIcon name="chevron_left" className="text-[18px]" /> Previous
              </PartsButton>
              <PartsButton variant="secondary" disabled={to >= total} onClick={() => set({ page: filters.page + 1 })}>
                Next <DIcon name="chevron_right" className="text-[18px]" />
              </PartsButton>
            </div>
          </div>
        </>
      )}

      {toast ? (
        <div role="status" className="fixed bottom-6 left-1/2 z-[95] flex -translate-x-1/2 items-center gap-3 rounded-xl bg-[#30323b] px-4 py-3 text-[14px] text-white shadow-lg">
          {toast}
          <PartsButton variant="secondary" onClick={() => setToast(null)}>OK</PartsButton>
        </div>
      ) : null}

      {openId ? <PictureDrawer id={openId} onClose={() => setOpenId(null)} onChanged={load} /> : null}
      {remakeOpen ? (
        <RemakeDialog
          spend={spend}
          onClose={() => setRemakeOpen(false)}
          onDone={(n) => {
            setRemakeOpen(false);
            setToast(`${n.toLocaleString()} pictures queued for remaking.`);
            load();
          }}
        />
      ) : null}
    </div>
  );
}

function LoadingState() {
  return (
    <div aria-busy="true" aria-label="Loading vehicle pictures">
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-2xl bg-[#eef0f6] motion-reduce:animate-none dark:bg-[#1e293b]" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-72 animate-pulse rounded-2xl bg-[#eef0f6] motion-reduce:animate-none dark:bg-[#1e293b]" />
        ))}
      </div>
    </div>
  );
}
