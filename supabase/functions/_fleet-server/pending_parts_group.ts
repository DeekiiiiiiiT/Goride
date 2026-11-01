/**
 * Dominion Pending catalog — group key helpers.
 */
export function pendingPartsGroupKey(row: Record<string, unknown>): string {
  const catalogId = row.vehicle_catalog_id ? String(row.vehicle_catalog_id) : "";
  const componentId = row.maintenance_component_id ? String(row.maintenance_component_id) : "";
  const fit = row.fit_descriptor ? String(row.fit_descriptor) : "";
  const side = fit ? "" : (row.install_side ? String(row.install_side) : "");
  const matchType = row.match_type ? String(row.match_type) : "";
  return `${catalogId}:${componentId}:${fit || side}:${matchType}`;
}

export function parsePendingPartsGroupId(groupId: string): {
  vehicleCatalogId: string;
  componentId: string;
  fitOrSide: string;
  matchType: string;
} {
  const [vehicleCatalogId = "", componentId = "", fitOrSide = "", matchType = ""] = groupId.split(":");
  return { vehicleCatalogId, componentId, fitOrSide, matchType };
}

export function applyPendingPartsGroupFilters<T extends { eq: (col: string, val: string) => T; is: (col: string, val: null) => T }>(
  query: T,
  groupId: string,
): T {
  const { vehicleCatalogId, componentId, fitOrSide, matchType } = parsePendingPartsGroupId(groupId);
  if (vehicleCatalogId) query.eq("vehicle_catalog_id", vehicleCatalogId);
  else query.is("vehicle_catalog_id", null);
  if (componentId) query.eq("maintenance_component_id", componentId);
  else query.is("maintenance_component_id", null);
  if (fitOrSide.includes(":")) query.eq("fit_descriptor", fitOrSide);
  else if (fitOrSide) query.eq("install_side", fitOrSide);
  else query.is("install_side", null);
  if (matchType) query.eq("match_type", matchType);
  else query.is("match_type", null);
  return query;
}
