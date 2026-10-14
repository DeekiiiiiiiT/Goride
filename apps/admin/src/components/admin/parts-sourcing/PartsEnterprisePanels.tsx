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

export function PartsVehiclesPanel({ token }: { token: string }) {
  const [platforms, setPlatforms] = useState<Record<string, unknown>[]>([]);
  const [engines, setEngines] = useState<Record<string, unknown>[]>([]);
  const [coverage, setCoverage] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState("");

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

  const pct = coverage?.coveragePct ?? 0;
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4">
        <p className="text-sm text-slate-500">Catalog coverage</p>
        <p className="text-3xl font-semibold">{String(pct)}%</p>
        <p className="text-sm text-slate-500">
          {String(coverage?.coveredCount ?? 0)} of {String(coverage?.vehicleCount ?? 0)} catalog variants have a match on every top component that has parts. Turn on tiered search for fleets after this reaches 60%.
        </p>
        {error ? <p className="text-sm text-red-600 mt-2">{error}</p> : null}
      </div>
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
        <div><Label>Group id</Label><Input value={ruleGroup} onChange={(e) => setRuleGroup(e.target.value)} placeholder="Group id" /></div>
        <div>
          <Label>Fits</Label>
          <select className="h-9 rounded-md border px-2 bg-white dark:bg-slate-800" value={ruleTarget} onChange={(e) => setRuleTarget(e.target.value)}>
            {["engine_family", "platform", "catalog_variant"].map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div><Label>Code</Label><Input value={ruleCode} onChange={(e) => setRuleCode(e.target.value)} placeholder="1NZ-FE or ZRR80G" /></div>
        <Button type="button" variant="outline" onClick={async () => {
          try {
            const body: Record<string, unknown> = { interchange_group_id: ruleGroup, target_kind: ruleTarget };
            if (ruleTarget === "engine_family") body.engine_code = ruleCode;
            else if (ruleTarget === "platform") body.platform_code = ruleCode;
            else body.vehicle_catalog_id = ruleCode;
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
  const [partId, setPartId] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      setRequests(await listPartsSourcingRequests(token, status));
      const [c, a, w, q, r] = await Promise.all([
        partsEnterpriseApi.cores(token),
        partsEnterpriseApi.alerts(token),
        partsEnterpriseApi.claims(token),
        partsEnterpriseApi.quotes(token),
        partsEnterpriseApi.linkReviews(token),
      ]);
      setCores(itemsOf(c));
      setAlerts(itemsOf(a));
      setClaims(itemsOf(w));
      setQuotes(itemsOf(q));
      setReviews(itemsOf(r));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Queue failed to load");
      setRequests([]);
    }
  }, [token, status]);
  useEffect(() => { void load(); }, [load]);

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
              <div className="flex flex-wrap gap-2">
                <Input className="max-w-xs" placeholder="Part id to attach" value={partId} onChange={(e) => setPartId(e.target.value)} />
                <Button type="button" size="sm" onClick={async () => {
                  try {
                    await updatePartsSourcingRequest(token, r.id, "resolved", undefined, partId || null);
                    toast.success("Resolved");
                    await load();
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : "Failed");
                  }
                }}>Resolve with part</Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <Section title="Number reviews" rows={reviews} empty="No ambiguous part numbers." />
      <Section title="Repeat failures" rows={alerts} empty="No repeat-failure alerts." />
      <Section title="Warranty claims" rows={claims} empty="No warranty claims." />
      <Section title="Quote requests" rows={quotes} empty="No quote requests." />
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

function Section({ title, rows, empty }: { title: string; rows: Record<string, unknown>[]; empty: string }) {
  return (
    <div>
      <h3 className="font-medium mb-2">{title}</h3>
      {rows.length === 0 ? <p className="text-sm text-slate-500">{empty}</p> : (
        <ul className="text-sm space-y-1">
          {rows.slice(0, 20).map((row) => (
            <li key={String(row.id)} className="rounded border px-3 py-2">
              {String(row.detail || row.need_text || row.part_number || row.status || row.id)}
              {row.status ? ` · ${String(row.status)}` : ""}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
