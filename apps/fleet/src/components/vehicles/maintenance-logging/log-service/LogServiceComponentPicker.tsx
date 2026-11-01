import React from "react";
import { CheckCircle2 } from "lucide-react";
import { MaintenanceIcon } from "../../MaintenanceIcon";
import type { MaintenanceServiceCategory } from "../../../../types/maintenance";
import { groupCategoriesBySystem } from "../../../../types/maintenance";

export function LogServiceComponentPicker({
  packageLabel,
  selectedCount,
  loggedCount,
  categories,
  systems,
  selectedCategoryIds,
  categoryHasLine,
  onComponentTap,
  onToggleCategorySelected,
}: {
  packageLabel: string;
  selectedCount: number;
  loggedCount: number;
  categories: MaintenanceServiceCategory[];
  systems: MaintenanceServiceCategory[];
  selectedCategoryIds: string[];
  categoryHasLine: (cat: MaintenanceServiceCategory) => boolean;
  onComponentTap: (cat: MaintenanceServiceCategory) => void;
  onToggleCategorySelected: (catId: string, e: React.MouseEvent) => void;
}) {
  const grouped = groupCategoriesBySystem([...systems, ...categories]);

  return (
    <div className="space-y-5">
      <p className="text-sm text-stitch-secondary">
        {packageLabel}: {selectedCount} selected · {loggedCount} logged
      </p>
      {grouped.length === 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {categories.map((cat) => {
            const selected = selectedCategoryIds.includes(cat.id);
            const logged = categoryHasLine(cat);
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => onComponentTap(cat)}
                className={`relative flex flex-col items-center gap-2 p-4 rounded-xl border transition-colors text-center min-h-[108px] ${
                  selected || logged
                    ? "border-primary/40 bg-surface-container-low"
                    : "border-outline-variant/40 bg-surface-container-lowest hover:bg-surface-container-low hover:border-primary/30"
                }`}
              >
                {(selected || logged) && (
                  <span
                    role="presentation"
                    onClick={(e) => onToggleCategorySelected(cat.id, e)}
                    className="absolute top-2 right-2 text-primary"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                  </span>
                )}
                <div className="bg-surface-container p-3 rounded-xl text-on-surface">
                  <MaintenanceIcon iconKey={cat.icon_key} className="w-6 h-6" />
                </div>
                <span className="text-sm font-medium text-on-surface leading-tight">{cat.name}</span>
              </button>
            );
          })}
        </div>
      ) : (
        grouped.map(({ system, components }) =>
          components.length === 0 ? null : (
            <section key={system.id} className="space-y-3">
              <h3 className="text-sm font-semibold text-on-surface flex items-center gap-2">
                <MaintenanceIcon iconKey={system.icon_key} className="w-4 h-4 text-primary" />
                {system.name}
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {components.map((cat) => {
                  const selected = selectedCategoryIds.includes(cat.id);
                  const logged = categoryHasLine(cat);
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => onComponentTap(cat)}
                      className={`relative flex flex-col items-center gap-2 p-4 rounded-xl border transition-colors text-center min-h-[108px] ${
                        selected || logged
                          ? "border-primary/40 bg-surface-container-low"
                          : "border-outline-variant/40 bg-surface-container-lowest hover:bg-surface-container-low"
                      }`}
                    >
                      {(selected || logged) && (
                        <span
                          role="presentation"
                          onClick={(e) => onToggleCategorySelected(cat.id, e)}
                          className="absolute top-2 right-2 text-primary"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                        </span>
                      )}
                      <div className="bg-surface-container p-3 rounded-xl text-on-surface">
                        <MaintenanceIcon iconKey={cat.icon_key} className="w-6 h-6" />
                      </div>
                      <span className="text-sm font-medium text-on-surface leading-tight">{cat.name}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          ),
        )
      )}
    </div>
  );
}
