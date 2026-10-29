import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  fetchPetrojamPrices,
  petrojamRowsToLong,
  type PetrojamSyncMode,
  type RefineryPricePoint,
} from "./scrape.ts";

export type ActiveRefinery = {
  id: string;
  slug: string;
  source_kind: string;
  status: string;
};

export type SyncRunResult = {
  refinery_id: string;
  slug: string;
  error: string | null;
  weeks_found: number;
  weeks_new: number;
  weeks_unchanged: number;
  weeks_revised: number;
  run_id?: string;
};

export function httpStatusForRuns(runs: Array<{ error: string | null }>): number {
  return runs.some((run) => run.error) ? 500 : 200;
}

type SnapshotJson = {
  run_id?: string;
  weeks_found?: number;
  weeks_new?: number;
  weeks_unchanged?: number;
  weeks_revised?: number;
  error?: string | null;
};

function asRun(refinery: ActiveRefinery, raw: SnapshotJson | null, fallbackError?: string): SyncRunResult {
  return {
    refinery_id: refinery.id,
    slug: refinery.slug,
    error: fallbackError ?? raw?.error ?? null,
    weeks_found: Number(raw?.weeks_found ?? 0),
    weeks_new: Number(raw?.weeks_new ?? 0),
    weeks_unchanged: Number(raw?.weeks_unchanged ?? 0),
    weeks_revised: Number(raw?.weeks_revised ?? 0),
    run_id: raw?.run_id,
  };
}

export async function writeRefinerySnapshot(
  db: SupabaseClient,
  refineryId: string,
  rows: RefineryPricePoint[],
  opts: {
    source: "scrape" | "manual" | "backfill";
    sourceUrl?: string | null;
    trigger: "schedule" | "owner" | "manual_entry";
    actor?: string | null;
    mode?: string | null;
    pages?: number | null;
    reason?: string | null;
    enteredBy?: string | null;
  },
): Promise<SnapshotJson> {
  const { data, error } = await db.rpc("refinery_write_snapshot", {
    p_refinery_id: refineryId,
    p_rows: rows,
    p_source: opts.source,
    p_source_url: opts.sourceUrl ?? null,
    p_trigger: opts.trigger,
    p_actor: opts.actor ?? null,
    p_mode: opts.mode ?? null,
    p_pages: opts.pages ?? null,
    p_reason: opts.reason ?? null,
    p_entered_by: opts.enteredBy ?? null,
  });
  if (error) throw new Error(error.message);
  return (data ?? {}) as SnapshotJson;
}

export async function syncOneRefinery(
  db: SupabaseClient,
  refinery: ActiveRefinery,
  opts: {
    mode: PetrojamSyncMode;
    year?: number;
    month?: number;
    maxPages?: number;
    trigger: "schedule" | "owner" | "manual_entry";
    actor?: string | null;
    scrape?: typeof fetchPetrojamPrices;
  },
): Promise<SyncRunResult> {
  const scrape = opts.scrape ?? fetchPetrojamPrices;
  if (refinery.source_kind === "manual") {
    return asRun(refinery, null, "Entered by hand");
  }
  if (refinery.source_kind !== "petrojam_html") {
    const message = `No price adapter for ${refinery.source_kind}`;
    await db.rpc("refinery_record_error", {
      p_refinery_id: refinery.id,
      p_trigger: opts.trigger,
      p_actor: opts.actor ?? null,
      p_mode: opts.mode,
      p_error: message,
    });
    return asRun(refinery, null, message);
  }

  try {
    const fetched = await scrape({
      mode: opts.mode,
      year: opts.year,
      month: opts.month,
      maxPages: opts.maxPages,
    });
    const written = await writeRefinerySnapshot(db, refinery.id, petrojamRowsToLong(fetched.rows), {
      source: "scrape",
      sourceUrl: "https://www.petrojam.com/price/",
      trigger: opts.trigger,
      actor: opts.actor,
      mode: opts.mode,
      pages: fetched.pagesFetched,
    });
    return asRun(refinery, written, written.error ?? undefined);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Sync failed";
    await db.rpc("refinery_record_error", {
      p_refinery_id: refinery.id,
      p_trigger: opts.trigger,
      p_actor: opts.actor ?? null,
      p_mode: opts.mode,
      p_error: message,
    });
    return asRun(refinery, null, message);
  }
}

export async function syncActiveRefineries(
  db: SupabaseClient,
  opts: {
    mode: PetrojamSyncMode;
    year?: number;
    month?: number;
    maxPages?: number;
    trigger: "schedule" | "owner";
    actor?: string | null;
    scrape?: typeof fetchPetrojamPrices;
    refineries?: ActiveRefinery[];
  },
): Promise<{ status: number; runs: SyncRunResult[] }> {
  let refineries = opts.refineries;
  if (!refineries) {
    const { data, error } = await db.rpc("refinery_list");
    if (error) throw new Error(error.message);
    refineries = ((data ?? []) as ActiveRefinery[]).filter(
      (row) => row.status === "active" && row.source_kind !== "manual",
    );
  }
  const runs: SyncRunResult[] = [];
  for (const refinery of refineries) {
    runs.push(await syncOneRefinery(db, refinery, opts));
  }
  return { status: httpStatusForRuns(runs), runs };
}
