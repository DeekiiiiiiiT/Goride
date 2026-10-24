/**
 * Hits the public catalog a few times and prints status codes.
 * Usage: node scripts/plug-public-load.mjs https://<project>.supabase.co/functions/v1/platform-catalog
 */
const base = process.argv[2];
if (!base) {
  console.error('Pass the platform-catalog URL');
  process.exit(1);
}

const headers = {};
if (process.env.SUPABASE_ANON_KEY) {
  headers.apikey = process.env.SUPABASE_ANON_KEY;
  headers.Authorization = `Bearer ${process.env.SUPABASE_ANON_KEY}`;
}
const paths = ['/health', '/stations', '/places', '/geo/parishes?level=1', '/tolls'];
const started = Date.now();
const results = await Promise.all(paths.map(async (path) => {
  const response = await fetch(`${base}${path}`, { headers });
  return { path, status: response.status, cache: response.headers.get('cache-control') };
}));
const failed = results.filter((row) => row.status >= 500);
console.log(JSON.stringify({ ms: Date.now() - started, results, failed: failed.length }, null, 2));
process.exit(failed.length ? 1 : 0);
