/**
 * D7: every server read of `part_picture*` names its columns. A `select("*")` on a server-only table silently starts
 * returning any column added later, and D1's columns include prompt text and costs.
 * deno test --no-check --allow-read supabase/functions/_fleet-server/part_pictures_explicit_columns.test.ts
 */
import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

/** The server files this round added (and the only ones allowed to touch part_picture*). */
const NEW_FILES = [
  "part_picture_db.ts",
  "part_picture_worker.ts",
  "part_picture_cleanup.ts",
  "part_pictures_queue.ts",
  "part_picture_routes.ts",
  "part_pictures_settings.ts",
  "part_picture_imagen.ts",
  "part_picture_prompt.ts",
  // Round S2: the Dominion routes and the reads they share with the saved-page result.
  "part_picture_admin_routes.ts",
  "part_picture_admin_db.ts",
  "part_picture_reads.ts",
  "part_picture_urls.ts",
];

const read = (file: string) => Deno.readTextFile(new URL(`./${file}`, import.meta.url));

Deno.test("D7: no new server file uses select(\"*\") or a bare select()", async () => {
  for (const file of NEW_FILES) {
    const text = await read(file);
    assert(!/\.select\(\s*(["'`])\*\1/.test(text), `${file} uses select("*")`);
    assert(!/\.select\(\s*\)/.test(text), `${file} has a select with no column list`);
  }
});

Deno.test("D7: every read of a part_picture table names its columns", async () => {
  for (const file of NEW_FILES) {
    const text = await read(file);
    const sources = [...text.matchAll(/\.from\(\s*(["'])(part_picture[a-z_]*)\1\s*\)/g)];
    for (const source of sources) {
      const after = text.slice((source.index ?? 0) + source[0].length);
      const select = after.match(/^\s*\.select\(\s*([^)]*)/);
      if (!select) continue; // an insert or update chain: no columns to read
      const columns = select[1].trim();
      assert(columns.length > 0, `${file}: select() on ${source[2]} names no columns`);
      assert(!/^(["'`])\*\1/.test(columns), `${file}: select("*") on ${source[2]}`);
      assert(
        /^(["'`])[^"'`]+\1/.test(columns) || columns.startsWith("PART_PICTURE_"),
        `${file}: select on ${source[2]} must be a quoted column list or a shared constant, got ${columns.slice(0, 40)}`,
      );
    }
  }
});

Deno.test("D7: the shared column lists exist and are what the reads use", async () => {
  const db = await read("part_picture_db.ts");
  assert(db.includes('export const PART_PICTURE_COLUMNS ='));
  assert(db.includes('export const PART_PICTURE_DIAGRAM_COLUMNS ='));
  assert(db.includes(".select(PART_PICTURE_DIAGRAM_COLUMNS)"));
  // The columns a picture row must carry for the worker and the screens.
  for (const column of ["interchange_group_id", "status", "label", "r2_key", "version", "template_version", "made_at"]) {
    assert(db.includes(column), `missing column ${column}`);
  }
});

Deno.test("D7: the Dominion reads (round S2) name their columns too", async () => {
  const admin = await read("part_picture_admin_db.ts");
  // §3.5 point 2: the one shape a picture comes back in, and the columns behind it.
  for (const column of [
    "interchange_group_id",
    "manufacturer",
    "part_number",
    "part_name",
    "catalog_group_id",
    "status",
    "r2_key",
    "version",
    "template_version",
    "made_at",
    "created_at",
  ]) {
    assert(admin.includes(column), `the picture shape is missing ${column}`);
  }
  const pictureColumns = admin.match(/export const PART_PICTURE_ADMIN_COLUMNS =\s*\n?\s*"([^"]+)"/)?.[1] ?? "";
  assert(pictureColumns.length > 0, "the picture column list is missing");
  // The list read never carries the prompt, the costs, the lease or who hid it.
  for (const forbidden of ["prompt", "cost_usd", "lease_until", "hidden_by", "last_error", "attempts"]) {
    assert(!pictureColumns.includes(forbidden), `the list read must not carry ${forbidden}`);
  }
  assert(admin.includes('"catalog_group_id, materials, enabled, version, updated_by, updated_at"'));
  assert(admin.includes(".select(PART_PICTURE_ADMIN_COLUMNS)"));
  assert(admin.includes(".select(PART_PICTURE_TEMPLATE_COLUMNS)"));

  // The reads shared with the saved-page result keep to those modules: the route itself never queries part_picture*.
  const savedPage = await read("research_saved_page_routes.ts");
  assert(!/\.from\(\s*(["'])part_picture/.test(savedPage), "the saved-page route must use the reads module");
  const reads = await read("part_picture_reads.ts");
  assert(!/\.from\(\s*(["'])part_picture/.test(reads), "the reads module takes its rows from part_picture_admin_db");
});

Deno.test("D7: part_master and part_picture_template reads also name their columns", async () => {  const queue = await read("part_pictures_queue.ts");
  // The two lookups that feed the queue (passed to selectIn, which runs .select(columns)).
  assert(
    queue.includes('"oem_part_number, oem_part_number_norm, manufacturer, name, maintenance_component_id, interchange_group_id, catalog_decision"'),
    "the part_master read must name its columns",
  );
  assert(
    queue.includes('"catalog_group_id, materials, enabled, version"'),
    "the template read must name its columns",
  );
  const db = await read("part_picture_db.ts");
  assert(db.includes('.select("catalog_group_id, materials, enabled, version")'));
});

/**
 * D8.9 (docs/part-type-learning-audit.md §2): the two tables the learning round added are server-only too. Every read
 * names its columns — a `select("*")` would start returning a history nobody meant to expose.
 */
const LEARNING_FILES = [
  "saved_page_diagrams.ts",
  "saved_page_part_type_routes.ts",
  "research_saved_page_routes.ts",
  "part_picture_db.ts",
  "part_picture_cleanup.ts",
];

Deno.test("D8.9: no new server file uses select(\"*\") on the two new tables", async () => {
  // The modules this round added have no older reads at all, so a bare select("*") anywhere in them is a bug.
  const NO_STAR_FILES = ["saved_page_diagrams.ts", "saved_page_part_type_routes.ts", "part_picture_cleanup.ts"];
  for (const file of NO_STAR_FILES) {
    const text = await read(file);
    assert(!/\.select\(\s*(["'`])\*\1/.test(text), `${file} uses select("*")`);
  }
  for (const file of LEARNING_FILES) {
    const text = await read(file);
    for (const table of ["part_type_suggestion_dismissal", "research_saved_page_diagram"]) {
      const sources = [...text.matchAll(new RegExp(`\\.from\\(\\s*(["'])${table}\\1\\s*\\)`, "g"))];
      for (const source of sources) {
        const after = text.slice((source.index ?? 0) + source[0].length);
        const select = after.match(/^\s*\.select\(\s*([^)]*)/);
        if (!select) continue; // an insert or update chain: no columns to read
        const columns = select[1].trim();
        assert(columns.length > 0, `${file}: select() on ${table} names no columns`);
        assert(!/^(["'`])\*\1/.test(columns), `${file}: select("*") on ${table}`);
        assert(
          /^(["'`])[^"'`]+\1/.test(columns) || columns.startsWith("SAVED_PAGE_"),
          `${file}: select on ${table} must be a quoted column list or a shared constant, got ${columns.slice(0, 40)}`,
        );
      }
    }
  }
});