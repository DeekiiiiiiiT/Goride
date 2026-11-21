/**
 * RE-23: Dominion research + pending routes show the car, the part type / place, job state, proposals and evidence —
 * never who asked, when they asked, what they typed, or how many companies asked.
 *
 * withPrivacyGuard(app) wraps every route a register function adds, so whatever a handler returns through c.json()
 * is stripped of these keys first. New routes are covered automatically. Fleet demand stays on the server for
 * ordering only.
 */

export const RESEARCH_PRIVATE_KEYS = new Set([
  // companies / people
  "organization_id", "organizationId", "organization_name", "organizationName", "org_name", "company", "company_name",
  "customer_name", "customerName", "user_name", "email", "plate", "license_plate", "licensePlate",
  "vehicle_id", "vehicleId", "fleet_vehicle_id", "fleetVehicleId", "fleetVehicle",
  // demand and timing of requests
  "fleet_count", "fleetCount", "sortFleetCount", "first_requested_at", "last_requested_at", "firstAsked", "lastAsked",
  // what a customer typed
  "need_text", "needText", "latest_need_text", "latestNeedText", "request_text", "requestText",
  "requested_name", "requestedName", "requested_part_number", "requestedPartNumber", "old_part_number",
  "oldPartNumber", "looking_note",
  // links back to a request / app activity
  "pending_request_id", "pendingRequestId", "origin", "origins", "group_key", "research_group_key",
]);

export function stripResearchPrivate(value: unknown, extra?: Set<string>): unknown {
  if (Array.isArray(value)) return value.map((v) => stripResearchPrivate(v, extra));
  if (!value || typeof value !== "object" || value instanceof Date) return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (RESEARCH_PRIVATE_KEYS.has(k) || extra?.has(k)) continue;
    out[k] = stripResearchPrivate(v, extra);
  }
  return out;
}

/** First private key found in a payload (for tests), or null. */
export function findResearchPrivateKey(value: unknown, extra?: Set<string>, path = "$"): string | null {
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const hit = findResearchPrivateKey(value[i], extra, `${path}[${i}]`);
      if (hit) return hit;
    }
    return null;
  }
  if (!value || typeof value !== "object") return null;
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (RESEARCH_PRIVATE_KEYS.has(k) || extra?.has(k)) return `${path}.${k}`;
    const hit = findResearchPrivateKey(v, extra, `${path}.${k}`);
    if (hit) return hit;
  }
  return null;
}

type Handler = (c: unknown, ...rest: unknown[]) => unknown;
type RouteApp = Record<string, unknown>;

function guardContext(c: unknown, extra?: Set<string>): unknown {
  if (!c || typeof c !== "object") return c;
  return new Proxy(c as Record<string, unknown>, {
    get(target, prop, receiver) {
      const v = Reflect.get(target, prop, receiver);
      if (prop === "json" && typeof v === "function") {
        return (body: unknown, ...args: unknown[]) => (v as (...a: unknown[]) => unknown).call(target, stripResearchPrivate(body, extra), ...args);
      }
      if (prop === "body" && typeof v === "function") {
        // CSV and other raw bodies are built from already-stripped rows by the handlers themselves.
        return (v as (...a: unknown[]) => unknown).bind(target);
      }
      return typeof v === "function" ? (v as (...a: unknown[]) => unknown).bind(target) : v;
    },
  });
}

/** An app-like object whose get / post / patch / delete wrap the last handler with the privacy strip. */
export function withPrivacyGuard<T>(app: T, extraKeys: string[] = []): T {
  const extra = extraKeys.length ? new Set(extraKeys) : undefined;
  const target = app as unknown as RouteApp;
  const wrap = (method: string) => (path: string, ...handlers: Handler[]) => {
    const last = handlers[handlers.length - 1];
    const wrapped: Handler = (c, ...rest) => last(guardContext(c, extra), ...rest);
    return (target[method] as (...a: unknown[]) => unknown).call(target, path, ...handlers.slice(0, -1), wrapped);
  };
  const out: Record<string, unknown> = Object.create(target);
  for (const m of ["get", "post", "patch", "put", "delete"]) {
    if (typeof target[m] === "function") out[m] = wrap(m);
  }
  return out as unknown as T;
}
