/**
 * R7 (docs/part-type-learning-audit.md §2 D4, §3 R7): the drawings one upload keeps, loads back, and the picture worker
 * deletes 30 days later. Made-up bytes and keys only.
 * deno test --no-check --allow-read supabase/functions/_fleet-server/saved_page_diagrams.test.ts
 */
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  duePageDrawings,
  loadPageDrawings,
  markPageDrawingDeleted,
  storePageDrawings,
} from "./saved_page_diagrams.ts";
import { runPartPictureCleanup } from "./part_picture_cleanup.ts";
import type { SavedPageImages } from "./saved_page_text.ts";

const PAGE = "11111111-1111-4111-8111-111111111111";

type Row = Record<string, any>;

class Q {
  private filters: Array<[string, string, unknown]> = [];
  private orderBy?: [string, boolean];
  private limitN?: number;
  private action: "select" | "insert" | "update" = "select";
  private payload: Row = {};
  private singleRow = false;
  constructor(private db: FakeDb) {}
  select() {
    return this;
  }
  insert(row: Row) {
    this.action = "insert";
    this.payload = row;
    return this;
  }
  update(patch: Row) {
    this.action = "update";
    this.payload = patch;
    return this;
  }
  eq(col: string, val: unknown) {
    this.filters.push(["eq", col, val]);
    return this;
  }
  is(col: string, val: unknown) {
    this.filters.push(["is", col, val]);
    return this;
  }
  lte(col: string, val: unknown) {
    this.filters.push(["lte", col, val]);
    return this;
  }
  order(col: string, opts?: { ascending?: boolean }) {
    this.orderBy = [col, opts?.ascending !== false];
    return this;
  }
  limit(n: number) {
    this.limitN = n;
    return this;
  }
  single() {
    this.singleRow = true;
    return this.exec();
  }
  then(res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) {
    return this.exec().then(res, rej);
  }
  private matches(row: Row): boolean {
    return this.filters.every(([op, col, val]) => {
      if (op === "eq") return row[col] === val;
      if (op === "is") return (row[col] ?? null) === val;
      if (op === "lte") return String(row[col] ?? "") <= String(val ?? "");
      return true;
    });
  }
  private async exec() {
    const rows = this.db.table();
    if (this.action === "insert") {
      const row = { id: `diagram-${this.db.seq++}`, created_at: new Date(this.db.now).toISOString(), ...this.payload };
      rows.push(row);
      return { data: this.singleRow ? row : [row], error: null };
    }
    if (this.action === "update") {
      for (const row of rows) if (this.matches(row)) Object.assign(row, this.payload);
      return { data: null, error: null };
    }
    let out = rows.filter((row) => this.matches(row));
    if (this.orderBy) {
      const [col, asc] = this.orderBy;
      out = [...out].sort((a, b) => (a[col] === b[col] ? 0 : a[col] > b[col] ? 1 : -1) * (asc ? 1 : -1));
    }
    if (this.limitN != null) out = out.slice(0, this.limitN);
    return { data: out, error: null };
  }
}

class FakeDb {
  seq = 1;
  now = Date.parse("2026-11-25T12:00:00Z");
  rows: Row[] = [];
  from() {
    return new Q(this);
  }
  table(): Row[] {
    return this.rows;
  }
}

function fakeStore() {
  const files = new Map<string, Uint8Array>();
  const puts: Array<{ bucket: string; key: string; bytes: Uint8Array; contentType: string }> = [];
  const removes: string[] = [];
  return {
    files,
    puts,
    removes,
    async put(bucket: "public" | "private", key: string, bytes: Uint8Array, contentType: string) {
      puts.push({ bucket, key, bytes, contentType });
      files.set(key, bytes);
    },
    async read(_bucket: "public" | "private", key: string) {
      const found = files.get(key);
      if (!found) throw new Error("not found");
      return found;
    },
    async remove(_bucket: "public" | "private", keys: string[]) {
      removes.push(...keys);
      for (const key of keys) files.delete(key);
    },
  };
}

function image(source: string, width = 400, height = 400, usemap: string | null = null): SavedPageImages["images"][number] {
  return { contentType: "image/png", bytes: new Uint8Array([1, 2, 3]), width, height, usemap, source };
}

Deno.test("R7: at most 3 drawings are kept, privately, under this upload's own path", async () => {
  const db = new FakeDb();
  const r2 = fakeStore();
  const images: SavedPageImages = {
    images: [
      image("mapped.png", 400, 400, "map-body"),
      image("big.png", 900, 900),
      image("small.png", 120, 120),
      image("mid.png", 300, 300),
      image("tiny.png", 40, 40),
    ],
    maps: { "map-body": [{ title: "HOSE, AIR CLEANER", attrs: "k=1", box: { x1: 1, y1: 2, x2: 3, y2: 4 } }] },
  };
  const stored = await storePageDrawings(db as unknown as SupabaseClient, {
    savedPageId: PAGE,
    images,
    r2,
  });
  // The mapped drawing first, then the biggest others; 3 at most.
  assertEquals(stored.images.length, 3);
  assertEquals(stored.images.map((i) => i.source.split("/").pop()?.slice(-10)).length, 3);
  assertEquals(db.rows.length, 3);
  assert(db.rows.every((row) => row.saved_page_id === PAGE));
  assert(db.rows.every((row) => String(row.r2_key).startsWith(`part-diagrams/pages/${PAGE}/`)), JSON.stringify(db.rows));
  assert(r2.puts.every((put) => put.bucket === "private"));
  // The mapped drawing keeps the page's own rectangle (a single area); the others keep none.
  assertEquals(db.rows[0].map_box, { x1: 1, y1: 2, x2: 3, y2: 4 });
  assert(db.rows.slice(1).every((row) => row.map_box === null));
  // The table's own 30-day default fills delete_after: the server never sends one.
  assert(db.rows.every((row) => !("delete_after" in row)));
});

Deno.test("R7: with no object storage nothing is kept, and the parts still save (noDiagram)", async () => {
  const db = new FakeDb();
  const stored = await storePageDrawings(db as unknown as SupabaseClient, {
    savedPageId: PAGE,
    images: { images: [image("one.png")], maps: {} },
    r2: null,
  });
  assertEquals(stored.images, []);
  assertEquals(db.rows.length, 0);
});

Deno.test("R7: the kept drawings load back as the picture queue's images", async () => {
  const db = new FakeDb();
  const r2 = fakeStore();
  await storePageDrawings(db as unknown as SupabaseClient, {
    savedPageId: PAGE,
    images: { images: [image("one.png", 640, 480)], maps: {} },
    r2,
  });
  const loaded = await loadPageDrawings(db as unknown as SupabaseClient, { savedPageId: PAGE, r2 });
  assertEquals(loaded.images.length, 1);
  assertEquals(
    [loaded.images[0].width, loaded.images[0].height, loaded.images[0].contentType, loaded.images[0].usemap],
    [640, 480, "image/png", null],
  );
  assert(loaded.images[0].source.startsWith(`part-diagrams/pages/${PAGE}/`), loaded.images[0].source);
  assertEquals([...loaded.images[0].bytes], [1, 2, 3]);
  // A page with none kept (an .html upload) loads nothing.
  const empty = await loadPageDrawings(db as unknown as SupabaseClient, { savedPageId: "no-such-page", r2 });
  assertEquals(empty.images, []);
});

Deno.test("R7: only drawings past their 30 days are due, and marking one never touches another", async () => {
  const db = new FakeDb();
  db.rows.push(
    { id: "old", r2_key: "part-diagrams/pages/p/old.png", delete_after: "2026-11-01T00:00:00Z", deleted_at: null },
    { id: "new", r2_key: "part-diagrams/pages/p/new.png", delete_after: "2026-12-30T00:00:00Z", deleted_at: null },
    { id: "gone", r2_key: "part-diagrams/pages/p/gone.png", delete_after: "2026-11-01T00:00:00Z", deleted_at: "2026-11-02T00:00:00Z" },
  );
  const due = await duePageDrawings(db as unknown as SupabaseClient, 10, "2026-11-25T00:00:00Z");
  assertEquals(due.map((row) => row.id), ["old"]);
  await markPageDrawingDeleted(db as unknown as SupabaseClient, "old", "2026-11-25T01:00:00Z");
  assertEquals(db.rows.find((row) => row.id === "old")?.deleted_at, "2026-11-25T01:00:00Z");
  assertEquals(db.rows.find((row) => row.id === "new")?.deleted_at, null);
});

Deno.test("R7: the picture worker deletes the upload's drawings and marks them", async () => {
  const r2 = fakeStore();
  r2.files.set("part-diagrams/pages/p/one.png", new Uint8Array([9]));
  const marked: Array<{ id: string; at: string }> = [];
  const db = {
    cleanupCandidates: async () => [],
    markVersionFileDeleted: async () => {},
    markDiagramDeleted: async () => {},
    savedPageDiagramCleanupCandidates: async () => [{ id: "diag-1", r2Key: "part-diagrams/pages/p/one.png" }],
    markSavedPageDiagramDeleted: async (id: string, at: string) => {
      marked.push({ id, at });
    },
  };
  const result = await runPartPictureCleanup({
    db: db as never,
    r2: r2 as never,
    retentionDays: 30,
    now: new Date("2026-11-25T12:00:00Z"),
  });
  assertEquals(result.diagrams, 1);
  assertEquals(r2.removes, ["part-diagrams/pages/p/one.png"]);
  assertEquals(marked.map((row) => row.id), ["diag-1"]);
  assertEquals(r2.files.size, 0);
});
