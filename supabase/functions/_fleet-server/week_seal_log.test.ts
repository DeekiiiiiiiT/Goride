/**
 * D14 — week_seal_log pure helpers + stubbed DB behaviours (replay / 409 / fail-closed).
 */
import {
  assertEquals,
  assertRejects,
  assertThrows,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  __setWeekSealLogAdminForTests,
  beginSealAttempt,
  buildSealIdempotencyKey,
  completeSealAttempt,
  isFreshInProgress,
  parseSealGeneration,
  SEAL_IN_PROGRESS_TTL_MS,
  WeekSealLogError,
  type WeekSealLogRow,
} from "./week_seal_log.ts";

Deno.test("buildSealIdempotencyKey is deterministic intent (no wall clock)", () => {
  const a = buildSealIdempotencyKey("org-1", "2026-01-05", "fuel", 0);
  const b = buildSealIdempotencyKey("org-1", "2026-01-05", "fuel", 0);
  assertEquals(a, b);
  assertEquals(a, "org-1:2026-01-05:fuel:g0");
  assertEquals(
    buildSealIdempotencyKey("org-1", "2026-01-05", "fuel", 1),
    "org-1:2026-01-05:fuel:g1",
  );
  const minute = Math.floor(Date.now() / 60_000);
  assertEquals(a.includes(String(minute)), false);
});

Deno.test("parseSealGeneration reads trailing :gN", () => {
  assertEquals(parseSealGeneration("org:w:fuel:g0"), 0);
  assertEquals(parseSealGeneration("org:w:fuel:g12"), 12);
  assertEquals(parseSealGeneration(null), 0);
});

Deno.test("isFreshInProgress respects TTL", () => {
  const fresh: WeekSealLogRow = {
    organization_id: "o",
    week_key: "w",
    lane: "fuel",
    status: "in_progress",
    attempts: 1,
    idempotency_key: "o:w:fuel:g0",
    correlation_id: null,
    request_hash: null,
    result_json: null,
    last_error: null,
    sealed_at: null,
    updated_at: new Date().toISOString(),
  };
  assertEquals(isFreshInProgress(fresh), true);
  const stale = {
    ...fresh,
    updated_at: new Date(Date.now() - SEAL_IN_PROGRESS_TTL_MS - 1_000).toISOString(),
  };
  assertEquals(isFreshInProgress(stale), false);
  assertEquals(SEAL_IN_PROGRESS_TTL_MS, 120_000);
});

type StubRow = WeekSealLogRow;

/** Minimal thenable query builder stub for week_seal_log tests. */
function makeStubSb(state: {
  byKey?: StubRow | null;
  byLane?: StubRow | null;
  readError?: { message: string } | null;
  writeError?: { message: string } | null;
  insertError?: { message: string } | null;
  updateResult?: unknown[];
  lastUpdateFilter?: string;
}) {
  const chain = (result: { data: unknown; error: unknown }) => {
    const api: Record<string, unknown> = {};
    const self = () => api;
    for (const m of [
      "select",
      "eq",
      "or",
      "insert",
      "update",
      "upsert",
    ]) {
      api[m] = (..._args: unknown[]) => {
        if (m === "or" && typeof _args[0] === "string") {
          state.lastUpdateFilter = _args[0];
        }
        if (m === "insert" && state.insertError) {
          return Promise.resolve({ data: null, error: state.insertError });
        }
        if (m === "update") {
          return chain({
            data: state.updateResult ?? [{ organization_id: "o" }],
            error: state.writeError ?? null,
          });
        }
        if (m === "upsert") {
          return Promise.resolve({
            data: null,
            error: state.writeError ?? null,
          });
        }
        return self();
      };
    }
    api.maybeSingle = () => Promise.resolve(result);
    // terminal for update().select()
    api.then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve(result).then(resolve);
    return api;
  };

  let readCall = 0;
  return {
    from(_table: string) {
      return {
        select(_cols: string) {
          readCall++;
          const isKeyLookup = readCall === 1;
          const data = state.readError
            ? null
            : isKeyLookup
              ? state.byKey ?? null
              : state.byLane ?? null;
          return chain({ data, error: state.readError ?? null });
        },
        insert(row: unknown) {
          if (state.insertError) {
            return Promise.resolve({ data: null, error: state.insertError });
          }
          state.byLane = row as StubRow;
          return Promise.resolve({ data: row, error: null });
        },
        update(row: unknown) {
          const api = chain({
            data: state.updateResult ?? [{ organization_id: "o" }],
            error: state.writeError ?? null,
          });
          // capture row for inspection
          (state as { lastUpdate?: unknown }).lastUpdate = row;
          return api;
        },
        upsert(row: unknown) {
          return Promise.resolve({
            data: row,
            error: state.writeError ?? null,
          });
        },
      };
    },
  };
}

Deno.test({
  name: "beginSealAttempt replays succeeded row with same key (D14)",
  async fn() {
    const key = buildSealIdempotencyKey("org", "2026-09-14", "fuel", 0);
    const prior: StubRow = {
      organization_id: "org",
      week_key: "2026-09-14",
      lane: "fuel",
      status: "succeeded",
      attempts: 1,
      idempotency_key: key,
      correlation_id: "c1",
      request_hash: null,
      result_json: { sealed: true, drivers: 3 },
      last_error: null,
      sealed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    __setWeekSealLogAdminForTests(makeStubSb({ byKey: prior }) as never);
    try {
      const got = await beginSealAttempt({
        organizationId: "org",
        weekKey: "2026-09-14",
        lane: "fuel",
        idempotencyKey: key,
      });
      assertEquals(got?.result_json, { sealed: true, drivers: 3 });
      assertEquals(got?.status, "succeeded");
    } finally {
      __setWeekSealLogAdminForTests(null);
    }
  },
});

Deno.test({
  name: "beginSealAttempt refuses fresh in_progress with CLOSE_IN_PROGRESS 409",
  async fn() {
    const key = buildSealIdempotencyKey("org", "w", "toll", 0);
    const busy: StubRow = {
      organization_id: "org",
      week_key: "w",
      lane: "toll",
      status: "in_progress",
      attempts: 1,
      idempotency_key: key,
      correlation_id: null,
      request_hash: null,
      result_json: null,
      last_error: null,
      sealed_at: null,
      updated_at: new Date().toISOString(),
    };
    __setWeekSealLogAdminForTests(
      makeStubSb({ byKey: null, byLane: busy }) as never,
    );
    try {
      const err = await assertRejects(
        () =>
          beginSealAttempt({
            organizationId: "org",
            weekKey: "w",
            lane: "toll",
            idempotencyKey: key,
          }),
        WeekSealLogError,
      );
      assertEquals(err.code, "CLOSE_IN_PROGRESS");
      assertEquals(err.status, 409);
    } finally {
      __setWeekSealLogAdminForTests(null);
    }
  },
});

Deno.test({
  name: "beginSealAttempt fail-closed on read error",
  async fn() {
    __setWeekSealLogAdminForTests(
      makeStubSb({ readError: { message: "boom" } }) as never,
    );
    try {
      const err = await assertRejects(
        () =>
          beginSealAttempt({
            organizationId: "org",
            weekKey: "w",
            lane: "fuel",
            idempotencyKey: "org:w:fuel:g0",
          }),
        WeekSealLogError,
      );
      assertEquals(err.code, "SEAL_LOG_READ_FAILED");
      assertEquals(err.status, 503);
    } finally {
      __setWeekSealLogAdminForTests(null);
    }
  },
});

Deno.test({
  name: "completeSealAttempt fail-closed on write error",
  async fn() {
    __setWeekSealLogAdminForTests(
      makeStubSb({ writeError: { message: "upsert down" } }) as never,
    );
    try {
      const err = await assertRejects(
        () =>
          completeSealAttempt({
            organizationId: "org",
            weekKey: "w",
            lane: "fuel",
            idempotencyKey: "org:w:fuel:g0",
            status: "succeeded",
            resultJson: { ok: true },
          }),
        WeekSealLogError,
      );
      assertEquals(err.code, "SEAL_LOG_WRITE_FAILED");
      assertEquals(err.status, 503);
    } finally {
      __setWeekSealLogAdminForTests(null);
    }
  },
});

Deno.test({
  name: "conditional claim: zero-row update throws CLOSE_IN_PROGRESS",
  async fn() {
    const key = buildSealIdempotencyKey("org", "w", "earnings", 0);
    const failedPrior: StubRow = {
      organization_id: "org",
      week_key: "w",
      lane: "earnings",
      status: "failed",
      attempts: 2,
      idempotency_key: key,
      correlation_id: null,
      request_hash: null,
      result_json: null,
      last_error: "prior",
      sealed_at: null,
      updated_at: new Date(Date.now() - 60_000).toISOString(),
    };
    __setWeekSealLogAdminForTests(
      makeStubSb({
        byKey: null,
        byLane: failedPrior,
        updateResult: [], // conditional update matched nothing → race lost
      }) as never,
    );
    try {
      const err = await assertRejects(
        () =>
          beginSealAttempt({
            organizationId: "org",
            weekKey: "w",
            lane: "earnings",
            idempotencyKey: key,
          }),
        WeekSealLogError,
      );
      assertEquals(err.code, "CLOSE_IN_PROGRESS");
    } finally {
      __setWeekSealLogAdminForTests(null);
    }
  },
});

Deno.test("WeekSealLogError fail-closed codes for write failures", () => {
  assertThrows(
    () => {
      throw new WeekSealLogError(
        "SEAL_LOG_WRITE_FAILED",
        "week_seal_log begin upsert failed: boom",
        503,
      );
    },
    WeekSealLogError,
    "week_seal_log begin upsert failed",
  );
});
