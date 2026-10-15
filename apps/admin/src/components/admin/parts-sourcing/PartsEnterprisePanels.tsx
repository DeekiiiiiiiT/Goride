import React, { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import { Textarea } from "../../ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../ui/table";
import { partsEnterpriseApi } from "../../../services/partSourcingService";
import { parsePartsCatalogCsv } from "@roam/types/partsCatalogCsvImport";

function itemsOf(data: Record<string, unknown> | null): Record<string, unknown>[] {
  const items = data?.items;
  return Array.isArray(items) ? items as Record<string, unknown>[] : [];
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
