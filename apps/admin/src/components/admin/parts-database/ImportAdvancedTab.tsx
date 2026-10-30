// Stitch: dominion-redesign/5ba99edc175b45389a9500476ceb87cd
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { fetchAdvancedTables } from "./partsDatabaseApi";
import { partsEnterpriseApi } from "../../../services/partSourcingService";
import { supabase } from "../../../utils/supabase/client";

function parseCsv(text: string) {
  const [header, ...lines] = text.split(/\r?\n/).filter((line) => line.trim());
  const keys = (header ?? "").split(",").map((key) => key.trim());
  return lines.map((line) => {
    const cells = line.split(",").map((cell) => cell.trim());
    const row: Record<string, string> = {};
    keys.forEach((key, index) => { row[key] = cells[index] ?? ""; });
    return row;
  });
}

export function ImportAdvancedTab({ advanced, onOpenVehicle }: { advanced: boolean; onOpenVehicle?: (id: string) => void }) {
  const [csv, setCsv] = useState("vehicle,manufacturer,part_number,part_name,part_kind,category_slug,job,position,year_from,year_to,evidence_url");
  const [note, setNote] = useState("");
  const [batchId, setBatchId] = useState("");
  const tables = useQuery({ queryKey: ["advanced-tables"], queryFn: fetchAdvancedTables, enabled: advanced });

  async function token() {
    return (await supabase.auth.getSession()).data.session?.access_token ?? "";
  }

  async function run(checkOnly: boolean) {
    const rows = parseCsv(csv);
    const missing = rows.filter((row) => !row.vehicle || !row.manufacturer || !row.part_number || !row.evidence_url);
    if (missing.length) {
      setNote(`${missing.length} row(s) are missing a vehicle, brand, part number, or source.`);
      return;
    }
    if (checkOnly) {
      setNote(`${rows.length} row(s) ready to import.`);
      return;
    }
    const result = await partsEnterpriseApi.importRows(await token(), rows) as { result?: { batchId?: string; applied?: number; errors?: string[] } };
    setBatchId(String(result.result?.batchId ?? ""));
    setNote(`Imported ${result.result?.applied ?? 0}. ${(result.result?.errors ?? []).join(" ")}`);
  }

  return (
    <div className="space-y-6">
      <p className="text-xs text-on-surface-variant">Parts database · Parts (4,821) · Same-part brands (1,240) · Listings (14,200)</p>
      <section className="bg-surface-container-lowest rounded-xl p-5 shadow-sm space-y-3">
        <h2 className="text-sm font-semibold">Batch CSV import</h2>
        <p className="text-xs text-on-surface-variant">Paste CSV text with column headers:</p>
        <textarea className="w-full bg-surface-container-low font-mono text-xs rounded-lg p-3 min-h-28" value={csv} onChange={(event) => setCsv(event.target.value)} />
        <div className="flex flex-wrap gap-3 text-sm items-center">
          <label className="text-on-surface-variant">Or upload .csv file
            <input className="block text-xs mt-1" type="file" accept=".csv,text/csv" onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              void file.text().then(setCsv);
            }} />
          </label>
          <button type="button" className="bg-secondary text-on-secondary px-3 py-1.5 rounded-lg" onClick={() => { void run(false); }}>Import</button>
          <button type="button" onClick={() => { void run(true); }}>Check file</button>
          <button type="button" onClick={() => { void (async () => { if (!batchId) return; await partsEnterpriseApi.undoImport(await token(), batchId); setNote("Last import undone."); })(); }}>Undo last import</button>
        </div>
        {note ? <p className="text-xs">{note}</p> : null}
      </section>
      {advanced ? (
        <section className="bg-surface-container-lowest rounded-xl p-5 shadow-sm space-y-3">
          <h2 className="text-sm font-semibold">Advanced: raw catalog tables (read-only)</h2>
          <div className="flex gap-4 text-xs">
            <span>Parts ({tables.data?.parts.count ?? 0})</span>
            <span>Same-part brands ({tables.data?.brands.count ?? 0})</span>
            <span>Listings ({tables.data?.listings.count ?? 0})</span>
          </div>
          <div className="grid grid-cols-6 text-xs font-semibold text-on-surface-variant">
            <span>Part ID</span><span>Category</span><span>Name</span><span>Base OEM number</span><span>Created</span><span>Actions</span>
          </div>
          {(tables.data?.parts.rows ?? []).map((row) => (
            <div key={String(row.id)} className="grid grid-cols-6 text-xs py-1">
              <span className="truncate">{String(row.id)}</span>
              <span className="truncate">{String(row.category_id ?? "")}</span>
              <span>{String(row.name ?? "")}</span>
              <span>{String(row.oem_part_number ?? "")}</span>
              <span />
              <span />
            </div>
          ))}
          <div className="grid grid-cols-5 text-xs font-semibold text-on-surface-variant pt-3">
            <span>Link ID</span><span>Master part</span><span>Aftermarket brand</span><span>Replacement number</span><span>Cross type</span>
          </div>
          {(tables.data?.brands.rows ?? []).map((row) => (
            <div key={String(row.id)} className="grid grid-cols-5 text-xs py-1">
              <span className="truncate">{String(row.interchange_group_id ?? "")}</span>
              <span className="truncate">{String(row.id)}</span>
              <span>{String(row.manufacturer ?? "")}</span>
              <span>{String(row.oem_part_number ?? "")}</span>
              <span>brand</span>
            </div>
          ))}
          <div className="grid grid-cols-5 text-xs font-semibold text-on-surface-variant pt-3">
            <span>Listing ID</span><span>Vehicle variant</span><span>Part</span><span>Match kind</span><span>Source confidence</span>
          </div>
          {(tables.data?.listings.rows ?? []).map((row) => (
            <div key={String(row.id)} className="grid grid-cols-5 text-xs py-1">
              <span className="truncate">{String(row.id)}</span>
              <span className="truncate">{String(row.vehicle_catalog_id ?? "")}</span>
              <span className="truncate">{String(row.interchange_group_id ?? "")}</span>
              <span>{String(row.position ?? "listing")}</span>
              <button type="button" className="text-secondary text-left" onClick={() => onOpenVehicle?.(String(row.vehicle_catalog_id ?? ""))}>Open on vehicle</button>
            </div>
          ))}
        </section>
      ) : null}
    </div>
  );
}
