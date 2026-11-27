/**
 * "Add parts from a saved page" (docs/saved-page-parts-audit.md §6 S3–S6, Stitch docs/stitch/saved-page-parts/,
 * Keep / Drop / Add in §6b). One in-app overlay: choose file → reading → result, plus "read before" and the stop cards.
 * Every reason and detail line is the server's own; the screen never makes up wording. Never a browser pop-up.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  researchApi,
  type SavedPage,
  type SavedPageCounts,
  type SavedPageReply,
  type SavedPageRow,
  type SavedPageStopCode,
} from "../../../services/researchEngineService";
import { D_MONO, D_MUTED, D_TXT, DIcon, PartsButton, RE_SOFT, RePill } from "./ReKit";
import { PartPictureFrame, PictureStatePill, pictureWord } from "../part-pictures/PartPictureBits";
import { listTemplates } from "../part-pictures/partPicturesApi";
import { newTypeKeys, SavedPageSuggestions, SortSummary, sortedByRoam, type PickerGroup } from "./SavedPageSuggestions";
import { SortedByRoam } from "./SortedByRoam";

/** S1 "See pictures": open the Part pictures page filtered to this upload (same switch the page links use). */
export function openPartPicturesFor(savedPageId: string) {
  const url = new URL(window.location.href);
  window.history.pushState({ page: "part-pictures" }, "", `${url.pathname}?page=part-pictures&savedPageId=${encodeURIComponent(savedPageId)}`);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

/** Copies each row's picture (matched by number and group) and the upload's picture counts onto the page shown. */
function withPictures(shown: SavedPage, fresh: SavedPage): SavedPage {
  const freshRows = fresh.result?.rows ?? [];
  const rows = (shown.result?.rows ?? []).map((row) => {
    const match = freshRows.find((f) => f.number === row.number && f.group === row.group);
    return { ...row, picture: match?.picture ?? null };
  });
  return {
    ...shown,
    result: { ...shown.result, rows, pictures: fresh.result?.pictures ?? shown.result?.pictures },
  };
}


const MAX_BYTES = 8 * 1024 * 1024;
const ACCEPT = ".html,.htm,.mhtml,.mht,text/html,multipart/related";

type Props = {
  token: string;
  carId: string;
  /** "Toyota Roomy · M900A" */
  carLabel: string;
  /** The browser check this was opened from (S1), if any. */
  jobId?: string | null;
  /** Open straight on one earlier upload's result (S2 "Saved pages read" row). */
  savedPageId?: string | null;
  onClose: () => void;
  /** After a read finished (or Done): refresh coverage and readiness. */
  onChanged: () => void;
  /** S5 "Check this part": open the normal browser check for that job. */
  onCheckPart: (jobId: string, partType: string) => void;
  /** Owner login: may press Add part type / Not a part we track (docs/part-type-learning-audit.md S1). */
  owner?: boolean;
};

type Stop = { code: SavedPageStopCode; detail: string };
type View =
  | { kind: "pick" }
  | { kind: "reading" }
  | { kind: "result"; page: SavedPage }
  | { kind: "read_before"; page: SavedPage }
  | { kind: "stopped"; stop: Stop }
  | { kind: "loading" }
  | { kind: "error"; message: string };

const EMPTY: Required<SavedPageCounts> = { saved: 0, already: 0, held: 0, not_saved: 0, left_for_later: 0, not_roam_type: 0 };

/** The page link a saved file carries: Chrome/Edge `saved from url`, or an .mhtml `Snapshot-Content-Location`. */
export function linkInSavedFile(head: string): string | null {
  // A "Webpage, Single File" save stores its page quoted-printable ("url=3D(0122)https://…" split by "=" line
  // breaks): undo that first, but only for a MIME file, so a plain .html page is read exactly as saved.
  const isMime = /^(?:From:|MIME-Version:|Snapshot-Content-Location:)/im.test(head.slice(0, 400));
  const text = isMime
    ? head.replace(/=\r?\n/g, "").replace(/=([0-9A-F]{2})/gi, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)))
    : head;
  const saved = /<!--\s*saved from url=\(\d+\)(https?:\/\/\S+?)\s*-->/i.exec(text);
  if (saved) return saved[1];
  const mhtml = /^(?:Snapshot-Content-Location|Content-Location):\s*(https?:\/\/\S+)/im.exec(head);
  return mhtml ? mhtml[1] : null;
}

export function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function readDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/** The part-type icon for a result row (plain lookup; any type falls back to a wrench). */
function rowIcon(partType: string): string {
  const n = partType.toLowerCase();
  if (/shock|strut/.test(n)) return "height";
  if (/link/.test(n)) return "link";
  if (/bar/.test(n)) return "horizontal_distribute";
  if (/brake/.test(n)) return "album";
  if (/filter/.test(n)) return "air";
  if (/bearing/.test(n)) return "settings";
  if (/plug/.test(n)) return "bolt";
  return "build";
}

const STOP_CARD: Record<SavedPageStopCode, { icon: string; tone: "red" | "amber" | "slate"; title: string; button: "again" | "done" }> = {
  wrong_car: { icon: "directions_car", tone: "red", title: "This page is for a different car", button: "again" },
  untrusted_site: { icon: "gpp_bad", tone: "red", title: "That site isn't on the trusted list for this car", button: "again" },
  part_maker_page: { icon: "storefront", tone: "slate", title: "Saved pages work with the car maker's own catalogue", button: "done" },
  cap_reached: { icon: "account_balance_wallet", tone: "amber", title: "Today's research budget is used up", button: "done" },
  too_big: { icon: "description", tone: "red", title: "This file is too big", button: "again" },
  not_web_page: { icon: "description", tone: "red", title: "That isn't a saved web page", button: "again" },
  no_rows: { icon: "search_off", tone: "slate", title: "Roam couldn't find any part rows on this page", button: "again" },
  no_build_dates: { icon: "event_busy", tone: "slate", title: "This car has no build dates yet", button: "done" },
  too_many_pages: { icon: "hourglass_empty", tone: "amber", title: "That's enough pages for today", button: "done" },
  ai_failed: { icon: "cloud_off", tone: "red", title: "The page couldn't be read", button: "again" },
};

/** The plain line under a stop card's title; the boxed detail is the server's own (SP-38). */
function stopLines(stop: Stop): { line: string; box: string | null } {
  switch (stop.code) {
    case "wrong_car":
      return { line: "Open the page for this car on the catalogue website, then save it again.", box: stop.detail };
    case "untrusted_site":
      return { line: "Use a page from the car maker's own catalogue.", box: stop.detail };
    case "too_big":
      return { line: "Saved pages up to 8 MB can be read.", box: stop.detail };
    case "not_web_page":
      return { line: "Save the page with Ctrl+S, as Webpage.", box: stop.detail };
    default:
      return { line: stop.detail, box: null };
  }
}

const TONE_CIRCLE = {
  red: "bg-[#fdecec] text-[#a83836] dark:bg-[#450a0a] dark:text-[#f87171]",
  amber: "bg-[#fff4dc] text-[#8a5a00] dark:bg-[#451a03] dark:text-[#fbbf24]",
  slate: "bg-[#f1f5f9] text-[#475569] dark:bg-[#1e293b] dark:text-[#94a3b8]",
  green: "bg-[#e6f4ea] text-[#006e31] dark:bg-[#14532d]/60 dark:text-[#4ade80]",
} as const;

export function SavedPageOverlay({ token, carId, carLabel, jobId, savedPageId, onClose, onChanged, onCheckPart, owner = false }: Props) {
  const [view, setView] = useState<View>(savedPageId ? { kind: "loading" } : { kind: "pick" });
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState("");
  const [urlFound, setUrlFound] = useState(false);
  const [urlTouched, setUrlTouched] = useState(false);
  const [step, setStep] = useState(0);
  const [showOther, setShowOther] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const reading = view.kind === "reading";
  const [picturesAiOn, setPicturesAiOn] = useState(false);
  const [groups, setGroups] = useState<PickerGroup[]>([]);
  // Auto-sort S1 -> S2: "Review" shows Roam's answers inside this overlay (Back returns to the result).
  const [reviewing, setReviewing] = useState(false);

  // S1 pictures: read the rows with their pictures once the result shows, then every 10 s while one is being made.
  const resultId = view.kind === "result" ? view.page.id : null;
  const makingAny = view.kind === "result" && (view.page.result?.rows ?? []).some((r) => r.picture?.status === "being_made");
  const refreshPictures = useCallback(
    (id: string) =>
      researchApi
        .savedPageWithPictures(token, id)
        .then((r) => {
          setPicturesAiOn(Boolean(r.picturesAiOn));
          // Only the pictures are taken from this read; the result already shown stays exactly as it was.
          setView((v) => (v.kind === "result" && v.page.id === id ? { kind: "result", page: withPictures(v.page, r.savedPage) } : v));
        })
        .catch(() => {
          // Pictures are extra: the result stays as it was (PP-25).
        }),
    [token],
  );
  useEffect(() => {
    if (resultId) void refreshPictures(resultId);
  }, [resultId, refreshPictures]);
  useEffect(() => {
    if (!resultId || !makingAny) return;
    const t = window.setInterval(() => void refreshPictures(resultId), 10_000);
    return () => window.clearInterval(t);
  }, [resultId, makingAny, refreshPictures]);

  // Part-type cards: the 13 part groups and whether each makes pictures, read once when a result has cards.
  const hasCards = view.kind === "result" && (view.page.result?.suggestions ?? []).some((x) => x.kind !== "fixings");
  useEffect(() => {
    if (!hasCards || groups.length) return;
    let live = true;
    listTemplates()
      .then((items) => live && setGroups(items.map((t) => ({ id: t.catalogGroupId, name: t.name, pictures: t.enabled })).sort((a, b) => a.name.localeCompare(b.name))))
      .catch(() => {
        // The card still offers the suggestion's own group.
      });
    return () => {
      live = false;
    };
  }, [hasCards, groups.length]);

  const actOnSuggestion = useCallback(
    async (id: string, body: { key: string; action: "add" | "dismiss"; name?: string; groupId?: string }) => {
      const reply = await researchApi.savedPagePartType(token, id, body);
      setPicturesAiOn(Boolean(reply.picturesAiOn));
      setView((v) => (v.kind === "result" && v.page.id === id ? { kind: "result", page: reply.savedPage } : v));
      onChanged();
    },
    [token, onChanged],
  );

  // S2 row → that upload's result.
  useEffect(() => {
    if (!savedPageId) return;
    let live = true;
    researchApi
      .savedPage(token, savedPageId)
      .then((page) => {
        if (!live) return;
        const stop = page.result?.stop;
        setView(page.status === "stopped" && stop ? { kind: "stopped", stop: stop as Stop } : { kind: "result", page });
      })
      .catch((e) => live && setView({ kind: "error", message: e instanceof Error ? e.message : "Couldn't load that page's result" }));
    return () => {
      live = false;
    };
  }, [token, savedPageId]);

  // No close while reading (S4 / SP-33).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !reading) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [reading, onClose]);

  // S4: the steps tick while the one request runs (no buttons).
  useEffect(() => {
    if (!reading) return;
    setStep(0);
    const a = window.setTimeout(() => setStep(1), 1500);
    const b = window.setTimeout(() => setStep(2), 5000);
    return () => {
      window.clearTimeout(a);
      window.clearTimeout(b);
    };
  }, [reading]);

  const pickFile = useCallback(async (f: File | null) => {
    setFile(f);
    setUrl("");
    setUrlFound(false);
    setUrlTouched(false);
    if (!f) return;
    if (f.size > MAX_BYTES) {
      setView({ kind: "stopped", stop: { code: "too_big", detail: formatSize(f.size) } });
      return;
    }
    try {
      const head = await f.slice(0, 64 * 1024).text();
      const link = linkInSavedFile(head);
      if (link) {
        setUrl(link);
        setUrlFound(true);
      }
    } catch {
      // The link field stays empty; the owner pastes it.
    }
  }, []);

  const resetToPick = () => {
    void pickFile(null);
    if (inputRef.current) inputRef.current.value = "";
    setView({ kind: "pick" });
  };

  const linkOk = /^https:\/\/\S+$/i.test(url.trim());

  async function read(again = false) {
    if (!file || !linkOk) return;
    setView({ kind: "reading" });
    let reply: SavedPageReply;
    try {
      reply = await researchApi.uploadSavedPage(token, { file, vehicleCatalogId: carId, jobId: jobId ?? null, url: url.trim(), again });
    } catch (e) {
      setView({ kind: "error", message: e instanceof Error ? e.message : "The page couldn't be read. Try again." });
      return;
    }
    if (reply.alreadyRead) {
      setView({ kind: "read_before", page: reply.savedPage });
      return;
    }
    onChanged();
    if (reply.stop) {
      setView({ kind: "stopped", stop: reply.stop });
      return;
    }
    setView({ kind: "result", page: reply.savedPage });
  }

  // ---------------------------------------------------------------- views

  let body: ReactNode = null;
  let footer: ReactNode = null;

  if (view.kind === "pick") {
    const urlError = file && !urlFound && (urlTouched || url) && !linkOk;
    const urlMissing = file && !urlFound && !url.trim();
    body = (
      <>
        <Header title="Add parts from a saved page" sub={carLabel} />
        <div className={`flex flex-col gap-3 rounded-xl p-5 ${RE_SOFT}`} data-testid="saved-page-howto">
          <p className={`text-[13px] font-semibold ${D_TXT}`}>How to save the page</p>
          <HowStep n={1}>Open the page for this car on the catalogue website.</HowStep>
          <HowStep n={2}>
            Press <Kbd>Ctrl+S</Kbd> (<Kbd>Cmd+S</Kbd> on a Mac).
          </HowStep>
          <HowStep n={3}>
            Save it as <span className="font-semibold">Webpage, Single File</span>. That also brings the drawing, so Roam can make a picture of each part.
          </HowStep>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="hidden"
          data-testid="saved-page-file-input"
          onChange={(e) => void pickFile(e.target.files?.[0] ?? null)}
        />
        {file ? (
          <div className="flex flex-col gap-3 rounded-xl border border-[#c5c6d0] p-4 sm:flex-row sm:items-center dark:border-[#334155]" data-testid="saved-page-file">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#dbe1ff] text-[#0153dc] dark:bg-[#1e3a8a]/50 dark:text-[#93b4ff]">
                <DIcon name="description" className="text-[22px]" />
                <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-[#006e31] text-white">
                  <DIcon name="check" className="text-[13px]" />
                </span>
              </span>
              <div className="min-w-0">
                <p className={`break-all text-[15px] font-medium ${D_TXT}`}>{file.name}</p>
                <p className={`text-[13px] ${D_MUTED}`}>{formatSize(file.size)} · saved web page{/\.mht(ml)?$/i.test(file.name) ? " · single file" : ""}</p>
              </div>
            </div>
            <PartsButton variant="secondary" className="!min-h-[44px]" onClick={() => inputRef.current?.click()} data-testid="saved-page-choose-another">
              Choose another file
            </PartsButton>
          </div>
        ) : (
          <div
            className="flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-[#c5c6d0] px-4 py-8 text-center dark:border-[#334155]"
            data-testid="saved-page-dropzone"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              void pickFile(e.dataTransfer.files?.[0] ?? null);
            }}
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#dbe1ff] text-[#0153dc] dark:bg-[#1e3a8a]/50 dark:text-[#93b4ff]">
              <DIcon name="upload_file" className="text-[22px]" />
            </span>
            <p className={`text-[14px] ${D_MUTED}`}>Drop the saved page here, or</p>
            <PartsButton variant="primary" className="!min-h-[44px]" onClick={() => inputRef.current?.click()} data-testid="saved-page-choose-file">
              <DIcon name="folder_open" className="text-[18px]" /> Choose file
            </PartsButton>
          </div>
        )}

        <label className="flex flex-col gap-2">
          <span className={`text-[15px] font-semibold ${D_TXT}`}>Page link</span>
          <span
            className={`flex min-h-[44px] items-center gap-2 rounded-[10px] border px-3 ${
              urlError || (urlTouched && urlMissing)
                ? "border-[#a83836] bg-[#fdecec]/40 dark:border-[#f87171]"
                : "border-[#c5c6d0] bg-white dark:border-[#334155] dark:bg-[#0b1220]"
            }`}
          >
            <DIcon name="link" className={`text-[18px] ${D_MUTED}`} />
            <input
              type="url"
              inputMode="url"
              value={url}
              placeholder="https://…"
              data-testid="saved-page-url"
              onChange={(e) => {
                setUrl(e.target.value);
                setUrlFound(false);
              }}
              onBlur={() => setUrlTouched(true)}
              className={`min-w-0 flex-1 bg-transparent text-[14px] outline-none ${D_MONO} ${D_TXT}`}
            />
          </span>
          {urlFound ? (
            <span className="flex items-center gap-1 text-[13px] font-medium text-[#006e31] dark:text-[#4ade80]" data-testid="saved-page-url-found">
              <DIcon name="check" className="text-[16px]" /> Found in the file
            </span>
          ) : file && (urlTouched || url) && !linkOk ? (
            <span className="flex items-center gap-1 text-[13px] font-medium text-[#a83836] dark:text-[#f87171]" data-testid="saved-page-url-error">
              <DIcon name="error" className="text-[16px]" /> Paste the page&apos;s link from the address bar.
            </span>
          ) : null}
        </label>

        <div className="flex items-start gap-3 rounded-xl bg-[#dbe1ff] p-4 text-[14px] text-[#00174b] dark:bg-[#1e3a8a]/40 dark:text-[#dbe1ff]">
          <DIcon name="verified_user" className="text-[20px] text-[#0153dc] dark:text-[#93b4ff]" />
          <p>
            Rows that pass every check are saved as <span className="font-semibold text-[#006e31] dark:text-[#4ade80]">Confirmed</span>. Each Roam
            part also gets a picture a minute or two later.
          </p>
        </div>
        <p className={`text-[13px] ${D_MUTED}`}>Saved pages up to 8 MB can be read.</p>
      </>
    );
    footer = (
      <>
        <PartsButton variant="danger" className="!min-h-[44px]" onClick={onClose} data-testid="saved-page-cancel">
          Cancel
        </PartsButton>
        <PartsButton variant="primary" className="!min-h-[44px]" disabled={!file || !linkOk} onClick={() => void read(false)} data-testid="saved-page-read">
          Read page <DIcon name="arrow_forward" className="text-[18px]" />
        </PartsButton>
      </>
    );
  } else if (view.kind === "reading") {
    const steps = [
      { title: "Page is for this car", sub: "Checking the page's own car and dates" },
      { title: "Reading the parts", sub: "Finding every part row on the page" },
      { title: "Checking numbers, sides and dates", sub: "Checking each number on the page" },
      { title: "Saving", sub: "Waiting for the checks" },
    ];
    body = (
      <>
        <Header title="Reading the page…" sub="Checking each number against the page. This takes up to a minute." />
        <ol className="flex flex-col gap-5 rounded-2xl bg-[#dbe1ff]/50 p-6 dark:bg-[#1e3a8a]/30" data-testid="saved-page-reading">
          {steps.map((s, i) => {
            const done = i < step;
            const current = i === step;
            return (
              <li key={s.title} className="flex items-start gap-4" data-testid={`reading-step-${i + 1}`} data-state={done ? "done" : current ? "current" : "later"}>
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                    done
                      ? "bg-[#006e31] text-white"
                      : current
                        ? "bg-[#0153dc] text-white ring-4 ring-[#0153dc]/20"
                        : "bg-[#eef0f6] text-[#5d5f68] dark:bg-[#1e293b] dark:text-[#94a3b8]"
                  }`}
                >
                  {done ? <DIcon name="check" className="text-[18px]" /> : current ? <DIcon name="progress_activity" className="animate-spin text-[18px]" /> : <span className="h-2 w-2 rounded-full bg-current" />}
                </span>
                <div className="flex flex-col">
                  <span className={`text-[16px] font-semibold ${current ? "text-[#0153dc] dark:text-[#93b4ff]" : done ? D_TXT : D_MUTED}`}>{s.title}</span>
                  <span className={`text-[13px] ${D_MUTED}`}>{s.sub}</span>
                </div>
              </li>
            );
          })}
        </ol>
        <div className="h-2 overflow-hidden rounded-full bg-[#e1e1ed] dark:bg-[#1e293b]">
          <div className="h-full rounded-full bg-[#0153dc] transition-all duration-700" style={{ width: `${[20, 45, 70, 90][step]}%` }} />
        </div>
        <p className={`flex items-center justify-center gap-1.5 text-center text-[13px] ${D_MUTED}`}>
          <DIcon name="info" className="text-[16px]" /> You can keep this open. Nothing is saved until every check is done.
        </p>
      </>
    );
  } else if (view.kind === "result" && reviewing) {
    body = (
      <>
        <Header title="Roam's answers" sub={carLabel} />
        <SortedByRoam token={token} owner={owner} />
      </>
    );
    footer = (
      <>
        <PartsButton variant="secondary" className="!min-h-[44px]" onClick={() => setReviewing(false)} data-testid="sorted-back">
          <DIcon name="arrow_back" className="text-[18px]" /> Back
        </PartsButton>
        <PartsButton
          variant="primary"
          className="!min-h-[44px]"
          onClick={() => {
            onChanged();
            onClose();
          }}
        >
          Done
        </PartsButton>
      </>
    );
  } else if (view.kind === "result") {
    const resultPage = view.page;
    const hasPictures = picturesAiOn && (resultPage.result?.rows ?? []).some((r) => r.picture);
    body = (
      <Result
        page={resultPage}
        aiOn={picturesAiOn}
        showOther={showOther}
        setShowOther={setShowOther}
        onCheckPart={onCheckPart}
        owner={owner}
        groups={groups}
        onAct={(b) => actOnSuggestion(resultPage.id, b)}
        onReview={() => setReviewing(true)}
      />
    );
    footer = (
      <>
        {hasPictures ? (
          <PartsButton
            variant="secondary"
            className="!min-h-[44px]"
            data-testid="saved-page-see-pictures"
            onClick={() => {
              onClose();
              openPartPicturesFor(resultPage.id);
            }}
          >
            <DIcon name="image" className="text-[18px]" /> See pictures
          </PartsButton>
        ) : (
          <span />
        )}
        <PartsButton
          variant="primary"
          className="!min-h-[44px]"
          data-testid="saved-page-done"
          onClick={() => {
            onChanged();
            onClose();
          }}
        >
          Done
        </PartsButton>
      </>
    );
  } else if (view.kind === "read_before") {
    const counts = { ...EMPTY, ...(view.page.result?.counts ?? {}) };
    body = (
      <>
        <Header title="You've read this page before" sub={carLabel} />
        <div className="flex flex-col gap-3 rounded-xl border border-[#e6e7ee] p-4 sm:flex-row sm:items-center dark:border-[#1e293b]" data-testid="saved-page-earlier">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#dbe1ff] text-[#0153dc] dark:bg-[#1e3a8a]/50 dark:text-[#93b4ff]">
            <DIcon name="description" className="text-[22px]" />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <p className={`text-[15px] font-semibold ${D_TXT}`}>
              Read on {readDate(view.page.created_at)}
              {view.page.domain ? <span className={`font-normal ${D_MUTED}`}> · {view.page.domain}</span> : null}
            </p>
            <CountPills counts={counts} />
          </div>
        </div>
        <div className={`flex items-start gap-3 rounded-xl p-4 text-[14px] ${RE_SOFT} ${D_TXT}`}>
          <DIcon name="sync" className="text-[20px] text-[#0153dc] dark:text-[#93b4ff]" />
          <p>
            Reading it again checks every row once more. Parts already saved show as <span className="font-semibold">Already on file</span>, and
            nothing is added twice.
          </p>
        </div>
      </>
    );
    const page = view.page;
    footer = (
      <>
        <PartsButton variant="danger" className="!min-h-[44px]" onClick={onClose} data-testid="saved-page-cancel">
          Cancel
        </PartsButton>
        <div className="flex flex-wrap gap-2">
          <PartsButton variant="secondary" className="!min-h-[44px]" onClick={() => setView({ kind: "result", page })} data-testid="saved-page-see-result">
            See the old result
          </PartsButton>
          <PartsButton variant="primary" className="!min-h-[44px]" onClick={() => void read(true)} data-testid="saved-page-read-again">
            <DIcon name="refresh" className="text-[18px]" /> Read again
          </PartsButton>
        </div>
      </>
    );
  } else if (view.kind === "stopped") {
    const card = STOP_CARD[view.stop.code] ?? STOP_CARD.no_rows;
    const lines = stopLines(view.stop);
    body = (
      <div className="flex flex-col items-start gap-4 py-2" data-testid="saved-page-stop" data-code={view.stop.code}>
        <span className={`flex h-12 w-12 items-center justify-center rounded-full ${TONE_CIRCLE[card.tone]}`}>
          <DIcon name={card.icon} className="text-[24px]" />
        </span>
        <h2 className={`text-[22px] font-semibold ${D_TXT}`}>{card.title}</h2>
        <p className={`text-[15px] ${D_MUTED}`}>{lines.line}</p>
        {lines.box ? (
          <div className={`w-full rounded-xl p-4 text-[14px] ${RE_SOFT} ${D_TXT}`} data-testid="saved-page-stop-detail">
            {lines.box}
          </div>
        ) : null}
      </div>
    );
    footer = (
      <>
        <span />
        {card.button === "again" ? (
          <PartsButton variant="secondary" className="!min-h-[44px]" onClick={resetToPick} data-testid="saved-page-choose-another">
            <DIcon name="upload_file" className="text-[18px]" /> Choose another file
          </PartsButton>
        ) : (
          <PartsButton variant="primary" className="!min-h-[44px]" onClick={onClose} data-testid="saved-page-done">
            Done
          </PartsButton>
        )}
      </>
    );
  } else if (view.kind === "loading") {
    body = (
      <div className="flex flex-col gap-3 py-4" data-testid="saved-page-loading" aria-busy>
        <div className="h-6 w-48 animate-pulse rounded bg-[#e1e1ed] dark:bg-[#1e293b]" />
        <div className="h-16 animate-pulse rounded-xl bg-[#e1e1ed] dark:bg-[#1e293b]" />
        <div className="h-16 animate-pulse rounded-xl bg-[#e1e1ed] opacity-60 dark:bg-[#1e293b]" />
      </div>
    );
  } else {
    body = (
      <div className="flex flex-col items-start gap-4 py-2" data-testid="saved-page-error">
        <span className={`flex h-12 w-12 items-center justify-center rounded-full ${TONE_CIRCLE.red}`}>
          <DIcon name="cloud_off" className="text-[24px]" />
        </span>
        <h2 className={`text-[22px] font-semibold ${D_TXT}`}>That didn&apos;t work</h2>
        <p className={`text-[15px] ${D_MUTED}`}>{view.message}</p>
      </div>
    );
    footer = (
      <>
        <PartsButton variant="danger" className="!min-h-[44px]" onClick={onClose} data-testid="saved-page-cancel">
          Cancel
        </PartsButton>
        <PartsButton variant="secondary" className="!min-h-[44px]" onClick={() => (file ? void read(false) : resetToPick())} data-testid="saved-page-try-again">
          <DIcon name="refresh" className="text-[18px]" /> Try again
        </PartsButton>
      </>
    );
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-[#191b24]/40 md:items-center md:p-4" data-testid="saved-page-overlay">
      <div
        role="dialog"
        aria-modal
        aria-label="Add parts from a saved page"
        className="relative flex max-h-[100dvh] w-full flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl md:max-h-[92vh] md:max-w-[640px] md:rounded-[20px] dark:bg-[#111a2e]"
      >
        <div className="mx-auto mt-3 h-1.5 w-12 rounded-full bg-[#e1e1ed] md:hidden dark:bg-[#334155]" />
        {!reading && view.kind !== "result" ? (
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="absolute right-5 top-5 flex h-9 w-9 items-center justify-center rounded-lg border border-[#c5c6d0] bg-white text-[#5d5f68] hover:bg-[#ededf9] dark:border-[#334155] dark:bg-[#111a2e] dark:text-[#94a3b8]"
          >
            <DIcon name="close" className="text-[18px]" />
          </button>
        ) : null}
        <div className="flex flex-col gap-6 overflow-y-auto p-6 md:p-8">{body}</div>
        {footer ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#e6e7ee] px-6 py-4 md:px-8 dark:border-[#1e293b]">{footer}</div>
        ) : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- pieces

function Header({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="flex flex-col gap-1 pr-10">
      <h2 className={`text-[24px] font-semibold leading-tight ${D_TXT}`}>{title}</h2>
      <p className={`text-[15px] ${D_MUTED}`}>{sub}</p>
    </div>
  );
}

function HowStep({ n, children }: { n: number; children: ReactNode }) {
  return (
    <div className={`flex items-center gap-3 text-[15px] ${D_TXT}`}>
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#0153dc] text-[13px] font-semibold text-white">{n}</span>
      <span>{children}</span>
    </div>
  );
}

function Kbd({ children }: { children: ReactNode }) {
  return <kbd className={`rounded border border-[#c5c6d0] bg-white px-1.5 py-0.5 text-[12px] ${D_MONO} ${D_TXT} dark:border-[#334155] dark:bg-[#0b1220]`}>{children}</kbd>;
}

/** Saved / Already on file / Needs you / Not a Roam part type. A count of 0 is slate (SP-32). */
function CountPills({ counts }: { counts: SavedPageCounts }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5" data-testid="saved-page-counts">
      <RePill tone={counts.saved ? "green" : "grey"} testId="count-saved">
        Saved {counts.saved}
      </RePill>
      {counts.already ? (
        <RePill tone="grey" testId="count-already">
          Already on file {counts.already}
        </RePill>
      ) : null}
      {counts.not_saved ? (
        <RePill tone="grey" testId="count-not-saved">
          Not saved {counts.not_saved}
        </RePill>
      ) : null}
      <RePill tone={counts.held ? "amber" : "grey"} testId="count-held">
        Needs you {counts.held}
      </RePill>
      <RePill tone="grey-outline" testId="count-other">
        Not a Roam part type {counts.not_roam_type}
      </RePill>
    </div>
  );
}

function Result({
  page,
  aiOn,
  showOther,
  setShowOther,
  onCheckPart,
  owner,
  groups,
  onAct,
  onReview,
}: {
  page: SavedPage;
  aiOn: boolean;
  showOther: boolean;
  setShowOther: (v: boolean) => void;
  onCheckPart: (jobId: string, partType: string) => void;
  owner: boolean;
  groups: PickerGroup[];
  onAct: (body: { key: string; action: "add" | "dismiss"; name?: string; groupId?: string }) => Promise<void>;
  onReview: () => void;
}) {
  const counts = { ...EMPTY, ...(page.result?.counts ?? {}) };
  const rows = page.result?.rows ?? [];
  const of = (g: SavedPageRow["group"]) => rows.filter((r) => r.group === g);
  const held = counts.held > 0;
  const nothingNew = counts.saved === 0 && counts.held === 0 && counts.already + counts.not_saved > 0;
  const skipped = page.result?.skipped ?? counts.left_for_later;
  const title =
    counts.saved === 0 && counts.held === 0
      ? counts.already + counts.not_saved
        ? "Nothing new to save"
        : "No parts saved"
      : held
        ? `${counts.saved} ${counts.saved === 1 ? "part" : "parts"} saved · ${counts.held} need you`
        : `${counts.saved} ${counts.saved === 1 ? "part" : "parts"} saved`;
  const other = of("not_roam_type");
  // Rev 2 §4: a held row is a page gap or a Roam problem, never a part question, so it carries no "Check this part".
  const heldLine = (r: SavedPageRow, i: number) => <ResultLine key={`h${i}`} row={r} reason={r.reason} />;
  // Results read after the part-type round carry suggestions; older ones keep the folded list.
  const learning = Array.isArray(page.result?.suggestions);
  const madeHere = newTypeKeys(page);
  const names = page.result?.otherTypes?.length ? page.result.otherTypes : [...new Set(other.map((r) => r.partType))].slice(0, 5);

  return (
    <div className="flex flex-col gap-6" data-testid="saved-page-result">
      <div className="flex flex-col items-center gap-3 text-center">
        <span className={`flex h-14 w-14 items-center justify-center rounded-full ${held ? TONE_CIRCLE.amber : nothingNew ? TONE_CIRCLE.slate : TONE_CIRCLE.green}`}>
          <DIcon name={held ? "priority_high" : "check"} className="text-[28px]" />
        </span>
        <h2 className={`text-[26px] font-semibold ${D_TXT}`} data-testid="saved-page-result-title">
          {title}
        </h2>
        <p className={`text-[15px] ${D_MUTED}`}>
          {page.domain ? `From ${page.domain} · ` : ""}read {readDate(page.created_at)}
        </p>
        <CountPills counts={counts} />
        {aiOn ? <PicturesLine page={page} /> : null}
      </div>

      {aiOn && needsDrawing(page) ? (
        <div className="flex items-start gap-3 rounded-xl bg-[#dbe1ff] p-4 text-[14px] text-[#00174b] dark:bg-[#1e3a8a]/40 dark:text-[#dbe1ff]" data-testid="saved-page-needs-drawing">
          <DIcon name="info" className="text-[20px] text-[#0153dc] dark:text-[#93b4ff]" />
          <p>
            <span className="font-semibold">Pictures need the drawing.</span> Next time, save the page in Chrome as Webpage, Single File and upload that.
          </p>
        </div>
      ) : null}

      <Group title="Saved" count={of("saved").length} testId="group-saved">
        {of("saved").map((r, i) => (
          <ResultLine
            key={`s${i}`}
            row={r}
            picture={aiOn ? pictureFor(page, r) : undefined}
            newType={Boolean(r.suggestion && madeHere.has(r.suggestion))}
            right={<RePill tone="green" icon="check">Confirmed</RePill>}
          />
        ))}
      </Group>

      <Group title="Already on file" count={of("already").length} testId="group-already">
        {of("already").map((r, i) => (
          <ResultLine key={`a${i}`} row={r} picture={aiOn ? pictureFor(page, r) : undefined} right={<RePill tone="grey">Already on file</RePill>} />
        ))}
      </Group>

      <Group title="Not saved" count={of("not_saved").length} testId="group-not-saved">
        {of("not_saved").map((r, i) => (
          <ResultLine key={`n${i}`} row={r} reason={r.reason} right={<RePill tone="grey">Not saved</RePill>} />
        ))}
      </Group>

      <Group title="Needs you" count={of("held").length} testId="group-held">
        {of("held").map(heldLine)}
      </Group>

      {skipped > 0 ? (
        <div className={`flex items-center gap-3 rounded-xl px-4 py-3 text-[14px] ${RE_SOFT} ${D_TXT}`} data-testid="saved-page-skipped">
          <DIcon name="block" className={`text-[20px] ${D_MUTED}`} />
          <span>
            Roam skipped {skipped} {skipped === 1 ? "row" : "rows"} it couldn&apos;t prove from the page.
          </span>
        </div>
      ) : null}

      {learning && sortedByRoam(page) ? (
        <SortSummary page={page} onReview={onReview} />
      ) : learning ? (
        <SavedPageSuggestions page={page} owner={owner} groups={groups} aiOn={aiOn} onAct={onAct} renderHeldRow={heldLine} />
      ) : other.length ? (
        <div className={`rounded-xl ${RE_SOFT}`} data-testid="group-other">
          <button
            type="button"
            className={`flex min-h-[48px] w-full items-center justify-between gap-3 px-4 py-3 text-left ${D_TXT}`}
            onClick={() => setShowOther(!showOther)}
            aria-expanded={showOther}
            data-testid="saved-page-other-toggle"
          >
            <span className="flex items-center gap-2">
              <DIcon name="inventory_2" className={`text-[20px] ${D_MUTED}`} />
              <span className="text-[14px]">
                <span className="font-medium">Not a Roam part type · {other.length} rows</span>
                {names.length ? <span className={D_MUTED}> · {names.join(", ").toLowerCase()}</span> : null}
              </span>
            </span>
            <DIcon name={showOther ? "expand_less" : "expand_more"} className={`text-[20px] ${D_MUTED}`} />
          </button>
          {showOther ? (
            <ul className="flex flex-col gap-1 px-4 pb-3" data-testid="saved-page-other-list">
              {other.map((r, i) => (
                <li key={`o${i}`} className={`flex flex-wrap items-center gap-2 text-[13px] ${D_TXT}`}>
                  <span>{r.partType}</span>
                  {r.number ? <span className={`${D_MONO} ${D_MUTED}`}>{r.number}</span> : null}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function Group({ title, count, testId, children }: { title: string; count: number; testId: string; children: ReactNode }) {
  if (!count) return null;
  return (
    <section className="flex flex-col gap-2" data-testid={testId}>
      <div className="flex items-center gap-2">
        <h3 className={`text-[18px] font-semibold ${D_TXT}`}>{title}</h3>
        <span className={`rounded-full px-2 text-[12px] font-semibold ${RE_SOFT} ${D_TXT}`}>{count}</span>
      </div>
      <div className="flex flex-col divide-y divide-[#e6e7ee] overflow-hidden rounded-xl border border-[#e6e7ee] dark:divide-[#1e293b] dark:border-[#1e293b]">
        {children}
      </div>
    </section>
  );
}

/** One row everywhere (SP-37): icon, plain words · place, then number and dates in mono; names wrap, never cut off. */
/** The row's picture state for S1: its picture, or "No diagram" when the upload had none for it. */
function pictureFor(page: SavedPage, row: SavedPageRow): { noDiagram: boolean } {
  // Decided from what the upload recorded, never the file name: the server stores a shortened name without its
  // ending, so a single-file save would look like a plain .html one.
  const queued = page.result?.pictures?.rows?.find((p) => p.number === row.number);
  return { noDiagram: !row.picture && queued?.status === "noDiagram" };
}

/** The "Pictures need the drawing" notice: the upload found no drawing for any of its parts. */
function needsDrawing(page: SavedPage): boolean {
  const pictures = page.result?.pictures;
  if (!pictures || pictures.failed) return false;
  return pictures.noDiagram > 0 && pictures.queued === 0 && !(page.result?.rows ?? []).some((r) => r.picture);
}

/** "Pictures: 4 made · 2 being made · 3 with no diagram" (only the parts that are not zero). */
function PicturesLine({ page }: { page: SavedPage }) {
  const rows = (page.result?.rows ?? []).filter((r) => r.group === "saved" || r.group === "already");
  if (page.result?.pictures?.failed) {
    return (
      <p className={`flex items-center gap-1.5 text-[14px] ${D_MUTED}`} data-testid="saved-page-pictures-line">
        <DIcon name="image" className="text-[18px]" /> Pictures couldn&apos;t be queued — try again in a minute.
      </p>
    );
  }
  const count = (fn: (r: SavedPageRow) => boolean) => rows.filter(fn).length;
  const parts = [
    [count((r) => r.picture?.status === "made" || r.picture?.status === "hidden"), "made"],
    [count((r) => r.picture?.status === "being_made"), "being made"],
    [count((r) => r.picture?.status === "waiting"), "waiting"],
    [count((r) => r.picture?.status === "failed"), "failed"],
    [count((r) => pictureFor(page, r).noDiagram), "with no diagram"],
  ]
    .filter(([n]) => Number(n) > 0)
    .map(([n, word]) => `${n} ${word}`);
  if (!parts.length) return null;
  return (
    <p className={`flex items-center gap-1.5 text-[14px] ${D_MUTED}`} data-testid="saved-page-pictures-line">
      <DIcon name="image" className="text-[18px]" /> Pictures: {parts.join(" · ")}
    </p>
  );
}

function ResultLine({
  row,
  right,
  reason,
  picture,
  newType,
}: {
  row: SavedPageRow;
  right?: ReactNode;
  reason?: string | null;
  picture?: { noDiagram: boolean };
  /** Auto-sort S1: Roam made this row's part type on this upload. */
  newType?: boolean;
}) {
  const word = picture ? pictureWord(row.picture ?? null, picture.noDiagram) : null;
  // A "waits" line and a Not saved fact are plain information (grey, info icon); only a held row is a warning.
  const waits = Boolean(reason && (/^Waits\b/.test(reason) || row.group === "not_saved"));
  return (
    <div className="flex flex-col gap-3 bg-white p-4 sm:flex-row sm:items-center dark:bg-[#111a2e]" data-testid="saved-page-row">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        {word ? (
          <PartPictureFrame picture={row.picture ?? null} size={40} icon={rowIcon(row.partType)} />
        ) : (
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#dbe1ff] text-[#0153dc] dark:bg-[#1e3a8a]/50 dark:text-[#93b4ff]">
            <DIcon name={rowIcon(row.partType)} className="text-[20px]" />
          </span>
        )}
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className={`flex flex-wrap items-center gap-2 text-[15px] font-medium ${D_TXT}`}>
            {word ? <span data-testid="saved-page-picture-state"><PictureStatePill word={word} /></span> : null}
            <span>
              {row.partType}
              {row.place ? ` · ${row.place}` : ""}
            </span>
            {newType ? (
              <RePill tone="grey" testId="saved-page-new-type">
                New part type
              </RePill>
            ) : null}
          </span>
          <span className={`text-[13px] ${D_MONO} ${D_MUTED}`}>{[row.number, row.dates].filter(Boolean).join(" · ")}</span>
          {reason ? (
            <span
              className={`mt-1 flex items-start gap-1 text-[13px] font-medium ${waits ? D_MUTED : "text-[#8a5a00] dark:text-[#fbbf24]"}`}
              data-testid="saved-page-reason"
            >
              <DIcon name={waits ? "info" : "warning"} className="text-[16px]" />
              {reason}
            </span>
          ) : null}
        </div>
      </div>
      {right ? <div className="flex shrink-0 sm:justify-end">{right}</div> : null}
    </div>
  );
}
