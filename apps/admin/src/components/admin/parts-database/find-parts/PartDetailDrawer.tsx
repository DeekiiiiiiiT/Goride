// Stitch: dominion-redesign/S42f · find_parts_part_detail_drawer
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PART_MATCH_TIERS } from "../../../../../../../packages/types/src/partsResolution";
import { useAuth } from "../../../auth/AuthContext";
import { supabase } from "../../../../utils/supabase/client";
import { partsEnterpriseApi } from "../../../../services/partSourcingService";
import type { FindPartsCandidate, FoundPartRow } from "../partsDatabaseApi";
import { savePartAlias } from "./findPartsApi";

function evidenceLabel(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return host || "Source link";
  } catch {
    return "Source link";
  }
}

function userMonogram(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
  return (parts[0]?.slice(0, 2) ?? "??").toUpperCase();
}

export function PartDetailDrawer({
  part,
  candidates,
  owner,
  componentId,
  onClose,
  onEdit,
  onConfirmed,
  crossReferences = [],
}: {
  part: FoundPartRow;
  candidates: FindPartsCandidate[];
  owner: boolean;
  componentId: string;
  onClose: () => void;
  onEdit: () => void;
  onConfirmed?: () => void;
  crossReferences?: FoundPartRow[];
}) {
  const { user, role } = useAuth();
  const [alias, setAlias] = useState("");
  const [status, setStatus] = useState(part.status);
  const [confirming, setConfirming] = useState(false);
  const ownerTitle = owner ? undefined : "Only the owner can change parts.";
  const verified = status === "verified";
  const tierMeta = PART_MATCH_TIERS.find((row) => row.tier === part.tier);
  const partNumberLine = [part.brand, part.number].filter(Boolean).join(" ");
  const crossRefs = (part.alsoKnownAs ?? []).filter(Boolean);
  const fitSet = new Set(part.fitsVariantIds ?? []);
  const fitRows = candidates.length ? candidates : [];
  const fitCount = fitRows.filter((row) => fitSet.has(row.id)).length;
  const displayName =
    (user?.user_metadata?.full_name as string | undefined)
    ?? user?.email?.split("@")[0]
    ?? "Owner";
  const roleLabel = role === "platform_owner" ? "Owner" : role?.replace(/^platform_/, "").replace(/_/g, " ") ?? "Staff";

  useEffect(() => {
    setStatus(part.status);
  }, [part.partId, part.status]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function copyNumber() {
    if (!part.number) return;
    try {
      await navigator.clipboard.writeText(part.number);
      toast.success("Part number copied");
    } catch {
      toast.error("Could not copy");
    }
  }

  async function confirm() {
    if (!owner || verified) return;
    setConfirming(true);
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token ?? "";
      await partsEnterpriseApi.decidePart(token, part.partId, "confirmed", part.evidenceUrl ?? undefined);
      setStatus("verified");
      toast.success("Part confirmed");
      onConfirmed?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not confirm");
    } finally {
      setConfirming(false);
    }
  }

  async function addAlias() {
    if (!owner || !alias.trim() || !componentId) return;
    try {
      await savePartAlias({ term: alias.trim(), componentId, reason: "Added from Find parts" });
      setAlias("");
      toast.success("Alias saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save alias");
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex justify-end bg-[#0f172a]/40 backdrop-blur-[2px]" onClick={onClose}>
      <aside
        className="find-parts-sheet flex h-full w-full max-w-[520px] flex-col overflow-hidden bg-surface-container-lowest shadow-2xl"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-labelledby="part-detail-title"
      >
        <div className="flex-1 overflow-y-auto">
          <div className="p-space-xl bg-surface-container-lowest">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1 min-w-0">
                <span className="font-label-xs text-label-xs tracking-wider uppercase text-secondary font-semibold">Primary component view</span>
                <h2 id="part-detail-title" className="font-headline-xl text-headline-xl text-on-surface font-bold tracking-tight">{part.name}</h2>
                <div className="flex items-center gap-space-sm pt-0.5">
                  <span className="font-mono-lg text-mono-lg text-primary font-semibold tracking-tight truncate">{partNumberLine}</span>
                  {part.number ? (
                    <button type="button" className="text-outline hover:text-primary transition-colors shrink-0" title="Copy part number" onClick={() => { void copyNumber(); }}>
                      <span className="material-symbols-outlined text-[16px]">content_copy</span>
                    </button>
                  ) : null}
                </div>
              </div>
              <button
                type="button"
                className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-surface-container text-on-surface-variant hover:bg-surface-container-high transition-colors shrink-0"
                title="Close drawer (Escape)"
                onClick={onClose}
              >
                <span className="font-mono-sm text-mono-sm font-semibold">✕</span>
                <kbd className="font-mono-sm text-mono-sm bg-surface-container-lowest px-1.5 py-0.5 rounded text-outline text-[10px]">ESC</kbd>
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-2 mt-space-md pt-space-xs">
              {tierMeta ? (
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 text-primary">
                  <span className="material-symbols-outlined text-[14px]">verified</span>
                  <span className="font-mono-sm text-mono-sm font-semibold">{tierMeta.plainLabel}</span>
                </div>
              ) : null}
              <span className="font-mono-sm text-mono-sm font-semibold px-2 py-0.5 rounded bg-surface-container-high text-on-surface-variant uppercase">
                {part.tier === 4 ? "Aftermarket" : `${tierMeta?.tag ?? "OEM"} original`}
              </span>
              {verified ? (
                <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#10b981]/15 text-[#047857]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#10b981]" />
                  <span className="font-mono-sm text-mono-sm font-semibold">Verified</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-surface-container-high text-on-surface-variant">
                  <span className="font-mono-sm text-mono-sm font-semibold">Needs checking</span>
                </div>
              )}
            </div>
          </div>

          <div className="px-space-xl py-space-lg bg-surface-container-low/50">
            <div className="flex items-center justify-between mb-space-sm gap-2">
              <div className="flex items-center gap-space-xs">
                <span className="material-symbols-outlined text-[16px] text-primary">task_alt</span>
                <h3 className="font-label-md text-label-md uppercase tracking-wider text-secondary font-bold">Why it fits</h3>
              </div>
              {part.evidenceUrl ? (
                <a
                  className="flex items-center gap-1 font-body-sm text-body-sm text-primary-container hover:underline font-medium shrink-0"
                  href={part.evidenceUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  <span>{evidenceLabel(part.evidenceUrl)}</span>
                  <span className="material-symbols-outlined text-[14px]">open_in_new</span>
                </a>
              ) : null}
            </div>
            <p className="font-body-md text-body-md text-on-surface leading-snug">{part.reason}</p>
          </div>

          <div className="px-space-xl py-space-lg bg-surface-container-lowest">
            <div className="flex items-center justify-between mb-space-md">
              <div className="flex items-center gap-space-xs">
                <span className="material-symbols-outlined text-[16px] text-primary">directions_car</span>
                <h3 className="font-label-md text-label-md uppercase tracking-wider text-secondary font-bold">Fits these versions</h3>
              </div>
              {fitRows.length ? (
                <span className="font-mono-sm text-mono-sm text-on-surface-variant bg-surface-container px-2 py-0.5 rounded">
                  {fitCount} of {fitRows.length} listed
                </span>
              ) : null}
            </div>
            <div className="space-y-space-xs">
              {fitRows.length ? fitRows.map((row) => {
                const fits = fitSet.has(row.id);
                return (
                  <div
                    key={row.id}
                    className={`p-space-sm rounded-xl flex items-center justify-between ${fits ? "bg-surface-container-lowest hover:bg-surface-container-low" : "bg-surface-container-low/70"} transition-colors`}
                  >
                    <div className="flex items-center gap-space-md min-w-0">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${fits ? "bg-[#10b981]/15 text-[#047857]" : "bg-surface-container-highest text-secondary"}`}>
                        {fits ? "✓" : "—"}
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className={`font-body-md text-body-md truncate ${fits ? "text-on-surface font-semibold" : "text-secondary font-medium"}`}>{row.plainLabel || row.codeLine}</span>
                        {row.codeLine ? <span className="font-mono-sm text-mono-sm text-on-surface-variant truncate">{row.codeLine}</span> : null}
                      </div>
                    </div>
                    {fits ? (
                      <span className="font-mono-sm text-mono-sm px-2.5 py-0.5 rounded-full bg-[#0153dc]/10 text-primary-container font-semibold shrink-0 ml-2">Direct OE Fit</span>
                    ) : (
                      <span className="font-mono-sm text-mono-sm px-2 py-0.5 rounded bg-surface-container-highest text-on-surface-variant shrink-0 ml-2">Not on file for this part</span>
                    )}
                  </div>
                );
              }) : (
                <p className="font-body-sm text-body-sm text-on-surface-variant">No version list for this search.</p>
              )}
            </div>
          </div>

          {crossReferences.length ? (
            <div className="px-space-xl py-space-lg bg-surface-container-low/30">
              <div className="flex items-center justify-between mb-space-sm">
                <div className="flex items-center gap-space-xs">
                  <span className="material-symbols-outlined text-[16px] text-primary">sync_alt</span>
                  <h3 className="font-label-md text-label-md uppercase tracking-wider text-secondary font-bold">Same part, other numbers (Cross-references)</h3>
                </div>
                <span className="font-mono-sm text-mono-sm text-outline">{crossReferences.length} items</span>
              </div>
              <div className="grid grid-cols-1 gap-2 pt-1">
                {crossReferences.map((row) => (
                  <div key={row.partId} className="p-space-sm rounded-lg bg-surface-container-lowest shadow-sm flex items-center justify-between gap-2">
                    <div className="flex items-center gap-space-sm min-w-0">
                      <span className="material-symbols-outlined text-[16px] text-[#7c3aed] shrink-0">alt_route</span>
                      <span className="font-mono-md text-mono-md font-semibold text-on-surface truncate">{row.brand} {row.number}</span>
                    </div>
                    <span className="font-mono-sm text-mono-sm text-[#7c3aed] bg-[#7c3aed]/10 px-2 py-0.5 rounded shrink-0">Tier 4 alternate</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="px-space-xl py-space-md bg-surface-container-lowest">
            <div className="flex items-center gap-space-xs mb-space-sm">
              <span className="material-symbols-outlined text-[16px] text-secondary">label</span>
              <h3 className="font-label-md text-label-md uppercase tracking-wider text-secondary font-bold">Also called</h3>
            </div>
            <div className="flex flex-wrap gap-2">
              {crossRefs.map((label) => (
                <span key={`alias-${label}`} className="font-mono-sm text-mono-sm px-2.5 py-1 rounded-full bg-surface-container text-on-surface-variant font-medium">{label}</span>
              ))}
              {!crossRefs.length ? (
                <span className="font-body-sm text-body-sm text-on-surface-variant">None yet</span>
              ) : null}
              {owner ? (
                <button
                  type="button"
                  className="font-mono-sm text-mono-sm px-2.5 py-1 rounded-full bg-surface-container text-outline font-medium hover:bg-surface-container-high"
                  onClick={() => document.getElementById("part-alias-input")?.focus()}
                >
                  + add alias
                </button>
              ) : null}
            </div>
            {owner && componentId ? (
              <div className="flex gap-2 mt-3">
                <input
                  id="part-alias-input"
                  className="h-9 flex-1 rounded-xl bg-surface-container-low px-3 font-body-sm text-body-sm"
                  value={alias}
                  placeholder="Alternate name"
                  onChange={(event) => setAlias(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void addAlias();
                  }}
                />
                <button type="button" className="h-9 px-3 rounded-xl bg-surface-container-high text-body-sm font-medium" onClick={() => { void addAlias(); }}>Save</button>
              </div>
            ) : null}
          </div>

          <div className="px-space-xl py-space-lg bg-surface-container-low/40">
            <div className="flex items-center gap-space-xs mb-space-sm">
              <span className="material-symbols-outlined text-[16px] text-primary">security_update_good</span>
              <h3 className="font-label-md text-label-md uppercase tracking-wider text-secondary font-bold">Audit & verification history</h3>
            </div>
            <div className="p-space-md rounded-xl bg-surface-container-lowest shadow-sm space-y-2">
              <div className="flex items-start gap-space-sm">
                <span className="material-symbols-outlined text-[18px] text-primary mt-0.5">verified_user</span>
                <div>
                  <div className="font-body-sm text-body-sm text-on-surface font-semibold">
                    {verified ? `Confirmed · catalog verified` : "Pending · imported or edited, not confirmed yet"}
                  </div>
                  <div className="font-mono-sm text-mono-sm text-outline mt-0.5">
                    Part id {part.partId.slice(0, 8)}… · {verified ? "Counts toward coverage when confirmed" : "Needs checking in Data quality"}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-surface-container-lowest p-space-lg shadow-xl shrink-0 flex flex-col gap-space-sm border-t border-outline-variant/20">
          <div className="flex items-center justify-between gap-space-sm flex-wrap">
            <button
              type="button"
              className="h-9 px-space-md rounded-xl text-error bg-error-container/30 hover:bg-error-container text-body-sm font-semibold transition-colors flex items-center gap-1.5 disabled:opacity-40"
              disabled={!owner}
              title={ownerTitle ?? "Exclude from this car"}
              onClick={() => toast.message("Open Full database to remove a listing from this car.")}
            >
              <span className="material-symbols-outlined text-[16px]">block</span>
              <span>Exclude from this car</span>
            </button>
            <div className="flex items-center gap-space-sm">
              <button
                type="button"
                className="h-9 px-space-md rounded-xl bg-surface-container-high text-on-surface hover:bg-surface-container-highest text-body-sm font-medium transition-colors flex items-center gap-1.5 disabled:opacity-40"
                disabled={!owner}
                title={ownerTitle}
                onClick={onEdit}
              >
                <span className="material-symbols-outlined text-[16px]">edit</span>
                <span>Edit</span>
              </button>
              {verified ? (
                <button type="button" className="h-9 px-space-lg rounded-xl bg-primary-container/40 text-surface-bright text-body-sm font-semibold cursor-not-allowed flex items-center gap-1.5" disabled>
                  <span className="material-symbols-outlined text-[16px]">lock</span>
                  <span>Already verified</span>
                </button>
              ) : (
                <button
                  type="button"
                  className="h-9 px-space-lg rounded-xl bg-primary-container text-on-primary-container text-body-sm font-semibold flex items-center gap-1.5 disabled:opacity-40"
                  disabled={!owner || confirming}
                  title={ownerTitle}
                  onClick={() => { void confirm(); }}
                >
                  <span className="material-symbols-outlined text-[16px]">check_circle</span>
                  <span>{confirming ? "Confirming…" : "Confirm"}</span>
                </button>
              )}
            </div>
          </div>
          {owner ? (
            <div className="p-space-sm rounded-lg bg-surface-container flex items-center justify-between text-on-surface-variant gap-2 flex-wrap">
              <div className="flex items-center gap-space-xs">
                <span className="material-symbols-outlined text-[14px] text-primary">admin_panel_settings</span>
                <span className="font-mono-sm text-mono-sm text-on-surface">
                  Owner mode active: <span className="font-semibold text-primary">{userMonogram(displayName)} · {displayName}</span>
                </span>
              </div>
              <span className="font-mono-sm text-mono-sm text-outline capitalize">{roleLabel}</span>
            </div>
          ) : (
            <div className="p-space-sm rounded-lg bg-surface-container font-mono-sm text-mono-sm text-outline">
              Staff view: &quot;Only the owner can change parts.&quot;
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
