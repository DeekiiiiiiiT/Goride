import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import { Button } from "../../ui/button";
import { partsEnterpriseApi } from "../../../services/partSourcingService";

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

type Cell = "verified" | "unverified" | "missing";
type VariantRow = {
  variantId: string;
  make: string;
  model: string;
  chassisCode?: string;
  engineCode?: string;
  demand: number;
  fleetCount: number;
  ready: boolean;
  cells: Record<string, Cell>;
};

function cellMark(cell: Cell | undefined) {
  if (cell === "verified") return "Yes";
  if (cell === "unverified") return "Check";
  return "Missing";
}

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

  const load = useCallback(async () => {
    if (!token) return;
    const data = await partsEnterpriseApi.matrix(token);
    const matrix = (data.matrix ?? {}) as Record<string, unknown>;
    setRows((Array.isArray(matrix.variants) ? matrix.variants : []) as VariantRow[]);
    setInUsePct(Number(matrix.inUseReadyPct ?? 0));
    setAllPct(Number(matrix.allReadyPct ?? 0));
    const review = await partsEnterpriseApi.catalogReview(token);
    setParts((Array.isArray(review.parts) ? review.parts : []) as Array<Record<string, unknown>>);
  }, [token]);

  useEffect(() => { void load().catch((err) => setMessage(err instanceof Error ? err.message : "Could not load coverage")); }, [load]);

  const visible = useMemo(() => rows.filter((row) => {
    if (inUseOnly && row.demand <= 0) return false;
    if (make && !row.make.toLowerCase().includes(make.toLowerCase())) return false;
    return true;
  }), [rows, inUseOnly, make]);

  const pending = parts.filter((part) => part.decision === "pending");

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
            </tr>
          </thead>
          <tbody>
            {visible.slice(0, 80).map((row) => (
              <tr key={row.variantId} className="border-t">
                <td className="p-2">{row.make} {row.model}</td>
                <td className="p-2 text-center">{row.demand}</td>
                {CORE.map(([code]) => <td key={code} className="p-2 text-center">{cellMark(row.cells?.[code])}</td>)}
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
              <Button type="button" size="sm" onClick={() => token && partsEnterpriseApi.decidePart(token, id, "confirmed", evidence[id]).then(() => load())}>Confirm</Button>
              <Button type="button" size="sm" variant="outline" onClick={() => token && partsEnterpriseApi.decidePart(token, id, "rejected").then(() => load())}>Reject</Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
