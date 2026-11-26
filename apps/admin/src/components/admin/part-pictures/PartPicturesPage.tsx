/**
 * Dominion → Vehicles → Part pictures (docs/part-pictures-audit.md §4 S3, Stitch screens 8–14 in
 * docs/stitch/part-pictures/dominion/, Keep / Drop / Add in §4b). Pictures tab + Templates tab.
 * Dominion shows only its own data: no fleet names, plates, drivers, vehicle counts or "used by" (PP-17).
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { D_CARD, D_MONO, D_MUTED, D_TXT, DIcon } from "../parts-database/add-parts/catalog/dominionKit";
import { PartsButton } from "../parts-database/PartsButton";
import "../parts-database/partsDatabase.css";
import {
  listPartPictures,
  listTemplates,
  remakeOlder,
  remakeOlderCount,
  saveTemplate,
  setAiPartPictures,
  type PartPicture,
  type PartPictureFilters,
  type PartPictureList,
  type PartPictureTemplate,
  type PictureBanner,
  type PictureView,
  type RemakeOlder,
} from "./partPicturesApi";
import {
  PartPictureFrame,
  PartPictureOverlay,
  PictureButtons,
  PictureStatePill,
  pictureWord,
  plainDay,
  usePictureActions,
  waitingLine,
} from "./PartPictureBits";

const money = (n: number) => `US$${n.toFixed(2)}`;

const GROUP_ICON: Record<string, string> = {
  Filters: "filter_alt",
  Engine: "settings",
  Brakes: "radio_button_checked",
  "Suspension & steering": "tire_repair",
  "Battery & electrical": "bolt",
  "Exhaust & emissions": "air",
  "Lighting & visibility": "lightbulb",
  HVAC: "ac_unit",
  "Belts & hoses": "cable",
  Transmission: "settings_applications",
  "Hybrid & electric": "electric_car",
  Fluids: "water_drop",
  "Tires & wheels": "trip_origin",
};
const groupIcon = (name: string | null | undefined) => GROUP_ICON[name ?? ""] ?? "category";

function timeOfDay(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Jamaica" });
}

/** The savedPageId the S1 "See pictures" button put in the address. */
function savedPageFromUrl(): string | undefined {
  if (typeof window === "undefined") return undefined;
  return new URLSearchParams(window.location.search).get("savedPageId") || undefined;
}

export function PartPicturesPage({ isOwner, onBack }: { isOwner: boolean; onBack: () => void }) {
  const [tab, setTab] = useState<"pictures" | "templates">("pictures");
  const [filters, setFilters] = useState<PartPictureFilters>(() => ({ savedPageId: savedPageFromUrl() }));
  const [pageNo, setPageNo] = useState(1);
  const [searchText, setSearchText] = useState("");
  const [data, setData] = useState<PartPictureList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [templates, setTemplates] = useState<PartPictureTemplate[] | null>(null);
  const [toggleBusy, setToggleBusy] = useState(false);
  const [toggleError, setToggleError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    listPartPictures(filters).then(
      (d) => {
        setData(d);
        setLoading(false);
      },
      (e) => {
        setError(e instanceof Error ? e.message : "Couldn't load the pictures");
        setLoading(false);
      },
    );
  }, [filters]);
  useEffect(load, [load]);

  const loadTemplates = useCallback(() => {
    listTemplates().then(setTemplates, () => setTemplates([]));
  }, []);
  useEffect(loadTemplates, [loadTemplates]);

  useEffect(() => {
    const t = setTimeout(() => {
      setFilters((f) => (f.search === searchText ? f : { ...f, search: searchText || undefined, after: undefined, before: undefined }));
      setPageNo(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchText]);

  const set = (patch: Partial<PartPictureFilters>) => {
    setFilters((f) => ({ ...f, ...patch, after: undefined, before: undefined }));
    setPageNo(1);
  };

  const toggleAi = async () => {
    if (!data) return;
    setToggleBusy(true);
    setToggleError(null);
    try {
      await setAiPartPictures(!data.aiPicturesOn);
      load();
    } catch (e) {
      setToggleError(e instanceof Error ? e.message : "Couldn't change the setting");
    } finally {
      setToggleBusy(false);
    }
  };

  const replace = (p: PartPicture) =>
    setData((d) => (d ? { ...d, items: d.items.map((x) => (x.id === p.id ? p : x)) } : d));

  return (
    // Own background: Dominion's main area stays light grey in dark mode, so the page paints itself.
    <div className="parts-database-stitch mx-auto w-full max-w-[1400px] rounded-3xl bg-[#f8f9ff] px-4 py-6 sm:px-8 dark:bg-[#0b1220]" data-testid="part-pictures-page">
      <nav aria-label="Breadcrumb" className={`mb-4 flex items-center gap-2 text-[15px] ${D_MUTED}`}>
        <button type="button" className="rounded px-1 hover:underline" onClick={onBack}>Vehicles</button>
        <DIcon name="chevron_right" className="text-[18px]" />
        <span className={`font-medium ${D_TXT}`}>Part pictures</span>
      </nav>

      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_400px]">
        <div>
          <h1 className={`text-[30px] font-semibold tracking-tight ${D_TXT}`}>Part pictures</h1>
          <p className={`mt-1 max-w-[640px] text-[16px] ${D_MUTED}`}>
            Realistic pictures of each part, made by AI from the maker&apos;s diagram. One picture per part, shared by every car that uses it.
          </p>
        </div>
        {data ? (
          <SettingsCard data={data} isOwner={isOwner} busy={toggleBusy} onToggle={toggleAi} error={toggleError} />
        ) : error ? null : (
          <div className="h-[132px] animate-pulse rounded-2xl bg-[#eef0f6] motion-reduce:animate-none dark:bg-[#1e293b]" />
        )}
      </div>

      {data ? <Banners banners={data.banners} spend={data.pictureSpend} pause={data.pause} /> : null}

      <div role="tablist" className="mb-6 flex gap-6 border-b border-[#e6e7ee] dark:border-[#1e293b]">
        {(["pictures", "templates"] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`-mb-px flex min-h-[44px] items-center gap-2 border-b-2 px-1 text-[16px] font-medium ${
              tab === t ? "border-[#0153dc] text-[#0153dc] dark:border-[#5b8def] dark:text-[#93b4ff]" : `border-transparent ${D_MUTED}`
            }`}
          >
            <DIcon name={t === "pictures" ? "photo_library" : "tune"} className="text-[20px]" />
            {t === "pictures" ? "Pictures" : "Templates"}
          </button>
        ))}
      </div>

      {tab === "pictures" ? (
        <PicturesTab
          data={data}
          error={error}
          loading={loading}
          filters={filters}
          pageNo={pageNo}
          searchText={searchText}
          setSearchText={setSearchText}
          templates={templates ?? []}
          set={set}
          retry={load}
          onOlder={() => {
            if (!data?.nextAfter) return;
            setFilters((f) => ({ ...f, after: data.nextAfter ?? undefined, before: undefined }));
            setPageNo((n) => n + 1);
          }}
          onNewer={() => {
            if (!data?.nextBefore) return;
            setFilters((f) => ({ ...f, before: data.nextBefore ?? undefined, after: undefined }));
            setPageNo((n) => Math.max(1, n - 1));
          }}
          onChanged={replace}
        />
      ) : (
        <TemplatesTab templates={templates} isOwner={isOwner} dailyMax={data?.madeToday.dailyMax ?? 50} onSaved={loadTemplates} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------- top

function SettingsCard({
  data,
  isOwner,
  busy,
  onToggle,
  error,
}: {
  data: PartPictureList;
  isOwner: boolean;
  busy: boolean;
  onToggle: () => void;
  error: string | null;
}) {
  const { count, dailyMax } = data.madeToday;
  const dayPct = dailyMax > 0 ? Math.min(100, (count / dailyMax) * 100) : 0;
  return (
    <section className={`${D_CARD} flex flex-col gap-3 p-5`} aria-label="AI part pictures" data-testid="part-pictures-settings">
      <div className="flex items-center justify-between gap-3">
        <span className={`text-[15px] font-semibold ${D_TXT}`}>
          AI part pictures:{" "}
          <span className={data.aiPicturesOn ? "text-[#006e31] dark:text-[#4ade80]" : D_MUTED}>{data.aiPicturesOn ? "On" : "Off"}</span>
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={data.aiPicturesOn}
          aria-label="AI part pictures"
          disabled={!isOwner || busy}
          onClick={onToggle}
          className={`relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-50 ${data.aiPicturesOn ? "bg-[#006e31]" : "bg-[#c9ccd6] dark:bg-[#334155]"}`}
        >
          <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${data.aiPicturesOn ? "left-[22px]" : "left-0.5"}`} />
        </button>
      </div>
      {!isOwner ? <span className={`-mt-2 text-[12px] ${D_MUTED}`}>Only the owner can change this</span> : null}
      <div>
        <div className="flex justify-between text-[14px]">
          <span className={D_MUTED}>Made today</span>
          <span className={`${D_MONO} ${D_TXT}`}>{count} of {dailyMax}</span>
        </div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[#eef0f6] dark:bg-[#1e293b]">
          <div className="h-full rounded-full bg-[#0153dc]" style={{ width: `${dayPct}%` }} />
        </div>
      </div>
      <p className={`text-[13px] ${D_MUTED}`}>
        This month <b className={D_TXT}>{money(data.partPictureSpendUsd)}</b> on part pictures ·{" "}
        <span className={D_MONO}>{money(data.pictureSpend.usedUsd)} of {money(data.pictureSpend.budgetUsd)}</span> Gemini budget
      </p>
      {error ? <p className="text-[13px] text-[#a83836] dark:text-[#f87171]">{error}</p> : null}
    </section>
  );
}

function Banners({
  banners,
  spend,
  pause,
}: {
  banners: PictureBanner[];
  spend: { usedUsd: number; budgetUsd: number };
  pause: PartPictureList["pause"];
}) {
  if (!banners.length) return null;
  return (
    <div className="mb-6 flex flex-col gap-3" data-testid="part-pictures-banners">
      {banners.map((b) => {
        const until = timeOfDay(b.until ?? pause?.until);
        if (b.kind === "key_refused") {
          return (
            <Banner key={b.kind} tone="red" title="The picture service refused the key.">
              Check GEMINI_API_KEY. Roam tries again{until ? ` at ${until}` : " later"}.
            </Banner>
          );
        }
        if (b.kind === "paused") {
          return (
            <Banner key={b.kind} tone="grey" title="Part pictures are paused.">
              The picture service keeps failing. Roam will try again{until ? ` at ${until}` : " later"}.
            </Banner>
          );
        }
        if (b.kind === "ai_off") {
          return (
            <Banner key={b.kind} tone="amber" title="AI part pictures are off.">
              New uploads don&apos;t queue pictures. Pictures already made still show in Roam Fleet.
            </Banner>
          );
        }
        return (
          <Banner key={b.kind} tone="amber" title="80% of the Gemini budget is used this month.">
            {money(spend.usedUsd)} of {money(spend.budgetUsd)}.
          </Banner>
        );
      })}
    </div>
  );
}

function Banner({ tone, title, children }: { tone: "amber" | "red" | "grey"; title: string; children: ReactNode }) {
  const cls = {
    amber: "bg-[#fff4dc] text-[#5c3d00] dark:bg-[#451a03] dark:text-[#fde68a]",
    red: "bg-[#fdecec] text-[#7a1f1d] dark:bg-[#450a0a] dark:text-[#fecaca]",
    grey: "bg-[#eef0f6] text-[#30323b] dark:bg-[#1e293b] dark:text-[#e2e8f0]",
  }[tone];
  return (
    <div role="status" className={`flex items-start gap-3 rounded-2xl px-5 py-4 ${cls}`}>
      <DIcon name={tone === "red" ? "key_off" : "pause_circle"} className="mt-0.5 text-[22px]" />
      <div className="min-w-0 text-[15px]">
        <p className="font-semibold">{title}</p>
        <p>{children}</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Pictures tab

const TILES: Array<{ view: PictureView; label: string; key: keyof PartPictureList["counts"]; bar: string; icon: string; tint: string }> = [
  { view: "made", label: "Made", key: "ready", bar: "bg-[#006e31]", icon: "check_circle", tint: "text-[#006e31] dark:text-[#4ade80]" },
  { view: "being_made", label: "Being made", key: "beingMade", bar: "bg-[#0153dc]", icon: "autorenew", tint: "text-[#0153dc] dark:text-[#93b4ff]" },
  { view: "waiting", label: "Waiting", key: "waiting", bar: "bg-[#8a5a00]", icon: "hourglass_top", tint: "text-[#8a5a00] dark:text-[#fbbf24]" },
  { view: "failed", label: "Failed", key: "failed", bar: "bg-[#a83836]", icon: "error", tint: "text-[#a83836] dark:text-[#f87171]" },
  { view: "hidden", label: "Hidden", key: "hidden", bar: "bg-[#475569]", icon: "visibility_off", tint: "text-[#475569] dark:text-[#94a3b8]" },
];

function PicturesTab({
  data,
  error,
  loading,
  filters,
  pageNo,
  searchText,
  setSearchText,
  templates,
  set,
  retry,
  onOlder,
  onNewer,
  onChanged,
}: {
  data: PartPictureList | null;
  error: string | null;
  loading: boolean;
  filters: PartPictureFilters;
  pageNo: number;
  searchText: string;
  setSearchText: (v: string) => void;
  templates: PartPictureTemplate[];
  set: (patch: Partial<PartPictureFilters>) => void;
  retry: () => void;
  onOlder: () => void;
  onNewer: () => void;
  onChanged: (p: PartPicture) => void;
}) {
  if (error && !data) {
    return (
      <div className={`${D_CARD} mx-auto flex max-w-[560px] flex-col items-center gap-3 p-10 text-center`} data-testid="part-pictures-error">
        <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-[#fdecec] text-[#a83836] dark:bg-[#450a0a] dark:text-[#f87171]">
          <DIcon name="cloud_off" className="text-[28px]" />
        </span>
        <h2 className={`text-[20px] font-semibold ${D_TXT}`}>Couldn&apos;t load the pictures</h2>
        <p className={`text-[15px] ${D_MUTED}`}>Check your connection and try again.</p>
        <PartsButton variant="secondary" onClick={retry}>
          <DIcon name="refresh" className="text-[18px]" /> Try again
        </PartsButton>
      </div>
    );
  }
  if (!data) return <LoadingState />;
  const filtered = Boolean(filters.status || filters.catalogGroupId || filters.search || filters.savedPageId);
  const from = data.total === 0 ? 0 : (pageNo - 1) * data.pageSize + 1;
  const to = Math.min(data.total, from + data.items.length - 1);
  return (
    <>
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-5">
        {TILES.map((t) => (
          <button
            key={t.view}
            type="button"
            aria-pressed={filters.status === t.view}
            onClick={() => set({ status: filters.status === t.view ? undefined : t.view })}
            className={`${D_CARD} relative overflow-hidden p-5 pl-6 text-left transition-shadow hover:shadow-md ${filters.status === t.view ? "ring-2 ring-[#0153dc]" : ""}`}
          >
            <span className={`absolute inset-y-0 left-0 w-1 ${t.bar}`} aria-hidden />
            <div className="flex items-center justify-between gap-2">
              <span className={`text-[14px] ${D_TXT}`}>{t.label}</span>
              <DIcon name={t.icon} className={`text-[20px] ${t.tint}`} />
            </div>
            <div className={`mt-3 text-[30px] font-semibold leading-none tabular-nums ${D_TXT}`}>{data.counts[t.key].toLocaleString()}</div>
          </button>
        ))}
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <label className="relative min-w-[240px] flex-1">
          <span className="sr-only">Search a part number or name</span>
          <DIcon name="search" className={`pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[20px] ${D_MUTED}`} />
          <input
            type="search"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Search a part number or name…"
            className={`h-11 w-full rounded-xl border border-[#c5c6d0] bg-white pl-10 pr-3 text-[14px] dark:border-[#334155] dark:bg-[#111a2e] ${D_TXT}`}
          />
        </label>
        <Select
          label="Part group"
          value={filters.catalogGroupId ?? ""}
          onChange={(v) => set({ catalogGroupId: v || undefined })}
          options={[["", "All groups"], ...templates.map((t) => [t.catalogGroupId, t.name] as [string, string])]}
        />
        <Select
          label="State"
          value={filters.status ?? ""}
          onChange={(v) => set({ status: (v || undefined) as PictureView | undefined })}
          options={[["", "All states"], ...TILES.map((t) => [t.view, t.label] as [string, string])]}
        />
        {filters.savedPageId ? (
          <PartsButton variant="secondary" onClick={() => set({ savedPageId: undefined })} data-testid="part-pictures-upload-filter">
            This upload <DIcon name="close" className="text-[16px]" />
          </PartsButton>
        ) : null}
      </div>

      {error ? <p className="mb-4 text-[14px] text-[#a83836] dark:text-[#f87171]">{error}</p> : null}

      {data.items.length === 0 ? (
        <div className={`${D_CARD} mx-auto flex max-w-[620px] flex-col items-center gap-3 p-10 text-center`} data-testid="part-pictures-empty">
          <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-[#dbe1ff] text-[#0153dc] dark:bg-[#1e3a8a]/50 dark:text-[#93b4ff]">
            <DIcon name="photo_library" className="text-[28px]" />
          </span>
          <h2 className={`text-[20px] font-semibold ${D_TXT}`}>{filtered ? "No pictures match" : "No part pictures yet"}</h2>
          <p className={`text-[15px] ${D_MUTED}`}>
            {filtered ? "Try a different search or filter." : "Upload a saved page as a single file to make the first ones."}
          </p>
          {filtered ? (
            <PartsButton
              variant="secondary"
              onClick={() => {
                setSearchText("");
                set({ status: undefined, catalogGroupId: undefined, search: undefined, savedPageId: undefined });
              }}
            >
              Clear filters
            </PartsButton>
          ) : null}
        </div>
      ) : (
        <div className={`grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4 ${loading ? "opacity-60" : ""}`} aria-busy={loading}>
          {data.items.map((p) => (
            <PictureCard key={p.id} picture={p} onChanged={onChanged} />
          ))}
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <span className={`text-[15px] ${D_MUTED}`}>
          Showing <b className={D_TXT}>{from}–{to}</b> of <b className={D_TXT}>{data.total.toLocaleString()}</b>
        </span>
        <div className="flex gap-2">
          <PartsButton variant="secondary" disabled={!data.hasNewer || pageNo <= 1} onClick={onNewer}>
            <DIcon name="chevron_left" className="text-[18px]" /> Newer
          </PartsButton>
          <PartsButton variant="secondary" disabled={!data.hasOlder} onClick={onOlder}>
            Older <DIcon name="chevron_right" className="text-[18px]" />
          </PartsButton>
        </div>
      </div>
    </>
  );
}

function PictureCard({ picture, onChanged }: { picture: PartPicture; onChanged: (p: PartPicture) => void }) {
  const [open, setOpen] = useState(false);
  const actions = usePictureActions(onChanged);
  const word = pictureWord(picture);
  const buttons = (full: boolean) => (
    <PictureButtons
      picture={picture}
      busy={actions.busy}
      short={!full}
      onRemake={() => actions.askRemake(picture)}
      onHide={() => void actions.hide(picture)}
      onShow={() => void actions.show(picture)}
    />
  );
  return (
    <article className={`${D_CARD} flex flex-col overflow-hidden`} data-testid="part-picture-card">
      <div className="relative">
        <PartPictureFrame
          picture={picture}
          size="full"
          icon={groupIcon(picture.catalogGroup?.name)}
          className="!rounded-none"
          onOpen={picture.url ? () => setOpen(true) : undefined}
        />
        {word ? (
          <div className="absolute right-3 top-3 [&>span]:shadow-[0_1px_4px_rgba(0,0,0,0.12)] [&>span]:ring-2 [&>span]:ring-white dark:[&>span]:ring-[#0f172a]">
            <PictureStatePill word={word} />
          </div>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          {picture.catalogGroup ? (
            <span className="rounded-full bg-[#f1f5f9] px-2.5 py-0.5 text-[12px] text-[#475569] dark:bg-[#1e293b] dark:text-[#94a3b8]">
              {picture.catalogGroup.name}
            </span>
          ) : <span />}
          {picture.madeAt ? <span className={`text-[13px] ${D_MUTED}`}>Made {plainDay(picture.madeAt)}</span> : null}
        </div>
        <h3 className={`text-[17px] font-semibold ${D_TXT}`}>{picture.partName || "Part"}</h3>
        <span className={`text-[14px] ${D_MONO} ${D_TXT}`}>{picture.partNumber}</span>
        {picture.status === "being_made" ? (
          <p className="mt-2 flex items-center gap-2 rounded-lg bg-[#dbe1ff]/60 px-3 py-2 text-[14px] text-[#0153dc] dark:bg-[#1e3a8a]/40 dark:text-[#93b4ff]">
            <DIcon name="autorenew" className="animate-spin text-[18px] motion-reduce:animate-none" /> Making the picture
          </p>
        ) : picture.status === "waiting" ? (
          <p className="mt-2 flex items-center gap-2 rounded-lg bg-[#fff4dc] px-3 py-2 text-[14px] text-[#8a5a00] dark:bg-[#451a03] dark:text-[#fbbf24]">
            <DIcon name="schedule" className="text-[18px]" /> {waitingLine(picture.waitingReason)}
          </p>
        ) : picture.status === "failed" ? (
          <p className="mt-1 text-[13px] text-[#a83836] dark:text-[#f87171]">The picture couldn&apos;t be made</p>
        ) : picture.status === "hidden" ? (
          <p className={`mt-1 text-[13px] ${D_MUTED}`}>Roam Fleet doesn&apos;t show this picture.</p>
        ) : null}
        <div className="mt-auto pt-3">{buttons(false)}</div>
        {actions.error ? <p className="text-[13px] text-[#a83836] dark:text-[#f87171]">{actions.error}</p> : null}
      </div>
      {actions.confirm}
      {open ? <PartPictureOverlay picture={picture} onClose={() => setOpen(false)} actions={buttons(true)} /> : null}
    </article>
  );
}

function LoadingState() {
  return (
    <div aria-busy="true" aria-label="Loading part pictures" data-testid="part-pictures-loading">
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-5">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-2xl bg-[#eef0f6] motion-reduce:animate-none dark:bg-[#1e293b]" />
        ))}
      </div>
      <div className="mb-6 h-11 animate-pulse rounded-xl bg-[#eef0f6] motion-reduce:animate-none dark:bg-[#1e293b]" />
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-80 animate-pulse rounded-2xl bg-[#eef0f6] motion-reduce:animate-none dark:bg-[#1e293b]" />
        ))}
      </div>
    </div>
  );
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: Array<[string, string]> }) {
  return (
    <label className="relative">
      <span className="sr-only">{label}</span>
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`h-11 min-w-[160px] appearance-none rounded-xl border border-[#c5c6d0] bg-white pl-3 pr-9 text-[14px] dark:border-[#334155] dark:bg-[#111a2e] ${D_TXT}`}
      >
        {options.map(([v, l]) => (
          <option key={v} value={v}>{l}</option>
        ))}
      </select>
      <DIcon name="expand_more" className={`pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[20px] ${D_MUTED}`} />
    </label>
  );
}

// ---------------------------------------------------------------- Templates tab

function TemplatesTab({
  templates,
  isOwner,
  dailyMax,
  onSaved,
}: {
  templates: PartPictureTemplate[] | null;
  isOwner: boolean;
  dailyMax: number;
  onSaved: () => void;
}) {
  if (!templates) return <LoadingState />;
  return (
    <div className="flex flex-col gap-5">
      <p className={`flex items-center gap-2 rounded-xl bg-[#f3f4fb] px-4 py-3 text-[14px] dark:bg-[#111a2e] ${D_MUTED}`}>
        <DIcon name="info" className="text-[18px]" />
        Each part group has a short description of its materials. Roam adds it to every picture it makes for that group.
      </p>
      {templates.map((t) => (
        <TemplateCard key={t.catalogGroupId} template={t} isOwner={isOwner} dailyMax={dailyMax} onSaved={onSaved} />
      ))}
    </div>
  );
}

function TemplateCard({
  template,
  isOwner,
  dailyMax,
  onSaved,
}: {
  template: PartPictureTemplate;
  isOwner: boolean;
  dailyMax: number;
  onSaved: () => void;
}) {
  const [text, setText] = useState(template.materials);
  const [enabled, setEnabled] = useState(template.enabled);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [older, setOlder] = useState<RemakeOlder | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    setText(template.materials);
    setEnabled(template.enabled);
  }, [template]);

  useEffect(() => {
    let live = true;
    remakeOlderCount(template.catalogGroupId).then((r) => live && setOlder(r), () => live && setOlder(null));
    return () => {
      live = false;
    };
  }, [template.catalogGroupId, template.version]);

  const changed = text.trim() !== template.materials.trim() || enabled !== template.enabled;
  const versionLine = template.updatedByName
    ? `Version ${template.version} · last edited by ${template.updatedByName} on ${plainDay(template.updatedAt)}`
    : `Version ${template.version} · set up by Roam`;

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const patch: { materials?: string; enabled?: boolean } = {};
      if (text.trim() !== template.materials.trim()) patch.materials = text.trim();
      if (enabled !== template.enabled) patch.enabled = enabled;
      await saveTemplate(template.catalogGroupId, patch);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save the template");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={`${D_CARD} flex flex-col gap-4 p-6`} data-testid="part-picture-template">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#dbe1ff] text-[#0153dc] dark:bg-[#1e3a8a]/50 dark:text-[#93b4ff]">
            <DIcon name={groupIcon(template.name)} className="text-[22px]" />
          </span>
          <h3 className={`text-[18px] font-semibold ${D_TXT}`}>{template.name}</h3>
        </div>
        <label className="flex items-center gap-2">
          <span className={`text-[14px] font-medium ${enabled ? "text-[#006e31] dark:text-[#4ade80]" : D_MUTED}`}>{enabled ? "On" : "Off"}</span>
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            aria-label={`${template.name} pictures`}
            disabled={!isOwner || busy}
            onClick={() => setEnabled(!enabled)}
            className={`relative h-7 w-12 rounded-full transition-colors disabled:opacity-50 ${enabled ? "bg-[#006e31]" : "bg-[#c9ccd6] dark:bg-[#334155]"}`}
          >
            <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${enabled ? "left-[22px]" : "left-0.5"}`} />
          </button>
        </label>
      </div>
      <label className="flex flex-col gap-2">
        <span className={`text-[13px] font-semibold ${D_MUTED}`}>Materials</span>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          readOnly={!isOwner}
          rows={3}
          placeholder="Describe the materials, for example: clear plastic bottle with a coloured cap."
          className={`w-full rounded-[10px] border border-[#c5c6d0] bg-white p-3 text-[14px] outline-none focus:ring-2 focus:ring-[#0153dc] dark:border-[#334155] dark:bg-[#0b1220] ${D_TXT}`}
        />
      </label>
      <p className={`flex items-center gap-1.5 text-[13px] ${D_MUTED}`}>
        <DIcon name={enabled ? "history" : "block"} className="text-[16px]" />
        {enabled ? versionLine : `Off — ${template.name} parts get no picture.`}
      </p>
      <div className="flex flex-wrap items-end justify-between gap-3 border-t border-[#e6e7ee] pt-4 dark:border-[#1e293b]">
        <div className="flex flex-col gap-1">
          <PartsButton variant="primary" disabled={!isOwner || !changed || busy} onClick={() => void save()}>
            <DIcon name="check" className="text-[18px]" /> Save
          </PartsButton>
          {!isOwner ? (
            <span className={`text-[12px] ${D_MUTED}`}>Only the owner can change this</span>
          ) : !changed ? (
            <span className={`text-[12px] ${D_MUTED}`}>No changes</span>
          ) : null}
        </div>
        {older && older.count + older.needUpload > 0 ? (
          <div className="flex flex-col items-end gap-1">
            <PartsButton variant="secondary" disabled={!isOwner || older.count === 0} onClick={() => setConfirmOpen(true)}>
              <DIcon name="autorenew" className="text-[18px]" /> Remake pictures made with an older version
            </PartsButton>
            <span className={`text-[12px] ${D_MUTED}`}>
              {older.count} {older.count === 1 ? "picture" : "pictures"} · about {money(older.costUsd)} · about {older.days}{" "}
              {older.days === 1 ? "day" : "days"} at {dailyMax} a day
            </span>
          </div>
        ) : null}
      </div>
      {error ? <p className="text-[13px] text-[#a83836] dark:text-[#f87171]">{error}</p> : null}
      {note ? <p className="text-[13px] text-[#006e31] dark:text-[#4ade80]">{note}</p> : null}
      {confirmOpen && older ? (
        <RemakeOlderDialog
          name={template.name}
          version={template.version}
          older={older}
          dailyMax={dailyMax}
          onCancel={() => setConfirmOpen(false)}
          onDone={(queued) => {
            setConfirmOpen(false);
            setNote(`${queued} ${queued === 1 ? "picture" : "pictures"} queued for remaking.`);
            onSaved();
          }}
          groupId={template.catalogGroupId}
        />
      ) : null}
    </section>
  );
}

function RemakeOlderDialog({
  name,
  version,
  older,
  dailyMax,
  groupId,
  onCancel,
  onDone,
}: {
  name: string;
  version: number;
  older: RemakeOlder;
  dailyMax: number;
  groupId: string;
  onCancel: () => void;
  onDone: (queued: number) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);
  const rows = useMemo(
    () => [
      ["Pictures to remake", String(older.count)],
      ["Cost", `About ${money(older.costUsd)}`],
      ["Time", `About ${older.days} ${older.days === 1 ? "day" : "days"} at ${dailyMax} a day`],
    ],
    [older, dailyMax],
  );
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-[#0f172a]/40 p-4" role="dialog" aria-modal="true" aria-label={`Remake ${older.count} ${name} pictures?`}>
      <div className="w-full max-w-[560px] rounded-[20px] bg-white p-8 shadow-xl dark:bg-[#111a2e]">
        <span className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-full bg-[#dbe1ff] text-[#0153dc] dark:bg-[#1e3a8a]/50 dark:text-[#93b4ff]">
          <DIcon name="autorenew" className="text-[28px]" />
        </span>
        <h2 className={`text-[22px] font-semibold ${D_TXT}`}>Remake {older.count} {name} pictures?</h2>
        <p className={`mt-2 text-[15px] ${D_MUTED}`}>
          These pictures were made with an older {name} version. Roam will make them again with version {version}.
        </p>
        <dl className="mt-5 divide-y divide-[#e6e7ee] rounded-xl bg-[#f3f4fb] px-5 dark:divide-[#1e293b] dark:bg-[#0b1220]">
          {rows.map(([k, v]) => (
            <div key={k} className="flex items-center justify-between py-3 text-[15px]">
              <dt className={D_MUTED}>{k}</dt>
              <dd className={`font-semibold ${D_MONO} ${D_TXT}`}>{v}</dd>
            </div>
          ))}
        </dl>
        {older.needUpload > 0 ? (
          <p className={`mt-4 flex items-start gap-2 text-[14px] ${D_MUTED}`}>
            <DIcon name="event_repeat" className="text-[18px]" />
            {older.needUpload} more {older.needUpload === 1 ? "picture needs its" : "pictures need their"} page uploaded again as a single file — the drawing is
            older than 30 days.
          </p>
        ) : null}
        <p className={`mt-2 flex items-center gap-2 text-[14px] ${D_MUTED}`}>
          <DIcon name="schedule" className="text-[18px]" /> The old pictures stay for 30 days.
        </p>
        {error ? <p className="mt-3 text-[13px] text-[#a83836] dark:text-[#f87171]">{error}</p> : null}
        <div className="mt-6 flex justify-end gap-3">
          <PartsButton variant="danger" disabled={busy} onClick={onCancel}>Cancel</PartsButton>
          <PartsButton
            variant="primary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                const r = await remakeOlder(groupId);
                onDone(r.queued);
              } catch (e) {
                setError(e instanceof Error ? e.message : "Couldn't queue the remakes");
                setBusy(false);
              }
            }}
          >
            <DIcon name="refresh" className="text-[18px]" /> Remake {older.count} pictures
          </PartsButton>
        </div>
      </div>
    </div>
  );
}
