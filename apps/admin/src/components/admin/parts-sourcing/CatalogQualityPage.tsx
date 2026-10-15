import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import { Button } from "../../ui/button";
import { partsEnterpriseApi, listSuppliers } from "../../../services/partSourcingService";
import type { SupplierRecord } from "../../../types/partSourcing";
import { GuidedPartDialog } from "./GuidedPartDialog";

const CORE = [
  ["ENG-OIL", "Oil"],
  ["ENG-SPARK", "Plugs"],
  ["ENG-THERM", "Thermostat"],
  ["FILT-AIR", "Air"],
  ["HVAC-CABIN", "Cabin"],
  ["BRK-PADS", "Pads"],
  ["BELT-SERP", "Belt"],
  ["LGT-WIPER", "Wipers"],
  ["BRK-ROTOR", "Rotors"],
  ["SUS-SHOCK", "Shocks"],
] as const;

const SPECS = [
  ["wiper_driver_mm", "Driver wiper"],
  ["wiper_passenger_mm", "Passenger wiper"],
  ["engine_oil_grade", "Oil grade"],
  ["battery_jis", "Battery"],
] as const;

type Cell = "verified" | "unverified" | "missing" | "not_applicable";
type VariantRow = {
  variantId: string;
  make: string;
  model: string;
  chassisCode?: string;
  engineCode?: string;
  yearFrom?: number | null;
  yearTo?: number | null;
  demand: number;
  fleetCount: number;
  ready: boolean;
  cells: Record<string, Cell>;
  specCells?: Record<string, string>;
};

function cellMark(cell: Cell | undefined) {
  if (cell === "verified") return "Yes";
  if (cell === "unverified") return "Check";
  if (cell === "not_applicable") return "N/A";
  return "Missing";
}

type FitReview = { ids: string[]; partName: string; variantLabel: string; count: number };
type FitProposal = { id: string; partName: string; where: string; count: number };
type Gap = { variantId: string; label: string; chassisCode: string; engineCode: string; opCode: string; opLabel: string; yearFrom?: number | null; yearTo?: number | null };

export function CatalogQualityPage() {
  const { session } = useAuth();
  const token = session?.access_token;
  const [rows, setRows] = useState<VariantRow[]>([]);
  const [inUsePct, setInUsePct] = useState(0);
  const [allPct, setAllPct] = useState(0);
  const [make, setMake] = useState("");
  const [inUseOnly, setInUseOnly] = useState(false);
  const [killed, setKilled] = useState(false);
  const [message, setMessage] = useState("");
  const [parts, setParts] = useState<Array<Record<string, unknown>>>([]);
  const [evidence, setEvidence] = useState<Record<string, string>>({});
  const [reviews, setReviews] = useState<FitReview[]>([]);
  const [proposals, setProposals] = useState<FitProposal[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierRecord[]>([]);
  const [gap, setGap] = useState<Gap | null>(null);
  const [price, setPrice] = useState({ partId: "", supplierId: "", supplierSku: "", unitPrice: "", currency: "JMD" });

  const load = useCallback(async () => {
    if (!token) return;
    const data = await partsEnterpriseApi.matrix(token);
    const matrix = (data.matrix ?? {}) as Record<string, unknown>;
    setRows((Array.isArray(matrix.variants) ? matrix.variants : []) as VariantRow[]);
    setInUsePct(Number(matrix.inUseReadyPct ?? 0));
    setAllPct(Number(matrix.allReadyPct ?? 0));
    const review = await partsEnterpriseApi.catalogReview(token);
    setParts((Array.isArray(review.parts) ? review.parts : []) as Array<Record<string, unknown>>);
    const [didntFit, suggested, supplierRows] = await Promise.all([
      partsEnterpriseApi.ruleReviews(token),
      partsEnterpriseApi.proposals(token),
      listSuppliers(token),
    ]);
    setReviews((Array.isArray(didntFit.items) ? didntFit.items : []) as FitReview[]);
    setProposals((Array.isArray(suggested.items) ? suggested.items : []) as FitProposal[]);
    setSuppliers(supplierRows);
  }, [token]);

  useEffect(() => { void load().catch((err) => setMessage(err instanceof Error ? err.message : "Could not load coverage")); }, [load]);

  const visible = useMemo(() => rows.filter((row) => {
    if (inUseOnly && row.demand <= 0) return false;
    if (make && !row.make.toLowerCase().includes(make.toLowerCase())) return false;
    return true;
  }), [rows, inUseOnly, make]);

  const pending = parts.filter((part) => part.decision === "pending");
  const confirmed = parts.filter((part) => part.decision === "confirmed");

  return (
    <div className="p-4 md:p-6 space-y-4 text-slate-900 dark:text-slate-100">
      <div>
        <h1 className="text-xl font-bold">Data quality</h1>
        <p className="text-sm text-slate-500">{inUsePct}% of in-use variants are fully covered. {allPct}% of all variants.</p>
      </div>
      <div className="flex flex-wrap gap-2 items-center">
        <input className="border rounded px-2 py-1 text-sm" placeholder="Make" value={make} onChange={(e) => setMake(e.target.value)} />
        <label className="text-sm flex items-center gap-2">
          <input type="checkbox" checked={inUseOnly} onChange={(e) => setInUseOnly(e.target.checked)} />
          In use only
        </label>
        <Button type="button" size="sm" variant="outline" onClick={() => token && partsEnterpriseApi.refreshDemand(token).then(() => load())}>Refresh demand</Button>
        <Button type="button" size="sm" onClick={() => token && partsEnterpriseApi.seedInUse(token).then((res) => { setMessage(`Attached ${String(res.rulesAdded ?? 0)} engine rules.`); return load(); })}>Fill gaps from the same engine</Button>
        <Button type="button" size="sm" variant={killed ? "default" : "outline"} onClick={() => token && partsEnterpriseApi.tieredKill(token, !killed).then(() => setKilled((v) => !v))}>{killed ? "Emergency stop is on" : "Emergency stop"}</Button>
      </div>
      {message ? <p className="text-sm text-slate-600">{message}</p> : null}
      <div className="overflow-auto border rounded-lg">
        <table className="min-w-full text-xs">
          <thead>
            <tr>
              <th className="text-left p-2">Variant</th>
              <th className="p-2">In use</th>
              {CORE.map(([code, label]) => <th key={code} className="p-2">{label}</th>)}
              {SPECS.map(([code, label]) => <th key={code} className="p-2">{label}</th>)}
            </tr>
          </thead>
          <tbody>
            {visible.slice(0, 80).map((row) => (
              <tr key={row.variantId} className="border-t">
                <td className="p-2">{row.make} {row.model}</td>
                <td className="p-2 text-center">{row.demand}</td>
                {CORE.map(([code]) => (
                  <td key={code} className="p-2 text-center">
                    {row.cells?.[code] === "not_applicable" ? (
                      <span className="text-slate-400">N/A</span>
                    ) : row.demand > 0 && row.cells?.[code] !== "verified" ? (
                      <button type="button" className="underline" onClick={() => {
                        setGap({
                          variantId: row.variantId,
                          label: `${row.make} ${row.model}`,
                          chassisCode: row.chassisCode || "",
                          engineCode: row.engineCode || "",
                          opCode: code,
                          opLabel: CORE.find(([op]) => op === code)?.[1] || code,
                          yearFrom: row.yearFrom,
                          yearTo: row.yearTo,
                        });
                      }}>{cellMark(row.cells?.[code])}</button>
                    ) : cellMark(row.cells?.[code])}
                  </td>
                ))}
                {SPECS.map(([code]) => (
                  <td key={code} className="p-2 text-center text-slate-600">{row.specCells?.[code] || "—"}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="space-y-2">
        <h2 className="font-semibold">Verification queue</h2>
        {pending.length === 0 ? <p className="text-sm text-slate-500">No parts waiting for confirmation.</p> : pending.map((part) => {
          const id = String(part.id);
          return (
            <div key={id} className="flex flex-wrap items-center gap-2 border rounded px-3 py-2">
              <span className="text-sm flex-1">{String(part.manufacturer ?? "")} {String(part.partNumber ?? part.name ?? "")}</span>
              <input className="border rounded px-2 py-1 text-sm" placeholder="Evidence link" value={evidence[id] ?? ""} onChange={(e) => setEvidence((prev) => ({ ...prev, [id]: e.target.value }))} />
              <Button type="button" size="sm" onClick={() => {
                if (!token) return;
                if (!evidence[id]?.trim()) {
                  setMessage("A verified part needs a source link.");
                  return;
                }
                void partsEnterpriseApi.decidePart(token, id, "confirmed", evidence[id]).then(() => load());
              }}>Confirm</Button>
              <Button type="button" size="sm" variant="outline" onClick={() => token && partsEnterpriseApi.decidePart(token, id, "rejected").then(() => load())}>Reject</Button>
            </div>
          );
        })}
      </div>
      {gap && token ? (
        <GuidedPartDialog
          open
          token={token}
          mode="create"
          variant={{ id: gap.variantId, label: gap.label, yearFrom: gap.yearFrom, yearTo: gap.yearTo }}
          job={{ opCode: gap.opCode, label: gap.opLabel }}
          onClose={() => setGap(null)}
          onSaved={() => { setGap(null); void load(); }}
        />
      ) : null}
      <div className="space-y-2">
        <h2 className="font-semibold">Didn't fit</h2>
        {reviews.length === 0 ? <p className="text-sm text-slate-500">No fit complaints waiting.</p> : reviews.map((row) => (
          <div key={row.ids.join("-")} className="flex flex-wrap items-center gap-2 border rounded px-3 py-2">
            <span className="text-sm flex-1">{row.partName} · {row.variantLabel} · {row.count}</span>
            <Button type="button" size="sm" onClick={() => token && Promise.all(row.ids.map((id) => partsEnterpriseApi.resolveRuleReview(token, id, "approved"))).then(() => load())}>Approve</Button>
            <Button type="button" size="sm" variant="outline" onClick={() => token && Promise.all(row.ids.map((id) => partsEnterpriseApi.resolveRuleReview(token, id, "rejected"))).then(() => load())}>Reject</Button>
          </div>
        ))}
      </div>
      <div className="space-y-2">
        <h2 className="font-semibold">Suggested rules</h2>
        {proposals.length === 0 ? <p className="text-sm text-slate-500">No suggested rules.</p> : proposals.map((row) => (
          <div key={row.id} className="flex flex-wrap items-center gap-2 border rounded px-3 py-2">
            <span className="text-sm flex-1">{row.partName} · {row.where} · {row.count}</span>
            <Button type="button" size="sm" onClick={() => token && partsEnterpriseApi.decideProposal(token, row.id, "approved").then(() => load())}>Approve</Button>
            <Button type="button" size="sm" variant="outline" onClick={() => token && partsEnterpriseApi.decideProposal(token, row.id, "rejected").then(() => load())}>Reject</Button>
          </div>
        ))}
      </div>
      <div className="space-y-2">
        <h2 className="font-semibold">Reference price</h2>
        <p className="text-sm text-slate-500">A catalog price has no customer on it. Add one only when you have a real supplier price.</p>
        <div className="flex flex-wrap gap-2 items-center">
          <select className="border rounded px-2 py-1 text-sm" value={price.partId} onChange={(e) => setPrice((prev) => ({ ...prev, partId: e.target.value }))}>
            <option value="">Confirmed part</option>
            {confirmed.map((part) => <option key={String(part.id)} value={String(part.id)}>{String(part.manufacturer ?? "")} {String(part.partNumber ?? part.name ?? "")}</option>)}
          </select>
          <select className="border rounded px-2 py-1 text-sm" value={price.supplierId} onChange={(e) => setPrice((prev) => ({ ...prev, supplierId: e.target.value }))}>
            <option value="">Supplier</option>
            {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
          </select>
          <input className="border rounded px-2 py-1 text-sm" placeholder="Supplier code" value={price.supplierSku} onChange={(e) => setPrice((prev) => ({ ...prev, supplierSku: e.target.value }))} />
          <input className="border rounded px-2 py-1 text-sm w-28" placeholder="Price" value={price.unitPrice} onChange={(e) => setPrice((prev) => ({ ...prev, unitPrice: e.target.value }))} />
          <input className="border rounded px-2 py-1 text-sm w-20" value={price.currency} onChange={(e) => setPrice((prev) => ({ ...prev, currency: e.target.value }))} />
          <Button type="button" size="sm" disabled={!token || !price.partId || !price.supplierId || !price.supplierSku || !price.unitPrice} onClick={() => {
            if (!token) return;
            void partsEnterpriseApi.referenceOffer(token, {
              partId: price.partId,
              supplierId: price.supplierId,
              supplierSku: price.supplierSku,
              unitPrice: Number(price.unitPrice),
              currency: price.currency || "JMD",
            }).then(() => { setMessage("Reference price saved."); setPrice((prev) => ({ ...prev, supplierSku: "", unitPrice: "" })); }).catch((err) => setMessage(err instanceof Error ? err.message : "Could not save the price"));
          }}>Save price</Button>
        </div>
      </div>
    </div>
  );
}
