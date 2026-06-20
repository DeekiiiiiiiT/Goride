import React, { useState } from 'react';
import { MaterialIcon } from '@/components/icons/MaterialIcon';
import { ToggleSwitch } from '@/components/forms/ToggleSwitch';
import { SubPageHeader } from '@/components/layout/SubPageHeader';
import { DEFAULT_DASH_PREFERENCES, PREFERRED_AREAS } from '@/lib/mockSettings';

type DashPreferencesPageProps = {
  onBack: () => void;
};

export function DashPreferencesPage({ onBack }: DashPreferencesPageProps) {
  const [prefs, setPrefs] = useState(DEFAULT_DASH_PREFERENCES);

  const toggleArea = (area: string) => {
    setPrefs((prev) => ({
      ...prev,
      preferredAreas: prev.preferredAreas.includes(area)
        ? prev.preferredAreas.filter((a) => a !== area)
        : [...prev.preferredAreas, area],
    }));
  };

  return (
    <div className="fixed inset-0 z-[70] bg-background flex flex-col overflow-hidden">
      <SubPageHeader title="Dash Preferences" onBack={onBack} />

      <main className="flex-1 overflow-y-auto px-[var(--spacing-edge)] py-6 pb-8 max-w-2xl mx-auto w-full space-y-6">
        <section className="bg-surface rounded-xl shadow-soft p-4 space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-surface-variant">
            <MaterialIcon name="shopping_bag" className="text-primary" filled />
            <h2 className="text-xl font-semibold text-on-surface">Preferred delivery types</h2>
          </div>
          <label className="flex items-center justify-between p-2 hover:bg-surface-container-low rounded-lg cursor-pointer">
            <div className="flex items-center gap-4">
              <MaterialIcon name="restaurant" className="text-primary" />
              <span className="text-base">Food delivery</span>
            </div>
            <input
              type="checkbox"
              checked={prefs.foodDelivery}
              onChange={(e) => setPrefs((p) => ({ ...p, foodDelivery: e.target.checked }))}
              className="w-6 h-6 text-primary border-outline-variant rounded focus:ring-primary"
            />
          </label>
          {[
            { icon: 'local_grocery_store', label: 'Grocery' },
            { icon: 'inventory_2', label: 'Packages' },
          ].map((item) => (
            <div
              key={item.label}
              className="flex items-center justify-between p-2 rounded-lg opacity-70"
            >
              <div className="flex items-center gap-4">
                <MaterialIcon name={item.icon} className="text-muted" />
                <div>
                  <span className="text-base block">{item.label}</span>
                  <span className="text-[11px] text-muted">Coming Soon</span>
                </div>
              </div>
              <input type="checkbox" disabled className="w-6 h-6 rounded cursor-not-allowed" />
            </div>
          ))}
        </section>

        <section className="bg-surface rounded-xl shadow-soft p-4 space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-surface-variant">
            <div className="flex items-center gap-2">
              <MaterialIcon name="route" className="text-primary" filled />
              <h2 className="text-xl font-semibold text-on-surface">Max distance willing to travel</h2>
            </div>
            <span className="text-base text-primary font-bold">{prefs.maxDistanceKm} km</span>
          </div>
          <div className="pt-2 pb-4 px-1">
            <input
              type="range"
              min={1}
              max={20}
              value={prefs.maxDistanceKm}
              onChange={(e) =>
                setPrefs((p) => ({ ...p, maxDistanceKm: Number(e.target.value) }))
              }
              className="w-full h-2 bg-surface-variant rounded-lg appearance-none cursor-pointer accent-primary"
            />
            <div className="flex justify-between mt-2">
              <span className="text-[11px] text-muted">1 km</span>
              <span className="text-[11px] text-muted">20 km</span>
            </div>
          </div>
        </section>

        <section className="bg-surface rounded-xl shadow-soft p-4 space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-surface-variant">
            <MaterialIcon name="map" className="text-primary" filled />
            <h2 className="text-xl font-semibold text-on-surface">Area Preferences</h2>
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant block mb-2">
              Preferred areas (Multi-select)
            </label>
            <div className="flex flex-wrap gap-2">
              {PREFERRED_AREAS.map((area) => {
                const selected = prefs.preferredAreas.includes(area);
                return (
                  <button
                    key={area}
                    type="button"
                    onClick={() => toggleArea(area)}
                    className={`px-4 py-2 rounded-full border text-sm flex items-center gap-1 active:scale-95 transition-all ${
                      selected
                        ? 'border-primary bg-primary-container text-on-primary-container'
                        : 'border-outline-variant bg-surface text-on-surface hover:bg-surface-container'
                    }`}
                  >
                    <span>{area}</span>
                    {selected && <MaterialIcon name="check" className="text-base" />}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="pt-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant block mb-2">
              Avoid areas (Optional)
            </label>
            <div className="relative">
              <MaterialIcon
                name="do_not_disturb"
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted"
              />
              <input
                type="text"
                value={prefs.avoidAreas}
                onChange={(e) => setPrefs((p) => ({ ...p, avoidAreas: e.target.value }))}
                placeholder="e.g. South Industrial Park"
                className="w-full pl-10 pr-3 py-3 rounded-lg border border-outline-variant bg-surface focus:ring-2 focus:ring-primary focus:border-primary text-sm placeholder:text-muted"
              />
            </div>
          </div>
        </section>

        <section className="bg-surface rounded-xl shadow-soft p-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-surface-container flex items-center justify-center">
                <MaterialIcon name="bolt" className="text-primary" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-on-surface">Auto-accept offers</h2>
                <p className="text-sm text-muted">Automatically accept incoming requests</p>
              </div>
            </div>
            <ToggleSwitch
              checked={prefs.autoAccept}
              onChange={(v) => setPrefs((p) => ({ ...p, autoAccept: v }))}
              label="Auto-accept offers"
            />
          </div>
        </section>

        <button
          type="button"
          onClick={onBack}
          className="w-full h-14 bg-primary text-on-primary rounded-xl shadow-primary hover:opacity-95 active:scale-95 flex items-center justify-center gap-2 text-xl font-semibold"
        >
          <span>Save Preferences</span>
          <MaterialIcon name="save" />
        </button>
      </main>
    </div>
  );
}
