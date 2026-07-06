/**
 * Regression tests for postPaymentJournal (atomic RPC via rides_post_payment_journal_line).
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  PLATFORM_RECEIVABLE_KEY,
  riderAccountKeyForUser,
} from "../rides/cashSettlement/buildJournalEntries.ts";
import { postPaymentJournal } from "./paymentAccounts.ts";
import {
  resetRidesPaymentDbForTests,
  setRidesPaymentDbOverrideForTests,
} from "./ridesPaymentDb.ts";
import { InMemoryPaymentStore } from "./testHelpers/inMemoryPaymentStore.ts";

function setupStore(): InMemoryPaymentStore {
  const store = new InMemoryPaymentStore();
  store.seedSystemAccounts("JMD");
  setRidesPaymentDbOverrideForTests(store.asRidesPaymentDb());
  return store;
}

function teardownStore(): void {
  resetRidesPaymentDbForTests();
}

function sampleLine(amountMinor: number) {
  return {
    entry_type: "wallet_topup" as const,
    debit_account_key: PLATFORM_RECEIVABLE_KEY,
    credit_account_key: riderAccountKeyForUser("rider-1"),
    amount_minor: amountMinor,
    metadata: {},
  };
}

Deno.test("postPaymentJournal inserts journal row and updates both account balances", async () => {
  const store = setupStore();
  try {
    const result = await postPaymentJournal(undefined, {
      rideId: null,
      idempotencyKey: "topup-1",
      requestHash: "hash-1",
      currency: "JMD",
      lines: [sampleLine(500)],
      createdByUserId: "rider-1",
    });

    assertEquals(result.inserted, 1);
    assertEquals(result.skipped, false);
    assertEquals(store.journal.length, 1);
    assertEquals(store.journal[0].amount_minor, 500);
    assertEquals(store.getAccountBalance(riderAccountKeyForUser("rider-1"), "JMD"), 500);
    assertEquals(store.getAccountBalance(PLATFORM_RECEIVABLE_KEY, "JMD"), -500);
  } finally {
    teardownStore();
  }
});

Deno.test("postPaymentJournal skips duplicate idempotent request", async () => {
  const store = setupStore();
  try {
    const params = {
      rideId: "ride-abc",
      idempotencyKey: "settle-ride-abc",
      requestHash: "hash-settle",
      currency: "JMD",
      lines: [sampleLine(300)],
      createdByUserId: null,
    };

    const first = await postPaymentJournal(undefined, params);
    assertEquals(first.inserted, 1);

    const second = await postPaymentJournal(undefined, params);
    assertEquals(second.inserted, 0);
    assertEquals(second.skipped, true);
    assertEquals(store.journal.length, 1);
    assertEquals(store.getAccountBalance(riderAccountKeyForUser("rider-1"), "JMD"), 300);
  } finally {
    teardownStore();
  }
});

Deno.test("postPaymentJournal returns conflict when request_hash differs for same idempotency key", async () => {
  setupStore();
  try {
    const base = {
      rideId: null,
      idempotencyKey: "topup-conflict",
      currency: "JMD",
      lines: [sampleLine(100)],
      createdByUserId: null,
    };

    await postPaymentJournal(undefined, { ...base, requestHash: "hash-a" });

    const conflict = await postPaymentJournal(undefined, { ...base, requestHash: "hash-b" });
    assertEquals(conflict.inserted, 0);
    assertEquals(conflict.skipped, false);
    assertEquals(conflict.conflict, true);
  } finally {
    teardownStore();
  }
});

Deno.test("postPaymentJournal returns early when lines array is empty", async () => {
  setupStore();
  try {
    const result = await postPaymentJournal(undefined, {
      rideId: null,
      idempotencyKey: "empty-lines",
      requestHash: "hash-empty",
      currency: "JMD",
      lines: [],
      createdByUserId: null,
    });

    assertEquals(result.inserted, 0);
    assertEquals(result.skipped, false);
  } finally {
    teardownStore();
  }
});

/**
 * Concurrent postings must preserve credited balance (atomic RPC, ADR B1 / Phase 4).
 */
Deno.test("postPaymentJournal concurrent postings preserve credited account balance", async () => {
  const store = setupStore();
  try {
    const amount = 100;
    const line = sampleLine(amount);

    await Promise.all([
      postPaymentJournal(undefined, {
        rideId: null,
        idempotencyKey: "concurrent-a",
        requestHash: "hash-a",
        currency: "JMD",
        lines: [line],
        createdByUserId: null,
      }),
      postPaymentJournal(undefined, {
        rideId: null,
        idempotencyKey: "concurrent-b",
        requestHash: "hash-b",
        currency: "JMD",
        lines: [line],
        createdByUserId: null,
      }),
    ]);

    assertEquals(store.journal.length, 2);
    assertEquals(
      store.getAccountBalance(riderAccountKeyForUser("rider-1"), "JMD"),
      amount * 2,
      "concurrent credits must not overwrite each other",
    );
  } finally {
    teardownStore();
  }
});
