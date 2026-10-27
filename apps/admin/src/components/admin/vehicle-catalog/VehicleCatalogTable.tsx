// Stitch: dominion-redesign/d955104c499d440581c90e8a17bfc573 — flat catalog table (S8)
import React from "react";
import { Eye, Pencil, Trash2 } from "lucide-react";
import { formatCatalogProductionWindow, type VehicleCatalogRecord } from "../../../types/vehicleCatalog";

export type VehicleCatalogTableProps = {
  items: VehicleCatalogRecord[];
  viewingId?: string | null;
  onView: (row: VehicleCatalogRecord) => void;
  onEdit: (row: VehicleCatalogRecord) => void;
  onDelete: (row: VehicleCatalogRecord) => void;
};

function fuelLabel(row: VehicleCatalogRecord): string {
  const parts = [row.fuel_category, row.fuel_type].filter((x) => x != null && String(x).trim() !== "");
  return parts.length ? parts.map((x) => String(x).trim()).join(" · ") : "—";
}

function modelLabel(row: VehicleCatalogRecord): string {
  const trim = row.catalog_trim?.trim();
  if (trim && !row.model.toLowerCase().includes(trim.toLowerCase())) {
    return `${row.model} ${trim}`;
  }
  return row.model;
}

/** Catalog rows are live master data — treat as Active (no separate lifecycle status yet). */
function StatusPill() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-medium text-[#15803d]">
      <span className="h-1.5 w-1.5 rounded-full bg-[#15803d]" />
      Active
    </span>
  );
}

export function VehicleCatalogTable({
  items,
  viewingId = null,
  onView,
  onEdit,
  onDelete,
}: VehicleCatalogTableProps) {
  return (
    <div className="overflow-hidden rounded-[12px] border border-slate-200 bg-white shadow-2xs">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-semibold uppercase tracking-wider text-slate-600">
              <th className="px-5 py-3">Make</th>
              <th className="px-5 py-3">Model</th>
              <th className="px-5 py-3">Year</th>
              <th className="px-5 py-3">Fuel</th>
              <th className="px-5 py-3">Body</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700">
            {items.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-5 py-12 text-center text-xs font-normal text-slate-400">
                  The data is not in yet.
                </td>
              </tr>
            ) : (
              items.map((row) => {
                const inspecting = viewingId === row.id;
                return (
                  <tr
                    key={row.id}
                    className={
                      inspecting
                        ? "bg-blue-50/40 transition-colors hover:bg-blue-50/70"
                        : "transition-colors hover:bg-slate-50"
                    }
                  >
                    <td className="px-5 py-3.5 font-medium text-slate-900">
                      <span className="inline-flex items-center gap-2">
                        {inspecting ? <span className="h-2 w-2 shrink-0 rounded-full bg-blue-600" /> : null}
                        {row.make}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 font-semibold text-slate-900">{modelLabel(row)}</td>
                    <td className="px-5 py-3.5 font-mono text-slate-600">
                      {formatCatalogProductionWindow(row)}
                    </td>
                    <td className="px-5 py-3.5">{fuelLabel(row)}</td>
                    <td className="px-5 py-3.5 text-slate-600">{row.body_type ?? "—"}</td>
                    <td className="px-5 py-3.5">
                      <StatusPill />
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => onView(row)}
                          title="View specs"
                          className={
                            inspecting
                              ? "rounded-md bg-blue-100 p-1.5 text-blue-600 shadow-2xs transition-colors hover:bg-blue-200"
                              : "rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                          }
                        >
                          <Eye className="h-[18px] w-[18px]" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onEdit(row)}
                          title="Edit vehicle"
                          className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                        >
                          <Pencil className="h-[18px] w-[18px]" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDelete(row)}
                          title="Delete vehicle"
                          className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
                        >
                          <Trash2 className="h-[18px] w-[18px]" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
