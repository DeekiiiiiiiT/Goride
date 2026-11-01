/** Join split migration chunks for Deno tests (sorted by filename). */
export async function readMigrationGlob(suffix: string): Promise<string> {
  const migrationsDir = new URL("../../../supabase/migrations/", import.meta.url);
  const entries: { name: string; url: URL }[] = [];
  for await (const entry of Deno.readDir(migrationsDir)) {
    if (!entry.isFile || !entry.name.endsWith(".sql")) continue;
    if (!entry.name.includes(suffix)) continue;
    entries.push({ name: entry.name, url: new URL(entry.name, migrationsDir) });
  }
  entries.sort((a, b) => a.name.localeCompare(b.name));
  if (entries.length === 0) {
    throw new Error(`no migrations matching *${suffix}*`);
  }
  const parts: string[] = [];
  for (const { url } of entries) {
    parts.push(await Deno.readTextFile(url));
  }
  return parts.join("\n");
}
