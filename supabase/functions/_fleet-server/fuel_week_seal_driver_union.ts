/** H-7: drivers from DFP rows plus finalize snapshot overrides. */
export function unionFuelSealDriverIds(
  periodRows: Array<{ driver_id?: unknown }>,
  amountsByDriver?: Record<string, unknown> | null,
): string[] {
  const ids = new Set<string>();
  for (const p of periodRows) {
    const id = String(p.driver_id || "").trim();
    if (id) ids.add(id);
  }
  for (const id of Object.keys(amountsByDriver || {})) {
    const k = String(id || "").trim();
    if (k) ids.add(k);
  }
  return [...ids];
}
