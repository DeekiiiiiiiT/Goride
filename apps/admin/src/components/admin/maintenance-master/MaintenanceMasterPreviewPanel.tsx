import type { VehicleCatalogRecord } from "../../../types/vehicleCatalog";
import type { PreviewScheduleResponse } from "./maintenanceMasterApi";
import { downloadCsv, previewExportUrl } from "./maintenanceMasterApi";
import { formatInterval } from "./maintenanceMasterFormat";
import { MmScopeChip, MmSourceChip, MmStatusChip } from "./MmChips";

type Props = {
  open: boolean;
  token: string;
  catalog: VehicleCatalogRecord[];
  preview: PreviewScheduleResponse | null;
  catalogId: string;
  severe: boolean;
  onClose: () => void;
  onSelectCar: (id: string) => void;
  onToggleSevere: (v: boolean) => void;
  loading?: boolean;
};

function catalogCarLabel(v: VehicleCatalogRecord): string {
  const years = [v.production_start_year, v.production_end_year].filter((y) => y != null).join("–");
  return [v.make, v.model, v.chassis_code, years].filter(Boolean).join(" · ");
}

export function MaintenanceMasterPreviewPanel({
  open,
  token,
  catalog,
  preview,
  catalogId,
  severe,
  onClose,
  onSelectCar,
  onToggleSevere,
  loading,
}: Props) {
  if (!open) return null;

  const cat = preview?.catalog as VehicleCatalogRecord | undefined;
  const picked = catalog.find((v) => v.id === catalogId);
  const searchValue = picked ? catalogCarLabel(picked) : catalogId;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="mm-light-card max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="font-headline text-headline-sm">Preview a car</h2>
          <button type="button" onClick={onClose} aria-label="Close">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <input
          type="search"
          list="mm-catalog-options"
          placeholder="Search catalog car…"
          className="mt-4 w-full rounded-lg border border-outline-variant/50 bg-white px-3 py-2 text-sm"
          value={searchValue}
          onChange={(e) => {
            const raw = e.target.value;
            const byId = catalog.find((v) => v.id === raw);
            if (byId) {
              onSelectCar(byId.id);
              return;
            }
            const byLabel = catalog.find(
              (v) => catalogCarLabel(v).toLowerCase() === raw.trim().toLowerCase(),
            );
            if (byLabel) {
              onSelectCar(byLabel.id);
              return;
            }
            onSelectCar(raw);
          }}
        />
        <datalist id="mm-catalog-options">
          {catalog.map((v) => (
            <option key={v.id} value={catalogCarLabel(v)} />
          ))}
        </datalist>
        <label className="mt-3 flex items-center gap-2 text-sm text-on-surface">
          <input type="checkbox" checked={severe} onChange={(e) => onToggleSevere(e.target.checked)} />
          Hard use (severe duty)
        </label>
        {cat ? (
          <p className="mt-3 text-sm font-medium text-on-surface">{catalogCarLabel(cat)}</p>
        ) : picked ? (
          <p className="mt-3 text-sm font-medium text-on-surface">{catalogCarLabel(picked)}</p>
        ) : null}
        {loading && !(preview?.items?.length) ? (
          <p className="mt-4 text-sm text-on-surface-variant">Loading…</p>
        ) : null}
        <table className="mt-4 w-full text-left text-sm">
          <thead className="text-xs uppercase text-on-surface-variant">
            <tr>
              <th className="py-2">Part</th>
              <th className="py-2">Interval used</th>
              <th className="py-2">Comes from</th>
              <th className="py-2">Source</th>
              <th className="py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {(preview?.items ?? []).map((row, i) => {
              const insteadKm = row.instead_of_km;
              const insteadMo = row.instead_of_months;
              return (
                <tr key={i} className="border-t border-outline-variant/20">
                  <td className="py-2">{String(row.task_name ?? row.component_name)}</td>
                  <td className="py-2 font-code text-xs">
                    {formatInterval(row.interval_km as number, row.interval_months as number)}
                    {insteadKm != null || insteadMo != null ? (
                      <p className="mt-0.5 text-[11px] text-on-surface-variant">
                        instead of everyone&apos;s {formatInterval(insteadKm as number, insteadMo as number)}
                      </p>
                    ) : null}
                  </td>
                  <td className="py-2">
                    <MmScopeChip scope={String(row.template_scope ?? "global")} />
                  </td>
                  <td className="py-2">
                    <MmSourceChip source={row.source_type as string} />
                  </td>
                  <td className="py-2">
                    <MmStatusChip status={row.status as string} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {(preview?.not_on_car ?? []).length ? (
          <div className="mt-6 border-t border-outline-variant/30 pt-4">
            <p className="text-xs font-semibold uppercase text-on-surface-variant">Not on this car</p>
            <ul className="mt-2 space-y-1 text-sm text-on-surface-variant">
              {preview!.not_on_car.map((row, i) => (
                <li key={i}>
                  {String(row.component_name ?? row.task_name)} — {String(row.reason ?? "Not on this car")}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <button
          type="button"
          className="mt-4 rounded-lg border border-outline-variant/50 px-3 py-1.5 text-xs text-secondary disabled:opacity-40"
          disabled={!catalogId}
          onClick={() => void downloadCsv(previewExportUrl(catalogId), token, "maintenance-preview.csv")}
        >
          Export breakdown
        </button>
      </div>
    </div>
  );
}
