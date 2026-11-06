import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "../../../auth/AuthContext";
import { partsEnterpriseApi } from "../../../../services/partSourcingService";
import { supabase } from "../../../../utils/supabase/client";
import {
  createPartReferenceRow,
  deletePartReferenceRow,
  fetchPartReferenceTable,
} from "../../../../services/partsAutoMatchApi";
import { goDominionPage, writeCatalogSearch } from "../partsCatalogUrl";
import { excludeListing, fetchMasterPart } from "../partsDatabaseApi";
import { fitLinkBadge, type FitVia } from "@roam/types/partMatchReason";
import { formatPartPositionSideLabel } from "@roam/types/partPositionNorm";
import { PartsButton } from "../PartsButton";

function hostLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "Source on file";
  }
}

function fitAxleSubtitle(position: unknown, side: unknown): string {
  const label = formatPartPositionSideLabel(
    position == null ? "" : String(position),
    side == null ? "" : String(side),
  ).toLowerCase();
  if (label.includes("front")) return "Front axle";
  if (label.includes("rear")) return "Rear axle";
  return label || "—";
}

function referenceTypeLabel(raw: unknown): string {
  const t = String(raw ?? "").trim().toLowerCase();
  if (t === "replaces" || t === "oe") return "Replaces";
  if (t === "cross_ref" || t === "cross-reference" || t === "crossref") return "Cross-reference";
  if (!t || t === "—") return "—";
  return t.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function wearSensorLabel(raw: unknown): string {
  const v = String(raw ?? "none").trim().toLowerCase();
  if (!v || v === "none") return "None";
  return v.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function FullDatabaseDrawer({
  partId,
  onClose,
  onEdit,
  onAddCar,
  inline = false,
}: {
  partId: string;
  onClose: () => void;
  onEdit: () => void;
  onAddCar: () => void;
  inline?: boolean;
}) {
  const { role } = useAuth();
  const owner = role === "platform_owner";
  const client = useQueryClient();
  const query = useQuery({ queryKey: ["master-part", partId], queryFn: () => fetchMasterPart(partId) });
  const [authToken, setAuthToken] = useState("");
  useEffect(() => {
    void supabase.auth.getSession().then((s) => setAuthToken(s.data.session?.access_token ?? ""));
  }, []);
  const oeRefs = useQuery({
    queryKey: ["part-oe-refs", partId],
    queryFn: () => fetchPartReferenceTable(authToken, partId, "oe-references"),
    enabled: Boolean(authToken && partId),
  });
  const indexNums = useQuery({
    queryKey: ["part-index-nums", partId],
    queryFn: () => fetchPartReferenceTable(authToken, partId, "index-numbers"),
    enabled: Boolean(authToken && partId),
  });
  const [excluding, setExcluding] = useState(false);
  const [excludeVariantId, setExcludeVariantId] = useState("");
  const [reason, setReason] = useState("");
  const [source, setSource] = useState("");
  const [busy, setBusy] = useState(false);
  const part = query.data;
  const indexRev = part?.groupRevision ?? part?.indexRevision;
  const matchedCars = part?.fits.length ?? 0;
  const indexBadge = part?.indexBadge;
  const indexGroupHeadline = part?.indexGroupHeadline;
  const indexGroupCode = part?.indexGroupCode ?? part?.groupCode;
  const wvaPeers = part?.wvaPeerLabels ?? [];
  const ownerTitle = owner ? undefined : "Only the owner can change parts.";
  const drawerTitle = part ? [part.brand, part.number].filter(Boolean).join(" ") || part.name || "Part" : "Part";

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function verify() {
    if (!owner || !part || part.status === "verified") return;
    setBusy(true);
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token ?? "";
      await partsEnterpriseApi.decidePart(token, part.partId, "confirmed", part.evidenceUrl ?? undefined);
      toast.success("Part confirmed");
      await client.invalidateQueries({ queryKey: ["master-part", partId] });
      await client.invalidateQueries({ queryKey: ["catalog-master"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not confirm");
    } finally {
      setBusy(false);
    }
  }

  async function excludeFirst() {
    if (!owner || !part?.groupId) return;
    const target = part.fits.find((fit) => fit.variantId === excludeVariantId)
      || part.fits.find((fit) => fit.linkType === "DIRECT");
    if (!target) {
      toast.message("This part is not listed on a car yet.");
      return;
    }
    if (!reason.trim() || !source.trim()) {
      setExcluding(true);
      toast.message("Add a reason and a source link first.");
      return;
    }
    setBusy(true);
    try {
      await excludeListing({ groupId: part.groupId, variantId: target.variantId, reason, evidenceUrl: source });
      toast.success("Excluded from that car");
      setExcluding(false);
      await query.refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not exclude");
    } finally {
      setBusy(false);
    }
  }

  const shell = (
      <aside className={`find-parts-sheet bg-surface-container-lowest shadow-xl flex flex-col overflow-hidden rounded-xl ${inline ? "w-[620px] shrink-0 z-30" : "absolute top-0 bottom-0 right-0 w-[620px] max-w-[90vw] shadow-2xl"}`}>
        <div className="px-space-xl py-space-lg border-b border-outline-variant/40 bg-surface-container-low flex flex-col gap-space-sm">
          <div className="flex items-start justify-between gap-space-md">
            <div className="flex flex-col gap-1 min-w-0">
              {part ? (
                <>
                  <div className="flex items-center gap-space-sm flex-wrap">
                    {part.brand ? (
                      <span className="font-mono-sm px-2 py-0.5 rounded bg-surface-container-highest text-on-surface-variant font-semibold uppercase text-[10px]">
                        {part.brand}
                      </span>
                    ) : null}
                    {part.partType ? (
                      <span className="font-label-xs px-2 py-0.5 rounded bg-surface-container text-secondary">{part.partType}</span>
                    ) : null}
                    {(part as { position?: string }).position ? (
                      <span className="font-mono-sm px-1.5 py-0.5 rounded bg-surface text-outline">
                        AXLE: {formatPartPositionSideLabel((part as { position?: string }).position, (part as { side?: string }).side).split(" ")[0]?.toUpperCase()}
                      </span>
                    ) : null}
                  </div>
                  <h1 className="font-headline-xl text-headline-xl font-bold text-on-surface tracking-tight">{drawerTitle}</h1>
                </>
              ) : <p className="text-secondary">Loading part…</p>}
            </div>
            <button type="button" className="w-8 h-8 rounded-xl bg-surface-container hover:bg-surface-container-high border border-outline-variant/50 flex items-center justify-center text-on-surface-variant" title="Close" onClick={onClose}>
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          </div>
          {part ? (
            <div className="flex flex-wrap items-center gap-space-xs">
              <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded font-label-xs uppercase ${part.status === "verified" ? "bg-emerald-600/10 text-emerald-800 dark:text-emerald-200" : "bg-amber-500/10 text-amber-800 dark:text-amber-200"}`}>
                <span className="material-symbols-outlined text-[15px]">{part.status === "verified" ? "verified" : "visibility"}</span>
                {part.status === "verified" ? "Verified" : "Needs checking"}
              </span>
              {part.status !== "verified" ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded font-label-xs uppercase bg-emerald-600/10 text-emerald-800 dark:text-emerald-200">
                  <span className="material-symbols-outlined text-[15px]">verified</span>
                  Verified
                </span>
              ) : null}
              {indexBadge ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-purple-600/10 text-purple-900 dark:text-purple-200 font-mono-sm text-mono-sm font-semibold">
                  <span className="material-symbols-outlined text-[15px] text-purple-700 dark:text-purple-300">alt_route</span>
                  {indexBadge}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
        <div className="flex-1 overflow-y-auto p-space-xl flex flex-col gap-space-xl">
          {query.isError ? <p className="text-secondary">Could not load this part. Nothing was changed.</p> : null}
          {part ? (
            <>
              <div className="flex flex-col gap-space-sm">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-label-xs uppercase tracking-wider text-on-surface-variant font-bold">
                      Cars it fits
                    </span>
                    <span className="font-mono-sm text-mono-sm px-1.5 py-0.5 rounded bg-surface-container-high text-on-surface font-semibold">
                      {matchedCars} MATCHED
                    </span>
                  </div>
                  <PartsButton variant="secondary" className="font-mono-sm text-mono-sm gap-0.5 disabled:opacity-40" disabled={!owner} title={ownerTitle} onClick={onAddCar}>
                    <span className="material-symbols-outlined text-[15px]">add</span>
                    Add a car
                  </PartsButton>
                </div>
                {part.fits.length === 0 ? <p className="font-body-sm text-secondary">No car listing yet.</p> : part.fits.map((fit) => (
                  <div key={`${fit.linkType}-${fit.variantId}`} className="p-space-sm rounded-lg bg-surface-container border border-outline-variant/30 flex items-center justify-between hover:bg-surface-container-high transition-colors">
                    <div className="flex items-center gap-space-sm min-w-0">
                      <span className="material-symbols-outlined text-primary text-[18px] shrink-0">directions_car</span>
                      <div className="min-w-0">
                        <span className="font-headline-md text-headline-md font-bold text-on-surface block">{[fit.make, fit.model].filter(Boolean).join(" ")}</span>
                        <span className="font-mono-sm text-mono-sm text-on-surface-variant">{[fit.chassis, fit.years, fitAxleSubtitle(fit.position, (fit as { side?: string }).side)].filter(Boolean).join(" · ")}</span>
                      </div>
                    </div>
                    <span className={`font-mono-sm text-mono-sm px-2 py-0.5 rounded font-semibold shrink-0 ${fitLinkBadge((fit as { via?: FitVia }).via ?? "direct", (fit as { fitSource?: "kept" }).fitSource) === "PLATFORM TWIN" ? "bg-cyan-700/10 text-cyan-800 dark:text-cyan-200" : "bg-[rgba(1,83,220,0.12)] text-primary dark:bg-primary-container/15 dark:text-[#8eb4ff]"}`}>
                      {fitLinkBadge((fit as { via?: FitVia }).via ?? "direct", (fit as { fitSource?: "kept" }).fitSource)}
                    </span>
                  </div>
                ))}
              </div>
              <div className="flex flex-col gap-space-md">
                <div className="flex items-center justify-between gap-2 pt-space-xs">
                  <h2 className="font-headline-lg text-headline-lg text-on-surface font-bold tracking-tight">Cross-references &amp; index numbers</h2>
                  {indexRev != null ? (
                    <span className="font-mono-sm text-mono-sm text-on-surface-variant font-medium">INDEX REVISION #{indexRev}</span>
                  ) : null}
                </div>
                {indexGroupHeadline || indexGroupCode ? (
                  <div className="p-space-md rounded-xl bg-purple-500/10 flex flex-col gap-space-xs">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-space-xs min-w-0">
                        <span className="material-symbols-outlined text-[20px] text-purple-800 dark:text-purple-300 shrink-0">hub</span>
                        <span className="font-headline-md text-headline-md text-purple-950 dark:text-purple-100 font-bold truncate">
                          {indexGroupHeadline ?? indexGroupCode}
                        </span>
                      </div>
                      {indexGroupCode ? (
                        <PartsButton
                          variant="secondary"
                          className="font-mono-sm text-mono-sm shrink-0"
                          onClick={() => {
                            goDominionPage("parts-catalog");
                            writeCatalogSearch({ tab: "Full database", q: indexGroupCode || part.number || "" }, "push");
                          }}
                        >
                          View group →
                        </PartsButton>
                      ) : null}
                    </div>
                    {wvaPeers.length ? (
                      <div className="flex flex-wrap items-center gap-space-xs pt-1">
                        {wvaPeers.slice(0, 6).map((label) => (
                          <span key={label} className="font-mono-sm text-mono-sm px-2 py-0.5 rounded bg-surface-container-lowest text-on-surface shadow-sm font-semibold">
                            {label}
                          </span>
                        ))}
                        {indexGroupCode ? (
                          <span className="font-mono-sm text-mono-sm px-2 py-0.5 rounded bg-purple-900 text-surface font-semibold ml-auto">
                            {indexGroupCode}
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ) : null}
                <ReferenceBlock
                  title="Replaces these factory numbers"
                  count={oeRefs.data?.rows.length ?? 0}
                  rows={oeRefs.data?.rows ?? []}
                  addLabel="+ Add factory number"
                  segment="oe-references"
                  partId={partId}
                  token={authToken}
                  owner={owner}
                  client={client}
                  valueKeys={["oe_number", "number"]}
                  partBrand={part.brand}
                />
                <ReferenceBlock
                  title="Industry index numbers"
                  count={indexNums.data?.rows.length ?? 0}
                  rows={indexNums.data?.rows ?? []}
                  addLabel="+ Add index number"
                  segment="index-numbers"
                  partId={partId}
                  token={authToken}
                  owner={owner}
                  client={client}
                  valueKeys={["value", "number", "code"]}
                  footnote="Parts with the same WVA or FMSI number and the same wear sensor are grouped together automatically."
                />
              </div>
              {excluding ? (
                <div className="space-y-2">
                  {part.fits.length > 1 ? (
                    <select className="w-full rounded-lg bg-surface-container-low px-3 py-2 text-sm" value={excludeVariantId} onChange={(e) => setExcludeVariantId(e.target.value)}>
                      <option value="">Pick car listing…</option>
                      {part.fits.map((fit) => (
                        <option key={fit.variantId} value={fit.variantId}>{[fit.make, fit.model, fit.years].filter(Boolean).join(" ")}</option>
                      ))}
                    </select>
                  ) : null}
                  <input className="w-full rounded-lg bg-surface-container-low px-3 py-2 text-sm" placeholder="Reason" value={reason} onChange={(event) => setReason(event.target.value)} />
                  <input className="w-full rounded-lg bg-surface-container-low px-3 py-2 text-sm" placeholder="Source link" value={source} onChange={(event) => setSource(event.target.value)} />
                </div>
              ) : null}
            </>
          ) : null}
        </div>
        <div className="p-space-lg border-t border-outline-variant/40 bg-surface-container-low flex items-center justify-between gap-space-sm">
          <button type="button" className="px-3.5 h-9 rounded-xl bg-error/10 text-error border border-error/35 font-semibold hover:bg-error/15 disabled:opacity-40 inline-flex items-center gap-1.5" disabled={!owner || busy} title={ownerTitle} onClick={() => { if (!excluding) { setExcludeVariantId(part?.fits[0]?.variantId ?? ""); setExcluding(true); return; } void excludeFirst(); }}>
            <span className="material-symbols-outlined text-[16px]">block</span>
            Exclude from car
          </button>
          <div className="flex items-center gap-2">
            <button type="button" className="px-3.5 h-9 rounded-xl bg-surface-container-highest text-on-surface font-semibold disabled:opacity-40" disabled={!owner} title={ownerTitle} onClick={onEdit}>Edit</button>
            <button type="button" className="px-4 h-9 rounded-xl bg-primary-container text-on-primary font-bold disabled:opacity-40 inline-flex items-center gap-1.5" disabled={!owner || busy} title={ownerTitle} onClick={() => { void verify(); }}>
              <span className="material-symbols-outlined text-[18px]">check_circle</span>
              Confirm fit
            </button>
          </div>
        </div>
      </aside>
  );
  if (inline) return shell;
  return (
    <div className="fixed inset-0 z-50">
      <button type="button" className="absolute inset-0 bg-inverse-surface/20" aria-label="Close part details" onClick={onClose} />
      {shell}
    </div>
  );
}

function referenceLabel(row: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const val = row[key];
    if (val != null && String(val).trim()) return String(val);
  }
  return "";
}

function ReferenceBlock({
  title,
  count,
  rows,
  addLabel,
  segment,
  partId,
  token,
  owner,
  client,
  valueKeys,
  footnote,
  partBrand,
}: {
  title: string;
  count: number;
  rows: Array<Record<string, unknown>>;
  addLabel: string;
  segment: "oe-references" | "index-numbers" | "approvals";
  partId: string;
  token: string;
  owner: boolean;
  client: ReturnType<typeof useQueryClient>;
  valueKeys: string[];
  footnote?: string;
  partBrand?: string;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [draftValue, setDraftValue] = useState("");
  const [draftBrand, setDraftBrand] = useState("");
  const [draftType, setDraftType] = useState("wva");
  const [draftEvidence, setDraftEvidence] = useState("");
  const [draftWear, setDraftWear] = useState("");
  const [menuId, setMenuId] = useState<string | null>(null);

  async function addRow() {
    if (!owner || !token) return;
    const value = draftValue.trim();
    if (!value) {
      toast.message("Enter a value first.");
      return;
    }
    if (segment === "index-numbers") {
      const evidence = draftEvidence.trim();
      if (!evidence) {
        toast.message("Evidence URL is required.");
        return;
      }
      try {
        await createPartReferenceRow(token, partId, segment, {
          value,
          number_type: draftType.trim() || "wva",
          index_type: draftType.trim() || "wva",
          oe_brand: draftBrand.trim() || undefined,
          wear_sensor: draftWear.trim() || undefined,
          evidence_url: evidence,
        });
        toast.success("Row added");
        setAddOpen(false);
        setDraftValue("");
        setDraftEvidence("");
        await client.invalidateQueries({ queryKey: ["part-index-nums", partId] });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not add row");
      }
      return;
    }
    const evidence = segment === "oe-references" ? draftEvidence.trim() : undefined;
    if (segment === "oe-references" && !evidence) {
      toast.message("Evidence URL is required.");
      return;
    }
    if (segment === "oe-references") {
      const oeBrand = draftBrand.trim() || (partBrand ?? "").trim();
      if (!oeBrand) {
        toast.message("Enter the factory brand first.");
        return;
      }
    }
    const body = segment === "oe-references"
      ? { oe_number: value, oe_brand: draftBrand.trim() || partBrand, evidence_url: evidence }
      : { value, standard_code: value };
    try {
      await createPartReferenceRow(token, partId, segment, body);
      toast.success("Row added");
      setAddOpen(false);
      setDraftValue("");
      setDraftEvidence("");
      const qk = segment === "oe-references" ? "part-oe-refs" : "part-approvals";
      await client.invalidateQueries({ queryKey: [qk, partId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not add row");
    }
  }

  async function removeRow(refId: string) {
    if (!owner || !token || !window.confirm("Remove this reference row?")) return;
    try {
      await deletePartReferenceRow(token, partId, segment, refId);
      toast.success("Removed");
      const qk = segment === "oe-references" ? "part-oe-refs" : segment === "index-numbers" ? "part-index-nums" : "part-approvals";
      await client.invalidateQueries({ queryKey: [qk, partId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not remove");
    }
  }

  return (
    <div className="space-y-space-xs">
      <div className="flex justify-between items-center">
        <span className="font-label-xs uppercase tracking-wider text-on-surface font-bold">{title}</span>
        <span className="font-mono-sm text-mono-sm text-on-surface-variant">{count} ENTRIES</span>
      </div>
      {rows.length ? (
        <div className="bg-surface-container-low rounded-lg overflow-hidden">
        <table className="min-w-full text-left text-xs">
          <thead className="bg-surface-container-high text-on-surface-variant font-label-xs uppercase">
            <tr>
              {segment === "oe-references" ? (
                <>
                  <th className="py-2 px-space-sm font-semibold w-24">Brand</th>
                  <th className="py-2 px-space-sm font-semibold">Factory Number</th>
                  <th className="py-2 px-space-sm font-semibold w-36">Type</th>
                </>
              ) : segment === "index-numbers" ? (
                <>
                  <th className="py-2 px-space-sm font-semibold w-24">Index</th>
                  <th className="py-2 px-space-sm font-semibold">Number</th>
                  <th className="py-2 px-space-sm font-semibold w-28">Wear Sensor</th>
                </>
              ) : (
                <th className="py-2 px-space-sm font-semibold">Value</th>
              )}
              <th className="py-2 px-space-sm font-semibold w-36">Source</th>
              <th className="py-2 px-space-sm text-right w-10" aria-label="Row menu" />
            </tr>
          </thead>
          <tbody className="font-body-sm text-on-surface divide-y divide-surface-container">
          {rows.slice(0, 12).map((row) => {
            const label = referenceLabel(row, valueKeys);
            const refId = String(row.id || "");
            const refType = referenceTypeLabel(row.reference_type || row.oe_ref_type);
            const indexType = String(row.index_type || row.number_type || "wva").toUpperCase();
            const supersession = String(row.supersession_note || row.supersession_line || "").trim();
            const typeChipClass = refType === "Replaces"
              ? "bg-primary-container text-on-primary"
              : "bg-surface-container-high text-on-surface";
            const indexChipClass = indexType === "FMSI"
              ? "bg-[rgba(1,83,220,0.12)] text-primary font-bold dark:bg-primary-container/15 dark:text-[#8eb4ff]"
              : "bg-purple-600/10 text-purple-900 dark:text-purple-200";
            return (
              <tr key={refId || label} className="hover:bg-surface transition-colors">
                {segment === "oe-references" ? (
                  <>
                    <td className="py-2.5 px-space-sm font-medium">{String(row.oe_brand || row.brand || "—")}</td>
                    <td className="py-2.5 px-space-sm">
                      <div className="font-mono-md font-semibold">{label}</div>
                      {supersession ? (
                        <div className="font-mono-sm text-on-surface-variant mt-0.5">↳ {supersession}</div>
                      ) : null}
                    </td>
                    <td className="py-2.5 px-space-sm">
                      <span className={`font-mono-sm px-2 py-0.5 rounded font-semibold ${typeChipClass}`}>{refType}</span>
                    </td>
                  </>
                ) : segment === "index-numbers" ? (
                  <>
                    <td className="py-2.5 px-space-sm">
                      <span className={`font-mono-sm px-2 py-0.5 rounded font-bold ${indexChipClass}`}>{indexType}</span>
                    </td>
                    <td className="py-2.5 px-space-sm font-mono-md font-semibold">{label}</td>
                    <td className="py-2.5 px-space-sm">
                      <span className="font-label-xs px-2 py-0.5 rounded bg-surface-container-high text-on-surface-variant">{wearSensorLabel(row.wear_sensor || row.wearSensor)}</span>
                    </td>
                  </>
                ) : (
                  <td className="py-2.5 px-space-sm font-mono">{label}</td>
                )}
                <td className="py-2.5 px-space-sm">
                  {row.evidence_url ? (
                    <a className="text-primary font-mono-sm inline-flex items-center gap-1 hover:underline" href={String(row.evidence_url)} target="_blank" rel="noreferrer">
                      {hostLabel(String(row.evidence_url))}
                      <span className="material-symbols-outlined text-[13px]">open_in_new</span>
                    </a>
                  ) : "—"}
                </td>
                <td className="py-2.5 px-space-sm text-right relative">
                <PartsButton variant="icon" className="disabled:opacity-40" disabled={!owner || !refId} aria-label="Row menu" onClick={() => setMenuId(menuId === refId ? null : refId)}>
                  <span className="material-symbols-outlined text-[18px]">more_horiz</span>
                </PartsButton>
                {menuId === refId ? (
                  <div className="absolute right-0 z-10 mt-1 rounded border border-outline-variant/40 bg-surface-container-lowest shadow p-2">
                    <PartsButton variant="danger" className="text-xs min-h-[32px] h-8" onClick={() => { void removeRow(refId); setMenuId(null); }}>Remove</PartsButton>
                  </div>
                ) : null}
                </td>
              </tr>
            );
          })}
          </tbody>
        </table>
        </div>
      ) : (
        <p className="text-body-sm text-secondary mb-2">No rows on file yet.</p>
      )}
      {footnote ? (
        <div className="px-space-xs py-1 flex items-start gap-1.5 text-on-surface-variant">
          <span className="material-symbols-outlined text-[16px] text-primary shrink-0 mt-0.5">info</span>
          <p className="font-body-sm leading-tight">{footnote}</p>
        </div>
      ) : null}
      {addOpen ? (
        <div className="mt-2 space-y-2 rounded-lg border border-outline-variant/40 p-2 text-sm">
          <input className="w-full rounded border px-2 py-1" placeholder="Value" value={draftValue} onChange={(e) => setDraftValue(e.target.value)} />
          {(segment === "oe-references" || segment === "index-numbers") ? (
            <input className="w-full rounded border px-2 py-1" placeholder="Brand" value={draftBrand} onChange={(e) => setDraftBrand(e.target.value)} />
          ) : null}
          {segment === "index-numbers" ? (
            <>
              <input className="w-full rounded border px-2 py-1" placeholder="Index type (wva, oem…)" value={draftType} onChange={(e) => setDraftType(e.target.value)} />
              <input className="w-full rounded border px-2 py-1" placeholder="Wear sensor (optional)" value={draftWear} onChange={(e) => setDraftWear(e.target.value)} />
            </>
          ) : null}
          {(segment === "oe-references" || segment === "index-numbers") ? (
            <input className="w-full rounded border px-2 py-1" placeholder="Evidence URL" value={draftEvidence} onChange={(e) => setDraftEvidence(e.target.value)} />
          ) : null}
          <div className="flex gap-2">
            <PartsButton variant="danger" onClick={() => setAddOpen(false)}>Cancel</PartsButton>
            <PartsButton variant="primary" className="disabled:opacity-40" disabled={!owner} onClick={() => { void addRow(); }}>Save</PartsButton>
          </div>
        </div>
      ) : (
        <PartsButton variant="secondary" className="font-mono-sm disabled:opacity-40" disabled={!owner} onClick={() => { setDraftBrand(partBrand || ""); setAddOpen(true); }}>{addLabel}</PartsButton>
      )}
    </div>
  );
}
