/** Link a location to a brand menu + per-location price / sold-out override. */

export function BrandCatalogPanel({
  brands,
  brandId,
  onBrandChange,
  overrides,
  onOverride,
}: {
  brands: Array<{ id: string; name: string }>;
  brandId: string | null;
  onBrandChange: (brandId: string | null) => void;
  overrides: Array<{
    targetId: string;
    label: string;
    price: number | null;
    isAvailable?: boolean | null;
  }>;
  onOverride: (targetId: string, patch: { price?: number | null; isAvailable?: boolean | null }) => void;
}) {
  return (
    <div className="space-y-3 rounded-lg border border-[#d7e0f2] p-4">
      <h3 className="text-sm font-semibold text-[#0f172a]">Brand catalog</h3>
      <p className="text-xs text-[#5f75a5]">
        Use a shared chain menu. Override price or availability for this location only.
      </p>
      <label className="block text-xs text-[#5f75a5]">
        Brand menu
        <select
          className="mt-1 w-full rounded border border-[#d7e0f2] px-2 py-1.5 text-sm"
          value={brandId || ''}
          onChange={(e) => onBrandChange(e.target.value || null)}
        >
          <option value="">This restaurant&apos;s own menu</option>
          {brands.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
      </label>
      {overrides.length ? (
        <ul className="space-y-2">
          {overrides.map((row) => {
            const soldOut = row.isAvailable === false;
            return (
              <li key={row.targetId} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="min-w-[8rem] flex-1">{row.label}</span>
                {brandId ? (
                  <input
                    type="number"
                    className="w-28 rounded border border-[#d7e0f2] px-2 py-1"
                    placeholder="Override J$"
                    value={row.price ?? ''}
                    onChange={(e) =>
                      onOverride(row.targetId, {
                        price: e.target.value === '' ? null : Number(e.target.value),
                      })
                    }
                  />
                ) : null}
                <label className="flex items-center gap-1 text-xs text-[#5f75a5]">
                  <input
                    type="checkbox"
                    checked={soldOut}
                    onChange={(e) =>
                      onOverride(row.targetId, {
                        isAvailable: e.target.checked ? false : null,
                      })
                    }
                  />
                  Sold out
                </label>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
