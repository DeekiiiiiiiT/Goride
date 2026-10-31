import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "../../../auth/AuthContext";
import { partsEnterpriseApi } from "../../../../services/partSourcingService";
import { supabase } from "../../../../utils/supabase/client";
import { excludeListing, fetchMasterPart } from "../partsDatabaseApi";
import { TIER_META } from "./matchMeta";

function hostLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "Source on file";
  }
}

function userMonogram(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
  return (parts[0]?.slice(0, 2) ?? "??").toUpperCase();
}

export function FullDatabaseDrawer({
  partId,
  onClose,
  onEdit,
  onAddCar,
}: {
  partId: string;
  onClose: () => void;
  onEdit: () => void;
  onAddCar: () => void;
}) {
  const { role, user } = useAuth();
  const owner = role === "platform_owner";
  const client = useQueryClient();
  const query = useQuery({ queryKey: ["master-part", partId], queryFn: () => fetchMasterPart(partId) });
  const [excluding, setExcluding] = useState(false);
  const [reason, setReason] = useState("");
  const [source, setSource] = useState("");
  const [busy, setBusy] = useState(false);
  const part = query.data;
  const tier = TIER_META[part?.tier ?? 1] ?? TIER_META[1];
  const ownerTitle = owner ? undefined : "Only the owner can change parts.";
  const displayName = (user?.user_metadata?.full_name as string | undefined) ?? user?.email?.split("@")[0] ?? "Owner";
  const initials = userMonogram(displayName);

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
    const target = part.fits.find((fit) => fit.linkType === "DIRECT");
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

  return (
    <div className="fixed inset-0 z-50">
      <button type="button" className="absolute inset-0 bg-[#0f172a]/20" aria-label="Close part details" onClick={onClose} />
      <aside className="find-parts-sheet absolute top-0 bottom-0 right-0 w-[500px] max-w-[90vw] bg-surface-container-lowest shadow-2xl flex flex-col">
        <div className="px-space-xl py-space-lg border-b border-outline-variant/40 flex items-start justify-between">
          <div className="flex flex-col gap-1.5">
            {part ? (
              <>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono-lg text-[18px] font-bold text-primary">{part.number || "No number"}</span>
                  <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full font-label-xs font-semibold ${part.status === "verified" ? "bg-emerald-500/10 text-emerald-700" : "bg-amber-500/10 text-amber-700"}`}>
                    {part.status === "verified" ? "Verified" : "Needs checking"}
                  </span>
                </div>
                <h2 className="font-headline-lg text-[22px] font-bold text-on-surface">{part.name || "Part"}</h2>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-mono-sm text-mono-sm font-semibold" style={{ color: tier.dot, backgroundColor: `${tier.dot}1a` }}>
                    {tier.label}
                  </span>
                  {part.brand ? <span className="text-secondary font-mono-sm text-mono-sm">· {part.brand}</span> : null}
                </div>
              </>
            ) : <p className="text-secondary">Loading part…</p>}
          </div>
          <button type="button" className="w-8 h-8 rounded-xl bg-surface border border-outline-variant/50 flex items-center justify-center" title="Close" onClick={onClose}>
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-space-xl flex flex-col gap-space-xl">
          {query.isError ? <p className="text-secondary">Could not load this part. Nothing was changed.</p> : null}
          {part ? (
            <>
              <div className="flex flex-col gap-space-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono-sm text-mono-sm uppercase tracking-wider text-secondary font-bold">Cars it fits ({part.fits.length} matched)</span>
                  <button type="button" className="font-mono-sm text-mono-sm text-primary font-bold inline-flex items-center gap-0.5 disabled:opacity-40" disabled={!owner} title={ownerTitle} onClick={onAddCar}>
                    <span className="material-symbols-outlined text-[15px]">add</span>
                    Add a car
                  </button>
                </div>
                {part.fits.length === 0 ? <p className="font-body-sm text-secondary">No car listing yet.</p> : part.fits.map((fit) => (
                  <div key={`${fit.linkType}-${fit.variantId}`} className="p-space-md rounded-xl bg-surface-container-low border border-outline-variant/40 flex items-center justify-between">
                    <div>
                      <span className="font-body-md font-bold text-on-surface block">{[fit.make, fit.model].filter(Boolean).join(" ")}</span>
                      <span className="font-mono-sm text-mono-sm text-secondary">{[fit.chassis, fit.years, fit.position].filter(Boolean).join(" · ")}</span>
                    </div>
                    <span className={`px-2.5 py-1 rounded-lg font-mono-sm text-mono-sm font-bold ${fit.linkType === "PLATFORM TWIN" ? "text-[#0e7490] bg-[#0e7490]/10" : "text-on-surface-variant bg-surface border border-outline-variant/50"}`}>{fit.linkType}</span>
                  </div>
                ))}
              </div>
              <div className="flex flex-col gap-space-xs">
                <span className="font-mono-sm text-mono-sm uppercase tracking-wider text-secondary font-bold">Why it fits / catalogue provenance</span>
                <div className="p-space-md rounded-xl bg-surface border border-outline-variant/50 flex flex-col gap-2 font-body-sm">
                  <div className="flex items-center justify-between border-b border-outline-variant/30 pb-2">
                    <span className="font-semibold">Source authority:</span>
                    <span className="font-mono-sm font-bold text-primary">{part.evidenceUrl ? hostLabel(part.evidenceUrl) : "No source link yet"}</span>
                  </div>
                  <p className="text-secondary">{part.note || "No catalogue note on file."}</p>
                </div>
              </div>
              <div className="p-space-md rounded-xl bg-surface-container-low border border-primary/20 flex items-start gap-2.5">
                <span className="material-symbols-outlined text-primary text-[20px] shrink-0">admin_panel_settings</span>
                <div className="flex flex-col">
                  <span className="font-body-sm font-bold text-on-surface">{owner ? `Owner mode active: ${initials}` : "Staff view"}</span>
                  <span className="font-mono-sm text-mono-sm text-secondary">Staff view restriction: &quot;Only the owner can change parts.&quot; Structural edits are permanently hashed to cluster ledger.</span>
                </div>
              </div>
              {excluding ? (
                <div className="space-y-2">
                  <input className="w-full rounded-lg bg-surface-container-low px-3 py-2 text-sm" placeholder="Reason" value={reason} onChange={(event) => setReason(event.target.value)} />
                  <input className="w-full rounded-lg bg-surface-container-low px-3 py-2 text-sm" placeholder="Source link" value={source} onChange={(event) => setSource(event.target.value)} />
                </div>
              ) : null}
            </>
          ) : null}
        </div>
        <div className="p-space-lg border-t border-outline-variant/40 flex items-center justify-between gap-space-sm">
          <button type="button" className="px-3.5 h-9 rounded-xl bg-surface border border-outline-variant/50 text-secondary disabled:opacity-40" disabled={!owner || busy} title={ownerTitle} onClick={() => { void excludeFirst(); }}>
            Exclude from car
          </button>
          <div className="flex items-center gap-2">
            <button type="button" className="px-3.5 h-9 rounded-xl bg-surface border border-outline-variant/50 disabled:opacity-40" disabled={!owner} title={ownerTitle} onClick={onEdit}>Edit</button>
            <button type="button" className="px-4 h-9 rounded-xl bg-primary-container text-on-primary font-semibold disabled:opacity-40" disabled={!owner || busy || part?.status === "verified"} title={ownerTitle} onClick={() => { void verify(); }}>
              {part?.status === "verified" ? "Verified" : "Confirm fit"}
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}
