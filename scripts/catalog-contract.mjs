/**
 * Public catalog contract: versioned reads exist, public selects do not
 * return a customer or an organization id, and every public GET stays clean live.
 * Run: node scripts/catalog-contract.mjs
 * Live check uses SUPABASE_URL or VITE_SUPABASE_URL, plus the anon key when set.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..', 'supabase', 'functions', 'platform-catalog');
const sources = ['index.ts', 'geoRoutes.ts'].map((name) => readFileSync(join(root, name), 'utf8'));
const text = sources.join('\n');
const required = [
  '/v1/stations',
  '/v1/changes',
  'app.all("/v1/*"',
  '/places',
  '/tolls',
  '/vehicle-catalog',
  '/parts',
  '/schedules',
  '/geo/parishes',
];
const forbidden = ['organization_id', 'organizationId', 'customer_id', 'customerId', 'customer_name'];
let failed = false;

for (const path of required) {
  if (!text.includes(path)) {
    console.error(`platform-catalog is missing ${path}`);
    failed = true;
  }
}

const selects = text.match(/\.select\("([^"]+)"\)/g) ?? [];
for (const select of selects) {
  for (const column of forbidden) {
    if (select.includes(column)) {
      console.error(`public catalog select includes ${column}: ${select}`);
      failed = true;
    }
  }
}

if (text.includes('.schema("fleet")') || text.includes('schema: "fleet"')) {
  console.error('platform-catalog must not read the fleet schema');
  failed = true;
}

function hasPrivateKey(value) {
  if (Array.isArray(value)) return value.some((item) => hasPrivateKey(item));
  if (!value || typeof value !== 'object') return false;
  return Object.entries(value).some(([key, item]) => forbidden.includes(key) || hasPrivateKey(item));
}

async function checkLive(url, headers, path) {
  const live = await fetch(url, { headers });
  const body = await live.text();
  if (live.status !== 200) {
    console.error(`${path} returned ${live.status}: ${body.slice(0, 240)}`);
    failed = true;
    return null;
  }
  try {
    const json = JSON.parse(body);
    if (hasPrivateKey(json)) {
      console.error(`${path} includes a customer or company id`);
      failed = true;
    }
    return json;
  } catch {
    console.error(`${path} did not return JSON`);
    failed = true;
    return null;
  }
}

function firstId(json, listKey) {
  const rows = json && Array.isArray(json[listKey]) ? json[listKey] : [];
  const row = rows.find((item) => item && typeof item === 'object' && item.id);
  return row ? String(row.id) : '';
}

const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
const placeholder = !supabaseUrl || supabaseUrl.includes('ci-placeholder') || supabaseUrl.includes('YOUR_REF');
if (placeholder) {
  console.error('Set SUPABASE_URL so the public catalog can be checked live');
  failed = true;
} else {
  const headers = {};
  const anon = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (anon) {
    headers.apikey = anon;
    headers.Authorization = `Bearer ${anon}`;
  }
  const base = `${supabaseUrl}/functions/v1/platform-catalog`;
  const publicPaths = [
    '/health',
    '/v1/stations',
    '/stations',
    '/v1/changes',
    '/v1/places',
    '/places',
    '/v1/geo/parishes',
    '/geo/parishes',
    '/v1/tolls',
    '/tolls',
    '/v1/vehicle-catalog',
    '/vehicle-catalog',
  ];
  const loaded = {};
  for (const path of publicPaths) {
    loaded[path] = await checkLive(`${base}${path}`, headers, path);
  }

  const stationId = firstId(loaded['/v1/stations'], 'stations');
  if (stationId) {
    await checkLive(`${base}/stations/${encodeURIComponent(stationId)}`, headers, '/stations/:id');
    await checkLive(`${base}/v1/stations/${encodeURIComponent(stationId)}`, headers, '/v1/stations/:id');
  }

  const placeId = firstId(loaded['/v1/places'], 'places');
  if (placeId) {
    await checkLive(`${base}/places/${encodeURIComponent(placeId)}`, headers, '/places/:id');
    await checkLive(`${base}/v1/places/${encodeURIComponent(placeId)}`, headers, '/v1/places/:id');
  }

  const variant = firstId(loaded['/v1/vehicle-catalog'], 'vehicles');
  if (variant) {
    const query = `?variant=${encodeURIComponent(variant)}`;
    await checkLive(`${base}/v1/parts${query}`, headers, '/v1/parts');
    await checkLive(`${base}/parts${query}`, headers, '/parts');
    await checkLive(`${base}/v1/schedules${query}`, headers, '/v1/schedules');
    await checkLive(`${base}/schedules${query}`, headers, '/schedules');
  }
}

if (failed) process.exit(1);
console.log('OK — catalog contract (versioned reads, no private columns, live public catalog)');
