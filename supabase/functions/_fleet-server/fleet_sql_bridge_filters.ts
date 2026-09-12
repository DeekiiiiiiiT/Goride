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
  // Rideshare null-inclusive platform exclusion (F-09)
  if (/value->>platform\.is\.null/.test(expr) && /value->>platform\.neq\./.test(expr)) return true;
  return false;
}

/**
 * Resolve a production or() expression to the FleetQueryFilter payload (N-13).
 * Keep in sync with executeMapped or() branches in fleet_sql_bridge.ts.
 */
export function resolveMappedOrFilter(
  expr: string,
): { op: "or" | "orOrg" | "in" | "gte" | "lte"; col?: string; value: string | string[] } | null {
  const orgM = expr.match(/organizationId\.eq\.([^,]+)/);
  if (orgM) return { op: "orOrg", value: orgM[1] };
  if (/value->>platform\.is\.null/.test(expr) && /value->>platform\.neq\./.test(expr)) {
    const neq = expr.match(/value->>platform\.neq\.([^,]+)/);
    if (neq) return { op: "or", value: `platform.is.null,platform.neq.${neq[1]}` };
  }
  const allIlike = expr.split(",").map((s) => s.trim()).filter(Boolean);
  if (allIlike.length > 0 && allIlike.every((p) => /\.ilike\./i.test(p))) {
    const resolved = allIlike.map((p) => {
      const [left, pattern] = p.split(/\.ilike\./i);
      const col =
        left === "legacy_kv_id" || left === "key"
          ? "legacy_kv_id"
          : left.includes("id") && !left.includes("driver")
            ? "id"
            : left.includes("driverName")
              ? "payload_json->>driverName"
              : left.replace(/^value->>/, "payload_json->>");
      return `${col}.ilike.${pattern}`;
    });
    return { op: "or", value: resolved.join(",") };
  }
  return null;
}
