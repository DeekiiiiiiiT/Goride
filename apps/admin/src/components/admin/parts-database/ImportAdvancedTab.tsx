// Stitch: dominion-redesign/5ba99edc175b45389a9500476ceb87cd
import { useQuery } from "@tanstack/react-query";
import { ProblemsEditor } from "./find-parts/ProblemsEditor";
import { useAuth } from "../../auth/AuthContext";
import { useState } from "react";
import { fetchAdvancedTables } from "./partsDatabaseApi";
import { PartsButton } from "./PartsButton";

export function ImportAdvancedTab({
  advanced,
  onOpenVehicle,
  onProblemsOpenChange,
}: {
  advanced: boolean;
  onOpenVehicle?: (id: string) => void;
  onProblemsOpenChange?: (open: boolean) => void;
}) {
  const { role } = useAuth();
  const [offset, setOffset] = useState(0);
  const tables = useQuery({ queryKey: ["advanced-tables", offset], queryFn: () => fetchAdvancedTables(offset), enabled: advanced });

  if (!advanced) return null;

  return (
    <div className="space-y-6">
      <ProblemsEditor owner={role === "platform_owner"} onEditingChange={onProblemsOpenChange} />
      <section className="bg-surface-container-lowest rounded-xl p-5 shadow-sm space-y-3">
        <h2 className="text-sm font-semibold">Advanced: raw catalog tables (read-only)</h2>
        <div className="flex gap-4 text-xs">
          <span>Parts ({tables.data?.parts?.count ?? 0})</span>
          <span>Same-part brands ({tables.data?.brands?.count ?? 0})</span>
          <span>Listings ({tables.data?.listings?.count ?? 0})</span>
        </div>
        <div className="grid grid-cols-6 text-xs font-semibold text-on-surface-variant">
          <span>Part ID</span><span>Category</span><span>Name</span><span>Base OEM number</span><span>Created</span><span>Actions</span>
        </div>
        {(tables.data?.parts?.rows ?? []).map((row) => (
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
        {(tables.data?.brands?.rows ?? []).map((row) => (
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
        {(tables.data?.listings?.rows ?? []).map((row) => (
          <div key={String(row.id)} className="grid grid-cols-5 text-xs py-1">
            <span className="truncate">{String(row.id)}</span>
            <span className="truncate">{String(row.vehicle_catalog_id ?? "")}</span>
            <span className="truncate">{String(row.interchange_group_id ?? "")}</span>
            <span>{String(row.position ?? "listing")}</span>
            <PartsButton variant="secondary" className="text-xs text-left justify-start" onClick={() => onOpenVehicle?.(String(row.vehicle_catalog_id ?? ""))}>Open on vehicle</PartsButton>
          </div>
        ))}
        <div className="flex gap-3 text-xs pt-3">
          <PartsButton variant="secondary" className="text-xs h-8 min-h-[32px] disabled:opacity-40" disabled={offset === 0} onClick={() => setOffset((value) => Math.max(0, value - 50))}>Previous</PartsButton>
          <PartsButton
            variant="secondary"
            className="text-xs h-8 min-h-[32px] disabled:opacity-40"
            disabled={
              !tables.data
              || offset + 50 >= Math.max(
                tables.data.parts?.count ?? 0,
                tables.data.brands?.count ?? 0,
                tables.data.listings?.count ?? 0,
              )
            }
            onClick={() => setOffset((value) => value + 50)}
          >Next</PartsButton>
        </div>
      </section>
    </div>
  );
}
