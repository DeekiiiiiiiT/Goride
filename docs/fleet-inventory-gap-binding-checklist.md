# Fleet inventory gap screens — binding checklist (R20)

Reference implementation: [`GapInventorySettings.tsx`](../apps/fleet/src/components/inventory/gap/GapInventorySettings.tsx) + [`useGapInventorySettingsForm.ts`](../apps/fleet/src/components/inventory/gap/useGapInventorySettingsForm.ts).

## Per modal

1. **Load** — `useGapLoad` + `inventoryApi`; expose lists, counts, selected row, formatted money via `inventoryFormat`.
2. **Inputs** — Stitch `input` / `textarea` / toggles use hook `value` + `onChange` (populated from API in `useEffect`).
3. **Lists** — `.map()` over API rows; empty state copy when `length === 0`.
4. **Actions** — Stitch primary buttons call hook `save` / `approve` / etc.; no duplicate save UI.
5. **Validation** — Hook exports `canSave` / `canSubmit`; disable confirm when invalid; never `trim() || 'Vendor'` placeholders.
6. **No dock** — Do not use `GapActionDock`.

## Vendor spike acceptance (R20-01)

- [ ] Drawer legal name, phone, email, description, tags, lead time, active toggle bound to hook.
- [ ] Vendor table rows from `inventoryApi.vendors()`; KPI tiles from aggregated vendor data (no literals `9`, `64,200`, `4.9 / 5.0`, `1,480`, `Kingston Hub`).
- [ ] Single **Save vendor** in drawer footer; `disabled={!canSave || saving}`.
- [ ] Save with empty name does not create `"Vendor"` row.
- [ ] `rg GapActionDock apps/fleet` → 0 matches when all 14 dock screens done.
