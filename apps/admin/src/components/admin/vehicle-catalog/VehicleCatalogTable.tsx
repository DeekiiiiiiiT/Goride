import React from "react";
import { ChevronRight, Eye, Pencil, Trash2 } from "lucide-react";
import { formatCatalogProductionWindow, type VehicleCatalogRecord } from "../../../types/vehicleCatalog";
import { Button } from "../../ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../ui/table";

export type VehicleCatalogGroupedMake = {
  make: string;
  modelGroups: { model: string; rows: VehicleCatalogRecord[] }[];
  variantCount: number;
};

export type VehicleCatalogTableProps = {
  items: VehicleCatalogRecord[];
  groupedCatalog: VehicleCatalogGroupedMake[];
  expandedMakes: Set<string>;
  expandedModels: Set<string>;
  onToggleMake: (make: string) => void;
  onToggleModel: (make: string, model: string) => void;
  modelGroupKey: (make: string, model: string) => string;
  onView: (row: VehicleCatalogRecord) => void;
  onEdit: (row: VehicleCatalogRecord) => void;
  onDelete: (row: VehicleCatalogRecord) => void;
};

export function VehicleCatalogTable({
  items,
  groupedCatalog,
  expandedMakes,
  expandedModels,
  onToggleMake,
  onToggleModel,
  modelGroupKey,
  onView,
  onEdit,
  onDelete,
}: VehicleCatalogTableProps) {
  return (
      <div className="rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/60 shadow-sm overflow-hidden">
        <Table className="[&_th]:!text-slate-700 [&_td]:!text-slate-800 [&_tbody_tr]:border-slate-200 [&_tbody_tr:hover]:bg-slate-50 dark:[&_th]:!text-slate-300 dark:[&_td]:!text-slate-200 dark:[&_tbody_tr]:border-slate-800 dark:[&_tbody_tr:hover]:bg-slate-800/40">
        <TableHeader>
          <TableRow className="border-slate-200 hover:bg-transparent bg-slate-50 dark:border-slate-700 dark:bg-slate-800/90">
            <TableHead className="!bg-transparent text-slate-700 dark:text-slate-300">Make</TableHead>
            <TableHead className="!bg-transparent text-slate-700 dark:text-slate-300">Model</TableHead>
            <TableHead className="!bg-transparent text-slate-700 dark:text-slate-300">Years</TableHead>
            <TableHead
              className="hidden md:table-cell !bg-transparent text-slate-700 dark:text-slate-300"
              title="Series, facelift phase, or trim grade"
            >
              Series / facelift
            </TableHead>
            <TableHead
              className="hidden lg:table-cell !bg-transparent text-slate-700 dark:text-slate-300"
              title="Full model code or chassis"
            >
              Code
            </TableHead>
            <TableHead className="hidden lg:table-cell !bg-transparent text-slate-700 dark:text-slate-300">Body</TableHead>
            <TableHead className="w-[140px] text-right !bg-transparent text-slate-700 dark:text-slate-300">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.length === 0 ? (
            <TableRow className="hover:bg-transparent border-slate-200 dark:border-slate-800">
              <TableCell colSpan={7} className="text-center text-slate-500 py-12">
                No vehicles yet. Add one to get started.
              </TableCell>
            </TableRow>
          ) : (
            groupedCatalog.flatMap((makeGroup) => {
              const makeOpen = expandedMakes.has(makeGroup.make);
              const rowsOut: React.ReactNode[] = [];
              rowsOut.push(
                <TableRow
                  key={`make:${makeGroup.make}`}
                  className="border-slate-200 !bg-slate-50 hover:!bg-slate-100 [&_td]:!bg-slate-50 hover:[&_td]:!bg-slate-100 [&_td]:!text-slate-900 dark:border-slate-700 dark:!bg-slate-800 dark:hover:!bg-slate-700/95 dark:[&_td]:!bg-slate-800 dark:hover:[&_td]:!bg-slate-700/95 dark:[&_td]:!text-slate-100"
                >
                  <TableCell className="!bg-slate-50 font-semibold !text-slate-900 dark:!bg-slate-800 dark:!text-slate-100">
                    <button
                      type="button"
                      className="inline-flex items-center gap-2 rounded-md py-1 pr-2 text-left -ml-1 text-slate-900 hover:bg-slate-100 dark:text-slate-100 dark:hover:bg-slate-700/80"
                      onClick={() => onToggleMake(makeGroup.make)}
                      aria-expanded={makeOpen}
                    >
                      <ChevronRight
                        className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${makeOpen ? "rotate-90" : ""}`}
                        aria-hidden
                      />
                      {makeGroup.make}
                    </button>
                  </TableCell>
                  <TableCell className="!bg-slate-50 !text-slate-600 text-sm font-medium dark:!bg-slate-800 dark:!text-slate-400" colSpan={5}>
                    {makeGroup.modelGroups.length} model
                    {makeGroup.modelGroups.length === 1 ? "" : "s"} · {makeGroup.variantCount} variant
                    {makeGroup.variantCount === 1 ? "" : "s"}
                  </TableCell>
                  <TableCell className="!bg-slate-50 dark:!bg-slate-800" />
                </TableRow>,
              );
              if (!makeOpen) return rowsOut;

              for (const mg of makeGroup.modelGroups) {
                const mk = modelGroupKey(makeGroup.make, mg.model);
                const modelOpen = expandedModels.has(mk);
                rowsOut.push(
                  <TableRow
                    key={`model:${mk}`}
                    className="border-slate-200 !bg-white hover:!bg-slate-50 [&_td]:!bg-white hover:[&_td]:!bg-slate-50 [&_td]:!text-slate-900 dark:border-slate-700/80 dark:!bg-slate-900/85 dark:hover:!bg-slate-800/90 dark:[&_td]:!bg-slate-900/85 dark:hover:[&_td]:!bg-slate-800/90 dark:[&_td]:!text-slate-100"
                  >
                    <TableCell className="!bg-white pl-8 font-medium !text-slate-900 dark:!bg-slate-900/85 dark:!text-slate-100">
                      <button
                        type="button"
                        className="inline-flex items-center gap-2 rounded-md py-1 pr-2 text-left -ml-1 text-slate-900 hover:bg-slate-100 dark:text-slate-100 dark:hover:bg-slate-800"
                        onClick={() => onToggleModel(makeGroup.make, mg.model)}
                        aria-expanded={modelOpen}
                      >
                        <ChevronRight
                          className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${modelOpen ? "rotate-90" : ""}`}
                          aria-hidden
                        />
                        {mg.model}
                      </button>
                    </TableCell>
                    <TableCell className="!bg-white !text-slate-600 text-sm font-medium dark:!bg-slate-900/85 dark:!text-slate-400" colSpan={5}>
                      {mg.rows.length} variant{mg.rows.length === 1 ? "" : "s"}
                    </TableCell>
                    <TableCell className="!bg-white dark:!bg-slate-900/85" />
                  </TableRow>,
                );
                if (!modelOpen) continue;
                for (const row of mg.rows) {
                  rowsOut.push(
                    <TableRow
                      key={row.id}
                      className="border-slate-200 !bg-slate-50 hover:!bg-slate-100 data-[state=selected]:!bg-slate-100 [&_td]:!text-slate-700 dark:border-slate-800 dark:!bg-slate-950/40 dark:hover:!bg-slate-800/35 dark:data-[state=selected]:!bg-slate-800/50 dark:[&_td]:!text-slate-200"
                    >
                      <TableCell
                        className="w-8 min-w-[2rem] border-l-2 border-slate-300 bg-slate-50 pl-3 dark:border-slate-600 dark:bg-slate-900/50"
                        aria-hidden
                      />
                      <TableCell className="!text-slate-900 dark:!text-slate-100 font-medium">{row.model}</TableCell>
                      <TableCell className="!text-slate-700 dark:!text-slate-200 tabular-nums">
                        {formatCatalogProductionWindow(row)}
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-slate-600 dark:text-slate-400">
                        {row.trim_series ?? "—"}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-slate-600 dark:text-slate-400">
                        {row.full_model_code ?? row.chassis_code ?? row.generation ?? "—"}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-slate-600 dark:text-slate-400">
                        {row.body_type ?? "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="inline-flex gap-1 justify-end">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-800"
                            onClick={() => onView(row)}
                            title="View details"
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-800"
                            onClick={() => onEdit(row)}
                            title="Edit"
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-red-400 hover:text-red-300 hover:bg-red-950/50"
                            onClick={() => onDelete(row)}
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>,
                  );
                }
              }
              return rowsOut;
            })
          )}
        </TableBody>
      </Table>
      </div>
  );
}
