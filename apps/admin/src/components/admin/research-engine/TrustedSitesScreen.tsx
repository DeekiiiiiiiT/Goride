/**
 * S5 Parts database → Trusted sources — Stitch screens 10 (list), 11 (Add a site) and 12 (a site's lookup recipes).
 * The one trusted list (RE-11): trusted_site + trusted_source. Edits are the platform owner's alone (RE-21) and are
 * logged on the server. "Pages confirmed" = trusted_site.pages_confirmed; "Worked N times" = job reads with a row found.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "../../auth/AuthContext";
import {
  researchApi,
  type LookupRecipe,
  type SiteRead,
  type TrustedSite,
} from "../../../services/researchEngineService";
import { listVehicleCatalogPicker } from "../../../services/vehicleCatalogService";
import { deleteTrustedSourceMaker, renameTrustedSourceMaker } from "../parts-database/partsDatabaseApi";
import type { VehicleCatalogRecord } from "../../../types/vehicleCatalog";
import {
  D_CARD,
  D_MONO,
  D_MUTED,
  D_TXT,
  DIcon,
  PartsButton,
  RE_LABEL,
  RE_SOFT,
  ReDrawer,
  ReError,
  RePill,
  ReSavedText,
  ReSkeleton,
} from "./ReKit";
import { shortDate, siteName } from "./researchModel";
import { makesOf, modelsOf, partNumberOptions, type PickOption, versionLabels, versionsFor, yearOptions } from "./carPick";
import { SearchPick } from "./SearchPick";

const OWNER_ONLY = "Only the platform owner can change trusted sites.";
type Kind = "part_maker" | "car_maker" | "reference";

const GROUPS: Array<{ kind: Kind; title: string; dot: string; line: string }> = [
  {
    kind: "part_maker",
    title: "Part makers",
    dot: "bg-[#006e31]",
    line: "A part maker's own catalogue confirms its own parts. Two part makers naming the same factory number confirm it too.",
  },
  {
    kind: "car_maker",
    title: "Car-maker catalogues",
    dot: "bg-[#0153dc]",
    line: "The car maker's catalogue confirms a part for its own cars. Sites that block Roam are checked in your browser.",
  },
  {
    kind: "reference",
    title: "Reference only",
    dot: "bg-[#94a3b8]",
    line: "Reference sites can suggest a number. They never confirm one.",
  },
];

function siteKind(s: TrustedSite): Kind {
  const kinds = new Set(s.makers.map((m) => m.kind));
  if (kinds.has("car_maker")) return "car_maker";
  if (kinds.has("part_maker")) return "part_maker";
  return "reference";
}

/** Logo tile text: a short name as is ("SB", "NiBK"), else its first two letters ("Am"). */
export function logoText(domain: string): string {
  const n = siteName(domain);
  return n.length <= 4 ? n : n.slice(0, 2);
}

function ReadPill({ s }: { s: TrustedSite }) {
  const date = s.automated_read_checked_at ? ` · checked ${shortDate(s.automated_read_checked_at)}` : "";
  if (s.automated_read === "allowed") return <RePill tone="green" icon="check_circle">Roam can read it{date}</RePill>;
  if (s.automated_read === "blocked") return <RePill tone="blue" icon="web">Browser check only{date}</RePill>;
  return <RePill tone="grey-outline">Not checked yet</RePill>;
}

export function TrustedSitesScreen({ owner }: { owner: boolean }) {
  const { session } = useAuth();
  const token = session?.access_token ?? "";
  const [sites, setSites] = useState<TrustedSite[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [recipesFor, setRecipesFor] = useState<TrustedSite | null>(null);
  const [removing, setRemoving] = useState<TrustedSite | null>(null);
  const [openLog, setOpenLog] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setError(null);
    try {
      setSites(await researchApi.trustedSites(token));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load trusted sources");
    }
  }, [token]);
  useEffect(() => {
    void load();
  }, [load]);

  async function run(fn: () => Promise<unknown>, msg: string) {
    setBusy(true);
    try {
      await fn();
      toast.success(msg);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "That didn't work");
    } finally {
      setBusy(false);
    }
  }

  const knownMakers = useMemo(() => {
    const out: Record<Kind, string[]> = { car_maker: [], part_maker: [], reference: [] };
    for (const s of sites ?? []) for (const m of s.makers) if (m.maker !== "All makers" && !out[m.kind].includes(m.maker)) out[m.kind].push(m.maker);
    for (const k of Object.keys(out) as Kind[]) out[k].sort();
    return out;
  }, [sites]);

  if (error && !sites) return <ReError title="Couldn't load trusted sources" message={error} onRetry={() => void load()} />;
  if (!sites) return <ReSkeleton rows={4} testId="trusted-loading" />;

  return (
    <div className="flex flex-col gap-8 pt-6" data-testid="trusted-sites">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div className="flex flex-col gap-0.5">
          <div className="mt-1 flex flex-wrap items-baseline gap-3">
            <h1 className={`text-[26px] font-semibold tracking-tight ${D_TXT}`}>Trusted sources</h1>
            <span className={`text-[14px] ${D_MUTED}`}>Where Roam is allowed to confirm parts and specs.</span>
          </div>
        </div>
        <PartsButton variant="primary" className="!min-h-[40px]" disabled={!owner} title={owner ? undefined : OWNER_ONLY} onClick={() => setAdding(true)} data-testid="add-site">
          <DIcon name="add" className="text-[18px]" /> Add a site
        </PartsButton>
      </div>

      {GROUPS.map((g) => {
        const rows = sites.filter((s) => siteKind(s) === g.kind);
        return (
          <section key={g.kind} className={`${D_CARD} overflow-hidden`} data-testid={`site-group-${g.kind}`}>
            <div className="flex flex-col gap-1 p-6">
              <div className="flex items-center gap-2">
                <span className={`h-2.5 w-2.5 rounded-full ${g.dot}`} />
                <h2 className={`text-[18px] font-semibold ${D_TXT}`}>{g.title}</h2>
                <RePill tone="grey">{rows.length} {rows.length === 1 ? "site" : "sites"}</RePill>
              </div>
              <p className={`text-[13px] ${D_MUTED}`}>{g.line}</p>
            </div>
            {rows.length === 0 ? <p className={`border-t border-[#e6e7ee] px-6 py-4 text-[13px] dark:border-[#1e293b] ${D_MUTED}`}>No sites yet.</p> : null}
            {rows.map((s) => (
              <div key={s.domain} className="flex flex-col border-t border-[#e6e7ee] dark:border-[#1e293b]" data-testid="site-row">
                <div className="flex flex-col justify-between gap-4 p-6 xl:flex-row xl:items-center">
                  <div className="flex min-w-0 items-start gap-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#191b24] text-[14px] font-bold tracking-tighter text-white shadow-sm dark:bg-[#e2e8f0] dark:text-[#0b1220]">
                      {logoText(s.domain)}
                    </div>
                    <div className="flex min-w-0 flex-col gap-1">
                      <div className="flex flex-wrap items-center gap-2.5">
                        <a
                          href={`https://${s.domain}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`flex items-center gap-1 text-[16px] font-semibold hover:text-[#0153dc] ${D_TXT}`}
                        >
                          {s.domain}
                          <DIcon name="open_in_new" className="text-[15px]" />
                        </a>
                        <ReadPill s={s} />
                        {g.kind !== "reference" ? (
                          <span className={`rounded bg-[#ededf9] px-2 py-0.5 text-[13px] dark:bg-[#1e293b] ${D_MONO} ${D_MUTED}`} data-testid="pages-confirmed">
                            Pages confirmed: {s.pages_confirmed}
                          </span>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <PartsButton variant="secondary" className="!min-h-[26px] !px-2" onClick={() => setOpenLog(openLog === s.domain ? null : s.domain)} data-testid="site-reads">
                          <DIcon name="history" className="text-[14px]" /> Last reads
                        </PartsButton>
                      </div>
                      {s.makers.some((m) => m.maker !== "All makers") ? (
                        <div className={`flex flex-wrap items-center gap-1.5 text-[12px] ${D_MUTED}`}>
                          <span>Makers:</span>
                          {s.makers
                            .filter((m) => m.maker !== "All makers")
                            .map((m) => (
                              <MakerChip
                                key={`${m.kind}-${m.maker}`}
                                kind={m.kind}
                                maker={m.maker}
                                owner={owner}
                                onRename={(to) => void run(() => renameTrustedSourceMaker({ kind: m.kind as "car_maker" | "part_maker", from: m.maker, to }), `Renamed to ${to}`)}
                                onRemove={() => void run(() => deleteTrustedSourceMaker({ kind: m.kind as "car_maker" | "part_maker", maker: m.maker }), `${m.maker} removed`)}
                              />
                            ))}
                        </div>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 self-start xl:self-center">
                    <PartsButton variant="secondary" className="!min-h-[40px]" onClick={() => setRecipesFor(s)} data-testid="site-recipes">
                      <DIcon name="receipt_long" className="text-[16px]" /> Recipes ({s.recipeCount})
                    </PartsButton>
                    <PartsButton
                      variant="secondary"
                      className="!min-h-[40px]"
                      disabled={!owner || busy}
                      title={owner ? undefined : OWNER_ONLY}
                      data-testid="site-mark"
                      onClick={() =>
                        void run(
                          () => researchApi.markSite(token, s.domain, s.automated_read === "allowed" ? "blocked" : "allowed"),
                          s.automated_read === "allowed" ? `${s.domain} is now a browser-check site` : `Roam may read ${s.domain}`,
                        )
                      }
                    >
                      <DIcon name="language" className="text-[16px]" />
                      {s.automated_read === "allowed" ? "Mark as browser check" : "Mark as readable"}
                    </PartsButton>
                    <PartsButton variant="danger" className="!min-h-[40px]" disabled={!owner || busy} title={owner ? undefined : OWNER_ONLY} onClick={() => setRemoving(s)} data-testid="site-remove">
                      <DIcon name="delete" className="text-[16px]" /> Remove
                    </PartsButton>
                  </div>
                </div>
                {openLog === s.domain ? <ReadLog token={token} domain={s.domain} /> : null}
              </div>
            ))}
          </section>
        );
      })}

      <div className={`${D_CARD} flex items-start gap-3 p-5`} data-testid="trust-rule-card">
        <DIcon name="gavel" className="mt-0.5 text-[20px] text-[#0153dc] dark:text-[#93b4ff]" />
        <p className={`text-[14px] ${D_TXT}`}>
          Confirmed when the car maker&apos;s catalogue lists it, the part maker&apos;s own catalogue lists its own part, or two part makers agree.
          Reference sites can suggest but never confirm.
        </p>
      </div>

      {adding ? (
        <AddSiteDialog
          knownMakers={knownMakers}
          busy={busy}
          onCancel={() => setAdding(false)}
          onSave={(body) =>
            void run(async () => {
              await researchApi.addSite(token, body);
              setAdding(false);
            }, `${body.domain} added`)
          }
        />
      ) : null}

      {recipesFor ? <SiteRecipesDrawer token={token} site={recipesFor} owner={owner} onClose={() => { setRecipesFor(null); void load(); }} /> : null}

      {removing ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#191b24]/40 p-4" role="dialog" aria-modal data-testid="remove-site-dialog">
          <div className={`${D_CARD} flex w-full max-w-md flex-col gap-3 p-5 shadow-xl`}>
            <h2 className={`text-[16px] font-semibold ${D_TXT}`}>Remove {removing.domain}?</h2>
            <p className={`text-[13px] ${D_MUTED}`}>Roam stops using it. Its recipes are turned off. Parts it already confirmed stay on file.</p>
            <div className="flex justify-end gap-2 pt-2">
              <PartsButton variant="secondary" onClick={() => setRemoving(null)}>
                Keep it
              </PartsButton>
              <PartsButton
                variant="danger"
                confirm
                disabled={busy}
                onClick={() => {
                  const d = removing.domain;
                  setRemoving(null);
                  void run(() => researchApi.removeSite(token, d), `${d} removed`);
                }}
              >
                Remove
              </PartsButton>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MakerChip({ kind, maker, owner, onRename, onRemove }: { kind: string; maker: string; owner: boolean; onRename: (to: string) => void; onRemove: () => void }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(maker);
  if (kind === "reference") return <span className={`rounded-md bg-[#ededf9] px-2 py-0.5 dark:bg-[#1e293b] ${D_TXT}`}>{maker}</span>;
  if (editing) {
    return (
      <span className="inline-flex items-center gap-1">
        <input value={name} onChange={(e) => setName(e.target.value)} className="h-7 w-28 rounded border border-[#c5c6d0] bg-white px-2 text-[12px] dark:border-[#334155] dark:bg-[#0b1220] dark:text-[#e2e8f0]" />
        <PartsButton variant="primary" className="!min-h-[26px] !px-2" disabled={!name.trim() || name.trim() === maker} onClick={() => { setEditing(false); onRename(name.trim()); }}>
          Save
        </PartsButton>
        <PartsButton variant="secondary" className="!min-h-[26px] !px-2" onClick={() => setEditing(false)}>
          Cancel
        </PartsButton>
      </span>
    );
  }
  return (
    <span className={`inline-flex items-center gap-1 rounded-md bg-[#ededf9] py-0.5 pl-2 pr-1 dark:bg-[#1e293b] ${D_TXT}`}>
      {maker}
      {owner ? (
        <>
          <button type="button" aria-label={`Rename ${maker}`} onClick={() => setEditing(true)} className="flex h-5 w-5 items-center justify-center rounded border border-[#c5c6d0] dark:border-[#334155]">
            <DIcon name="edit" className="text-[12px]" />
          </button>
          <button type="button" aria-label={`Remove maker ${maker}`} onClick={onRemove} className="flex h-5 w-5 items-center justify-center rounded border border-[#a83836] text-[#a83836]">
            <DIcon name="close" className="text-[12px]" />
          </button>
        </>
      ) : null}
    </span>
  );
}

function ReadLog({ token, domain }: { token: string; domain: string }) {
  const [rows, setRows] = useState<SiteRead[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    researchApi
      .siteReads(token, domain)
      .then((r) => !cancelled && setRows(r))
      .catch(() => !cancelled && setRows([]));
    return () => {
      cancelled = true;
    };
  }, [token, domain]);
  return (
    <div className={`mx-6 mb-6 flex flex-col gap-1 rounded-xl p-3 ${RE_SOFT}`} data-testid="site-read-log">
      {rows === null ? <span className={`text-[13px] ${D_MUTED}`}>Loading…</span> : null}
      {rows?.length === 0 ? <span className={`text-[13px] ${D_MUTED}`}>Roam hasn&apos;t read this site yet.</span> : null}
      {rows?.map((r) => (
        <div key={r.id} className={`flex flex-wrap items-center justify-between gap-2 text-[12px] ${D_MUTED}`}>
          <span className={`truncate ${D_MONO}`}>{r.url}</span>
          <span className="flex items-center gap-2">
            {r.purpose === "recipe_test" ? <RePill tone="grey">Test</RePill> : null}
            {r.path === "owner_browser" ? <RePill tone="blue">You checked it</RePill> : null}
            {r.path === "roam_saved_page" ? <RePill tone="blue">Roam, from a saved page</RePill> : null}
            {r.foundRow ? <RePill tone="green">Row found</RePill> : <RePill tone="grey-outline">{r.httpStatus ? `No row · ${r.httpStatus}` : "No row"}</RePill>}
            <span>{shortDate(r.readAt)}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ Screen 11

function AddSiteDialog({
  knownMakers,
  busy,
  onCancel,
  onSave,
}: {
  knownMakers: Record<Kind, string[]>;
  busy: boolean;
  onCancel: () => void;
  onSave: (body: { domain: string; kind: Kind; makers: string[]; automatedRead: "allowed" | "blocked" | "not_checked"; checkedAt?: string }) => void;
}) {
  const [address, setAddress] = useState("");
  const [kind, setKind] = useState<Kind>("part_maker");
  const [makers, setMakers] = useState<string[]>([]);
  const [extra, setExtra] = useState("");
  const [read, setRead] = useState<"allowed" | "blocked">("allowed");
  const [checkedAt, setCheckedAt] = useState(() => new Date().toISOString().slice(0, 10));

  const trimmed = address.trim();
  const needsHttps = /^http:\/\//i.test(trimmed);
  const domain = trimmed.replace(/^https?:\/\//i, "").split("/")[0].toLowerCase();
  const domainOk = /^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain);
  const choices = [...new Set([...knownMakers[kind], ...makers])];
  const canSave = domainOk && !needsHttps && (kind === "reference" || makers.length > 0);

  const kindCard = (k: Kind, title: string, line: string) => (
    <label
      key={k}
      className={`flex cursor-pointer items-start gap-3 rounded-lg p-3.5 transition-all ${
        kind === k ? "bg-[#dbe1ff]/60 ring-1 ring-[#0153dc] dark:bg-[#1e3a8a]/40" : "bg-[#f3f3ff] hover:bg-[#ededf9] dark:bg-[#0b1220]"
      }`}
    >
      <input type="radio" name="site_kind" className="mt-0.5 h-4 w-4 accent-[#0153dc]" checked={kind === k} onChange={() => { setKind(k); setMakers([]); }} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className={`text-[16px] font-semibold ${kind === k ? "text-[#0153dc] dark:text-[#93b4ff]" : D_TXT}`}>{title}</span>
        <p className={`text-[13px] ${D_MUTED}`}>{line}</p>
      </div>
    </label>
  );

  const step = (n: number, label: string) => (
    <span className={`flex items-center gap-1.5 text-[13px] font-medium ${D_TXT}`}>
      <span className={`flex h-4 w-4 items-center justify-center rounded-full bg-[#e7e7f3] text-[10px] font-semibold dark:bg-[#1e293b] ${D_MONO}`}>{n}</span>
      {label}
    </span>
  );

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-[#191b24]/40 p-4" role="dialog" aria-modal data-testid="add-site-dialog">
      <div className={`${D_CARD} relative my-auto flex w-full max-w-[560px] flex-col overflow-hidden shadow-[0_20px_40px_-8px_rgba(1,83,220,0.18)]`}>
        <div className="flex items-start justify-between px-6 pb-4 pt-6">
          <div className="flex flex-col gap-1 pr-4">
            <div className="flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded-md bg-[#dbe1ff] text-[#0153dc]">
                <DIcon name="add_link" className="text-[16px]" />
              </div>
              <h2 className={`text-[18px] font-semibold tracking-tight ${D_TXT}`}>Add a trusted site</h2>
            </div>
            <p className={`text-[13px] ${D_MUTED}`}>A catalogue Roam may use to confirm parts and specs.</p>
          </div>
          <PartsButton variant="icon" aria-label="Close dialog" onClick={onCancel}>
            <DIcon name="close" className="text-[18px]" />
          </PartsButton>
        </div>
        <div className="flex max-h-[calc(86vh-130px)] flex-col gap-6 overflow-y-auto px-6 pb-6">
          <div className="flex flex-col gap-1.5">
            {step(1, "Website address")}
            <div className="relative flex w-full items-center">
              <DIcon name="language" className={`pointer-events-none absolute left-3 text-[18px] ${D_MUTED}`} />
              <input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="e.g. sbparts.jp or https://parts.example.com"
                data-testid="site-address"
                className="h-10 w-full rounded-lg border border-[#c5c6d0] bg-white pl-9 pr-3 text-[14px] text-[#30323b] outline-none focus:ring-2 focus:ring-[#0153dc] dark:border-[#334155] dark:bg-[#0b1220] dark:text-[#e2e8f0]"
              />
            </div>
            {needsHttps ? <p className="text-[13px] text-[#a83836]" data-testid="needs-https">Needs https</p> : null}
          </div>

          <div className="flex flex-col gap-2">
            {step(2, "What kind of site is it?")}
            <div role="radiogroup" className="flex flex-col gap-2">
              {kindCard("part_maker", "Part maker", "The maker's own parts catalogue (for example SB, NiBK). It confirms its own parts.")}
              {kindCard("car_maker", "Car-maker catalogue", "A catalogue of the car maker's own parts. It confirms parts for that maker's cars.")}
              {kindCard("reference", "Reference only (can suggest, can't confirm)", "A cross-reference list. Its numbers always need checking.")}
            </div>
          </div>

          {kind !== "reference" ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                {step(3, "Which makers does it cover?")}
                <span className="text-[12px] font-medium text-[#0153dc]">{makers.length} selected</span>
              </div>
              <div className="flex flex-wrap gap-2 pt-0.5">
                {choices.map((m) => {
                  const on = makers.includes(m);
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setMakers((prev) => (on ? prev.filter((x) => x !== m) : [...prev, m]))}
                      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-medium transition-all ${
                        on ? "bg-[#003ea9] text-white" : "border border-[#c5c6d0] bg-[#ededf9] text-[#30323b] dark:border-[#334155] dark:bg-[#1e293b] dark:text-[#e2e8f0]"
                      }`}
                    >
                      <DIcon name={on ? "check" : "add"} className="text-[14px]" />
                      {m}
                    </button>
                  );
                })}
                <span className="inline-flex items-center gap-1">
                  <input
                    value={extra}
                    onChange={(e) => setExtra(e.target.value)}
                    placeholder="Add another maker"
                    data-testid="add-another-maker"
                    className="h-8 w-40 rounded-full border border-[#c5c6d0] bg-white px-3 text-[12px] dark:border-[#334155] dark:bg-[#0b1220] dark:text-[#e2e8f0]"
                  />
                  <PartsButton
                    variant="secondary"
                    className="!min-h-[30px] !px-2.5"
                    disabled={!extra.trim()}
                    onClick={() => {
                      const m = extra.trim();
                      setMakers((prev) => (prev.includes(m) ? prev : [...prev, m]));
                      setExtra("");
                    }}
                  >
                    Add
                  </PartsButton>
                </span>
              </div>
            </div>
          ) : null}

          <div className="flex flex-col gap-2">
            {step(kind === "reference" ? 3 : 4, "Does it allow automatic reading?")}
            <div role="radiogroup" className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {([
                ["allowed", "Yes — I checked its rules", "Roam reads its pages directly"],
                ["blocked", "No — browser checks only", "You check its pages in your browser"],
              ] as const).map(([v, title, line]) => (
                <label
                  key={v}
                  className={`flex cursor-pointer flex-col justify-between rounded-xl p-3.5 transition-all ${
                    read === v ? "bg-[#dbe1ff]/60 ring-1 ring-[#0153dc] dark:bg-[#1e3a8a]/40" : "bg-[#f3f3ff] hover:bg-[#ededf9] dark:bg-[#0b1220]"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className={`text-[15px] font-semibold ${read === v ? "text-[#0153dc] dark:text-[#93b4ff]" : D_TXT}`}>{title}</span>
                    <input type="radio" name="auto_read" className="h-4 w-4 accent-[#0153dc]" checked={read === v} onChange={() => setRead(v)} />
                  </div>
                  <p className={`mt-1 text-[13px] ${D_MUTED}`}>{line}</p>
                </label>
              ))}
            </div>
            <label className={`flex items-center gap-2 text-[13px] ${D_MUTED}`}>
              Checked on
              <input
                type="date"
                value={checkedAt}
                onChange={(e) => setCheckedAt(e.target.value)}
                className="h-8 rounded-lg border border-[#c5c6d0] bg-white px-2 text-[13px] dark:border-[#334155] dark:bg-[#0b1220] dark:text-[#e2e8f0]"
              />
            </label>
          </div>
        </div>
        <div className="mt-auto flex items-center justify-between bg-[#f3f3ff] px-6 py-4 dark:bg-[#0b1220]">
          <PartsButton variant="danger" className="!min-h-[40px]" onClick={onCancel}>
            Cancel
          </PartsButton>
          <PartsButton
            variant="primary"
            className="!min-h-[40px]"
            disabled={busy || !canSave}
            data-testid="add-site-save"
            onClick={() => onSave({ domain, kind, makers: kind === "reference" ? [] : makers, automatedRead: read, checkedAt })}
          >
            <DIcon name="add_circle" className="text-[18px]" /> Add site
          </PartsButton>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Screen 12

const RECIPE_STEPS: Record<LookupRecipe["kind"], Array<{ title: string; line: (site: string) => string }>> = {
  search_then_page: [
    { title: "Search for the car", line: (s) => `Puts the car's model and frame code into ${s}'s search` },
    { title: "Open the matching result", line: () => "Opens the result for this car version" },
    { title: "Read the row with the number", line: () => "Keeps the row only when the number and the car are in it" },
  ],
  by_part_number: [
    { title: "Search for the part number", line: (s) => `Puts the part number into ${s}'s search` },
    { title: "Check the car", line: () => "The car's frame code must be in the same row" },
    { title: "Save the row", line: () => "Keeps a copy of the row it found" },
  ],
  form_then_page: [
    { title: "Fill in the search form", line: (s) => `Puts the part number into ${s}'s search form and sends it` },
    { title: "Open the page it leads to", line: () => "Reads the part page the site opens" },
    { title: "Check the car's row", line: () => "Keeps it only when the page lists the number and the car's row points to this part for that position" },
  ],
  browser_check_link: [
    { title: "Make the catalogue link", line: (s) => `Builds the ${s} page link for this car` },
    { title: "You open it in your browser", line: () => "Roam never reads this site itself" },
    { title: "You paste the matching line", line: () => "Roam checks the car and the value are in it" },
  ],
};

const KIND_LABEL: Record<LookupRecipe["kind"], string> = {
  search_then_page: "Search by car, then open the result",
  by_part_number: "Search by part number",
  browser_check_link: "Browser check link",
  form_then_page: "Fill the site's search form, then read the page it opens",
};

function SiteRecipesDrawer({ token, site, owner, onClose }: { token: string; site: TrustedSite; owner: boolean; onClose: () => void }) {
  const [rows, setRows] = useState<LookupRecipe[] | null>(null);
  const [editing, setEditing] = useState<LookupRecipe | "new" | null>(null);
  const [testing, setTesting] = useState<LookupRecipe | null>(null);
  const [busy, setBusy] = useState(false);
  const name = siteName(site.domain);

  const load = useCallback(async () => {
    try {
      setRows(await researchApi.recipes(token, site.domain));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't load recipes");
      setRows([]);
    }
  }, [token, site.domain]);
  useEffect(() => {
    void load();
  }, [load]);

  async function run(fn: () => Promise<unknown>, msg: string) {
    setBusy(true);
    try {
      await fn();
      toast.success(msg);
      setEditing(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "That didn't work");
    } finally {
      setBusy(false);
    }
  }

  const active = (rows ?? []).filter((r) => r.active).length;
  const header = (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <RePill tone="green-outline">{active} active {active === 1 ? "recipe" : "recipes"}</RePill>
      </div>
      <h2 className={`text-[18px] font-semibold tracking-tight ${D_TXT}`}>
        {name} ({site.domain}) — how Roam looks things up
      </h2>
    </div>
  );

  return (
    <ReDrawer open onClose={onClose} header={header} testId="recipes-drawer" footer={<p className={`text-[13px] ${D_MUTED}`}>Changes take effect on the next run.</p>}>
      <div className="flex items-center justify-between">
        <span className={RE_LABEL}>Recipes</span>
        <PartsButton variant="primary" disabled={!owner} title={owner ? undefined : OWNER_ONLY} onClick={() => setEditing("new")} data-testid="add-recipe">
          <DIcon name="add" className="text-[18px]" /> Add a recipe
        </PartsButton>
      </div>
      {editing === "new" ? <RecipeForm busy={busy} onCancel={() => setEditing(null)} onSave={(b) => void run(() => researchApi.addRecipe(token, site.domain, b), "Recipe added")} /> : null}
      {rows === null ? <ReSkeleton rows={2} /> : null}
      {rows?.length === 0 && editing !== "new" ? <p className={`text-[13px] ${D_MUTED}`}>No recipes yet. Roam only uses search results on this site.</p> : null}
      {(rows ?? []).map((r) =>
        editing !== "new" && editing?.id === r.id ? (
          <RecipeForm key={r.id} recipe={r} busy={busy} onCancel={() => setEditing(null)} onSave={(b) => void run(() => researchApi.patchRecipe(token, r.id, b), "Recipe saved")} />
        ) : (
          <div key={r.id} className={`${D_CARD} flex flex-col gap-4 p-6`} data-testid="recipe-card">
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2.5">
                <DIcon name={r.kind === "by_part_number" || r.kind === "form_then_page" ? "pin" : r.kind === "browser_check_link" ? "web" : "directions_car"} className="text-[20px] text-[#0153dc]" />
                <h3 className={`truncate text-[16px] font-semibold ${D_TXT}`}>{r.name || KIND_LABEL[r.kind]}</h3>
              </div>
              {r.active ? <RePill tone="green" icon="check">Active</RePill> : <RePill tone="grey">Off</RePill>}
            </div>
            <div className={`flex flex-col gap-2 rounded-lg p-4 ${RE_SOFT}`}>
              {RECIPE_STEPS[r.kind].map((s, i) => (
                <div key={s.title} className="flex items-start gap-2">
                  <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#0153dc] text-[11px] font-bold text-white ${D_MONO}`}>{i + 1}</span>
                  <div className="flex min-w-0 flex-col">
                    <span className={`text-[13px] font-semibold ${D_TXT}`}>{s.title}</span>
                    <p className={`text-[13px] leading-snug ${D_MUTED}`}>{s.line(name)}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className={`flex items-center gap-1.5 text-[12px] ${D_MUTED}`} data-testid="recipe-worked">
              <DIcon name="auto_awesome" className="text-[15px] text-[#0153dc]" />
              {r.worked > 0 ? `Worked ${r.worked} ${r.worked === 1 ? "time" : "times"} · last on ${shortDate(r.lastWorkedAt)}` : "Not run yet"}
            </div>
            {testing?.id === r.id ? <RecipeTest token={token} recipe={r} onClose={() => setTesting(null)} /> : null}
            <div className="flex flex-wrap items-center justify-end gap-2">
              {r.kind !== "browser_check_link" ? (
                <PartsButton variant="secondary" disabled={!owner} title={owner ? undefined : OWNER_ONLY} onClick={() => setTesting(r)} data-testid="recipe-test">
                  <DIcon name="science" className="text-[16px]" /> Test on a car
                </PartsButton>
              ) : null}
              <PartsButton variant="secondary" disabled={!owner} title={owner ? undefined : OWNER_ONLY} onClick={() => setEditing(r)}>
                Edit
              </PartsButton>
              {r.active ? (
                <PartsButton variant="danger" disabled={!owner || busy} title={owner ? undefined : OWNER_ONLY} onClick={() => void run(() => researchApi.patchRecipe(token, r.id, { active: false }), "Recipe turned off")}>
                  Turn off
                </PartsButton>
              ) : (
                <PartsButton variant="secondary" disabled={!owner || busy} onClick={() => void run(() => researchApi.patchRecipe(token, r.id, { active: true }), "Recipe turned on")}>
                  Turn on
                </PartsButton>
              )}
            </div>
          </div>
        ),
      )}
    </ReDrawer>
  );
}

function RecipeForm({
  recipe,
  busy,
  onCancel,
  onSave,
}: {
  recipe?: LookupRecipe;
  busy: boolean;
  onCancel: () => void;
  onSave: (body: { name: string; kind: LookupRecipe["kind"]; searchUrlTemplate: string; formBodyTemplate?: string; resultLinkRule?: string; notes?: string }) => void;
}) {
  const [name, setName] = useState(recipe?.name ?? "");
  const [kind, setKind] = useState<LookupRecipe["kind"]>(recipe?.kind ?? "by_part_number");
  const [tpl, setTpl] = useState(recipe?.search_url_template ?? "");
  const [linkRule, setLinkRule] = useState(recipe?.result_link_rule ?? "");
  const [formBody, setFormBody] = useState(recipe?.form_body_template ?? "");
  const usesLink = kind === "search_then_page" || kind === "form_then_page";
  const [notes, setNotes] = useState(recipe?.notes ?? "");
  const tplOk = /^https:\/\//.test(tpl.trim());
  const formOk = kind !== "form_then_page" || /^[^=&\s]+=[^&]*(&[^=&\s]+=[^&]*)*$/.test(formBody.trim());
  const input =
    "h-10 w-full rounded-lg border border-[#c5c6d0] bg-white px-3 text-[14px] text-[#30323b] outline-none focus:ring-2 focus:ring-[#0153dc] dark:border-[#334155] dark:bg-[#0b1220] dark:text-[#e2e8f0]";
  return (
    <div className={`${D_CARD} flex flex-col gap-3 p-5`} data-testid="recipe-form">
      <label className={`flex flex-col gap-1 text-[13px] ${D_MUTED}`}>
        Name
        <input className={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Search by part number" />
      </label>
      <label className={`flex flex-col gap-1 text-[13px] ${D_MUTED}`}>
        How it looks things up
        <select className={input} value={kind} onChange={(e) => setKind(e.target.value as LookupRecipe["kind"])}>
          <option value="by_part_number">{KIND_LABEL.by_part_number}</option>
          <option value="search_then_page">{KIND_LABEL.search_then_page}</option>
          <option value="form_then_page">{KIND_LABEL.form_then_page}</option>
          <option value="browser_check_link">{KIND_LABEL.browser_check_link}</option>
        </select>
      </label>
      <label className={`flex flex-col gap-1 text-[13px] ${D_MUTED}`}>
        Lookup address
        <input className={`${input} ${D_MONO}`} value={tpl} onChange={(e) => setTpl(e.target.value)} placeholder="https://example.com/search?q={number}" />
        <span className="text-[12px]">Use {"{number}"}, {"{chassis}"}, {"{model}"}, {"{make}"} or {"{engine}"} where the value goes.</span>
        {tpl && !tplOk ? <span className="text-[12px] text-[#a83836]">Needs https</span> : null}
      </label>
      {kind === "form_then_page" ? (
        <label className={`flex flex-col gap-1 text-[13px] ${D_MUTED}`}>
          Form fields
          <input
            className={`${input} ${D_MONO}`}
            value={formBody}
            onChange={(e) => setFormBody(e.target.value)}
            placeholder="txtPartNo={number}&txtClass=1"
            maxLength={1000}
            data-testid="recipe-form-fields"
          />
          <span className="text-[12px]">The fields the site's search form sends, joined with &amp;. Put {"{number}"} where the part number goes.</span>
          {formBody && !formOk ? <span className="text-[12px] text-[#a83836]">Write them like name=value&amp;name=value</span> : null}
        </label>
      ) : null}
      {usesLink ? (
        <label className={`flex flex-col gap-1 text-[13px] ${D_MUTED}`}>
          {kind === "form_then_page" ? "Result link contains (only if the form opens a list)" : "Result link contains"}
          <input className={input} value={linkRule} onChange={(e) => setLinkRule(e.target.value)} placeholder="/catalog/" />
        </label>
      ) : null}
      <label className={`flex flex-col gap-1 text-[13px] ${D_MUTED}`}>
        Notes
        <input className={input} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>
      <div className="flex justify-end gap-2">
        <PartsButton variant="danger" onClick={onCancel} disabled={busy}>
          Cancel
        </PartsButton>
        <PartsButton
          variant="primary"
          disabled={busy || !name.trim() || !tplOk || !formOk || (kind === "form_then_page" && !formBody.trim())}
          onClick={() =>
            onSave({
              name: name.trim(),
              kind,
              searchUrlTemplate: tpl.trim(),
              formBodyTemplate: kind === "form_then_page" ? formBody.trim() : undefined,
              resultLinkRule: usesLink ? linkRule.trim() : "",
              notes: notes.trim() || undefined,
            })}
          data-testid="recipe-save"
        >
          Save recipe
        </PartsButton>
      </div>
    </div>
  );
}

/** Round 2 "Test on a car": runs once for a chosen car, shows the row found or "Nothing found", saves no data. */
function RecipeTest({ token, recipe, onClose }: { token: string; recipe: LookupRecipe; onClose: () => void }) {
  const [cars, setCars] = useState<VehicleCatalogRecord[]>([]);
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState("");
  const [versionId, setVersionId] = useState("");
  const [onFile, setOnFile] = useState<PickOption[]>([]);
  const [onFileState, setOnFileState] = useState<"idle" | "loading" | "ok" | "failed">("idle");
  // Each run gets a number; a reply for an older run (or an older car) is ignored.
  const runId = useRef(0);
  const [number, setNumber] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ found: boolean; block?: string; reason?: string } | null>(null);
  const needsNumber = recipe.kind === "by_part_number" || recipe.kind === "form_then_page";

  useEffect(() => {
    void listVehicleCatalogPicker(token).then((r) => setCars(r.items)).catch(() => setCars([]));
  }, [token]);

  // Make → model → year → version, in plain words (owner rule: no frame or engine codes to type).
  const makes = useMemo(() => makesOf(cars).map((m) => ({ value: m, label: m })), [cars]);
  const models = useMemo(() => (make ? modelsOf(cars, make).map((m) => ({ value: m, label: m })) : []), [cars, make]);
  const years = useMemo(() => (make && model ? yearOptions(cars, make, model) : []), [cars, make, model]);
  const versions = useMemo(() => (make && model && year ? versionsFor(cars, make, model, year) : []), [cars, make, model, year]);
  const versionOptions = useMemo(() => {
    const labels = versionLabels(versions);
    return versions.map((c) => ({ value: c.id, label: labels.get(c.id) ?? `${c.make} ${c.model}` }));
  }, [versions]);
  // One version that year → it is the car; several → the person picks one.
  const car = versions.length === 1 ? versions[0] : versions.find((c) => c.id === versionId) ?? null;

  // Part numbers already on file for this car, so a number can be picked instead of typed.
  useEffect(() => {
    setOnFile([]);
    setOnFileState("idle");
    if (!car || !needsNumber) return;
    let live = true;
    setOnFileState("loading");
    void researchApi
      .coverage(token, car.id)
      .then((cov) => {
        if (!live) return;
        setOnFile(partNumberOptions(cov.parts ?? []));
        setOnFileState("ok");
      })
      .catch(() => {
        if (live) setOnFileState("failed");
      });
    return () => {
      live = false;
    };
  }, [token, car, needsNumber]);

  // Any change of car or number makes an older reply stale.
  useEffect(() => {
    runId.current += 1;
    setBusy(false);
  }, [car, number]);

  async function test() {
    if (!car) return;
    const mine = ++runId.current;
    setBusy(true);
    setResult(null);
    try {
      const reply = await researchApi.testRecipe(token, recipe.id, car.id, number.trim() || undefined);
      if (mine === runId.current) setResult(reply);
    } catch (e) {
      if (mine === runId.current) toast.error(e instanceof Error ? e.message : "The test didn't run");
    } finally {
      if (mine === runId.current) setBusy(false);
    }
  }

  return (
    <div className={`flex flex-col gap-2 rounded-xl p-4 ${RE_SOFT}`} data-testid="recipe-test-panel">
      <span className={`text-[13px] font-semibold ${D_TXT}`}>Test on a car — nothing is saved</span>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <SearchPick
          label="Make"
          placeholder="Choose a make"
          options={makes}
          value={make}
          testId="recipe-test-make"
          onChange={(v) => { setMake(v); setModel(""); setYear(""); setVersionId(""); setNumber(""); setResult(null); }}
        />
        <SearchPick
          label="Model"
          placeholder={make ? "Choose a model" : "Choose a make first"}
          options={models}
          value={model}
          disabled={!make}
          testId="recipe-test-model"
          onChange={(v) => { setModel(v); setYear(""); setVersionId(""); setNumber(""); setResult(null); }}
        />
        <SearchPick
          label="Year"
          placeholder={model ? "Choose a year" : "Choose a model first"}
          options={years}
          value={year}
          disabled={!model}
          testId="recipe-test-year"
          onChange={(v) => { setYear(v); setVersionId(""); setNumber(""); setResult(null); }}
        />
      </div>
      {versions.length > 1 ? (
        <SearchPick
          label="Version"
          placeholder="Choose the version"
          options={versionOptions}
          value={versionId}
          testId="recipe-test-version"
          onChange={(v) => { setVersionId(v); setNumber(""); setResult(null); }}
        />
      ) : null}
      {car && versions.length === 1 ? (
        <p className={`text-[12px] ${D_MUTED}`} data-testid="recipe-test-only-version">{versionOptions[0]?.label}</p>
      ) : null}
      {needsNumber ? (
        <SearchPick
          label="Part number to look for"
          placeholder={
            !car
              ? "Choose the car first"
              : onFileState === "loading"
                ? "Loading the parts on file…"
                : onFile.length
                  ? "Choose a part on file, or type a number"
                  : "Type the number to look for"
          }
          options={onFile}
          value={number}
          disabled={!car}
          testId="recipe-test-number"
          allowTyped="Look for"
          emptyText={
            onFileState === "failed"
              ? "Couldn't load the numbers on file. Type one."
              : onFileState === "loading"
                ? "Loading the parts on file…"
                : "No numbers on file for this car yet. Type one."
          }
          onChange={(v) => { setNumber(v); setResult(null); }}
        />
      ) : null}
      <div className="flex justify-end gap-2">
        <PartsButton variant="secondary" onClick={onClose}>
          Close
        </PartsButton>
        <PartsButton variant="primary" disabled={!car || busy || (needsNumber && !number.trim())} onClick={() => void test()} data-testid="recipe-test-run">
          {busy ? "Testing…" : "Run test"}
        </PartsButton>
      </div>
      {result ? (
        result.found && result.block ? (
          <ReSavedText title="Row found" text={result.block} onHide={() => setResult(null)} />
        ) : (
          <p className={`text-[13px] ${D_MUTED}`} data-testid="recipe-test-nothing">
            Nothing found.
          </p>
        )
      ) : null}
    </div>
  );
}
