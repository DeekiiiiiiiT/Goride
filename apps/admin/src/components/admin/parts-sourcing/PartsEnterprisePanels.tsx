import React, { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import { Textarea } from "../../ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../ui/table";
import { partsEnterpriseApi, listPartsSourcingRequests, updatePartsSourcingRequest, type PartsSourcingRequestRow } from "../../../services/partSourcingService";
import { parsePartsCatalogCsv } from "@roam/types/partsCatalogCsvImport";

function itemsOf(data: Record<string, unknown> | null): Record<string, unknown>[] {
  const items = data?.items;
  return Array.isArray(items) ? items as Record<string, unknown>[] : [];
}

const OP_LABEL: Record<string, string> = {
  "ENG-OIL": "Oil filter",
  "ENG-SPARK": "Spark plugs",
  "ENG-THERM": "Thermostat",
  "FILT-AIR": "Air filter",
  "HVAC-CABIN": "Cabin filter",
  "BRK-PADS": "Brake pads",
  "BELT-SERP": "Drive belt",
  "LGT-WIPER": "Wipers",
  "BRK-ROTOR": "Brake rotors",
  "SUS-SHOCK": "Shocks",
  "ENG-O2": "Oxygen sensor",
  "ENG-WPUMP": "Water pump",
};

export function PartsVehiclesPanel({ token }: { token: string }) {
  void token;
  return null;
}

function RetiredVehiclesPanel({ token }: { token: string }) {
  const [platforms, setPlatforms] = useState<Record<string, unknown>[]>([]);
  const [engines, setEngines] = useState<Record<string, unknown>[]>([]);
  const [coverage, setCoverage] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState("");
  const [compareFor, setCompareFor] = useState("");
  const [compare, setCompare] = useState<Record<string, unknown> | null>(null);

  const load = useCallback(async () => {
    setError("");
    try {
      const [p, e, c] = await Promise.all([
        partsEnterpriseApi.platforms(token),
        partsEnterpriseApi.engines(token),
        partsEnterpriseApi.coverage(token),
      ]);
      setPlatforms(itemsOf(p));
      setEngines(itemsOf(e));
      setCoverage((c.coverage as Record<string, unknown>) ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load vehicles");
    }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  const pct = Number(coverage?.coveragePct ?? 0);
  const byOrg = Array.isArray(coverage?.byOrg) ? coverage.byOrg as Record<string, unknown>[] : [];
  const tieredOn = Array.isArray(coverage?.tieredOnFor) ? coverage.tieredOnFor as string[] : [];
  const tieredSet = new Set(tieredOn);
  const enabledAt = (coverage?.orgEnabledAt && typeof coverage.orgEnabledAt === "object")
    ? coverage.orgEnabledAt as Record<string, string>
    : {};
  const components = Array.isArray(coverage?.components) ? coverage.components as Record<string, unknown>[] : [];
  const nameByCode = new Map(components.map((item) => [String(item.opCode ?? ""), String(item.name ?? item.opCode ?? "")]));
  const missing = Array.isArray(coverage?.missing) ? coverage.missing as Record<string, unknown>[] : [];
  const missingNames = missing.map((item) => String(item.name || item.opCode || "")).filter(Boolean);
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 space-y-3">
        <p className="text-sm text-slate-500">Active vehicles with a confirmed match on all 10 parts: oil filter, spark plugs, thermostat, air filter, cabin filter, brake pads, drive belt, wipers, brake rotors, and shocks.</p>
        <p className="text-3xl font-semibold">{String(pct)}%</p>
        <p className="text-sm text-slate-500">
          {String(coverage?.coveredCount ?? 0)} of {String(coverage?.vehicleCount ?? 0)} active vehicles. Tiered search unlocks for a fleet at 60%. Compare first, turn on one fleet, then wait a week.
        </p>
        {missingNames.length > 0 ? (
          <p className="text-sm text-slate-500">Still missing a match: {missingNames.join(", ")}.</p>
        ) : null}
        {byOrg.length === 0 ? <p className="text-sm text-slate-500">No active fleets in this sample yet.</p> : byOrg.map((org) => {
          const id = String(org.organizationId ?? "");
          const name = String(org.organizationName || id);
          const orgPct = Number(org.coveragePct ?? 0);
          const on = tieredSet.has(id);
          const waiting = false;
          return (
            <div key={id} className="space-y-2 rounded-lg border px-3 py-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">{name}</p>
                  <p className="text-xs text-slate-500">{orgPct}% · {String(org.coveredCount ?? 0)} of {String(org.vehicleCount ?? 0)} vehicles</p>
                  {Array.isArray(org.missingOpCodes) && (org.missingOpCodes as string[]).length > 0 ? (
                    <p className="text-xs text-slate-500">Missing: {(org.missingOpCodes as string[]).map((code) => nameByCode.get(code) || code).join(", ")}</p>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={async () => {
                    try {
                      const next = compareFor === id ? "" : id;
                      setCompareFor(next);
                      setCompare(next ? await partsEnterpriseApi.compare(token, id) : null);
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : "Could not compare");
                    }
                  }}>{compareFor === id ? "Hide compare" : "Compare with the old list"}</Button>
                  <Button type="button" size="sm" variant={on ? "outline" : "default"} disabled={!on && (orgPct < 60 || waiting)} onClick={async () => {
                    try {
                      await partsEnterpriseApi.setTieredSearch(token, id, !on);
                      toast.success(on ? "Tiered search off for this fleet" : "Tiered search on for this fleet");
                      await load();
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : "Could not change tiered search");
                    }
                  }}>{on ? "Turn off" : waiting ? "Wait one week" : orgPct < 60 ? "Needs 60%" : "Turn on for this fleet"}</Button>
                </div>
              </div>
              {compareFor === id && compare ? <PartsCompare compare={compare} /> : null}
            </div>
          );
        })}
        {error ? <p className="text-sm text-red-600 mt-2">{error}</p> : null}
      </div>
      <CatalogReview token={token} onChanged={load} />
      <PlatformFamilies token={token} onSaved={load} />
      <h3 className="font-medium">Platforms (one per exact chassis code)</h3>
      <div className="rounded-lg border overflow-hidden max-h-64 overflow-auto">
        <Table>
          <TableHeader><TableRow><TableHead>Code</TableHead><TableHead>Label</TableHead></TableRow></TableHeader>
          <TableBody>
            {platforms.length === 0 ? <TableRow><TableCell colSpan={2} className="text-center text-slate-500 py-6">No platforms yet. Apply the catalog migration to fill these from chassis codes.</TableCell></TableRow> : platforms.slice(0, 80).map((p) => (
              <TableRow key={String(p.id)}><TableCell className="font-mono">{String(p.code)}</TableCell><TableCell>{String(p.label ?? "")}</TableCell></TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <h3 className="font-medium">Engine families</h3>
      <div className="rounded-lg border overflow-hidden max-h-64 overflow-auto">
        <Table>
          <TableHeader><TableRow><TableHead>Code</TableHead><TableHead>Displacement</TableHead></TableRow></TableHeader>
          <TableBody>
            {engines.length === 0 ? <TableRow><TableCell colSpan={2} className="text-center text-slate-500 py-6">No engines yet.</TableCell></TableRow> : engines.slice(0, 80).map((p) => (
              <TableRow key={String(p.id)}><TableCell className="font-mono">{String(p.code)}</TableCell><TableCell>{p.displacement_cc != null ? String(p.displacement_cc) : "—"}</TableCell></TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function PartsCompare({ compare }: { compare: Record<string, unknown> }) {
  const vehicle = (compare.vehicle && typeof compare.vehicle === "object") ? compare.vehicle as Record<string, unknown> : null;
  const legacy = Array.isArray(compare.legacy) ? compare.legacy as Record<string, unknown>[] : [];
  const tiered = Array.isArray(compare.tiered) ? compare.tiered as Record<string, unknown>[] : [];
  const line = (row: Record<string, unknown>) => `${String(row.name || "Part")} ${row.partNumber ? `(${String(row.partNumber)})` : ""}`.trim();
  return (
    <div className="grid gap-3 sm:grid-cols-2 text-sm">
      <p className="sm:col-span-2 text-xs text-slate-500">
        {vehicle ? `${String(vehicle.make ?? "")} ${String(vehicle.model ?? "")} ${vehicle.year ?? ""} · ${String(vehicle.chassisCode ?? "")}`.trim() : "No catalog vehicle in this fleet yet."} The fleet app keeps the old list until you turn tiered search on.
      </p>
      <div>
        <p className="font-medium mb-1">Old list</p>
        {legacy.length === 0 ? <p className="text-xs text-slate-500">Nothing on the old list.</p> : <ul className="space-y-1">{legacy.map((row, i) => <li key={i}>{line(row)}</li>)}</ul>}
      </div>
      <div>
        <p className="font-medium mb-1">Tiered list</p>
        {tiered.length === 0 ? <p className="text-xs text-slate-500">Nothing on the tiered list yet.</p> : <ul className="space-y-1">{tiered.map((row, i) => <li key={i}>{line(row)} · tier {String(row.tier ?? "")}</li>)}</ul>}
      </div>
    </div>
  );
}

type FamilyReviewRow = {
  chassis_code: string;
  group_key: string;
  suggested_family: string;
  car_name: string;
  share_body_parts: boolean | null;
  notes: string;
};

function PlatformFamilies({ token, onSaved }: { token: string; onSaved: () => Promise<void> }) {
  const [rows, setRows] = useState<FamilyReviewRow[]>([]);
  const load = useCallback(async () => {
    const data = await partsEnterpriseApi.familyReview(token);
    setRows((Array.isArray(data.items) ? data.items : []) as FamilyReviewRow[]);
  }, [token]);
  useEffect(() => { void load().catch(() => setRows([])); }, [load]);
  const groups = new Map<string, FamilyReviewRow[]>();
  for (const row of rows) {
    const list = groups.get(row.group_key) ?? [];
    list.push(row);
    groups.set(row.group_key, list);
  }
  return (
    <div className="space-y-2">
      <h3 className="font-medium">Families that can share body parts</h3>
      <p className="text-sm text-slate-500">Nothing is grouped until you turn a family on. Accord and the Delica stay separate. The hybrid Noah stays separate from the gas Noah.</p>
      {[...groups.entries()].map(([key, list]) => {
        const family = list[0]?.suggested_family ?? "";
        const canShare = list.length > 1 || key === "r80-hybrid";
        const shared = canShare && list.every((row) => row.share_body_parts === true);
        const note = list.map((row) => row.notes).find(Boolean) ?? "";
        return (
          <div key={key} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2">
            <div>
              <p className="text-sm font-medium">{list.map((row) => `${row.car_name} (${row.chassis_code})`).join(", ")}</p>
              {note ? <p className="text-xs text-slate-500">{note}</p> : null}
            </div>
            {canShare ? (
              <Button type="button" size="sm" variant={shared ? "default" : "outline"} onClick={async () => {
                try {
                  await partsEnterpriseApi.setFamily(token, {
                    family,
                    chassisCodes: list.map((row) => row.chassis_code),
                    shareBodyParts: !shared,
                  });
                  toast.success(shared ? "Family ungrouped" : "These cars now share body parts");
                  await load();
                  await onSaved();
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Could not update the family");
                }
              }}>{shared ? "Sharing body parts" : key === "r80-hybrid" ? "Shares with the gas Noah" : "These share body parts"}</Button>
            ) : (
              <p className="text-xs text-slate-500">Stays on its own</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

type ReviewPart = { id: string; name: string; partNumber: string | null; manufacturer: string | null; opCode: string; decision: string };
type GapRow = { opCode: string; action: "confirm" | "attach" | "enter"; partNumber: string; manufacturer: string; partId: string | null; partName?: string; decision: string; done: boolean };
type GapFleet = { organizationName: string; chassisCode: string; engineCode: string; carName: string; vehicleCount: number; rows: GapRow[] };

function CatalogReview({ token, onChanged }: { token: string; onChanged: () => Promise<void> }) {
  const [parts, setParts] = useState<ReviewPart[]>([]);
  const [gaps, setGaps] = useState<GapFleet[]>([]);
  const [drafts, setDrafts] = useState<Record<string, { manufacturer: string; partNumber: string }>>({});
  const [reviewError, setReviewError] = useState("");
  const load = useCallback(async () => {
    const data = await partsEnterpriseApi.catalogReview(token);
    setParts((Array.isArray(data.parts) ? data.parts : []) as ReviewPart[]);
    setGaps((Array.isArray(data.gaps) ? data.gaps : []) as GapFleet[]);
    setReviewError("");
  }, [token]);
  useEffect(() => {
    void load().catch((err) => {
      setParts([]);
      setGaps([]);
      setReviewError(err instanceof Error ? err.message : "Could not load the catalog check.");
    });
  }, [load]);
  const pending = parts.filter((part) => part.decision === "pending");
  const act = async (work: () => Promise<unknown>, done: string) => {
    try {
      await work();
      toast.success(done);
      await load();
      await onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save");
    }
  };
  return (
    <div className="space-y-3">
      <h3 className="font-medium">Catalog numbers to check</h3>
      <p className="text-sm text-slate-500">A number counts toward the 60% gate only after you confirm it. Reject hides it from search. Nothing here is guessed.</p>
      {reviewError ? <p className="text-sm text-red-600">{reviewError}</p> : null}
      {pending.length === 0 ? <p className="text-sm text-slate-500">No unconfirmed numbers.</p> : pending.map((part) => (
        <div key={part.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2">
          <p className="text-sm">{OP_LABEL[part.opCode] || part.name} · {part.manufacturer} {part.partNumber}</p>
          <div className="flex gap-2">
            <Button type="button" size="sm" onClick={() => void act(() => partsEnterpriseApi.decidePart(token, part.id, "confirmed"), "Number confirmed")}>Confirm</Button>
            <Button type="button" size="sm" variant="outline" onClick={() => void act(() => partsEnterpriseApi.decidePart(token, part.id, "rejected"), "Number hidden from search")}>Reject</Button>
          </div>
        </div>
      ))}
      {gaps.map((fleet) => (
        <div key={`${fleet.organizationName}-${fleet.chassisCode}`} className="space-y-2">
          <h3 className="font-medium">{fleet.carName} · {fleet.chassisCode} · {fleet.organizationName}</h3>
          <p className="text-xs text-slate-500">{fleet.vehicleCount} vehicle{fleet.vehicleCount === 1 ? "" : "s"} · engine {fleet.engineCode || "unknown"}</p>
          {fleet.rows.filter((row) => !row.done).map((row) => {
            const draftKey = `${fleet.chassisCode}:${row.opCode}`;
            const draft = drafts[draftKey] ?? { manufacturer: "", partNumber: "" };
            return (
              <div key={draftKey} className="flex flex-wrap items-end justify-between gap-2 rounded-lg border px-3 py-2">
                <div>
                  <p className="text-sm">{OP_LABEL[row.opCode] || row.opCode}</p>
                  {row.action === "enter" ? (
                    <div className="flex flex-wrap gap-2 mt-2">
                      <Input value={draft.manufacturer} placeholder="Maker" onChange={(e) => setDrafts((prev) => ({ ...prev, [draftKey]: { ...draft, manufacturer: e.target.value } }))} />
                      <Input value={draft.partNumber} placeholder="Part number from the maker catalog" onChange={(e) => setDrafts((prev) => ({ ...prev, [draftKey]: { ...draft, partNumber: e.target.value } }))} />
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500">{row.manufacturer} {row.partNumber}{row.action === "attach" ? ` · attach to ${fleet.chassisCode}` : " · already follows this engine"}</p>
                  )}
                </div>
                {row.action === "enter" ? (
                  <Button type="button" size="sm" onClick={() => void act(() => partsEnterpriseApi.addCatalogPart(token, {
                    opCode: row.opCode,
                    chassisCode: fleet.chassisCode,
                    engineCode: fleet.engineCode,
                    manufacturer: draft.manufacturer,
                    partNumber: draft.partNumber,
                    partName: OP_LABEL[row.opCode] || row.opCode,
                  }), "Number saved")}>Save this number</Button>
                ) : row.action === "attach" && row.partId ? (
                  <Button type="button" size="sm" onClick={() => void act(() => partsEnterpriseApi.attachPart(token, row.partId as string, fleet.chassisCode), "Attached to this chassis")}>Attach</Button>
                ) : row.partId ? (
                  <Button type="button" size="sm" onClick={() => void act(() => partsEnterpriseApi.decidePart(token, row.partId as string, "confirmed"), "Number confirmed")}>Confirm</Button>
                ) : null}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export function PartsGroupsPanel({ token }: { token: string }) {
  const [groups, setGroups] = useState<Record<string, unknown>[]>([]);
  const [rules, setRules] = useState<Record<string, unknown>[]>([]);
  const [code, setCode] = useState("");
  const [scope, setScope] = useState("powertrain");
  const [ruleGroup, setRuleGroup] = useState("");
  const [ruleTarget, setRuleTarget] = useState("engine_family");
  const [ruleCode, setRuleCode] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const [g, r] = await Promise.all([partsEnterpriseApi.groups(token), partsEnterpriseApi.rules(token)]);
      setGroups(itemsOf(g));
      setRules(itemsOf(r));
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load groups");
    }
  }, [token]);
  useEffect(() => { void load(); }, [load]);

  return (
    <div className="space-y-4">
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <div className="flex flex-wrap gap-2 items-end">
        <div><Label>Group code</Label><Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="IC-OILFLT-0012" /></div>
        <div>
          <Label>Fit scope</Label>
          <select className="h-9 rounded-md border px-2 bg-white dark:bg-slate-800" value={scope} onChange={(e) => setScope(e.target.value)}>
            {["powertrain", "chassis", "body", "electrical", "universal"].map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>
        <Button type="button" onClick={async () => {
          try {
            await partsEnterpriseApi.createGroup(token, { code, fit_scope: scope, label: code });
            setCode("");
            toast.success("Group saved");
            await load();
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Failed");
          }
        }}>Add group</Button>
      </div>
      <div className="flex flex-wrap gap-2 items-end">
        <div>
          <Label>Group</Label>
          <select className="h-9 rounded-md border px-2 bg-white dark:bg-slate-800" value={ruleGroup} onChange={(e) => setRuleGroup(e.target.value)}>
            <option value="">Choose a group</option>
            {groups.map((g) => <option key={String(g.id)} value={String(g.id)}>{String(g.code)}</option>)}
          </select>
        </div>
        <div>
          <Label>Fits</Label>
          <select className="h-9 rounded-md border px-2 bg-white dark:bg-slate-800" value={ruleTarget} onChange={(e) => setRuleTarget(e.target.value)}>
            {["engine_family", "platform", "catalog_variant"].map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div><Label>{ruleTarget === "catalog_variant" ? "Catalog match" : "Code"}</Label><Input value={ruleCode} onChange={(e) => setRuleCode(e.target.value)} placeholder={ruleTarget === "catalog_variant" ? "Search make, model, or chassis" : "1NZ-FE or ZRR80G"} /></div>
        <Button type="button" variant="outline" onClick={async () => {
          try {
            const body: Record<string, unknown> = { interchange_group_id: ruleGroup, target_kind: ruleTarget };
            if (ruleTarget === "engine_family") body.engine_code = ruleCode;
            else if (ruleTarget === "platform") body.platform_code = ruleCode;
            else {
              const found = await partsEnterpriseApi.catalogVariants(token, ruleCode);
              const items = Array.isArray(found.items) ? found.items as Record<string, unknown>[] : [];
              const match = items.find((item) => String(item.chassis_code ?? "").toUpperCase() === ruleCode.trim().toUpperCase()) ?? items[0];
              if (!match?.id) throw new Error("No catalog variant matched that search.");
              body.vehicle_catalog_id = String(match.id);
            }
            await partsEnterpriseApi.createRule(token, body);
            toast.success("Rule saved");
            await load();
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Failed");
          }
        }}>Add rule</Button>
      </div>
      <p className="text-sm text-slate-500">An engine-family rule is rejected unless the group is powertrain or universal.</p>
      <div className="rounded-lg border overflow-hidden">
        <Table>
          <TableHeader><TableRow><TableHead>Code</TableHead><TableHead>Scope</TableHead></TableRow></TableHeader>
          <TableBody>
            {groups.length === 0 ? <TableRow><TableCell colSpan={2} className="text-center text-slate-500 py-6">No interchange groups yet.</TableCell></TableRow> : groups.map((g) => (
              <TableRow key={String(g.id)}><TableCell className="font-mono">{String(g.code)}</TableCell><TableCell>{String(g.fit_scope)}</TableCell></TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <h3 className="font-medium">Rules ({rules.length})</h3>
      <div className="rounded-lg border overflow-hidden max-h-64 overflow-auto">
        <Table>
          <TableHeader><TableRow><TableHead>Group</TableHead><TableHead>Target</TableHead><TableHead>Source</TableHead></TableRow></TableHeader>
          <TableBody>
            {rules.length === 0 ? <TableRow><TableCell colSpan={3} className="text-center text-slate-500 py-6">No rules yet. Import a CSV or add one after a group exists.</TableCell></TableRow> : rules.slice(0, 100).map((r) => (
              <TableRow key={String(r.id)}>
                <TableCell>{String((r.part_interchange_group as { code?: string } | null)?.code ?? "")}</TableCell>
                <TableCell>{String(r.target_kind)}</TableCell>
                <TableCell>{String(r.source ?? "")}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

export function PartsImportPanel({ token }: { token: string }) {
  const [text, setText] = useState("interchange_code,manufacturer,part_number,part_name,part_kind,fit_scope,target_kind,target_code,component_op_code,category_slug,supersedes\n");
  const [batchId, setBatchId] = useState("");
  const [message, setMessage] = useState("");

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-500">Paste real part numbers only. The importer will not invent OEM numbers.</p>
      <Textarea className="min-h-[160px] font-mono text-xs" value={text} onChange={(e) => setText(e.target.value)} />
      <div className="flex gap-2">
        <Button type="button" onClick={async () => {
          const parsed = parsePartsCatalogCsv(text);
          if (parsed.errors.length) {
            setMessage(parsed.errors.slice(0, 5).join(" "));
            return;
          }
          if (!parsed.rows.length) {
            setMessage("No rows to import.");
            return;
          }
          try {
            const result = await partsEnterpriseApi.importRows(token, parsed.rows);
            const body = result.result as { batchId?: string; applied?: number; errors?: string[] } | undefined;
            setBatchId(body?.batchId ?? "");
            setMessage(`Imported ${body?.applied ?? 0}. ${(body?.errors ?? []).join(" ")}`);
          } catch (err) {
            setMessage(err instanceof Error ? err.message : "Import failed");
          }
        }}>Import</Button>
        <Button type="button" variant="outline" disabled={!batchId} onClick={async () => {
          try {
            await partsEnterpriseApi.undoImport(token, batchId);
            setMessage("Last import removed.");
          } catch (err) {
            setMessage(err instanceof Error ? err.message : "Undo failed");
          }
        }}>Undo last import</Button>
      </div>
      {message ? <p className="text-sm">{message}</p> : null}
    </div>
  );
}

export function PartsQueuePanel({ token }: { token: string }) {
  const [status, setStatus] = useState("all");
  const [requests, setRequests] = useState<PartsSourcingRequestRow[]>([]);
  const [error, setError] = useState("");
  const [cores, setCores] = useState<Record<string, unknown>[]>([]);
  const [alerts, setAlerts] = useState<Record<string, unknown>[]>([]);
  const [claims, setClaims] = useState<Record<string, unknown>[]>([]);
  const [quotes, setQuotes] = useState<Record<string, unknown>[]>([]);
  const [reviews, setReviews] = useState<Record<string, unknown>[]>([]);
  const [didntFit, setDidntFit] = useState<Record<string, unknown>[]>([]);
  const [proposals, setProposals] = useState<Record<string, unknown>[]>([]);
  const [partQuery, setPartQuery] = useState("");
  const [partHits, setPartHits] = useState<Record<string, unknown>[]>([]);
  const [quotePrice, setQuotePrice] = useState("");
  const [quoteDays, setQuoteDays] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      setRequests(await listPartsSourcingRequests(token, status));
      const [c, a, w, q, r, fit, prop] = await Promise.all([
        partsEnterpriseApi.cores(token),
        partsEnterpriseApi.alerts(token),
        partsEnterpriseApi.claims(token),
        partsEnterpriseApi.quotes(token),
        partsEnterpriseApi.linkReviews(token),
        partsEnterpriseApi.ruleReviews(token),
        partsEnterpriseApi.proposals(token),
      ]);
      setCores(itemsOf(c));
      setAlerts(itemsOf(a));
      setClaims(itemsOf(w));
      setQuotes(itemsOf(q));
      setReviews(itemsOf(r));
      setDidntFit(itemsOf(fit).filter((row) => row.status === "open"));
      setProposals(itemsOf(prop).filter((row) => row.status === "proposed"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Queue failed to load");
      setRequests([]);
    }
  }, [token, status]);
  useEffect(() => { void load(); }, [load]);

  const act = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      toast.success("Saved");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  };

  const pendingCores = cores.filter((c) => c.status === "pending");
  const overdue = pendingCores.filter((c) => c.due_by && String(c.due_by) < new Date().toISOString().slice(0, 10));
  const pendingValue = pendingCores.reduce((s, c) => s + Number(c.core_charge || 0), 0);

  return (
    <div className="space-y-6">
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <div className="rounded-xl border p-4">
        <p className="font-medium">${pendingValue.toFixed(2)} in pending core returns · {overdue.length} overdue</p>
        <p className="text-sm text-slate-500">Core deposits stay on this list. They are not posted to driver pay.</p>
      </div>
      <div className="flex gap-2 items-center">
        <Label>Requests</Label>
        <select className="h-9 rounded-md border px-2" value={status} onChange={(e) => setStatus(e.target.value)}>
          {["all", "open", "in_progress", "resolved", "rejected"].map((s) => <option key={s}>{s}</option>)}
        </select>
      </div>
      {requests.length === 0 ? <p className="text-sm text-slate-500">No requests in this status.</p> : (
        <ul className="space-y-2">
          {requests.map((r) => (
            <li key={r.id} className="rounded-lg border p-3 text-sm space-y-2">
              <p className="font-medium">{r.need_text}</p>
              <p className="text-xs text-slate-500">{r.status} · {r.vehicle_id} · {r.organization_id}</p>
              <div className="flex flex-wrap gap-2 items-center">
                <Input className="max-w-xs" placeholder="Search a part to attach" value={partQuery} onChange={async (e) => {
                  const q = e.target.value;
                  setPartQuery(q);
                  if (q.trim().length < 2) { setPartHits([]); return; }
                  try {
                    const res = await partsEnterpriseApi.search(token, q.trim());
                    setPartHits(itemsOf(res));
                  } catch { setPartHits([]); }
                }} />
                {partHits.slice(0, 5).map((hit) => (
                  <Button key={String(hit.part_id)} type="button" size="sm" variant="outline" onClick={async () => {
                    try {
                      await updatePartsSourcingRequest(token, r.id, "resolved", undefined, String(hit.part_id));
                      toast.success("Resolved");
                      setPartQuery("");
                      setPartHits([]);
                      await load();
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : "Failed");
                    }
                  }}>{String(hit.name)}</Button>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
      <ActionList title="Didn't fit" empty="No fit complaints." rows={didntFit} label={(row) => String(row.notes || row.part_id)} actions={(row) => (
        <>
          <Button type="button" size="sm" variant="outline" onClick={() => act(() => partsEnterpriseApi.resolveRuleReview(token, String(row.id), "kept"))}>Keep the rule</Button>
          <Button type="button" size="sm" variant="outline" onClick={() => act(() => partsEnterpriseApi.resolveRuleReview(token, String(row.id), "retired"))}>Retire</Button>
        </>
      )} />
      <ActionList title="Suggested rules" empty="No suggestions yet. Three confirmed fits create one." rows={proposals} label={(row) => `${String(row.target_kind)} · ${String(row.fit_count)} fits`} actions={(row) => (
        <>
          <Button type="button" size="sm" onClick={() => act(() => partsEnterpriseApi.decideProposal(token, String(row.id), "approved"))}>Approve</Button>
          <Button type="button" size="sm" variant="outline" onClick={() => act(() => partsEnterpriseApi.decideProposal(token, String(row.id), "rejected"))}>Reject</Button>
        </>
      )} />
      <ActionList title="Number reviews" empty="No part numbers waiting to be linked." rows={reviews} label={(row) => String(row.part_number)} actions={(row) => (
        <>
          <Button type="button" size="sm" variant="outline" onClick={() => act(async () => {
            const q = window.prompt("Search the catalog for this number", String(row.part_number ?? ""));
            if (!q) return;
            const res = await partsEnterpriseApi.search(token, q);
            const hit = itemsOf(res)[0];
            if (!hit?.part_id) throw new Error("No part matched that search.");
            await partsEnterpriseApi.resolveLink(token, String(row.id), { status: "linked", linked_part_id: String(hit.part_id) });
          })}>Link</Button>
          <Button type="button" size="sm" variant="outline" onClick={() => act(() => partsEnterpriseApi.resolveLink(token, String(row.id), { status: "dismissed" }))}>Dismiss</Button>
        </>
      )} />
      <ActionList title="Repeat failures" empty="No repeat-failure alerts." rows={alerts} label={(row) => String(row.detail || row.part_number || row.id)} actions={(row) => (
        <Button type="button" size="sm" variant="outline" onClick={() => act(() => partsEnterpriseApi.dismissAlert(token, String(row.id)))}>Dismiss</Button>
      )} />
      <ActionList title="Warranty claims" empty="No warranty claims." rows={claims} label={(row) => `${String(row.status)} · ${String(row.part_id)}`} actions={(row) => (
        <>
          {["submitted", "credited", "rejected"].map((status) => (
            <Button key={status} type="button" size="sm" variant="outline" onClick={() => act(() => partsEnterpriseApi.updateClaim(token, String(row.id), status))}>{status}</Button>
          ))}
        </>
      )} />
      <div className="space-y-2">
        <h3 className="font-medium">Quote requests</h3>
        {quotes.length === 0 ? <p className="text-sm text-slate-500">No quote requests.</p> : quotes.slice(0, 20).map((row) => (
          <div key={String(row.id)} className="rounded border px-3 py-2 text-sm flex flex-wrap gap-2 items-center">
            <span className="flex-1">{String(row.part_number || row.part_id || row.status)}</span>
            <Input className="w-28" placeholder="Price" value={quotePrice} onChange={(e) => setQuotePrice(e.target.value)} />
            <Input className="w-24" placeholder="Days" value={quoteDays} onChange={(e) => setQuoteDays(e.target.value)} />
            <Button type="button" size="sm" onClick={() => act(() => partsEnterpriseApi.replyQuote(token, String(row.id), { unitPrice: Number(quotePrice), leadTimeDays: Number(quoteDays) }))}>Save offer</Button>
          </div>
        ))}
      </div>
      <ActionList title="Core returns" empty="No core returns." rows={cores} label={(row) => `${String(row.status)} · ${String(row.core_charge ?? "")}`} actions={(row) => (
        <>
          {["shipped", "credited", "rejected"].map((status) => (
            <Button key={status} type="button" size="sm" variant="outline" onClick={() => act(() => partsEnterpriseApi.updateCore(token, String(row.id), status))}>{status}</Button>
          ))}
        </>
      )} />
      <Button type="button" variant="outline" onClick={async () => {
        try {
          await partsEnterpriseApi.refreshAlerts(token);
          toast.success("Alerts refreshed");
          await load();
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Failed");
        }
      }}>Refresh repeat-failure alerts</Button>
    </div>
  );
}

function ActionList({ title, rows, empty, label, actions }: {
  title: string;
  rows: Record<string, unknown>[];
  empty: string;
  label: (row: Record<string, unknown>) => string;
  actions: (row: Record<string, unknown>) => React.ReactNode;
}) {
  return (
    <div>
      <h3 className="font-medium mb-2">{title}</h3>
      {rows.length === 0 ? <p className="text-sm text-slate-500">{empty}</p> : (
        <ul className="text-sm space-y-2">
          {rows.slice(0, 20).map((row) => (
            <li key={String(row.id)} className="rounded border px-3 py-2 flex flex-wrap items-center gap-2">
              <span className="flex-1 min-w-[12rem]">{label(row)}</span>
              {actions(row)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
