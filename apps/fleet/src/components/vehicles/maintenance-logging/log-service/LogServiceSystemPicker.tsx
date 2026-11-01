import React from "react";
import { Loader2 } from "lucide-react";
import { MaintenanceIcon } from "../../MaintenanceIcon";
import { LOG_SERVICE_COPY } from "./logServiceCopy";
import type { MaintenanceServiceCategory } from "../../../../types/maintenance";

export function LogServiceSystemPicker({
  system,
  components,
  loading,
  onPickComponent,
}: {
  system: MaintenanceServiceCategory;
  components: MaintenanceServiceCategory[];
  loading: boolean;
  onPickComponent: (cat: MaintenanceServiceCategory) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="bg-surface-container p-3 rounded-xl text-on-surface">
          <MaintenanceIcon iconKey={system.icon_key} className="w-6 h-6" />
        </div>
        <div>
          <h3 className="font-semibold text-on-surface">{system.name}</h3>
          <p className="text-xs text-stitch-secondary">{system.code}</p>
        </div>
      </div>
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-stitch-secondary py-8 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading components…
        </div>
      ) : components.length === 0 ? (
        <p className="text-sm text-stitch-secondary py-4">No components under this system.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {components.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => onPickComponent(cat)}
              className="flex flex-col items-center gap-2 p-4 rounded-xl border border-outline-variant/40 bg-surface-container-lowest hover:bg-surface-container-low hover:border-primary/30 transition-colors text-center min-h-[108px]"
            >
              <div className="bg-surface-container p-3 rounded-xl text-on-surface">
                <MaintenanceIcon iconKey={cat.icon_key} className="w-6 h-6" />
              </div>
              <span className="text-sm font-medium text-on-surface leading-tight">{cat.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
