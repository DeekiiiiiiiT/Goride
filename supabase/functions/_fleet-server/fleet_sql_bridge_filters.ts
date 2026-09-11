/**
 * Pure filter-shape helpers for fleet_sql_bridge regression tests.
 * Keep in sync with executeMapped or() / method translation rules.
 */
export function wildcardSearchTerm(raw: string): string {
  const t = String(raw ?? "").trim();
  if (!t) return "%";
  return t.includes("%") ? t : `%${t}%`;
}

export function buildTripSearchOrClause(driverName: string): string {
  const safe = wildcardSearchTerm(driverName).replace(/,/g, "");
  return `value->>driverName.ilike.${safe},value->>id.ilike.${safe},legacy_kv_id.ilike.${safe}`;
}

/**
 * Column refs inside PostgREST .or() filters must stay unquoted.
 * Quoting "payload_json->>driverName" makes PostgREST look for a literal column
 * named that string → 500 "column does not exist".
 */
export function postgrestOrColRef(sqlCol: string): string {
  return String(sqlCol ?? "").trim();
}

/** One .or() segment after KV→SQL column resolve. */
export function buildOrFilterSegment(sqlCol: string, op: "eq" | "ilike", value: string): string {
  return `${postgrestOrColRef(sqlCol)}.${op}.${value}`;
}

/** Returns true when an or() expression is a supported production UI shape. */
export function isMappedOrExpression(expr: string): boolean {
  if (/organizationId\.eq\./.test(expr)) return true;
  if (/value->>date\.gte\./.test(expr) && /requestTime\.gte\./.test(expr)) return true;
  if (/value->>date\.lte\./.test(expr) && /requestTime\.lte\./.test(expr)) return true;
  const statusEqs = [...expr.matchAll(/value->>status\.eq\.([^,]+)/g)];
  if (statusEqs.length >= 2) return true;
  const platformEqs = [...expr.matchAll(/value->>platform\.eq\.([^,]+)/g)];
  if (platformEqs.length >= 2) return true;
  if (/rush_delivery|Roam Rush/.test(expr) &&
    [...expr.matchAll(/value->>(?:serviceLine|service_line|platform)\.eq\.([^,]+)/g)].length >= 2) {
    return true;
  }
  const segments = expr.split(",").map((s) => s.trim()).filter(Boolean);
  if (segments.length > 0 && segments.every((p) => /\.(eq|ilike)\./i.test(p))) return true;
  return false;
}
