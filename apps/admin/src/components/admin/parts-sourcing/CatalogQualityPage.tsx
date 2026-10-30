// Stitch: dominion-redesign/e0aaec8b37924b6087208fd2632b5bbe
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Info } from "lucide-react";
import { useAuth } from "../../auth/AuthContext";
import { Button } from "../maintenance-templates/plainUi";
import { partsEnterpriseApi, listSuppliers } from "../../../services/partSourcingService";
import type { SupplierRecord } from "../../../types/partSourcing";
import { AddPartDialog } from "../parts-database/AddPartDialog";

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

type FitReview = { ids: string[]; partName: string; variantLabel: string; count: number };
type FitProposal = { id: string; partName: string; where: string; count: number };
type Gap = {
  variantId: string;
  label: string;
  chassisCode: string;
  engineCode: string;
  opCode: string;
  opLabel: string;
  yearFrom?: number | null;
  yearTo?: number | null;
};

type QualityIssue = {
  key: string;
  record: string;
  check: string;
  status: "Missing" | "Unverified";
  gap?: Gap;
};

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
  const [price, setPrice] = useState({
    partId: "",
    supplierId: "",
    supplierSku: "",
    unitPrice: "",
    currency: "JMD",
  });

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

  useEffect(() => {
    void load().catch((err) => setMessage(err instanceof Error ? err.message : "Could not load coverage"));
  }, [load]);

  const visible = useMemo(
    () =>
      rows.filter((row) => {
        if (inUseOnly && row.demand <= 0) return false;
        if (make && !row.make.toLowerCase().includes(make.toLowerCase())) return false;
        return true;
      }),
    [rows, inUseOnly, make],
  );

  const issues = useMemo(() => {
    const out: QualityIssue[] = [];
    for (const row of visible.slice(0, 120)) {
      const record = [row.make, row.model, row.chassisCode].filter(Boolean).join(" ");
      for (const [code, label] of CORE) {
        const cell = row.cells?.[code];
        if (cell === "verified" || cell === "not_applicable") continue;
        if (cell === "unverified" || cell === "missing" || cell == null) {
          const status: "Missing" | "Unverified" = cell === "unverified" ? "Unverified" : "Missing";
          out.push({
            key: `${row.variantId}-${code}`,
            record: record || row.variantId,
            check: label === "Oil" ? "Engine oil" : label === "Pads" ? "Brake pads" : label === "Plugs" ? "Spark plugs" : label,
            status,
            gap:
              row.demand > 0
                ? {
                    variantId: row.variantId,
                    label: `${row.make} ${row.model}`,
                    chassisCode: row.chassisCode || "",
                    engineCode: row.engineCode || "",
                    opCode: code,
                    opLabel: label,
                    yearFrom: row.yearFrom,
                    yearTo: row.yearTo,
                  }
                : undefined,
          });
        }
      }
      if (!row.engineCode) {
        out.push({
          key: `${row.variantId}-engine`,
          record: record || row.variantId,
          check: "Engine code",
          status: "Missing",
        });
      }
    }
    return out.slice(0, 80);
  }, [visible]);

  const pending = parts.filter((part) => part.decision === "pending");
  const confirmed = parts.filter((part) => part.decision === "confirmed");

  return (
    <div className="w-full max-w-6xl flex-1 space-y-5 p-8 text-slate-900">
      <div className="mb-4 flex items-center justify-between">
        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-slate-500">
          <span className="text-slate-400">Dominion</span>
          <span aria-hidden className="text-slate-300">
            ›
          </span>
          <span className="text-slate-400">Master data</span>
          <span aria-hidden className="text-slate-300">
            ›
          </span>
          <span className="text-slate-400">Vehicles</span>
          <span aria-hidden className="text-slate-300">
            ›
          </span>
          <span className="font-medium text-slate-900">Data quality</span>
        </nav>
        <span className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1 font-mono text-[11px] font-semibold tracking-wider text-slate-600 shadow-sm">
          <span className="h-1.5 w-1.5 rounded-full bg-blue-600" />
          REGION: JM-KGN
        </span>
      </div>

      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Data quality</h1>
        <p className="mt-1 text-sm text-slate-500">Missing or unverified vehicle specs and fitment.</p>
        <p className="mt-1 text-sm text-slate-500">
          {inUsePct}% of in-use variants are fully covered. {allPct}% of all variants.
        </p>
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <input
          className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs"
          placeholder="Make"
          value={make}
          onChange={(e) => setMake(e.target.value)}
        />
        <label className="flex items-center gap-2 text-xs text-slate-600">
          <input type="checkbox" checked={inUseOnly} onChange={(e) => setInUseOnly(e.target.checked)} />
          In use only
        </label>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => token && partsEnterpriseApi.refreshDemand(token).then(() => load())}
        >
          Refresh demand
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={() =>
            token &&
            partsEnterpriseApi.seedInUse(token).then((res) => {
              setMessage(`Attached ${String(res.rulesAdded ?? 0)} engine rules.`);
              return load();
            })
          }
        >
          Fill gaps from the same engine
        </Button>
        <Button
          type="button"
          size="sm"
          variant={killed ? "default" : "outline"}
          onClick={() =>
            token && partsEnterpriseApi.tieredKill(token, !killed).then(() => setKilled((v) => !v))
          }
        >
          {killed ? "Emergency stop is on" : "Emergency stop"}
        </Button>
      </div>
      {message ? <p className="text-sm text-slate-600">{message}</p> : null}

      <div className="mb-5 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/80">
              <th className="w-1/3 px-6 py-3 font-mono text-xs font-semibold uppercase tracking-wider text-slate-500" scope="col">
                Record
              </th>
              <th className="w-1/3 px-6 py-3 font-mono text-xs font-semibold uppercase tracking-wider text-slate-500" scope="col">
                Check
              </th>
              <th className="w-1/3 px-6 py-3 font-mono text-xs font-semibold uppercase tracking-wider text-slate-500" scope="col">
                Status
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-sm">
            {issues.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-6 py-10 text-center text-slate-500">
                  The data is not in yet.
                </td>
              </tr>
            ) : (
              issues.map((issue) => (
                <tr key={issue.key} className="transition-colors hover:bg-slate-50/50">
                  <td className="whitespace-nowrap px-6 py-4">
                    <span className="inline-flex items-center rounded-md border border-slate-200/80 bg-slate-100 px-2.5 py-1 font-mono text-xs font-medium text-slate-800">
                      {issue.record}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-xs font-medium text-slate-700">
                    {issue.check}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4">
                    {issue.status === "Missing" ? (
                      issue.gap ? (
                        <button
                          type="button"
                          className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-100"
                          onClick={() => setGap(issue.gap!)}
                        >
                          <span className="h-1.5 w-1.5 rounded-full bg-red-600" />
                          Missing
                        </button>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700">
                          <span className="h-1.5 w-1.5 rounded-full bg-red-600" />
                          Missing
                        </span>
                      )
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                        Unverified
                      </span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mb-5 flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-blue-100 bg-blue-50 text-blue-600">
            <Info className="h-4 w-4" aria-hidden />
          </div>
          <div>
            <div className="text-xs font-semibold leading-tight text-slate-800">Registry sync notice</div>
            <div className="mt-0.5 text-xs text-slate-500">The data is not in yet.</div>
          </div>
        </div>
        <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-1 font-mono text-[11px] text-slate-400">
          LOC: KINGSTON / PARISH REGISTRY JMD
        </div>
      </div>

      <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Verification queue</h2>
        {pending.length === 0 ? (
          <p className="text-sm text-slate-500">The data is not in yet.</p>
        ) : (
          pending.map((part) => {
            const id = String(part.id);
            return (
              <div key={id} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 px-3 py-2">
                <span className="flex-1 text-sm">
                  {String(part.manufacturer ?? "")} {String(part.partNumber ?? part.name ?? "")}
                </span>
                <input
                  className="rounded border border-slate-200 px-2 py-1 text-sm"
                  placeholder="Evidence link"
                  value={evidence[id] ?? ""}
                  onChange={(e) => setEvidence((prev) => ({ ...prev, [id]: e.target.value }))}
                />
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    if (!token) return;
                    if (!evidence[id]?.trim()) {
                      setMessage("A verified part needs a source link.");
                      return;
                    }
                    void partsEnterpriseApi.decidePart(token, id, "confirmed", evidence[id]).then(() => load());
                  }}
                >
                  Confirm
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => token && partsEnterpriseApi.decidePart(token, id, "rejected").then(() => load())}
                >
                  Reject
                </Button>
              </div>
            );
          })
        )}
      </div>

      {gap && token ? (
        <AddPartDialog
          variantId={gap.variantId}
          jobOpCode={gap.opCode}
          onClose={() => { setGap(null); void load(); }}
        />
      ) : null}

      <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Didn't fit</h2>
        {reviews.length === 0 ? (
          <p className="text-sm text-slate-500">The data is not in yet.</p>
        ) : (
          reviews.map((row) => (
            <div key={row.ids.join("-")} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 px-3 py-2">
              <span className="flex-1 text-sm">
                {row.partName} · {row.variantLabel} · {row.count}
              </span>
              <Button
                type="button"
                size="sm"
                onClick={() =>
                  token &&
                  Promise.all(row.ids.map((id) => partsEnterpriseApi.resolveRuleReview(token, id, "approved"))).then(
                    () => load(),
                  )
                }
              >
                Approve
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  token &&
                  Promise.all(row.ids.map((id) => partsEnterpriseApi.resolveRuleReview(token, id, "rejected"))).then(
                    () => load(),
                  )
                }
              >
                Reject
              </Button>
            </div>
          ))
        )}
      </div>

      <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Suggested rules</h2>
        {proposals.length === 0 ? (
          <p className="text-sm text-slate-500">The data is not in yet.</p>
        ) : (
          proposals.map((row) => (
            <div key={row.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 px-3 py-2">
              <span className="flex-1 text-sm">
                {row.partName} · {row.where} · {row.count}
              </span>
              <Button
                type="button"
                size="sm"
                onClick={() => token && partsEnterpriseApi.decideProposal(token, row.id, "approved").then(() => load())}
              >
                Approve
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => token && partsEnterpriseApi.decideProposal(token, row.id, "rejected").then(() => load())}
              >
                Reject
              </Button>
            </div>
          ))
        )}
      </div>

      <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Reference price</h2>
        <p className="text-sm text-slate-500">
          A catalog price has no customer on it. Add one only when you have a real supplier price.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="rounded border border-slate-200 px-2 py-1 text-sm"
            value={price.partId}
            onChange={(e) => setPrice((prev) => ({ ...prev, partId: e.target.value }))}
          >
            <option value="">Confirmed part</option>
            {confirmed.map((part) => (
              <option key={String(part.id)} value={String(part.id)}>
                {String(part.manufacturer ?? "")} {String(part.partNumber ?? part.name ?? "")}
              </option>
            ))}
          </select>
          <select
            className="rounded border border-slate-200 px-2 py-1 text-sm"
            value={price.supplierId}
            onChange={(e) => setPrice((prev) => ({ ...prev, supplierId: e.target.value }))}
          >
            <option value="">Supplier</option>
            {suppliers.map((supplier) => (
              <option key={supplier.id} value={supplier.id}>
                {supplier.name}
              </option>
            ))}
          </select>
          <input
            className="rounded border border-slate-200 px-2 py-1 text-sm"
            placeholder="Supplier code"
            value={price.supplierSku}
            onChange={(e) => setPrice((prev) => ({ ...prev, supplierSku: e.target.value }))}
          />
          <input
            className="w-28 rounded border border-slate-200 px-2 py-1 text-sm"
            placeholder="Price"
            value={price.unitPrice}
            onChange={(e) => setPrice((prev) => ({ ...prev, unitPrice: e.target.value }))}
          />
          <input
            className="w-20 rounded border border-slate-200 px-2 py-1 text-sm"
            value={price.currency}
            onChange={(e) => setPrice((prev) => ({ ...prev, currency: e.target.value }))}
          />
          <Button
            type="button"
            size="sm"
            disabled={!token || !price.partId || !price.supplierId || !price.supplierSku || !price.unitPrice}
            onClick={() => {
              if (!token) return;
              void partsEnterpriseApi
                .referenceOffer(token, {
                  partId: price.partId,
                  supplierId: price.supplierId,
                  supplierSku: price.supplierSku,
                  unitPrice: Number(price.unitPrice),
                  currency: price.currency || "JMD",
                })
                .then(() => {
                  setMessage("Reference price saved.");
                  setPrice((prev) => ({ ...prev, supplierSku: "", unitPrice: "" }));
                })
                .catch((err) => setMessage(err instanceof Error ? err.message : "Could not save the price"));
            }}
          >
            Save price
          </Button>
        </div>
      </div>
    </div>
  );
}
