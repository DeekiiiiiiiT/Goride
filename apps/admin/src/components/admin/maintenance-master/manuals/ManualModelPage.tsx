import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type { MaintenanceServiceCategory } from "../../../../types/maintenance";
import type { MaintenanceRule } from "../maintenanceMasterApi";
import { getManual, listModelFamilies, rereadPages, stopManual, type ManualDetail, type ModelFamilyRow } from "./manualsApi";
import {
  BTN_DANGER,
  BTN_PRIMARY,
  BTN_SECONDARY,
  CARD,
  Icon,
  ManualStatusPill,
  MarketPill,
  Pill,
  SourcePill,
  dateText,
  everyText,
} from "./manualsUi";
import { SPEC_GROUPS, pageListText, specLabel, specValueText } from "./specsFormat";

const MARKET_RANK: Record<string, number> = { JM: 1, GEN: 2, JP: 3, OTHER: 4 };

type Props = {
  token: string;
  platformId: string;
  rules: MaintenanceRule[];
  categories: MaintenanceServiceCategory[];
  canEdit: boolean;
  canApprove: boolean;
  /** Bumped by the parent when something changed elsewhere (an approval). */
  refreshKey: number;
  onBack: () => void;
  onOpenCheck: (manualId: string, modelName: string) => void;
  onUpload: (platformId: string, modelName: string) => void;
  onChanged: () => void;
};

function PageTile({ page, status }: { page: number; status: string }) {
  const styles: Record<string, string> = {
    done: "border-[#e6e7ee] bg-white",
    reading: "border-2 border-[#0153dc] bg-[#f3f6ff]",
    queued: "border-[#e6e7ee] bg-[#f3f4fb] opacity-70",
    failed: "border-[#e0b44a] bg-[#fff4dc]",
    skipped: "border-[#e6e7ee] bg-[#f3f4fb] opacity-50",
  };
  const icon: Record<string, [string, string]> = {
    done: ["check_circle", "text-[#006e31]"],
    reading: ["sync", "text-[#0153dc] animate-spin"],
    queued: ["hourglass_empty", "text-[#9a9ba4]"],
    failed: ["priority_high", "text-[#8a5a00]"],
    skipped: ["block", "text-[#9a9ba4]"],
  };
  const [name, cls] = icon[status] ?? ["help", "text-[#9a9ba4]"];
  return (
    <div className={`flex h-[112px] w-[92px] flex-col justify-between rounded-xl border p-2 ${styles[status] ?? styles.queued}`}>
      <div className="space-y-1.5 pt-1">
        <div className="h-1 w-3/4 rounded bg-[#d8dbe8]" />
        <div className="h-1 w-full rounded bg-[#e6e7ee]" />
        <div className="h-1 w-2/3 rounded bg-[#e6e7ee]" />
      </div>
      <div className="flex items-center justify-between">
        <span className="font-mono text-[12px]">{page}</span>
        <Icon name={name} className={`text-[16px] ${cls}`} />
      </div>
    </div>
  );
}

export function ManualModelPage({
  token,
  platformId,
  rules,
  categories,
  canEdit,
  canApprove,
  refreshKey,
  onBack,
  onOpenCheck,
  onUpload,
  onChanged,
}: Props) {
  const [family, setFamily] = useState<ModelFamilyRow | null>(null);
  const [details, setDetails] = useState<Record<string, ManualDetail>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const list = await listModelFamilies(token, { platformId });
      const row = list.items[0] ?? null;
      setFamily(row);
      const ds = await Promise.all((row?.manuals ?? []).map((m) => getManual(token, m.id).catch(() => null)));
      const map: Record<string, ManualDetail> = {};
      for (const d of ds) if (d) map[d.manual.id] = d;
      setDetails(map);
      setError("");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "This model could not be loaded.");
    }
  }, [token, platformId]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  // While a manual is being read, check every 10 seconds.
  const reading = (family?.manuals ?? []).some((m) => m.status === "reading");
  useEffect(() => {
    if (!reading) return;
    const t = window.setInterval(() => void load(), 10_000);
    return () => window.clearInterval(t);
  }, [reading, load]);

  const name = family?.name ?? family?.label ?? "This model";
  const shortName = name.replace(/\s\d{4}.*$/, "");

  const checkedOrder = useMemo(
    () =>
      (family?.manuals ?? [])
        .filter((m) => m.status === "checked")
        .sort((a, b) => (MARKET_RANK[a.market] ?? 9) - (MARKET_RANK[b.market] ?? 9)),
    [family],
  );

  // What every car of this model uses now: its own rule, else the everyone rule.
  const inUse = useMemo(() => {
    const active = rules.filter((r) => r.status === "active" && r.component_id);
    const byPart = new Map<string, MaintenanceRule>();
    for (const r of active) {
      const own = String(r.template_scope) === "platform" && String(r.platform_id ?? "") === platformId;
      const global = String(r.template_scope) === "global";
      if (!own && !global) continue;
      if ((r as { frequency_kind?: string }).frequency_kind === "manual_only") continue;
      const prev = byPart.get(r.component_id);
      const prevOwn = prev && String(prev.template_scope) === "platform";
      if (!prev || (own && !prevOwn)) byPart.set(r.component_id, r);
    }
    const nameOf = (id: string) => categories.find((c) => c.id === id)?.name ?? "Part";
    return [...byPart.values()].sort((a, b) => nameOf(a.component_id).localeCompare(nameOf(b.component_id))).map((r) => ({
      rule: r,
      part: nameOf(r.component_id),
    }));
  }, [rules, platformId, categories]);

  const anyApproved = inUse.some(({ rule }) => rule.source_type === "maker_manual");

  const stop = async (id: string) => {
    setBusy(true);
    try {
      await stopManual(token, id);
      toast.success("Stopped. The numbers found so far are kept as drafts.");
      await load();
      onChanged();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Could not stop reading.");
    } finally {
      setBusy(false);
    }
  };

  const reread = async (id: string, pages: number[]) => {
    setBusy(true);
    try {
      await rereadPages(token, id, pages);
      toast.success(`Reading ${pages.length} page${pages.length === 1 ? "" : "s"} again.`);
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Could not read those pages again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-2 space-y-6 text-[#30323b]" data-testid="mm-manual-model">
      <div className="flex flex-wrap items-center gap-4">
        <button type="button" className={BTN_SECONDARY} onClick={onBack}>
          <Icon name="arrow_back" className="text-[18px]" />
          Manuals
        </button>
        <div>
          <h2 className="text-[26px] font-semibold">{name}</h2>
          {family?.also_sold_as.length ? (
            <p className="text-[14px] text-[#5d5f68]">Also sold as {family.also_sold_as.join(", ")}</p>
          ) : null}
        </div>
        {canEdit ? (
          <button type="button" className={`${BTN_SECONDARY} ml-auto`} onClick={() => onUpload(platformId, name)}>
            <Icon name="add" className="text-[18px]" />
            Upload a manual
          </button>
        ) : null}
      </div>

      {error ? <p className="rounded-[10px] bg-[#fdecec] px-3 py-2 text-[14px] text-[#a83836]">{error}</p> : null}

      {anyApproved && checkedOrder.length ? (
        <p className="flex items-center gap-2 rounded-2xl bg-[#e6f4ea] px-4 py-3 text-[15px] text-[#006e31]">
          <Icon name="check_circle" className="text-[20px]" />
          Every {name} now uses its owner's manual.
        </p>
      ) : null}

      {(family?.manuals ?? []).map((m) => {
        const d = details[m.id];
        const pages = d?.pages ?? [];
        const failed = pages.filter((p) => p.status === "failed");
        const found = d?.rows.length ?? 0;
        const doneCount = d?.progress.pages_done ?? 0;
        const totalPages = d?.progress.pages_total ?? m.page_to - m.page_from + 1;
        // Only a page that is being read right now counts; progress_page is "last finished", not "now".
        const readingPage = pages.find((p) => p.status === "reading");
        const nowReading = readingPage ? (readingPage.printed_page ?? readingPage.pdf_page) : null;
        const usedFirst = m.status === "checked" && checkedOrder[0]?.id === m.id;
        const isOwnersManual = d?.manual.doc_type === "owners_manual";
        const specCount = d?.specs?.length ?? 0;
        const printedList = d?.manual.printed_pages?.length
          ? pageListText(d.manual.printed_pages)
          : `${m.page_from}–${m.page_to}`;
        return (
          <section key={m.id} className={`${CARD} p-6`} data-testid="mm-manual-card">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="mb-2">
                  {isOwnersManual ? (
                    <Pill tone="slate" icon="menu_book">
                      Owner's manual
                    </Pill>
                  ) : (
                    <Pill tone="blue" icon="event_repeat">
                      Service schedule
                    </Pill>
                  )}
                </div>
                <h3 className="text-[20px] font-semibold">{m.title}</h3>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <ManualStatusPill status={m.status} />
                  <MarketPill market={m.market} />
                  {m.status === "checked" ? (
                    usedFirst ? (
                      <Pill tone="green" icon="check">
                        Used first
                      </Pill>
                    ) : (
                      <Pill tone="slate">Backup</Pill>
                    )
                  ) : null}
                </div>
              </div>
              <p className="max-w-[360px] text-right text-[13px] text-[#5d5f68]">
                {m.page_count} pages · {m.status === "reading" ? "reading " : ""}pages {printedList}
                {d?.manual.year_from ? ` · for ${d.manual.year_from}–${d.manual.year_to ?? ""}` : ""}
                {d?.manual.uploaded_at ? ` · uploaded ${dateText(String(d.manual.uploaded_at))}` : ""}
              </p>
            </div>

            {m.status === "reading" ? (
              <div className="mt-5 rounded-2xl bg-[#f3f6ff] p-5">
                <div className="flex flex-wrap items-center gap-3">
                  <p className="text-[17px]">
                    {nowReading ? (
                      <>
                        Reading page <span className="font-semibold text-[#0153dc]">{nowReading}</span> of {m.page_to}
                      </>
                    ) : (
                      "Waiting to start reading"
                    )}
                  </p>
                  <span className="text-[15px] text-[#5d5f68]">
                    · {doneCount} of {totalPages} pages done
                  </span>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#dbe1ff]">
                  <div className="h-full bg-[#0153dc] transition-all" style={{ width: `${totalPages ? (doneCount / totalPages) * 100 : 0}%` }} />
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {pages.map((p) => (
                    <PageTile key={p.pdf_page} page={p.printed_page ?? p.pdf_page} status={p.status} />
                  ))}
                </div>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <p className="flex items-center gap-2 text-[14px] text-[#5d5f68]">
                    <Icon name="info" className="text-[18px]" />
                    You can leave this page. Roam carries on and lets you know when it's ready to check.
                  </p>
                  {canApprove ? (
                    <button type="button" className={BTN_DANGER} onClick={() => void stop(m.id)} disabled={busy}>
                      <Icon name="cancel" className="text-[18px]" />
                      Stop reading
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}

            {m.status !== "reading" && failed.length ? (
              <div className="mt-5 rounded-2xl border border-[#e0b44a] bg-[#fff4dc] p-5" data-testid="mm-failed-pages">
                <p className="flex items-center gap-2 text-[16px] font-semibold text-[#8a5a00]">
                  <Icon name="warning" className="text-[20px]" />
                  {failed.length === 1 ? `Page ${failed[0].printed_page ?? failed[0].pdf_page} could not be read` : `Pages ${failed.map((p) => p.printed_page ?? p.pdf_page).join(" and ")} could not be read`}
                </p>
                <ul className="mt-1 space-y-0.5 text-[14px] text-[#8a5a00]">
                  {failed.map((p) => (
                    <li key={p.pdf_page}>
                      Page {p.printed_page ?? p.pdf_page}: {p.error ?? "Roam found nothing it could read."}
                    </li>
                  ))}
                </ul>
                {canEdit ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className={BTN_SECONDARY}
                      disabled={busy}
                      onClick={() => void reread(m.id, failed.map((p) => p.pdf_page))}
                    >
                      <Icon name="sync" className="text-[18px]" />
                      Read {failed.length === 1 ? "that page" : `those ${failed.length} pages`} again
                    </button>
                    <button type="button" className={BTN_SECONDARY} onClick={() => onUpload(platformId, name)}>
                      <Icon name="edit_document" className="text-[18px]" />
                      Choose different pages
                    </button>
                  </div>
                ) : null}
                {doneCount ? (
                  <p className="mt-3 flex items-center gap-1 text-[13px] text-[#006e31]">
                    <Icon name="check" className="text-[16px]" />
                    The other {doneCount} page{doneCount === 1 ? "" : "s"} read fine.
                  </p>
                ) : null}
              </div>
            ) : null}

            {m.status === "waiting_check" ? (
              <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                <p className="text-[15px] text-[#5d5f68]">
                  {isOwnersManual
                    ? `${specCount} spec${specCount === 1 ? "" : "s"} found${found ? ` and ${found} interval${found === 1 ? "" : "s"}` : ""}. Check them against the pages, then approve.`
                    : `${found} number${found === 1 ? "" : "s"} found. Check them against the pages, then approve.`}
                </p>
                <button type="button" className={BTN_PRIMARY} onClick={() => onOpenCheck(m.id, name)}>
                  {isOwnersManual ? "Check specs" : failed.length ? `Check the ${found} numbers found` : "Check numbers"}
                  <Icon name="arrow_forward" className="text-[18px]" />
                </button>
              </div>
            ) : null}

            {m.status === "checked" ? (
              <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                <p className="text-[14px] text-[#5d5f68]">
                  {usedFirst ? "" : "Used only for parts the first manual leaves out. "}
                  {d?.manual.checked_at ? `Checked ${dateText(String(d.manual.checked_at))}` : ""}
                </p>
                <div className="flex gap-2">
                  <button type="button" className={BTN_SECONDARY} onClick={() => onOpenCheck(m.id, name)}>
                    <Icon name="visibility" className="text-[18px]" />
                    {isOwnersManual ? "See the specs" : "See the numbers"}
                  </button>
                  {canEdit ? (
                    <button
                      type="button"
                      className={BTN_SECONDARY}
                      disabled={busy}
                      onClick={() => {
                        // Only the pages this document was told to read (DOC-03), not every page in between.
                        const listed = d?.manual.pages?.length ? d.manual.pages : null;
                        const all: number[] = [];
                        if (listed) all.push(...listed);
                        else for (let p = m.page_from; p <= m.page_to; p += 1) all.push(p);
                        void reread(m.id, all);
                      }}
                    >
                      <Icon name="cached" className="text-[18px]" />
                      Read again
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}

            {m.status === "rejected" || m.status === "stopped" ? (
              <p className="mt-4 text-[14px] text-[#5d5f68]">
                {m.status === "rejected"
                  ? `Rejected: ${String(d?.manual.reject_reason ?? "")}`
                  : `Stopped${d?.manual.stop_reason ? `: ${String(d.manual.stop_reason)}` : "."}`}
                {found ? ` ${found} number${found === 1 ? "" : "s"} kept as drafts.` : ""}
              </p>
            ) : null}
            {m.status === "stopped" && found ? (
              <div className="mt-3">
                <button type="button" className={BTN_SECONDARY} onClick={() => onOpenCheck(m.id, name)}>
                  Check the {found} numbers found
                </button>
              </div>
            ) : null}
          </section>
        );
      })}

      {(() => {
        // "Specs from the owner's manual" (screen 4): every spec any owner's manual of this model found.
        const specs = Object.values(details)
          .filter((dd) => dd.manual.doc_type === "owners_manual")
          .flatMap((dd) => (dd.specs ?? []).filter((s) => s.status !== "rejected").map((s) => ({ s, manualId: dd.manual.id })));
        if (!specs.length) return null;
        const waiting = specs.some(({ s }) => s.status !== "active");
        return (
          <section className={`${CARD} p-6`} data-testid="mm-model-specs">
            <div className="flex flex-wrap items-center gap-3">
              <h3 className="text-[20px] font-semibold">Specs from the owner's manual</h3>
              {waiting ? (
                <Pill tone="amber" icon="pending_actions">
                  Not checked yet
                </Pill>
              ) : (
                <Pill tone="green" icon="check">
                  Checked
                </Pill>
              )}
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {SPEC_GROUPS.map((g) => {
                const rows = specs.filter(({ s }) => s.kind === g.kind);
                if (!rows.length) return null;
                return (
                  <div key={g.kind} className="rounded-2xl bg-[#f3f4fb] p-4">
                    <p className="flex items-center gap-2 text-[15px] font-semibold">
                      <Icon name={g.icon} className="text-[20px] text-[#0153dc]" />
                      {g.title}
                    </p>
                    <ul className="mt-2 space-y-1.5">
                      {rows.map(({ s }) => (
                        <li key={s.id} className={`flex items-baseline justify-between gap-3 text-[14px] ${s.status === "active" ? "" : "text-[#5d5f68]"}`}>
                          <span>
                            <span className="font-medium">{specLabel(s)}</span>
                            {s.applies_to ? <span className="text-[12px] text-[#5d5f68]"> · {s.applies_to}</span> : null}
                          </span>
                          <span className="whitespace-nowrap font-mono text-[13px]">
                            {specValueText(s)}
                            {s.printed_page ? <span className="ml-2 font-sans text-[12px] text-[#5d5f68]">p. {s.printed_page}</span> : null}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })()}

      {family && !family.manuals.length ? (
        <section className={`${CARD} p-6 text-[15px] text-[#5d5f68]`}>
          No manual for this model yet. Every {shortName} uses Roam policy until you upload one.
        </section>
      ) : null}

      <section className={`${CARD} p-6`}>
        <h3 className="text-[20px] font-semibold">What every {shortName} uses {anyApproved ? "now" : "today"}</h3>
        <ul className="mt-4 space-y-2">
          {inUse.map(({ rule, part }) => {
            const page = (rule as { evidence_page?: number | null }).evidence_page;
            const sevSame = (rule as { severe_same_as_normal?: boolean }).severe_same_as_normal;
            const sev =
              rule.severe_interval_km != null || rule.severe_interval_months != null
                ? everyText(rule.severe_interval_km as number | null, rule.severe_interval_months as number | null)
                : "";
            return (
              <li key={rule.id} className="flex flex-wrap items-center gap-3 rounded-xl bg-[#f3f4fb] px-4 py-3">
                <div className="min-w-[200px] flex-1">
                  <p className="text-[15px] font-semibold">{part}</p>
                  <p className="font-mono text-[13px]">
                    {everyText(rule.interval_km, rule.interval_months)}
                    {sevSame ? " · harder driving the same" : sev ? ` · harder driving ${sev.toLowerCase()}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <SourcePill source={rule.source_type} />
                  <span className="text-[13px] text-[#5d5f68]">
                    {rule.source_type === "maker_manual" ? (page ? `Owner's manual · page ${page}` : "Owner's manual") : "No manual checked yet"}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
        <p className="mt-3 flex items-center gap-2 text-[13px] text-[#5d5f68]">
          <Icon name="info" className="text-[16px]" />
          This changes as soon as you approve a manual's numbers.
        </p>
      </section>
    </div>
  );
}
