import { assertEquals } from "jsr:@std/assert";
import {
  pickTollCloseAmounts,
  type TollCloseAmounts,
} from "./toll_close_amounts.ts";

const periodFallback = (partial?: Partial<TollCloseAmounts>): TollCloseAmounts => ({
  totalSpend: 3860,
  reimbursed: 0,
  chargedToDriver: 0,
  cashWashSpend: 3860,
  tagSpend: 0,
  source: "period_columns",
  ...partial,
});

Deno.test("pickTollCloseAmounts prefers plaza over events and period", () => {
  const picked = pickTollCloseAmounts({
    fromPlaza: {
      tollSpend: 3575,
      reimbursed: 3290,
      cashWashSpend: 3290,
      tagSpend: 285,
    },
    fromEvents: {
      totalSpend: 9999,
      reimbursed: 1,
      chargedToDriver: 2,
      cashWashSpend: 0,
      tagSpend: 9999,
    },
    periodFallback: periodFallback(),
  });
  assertEquals(picked.source, "plaza");
  assertEquals(picked.totalSpend, 3575);
  assertEquals(picked.reimbursed, 3290);
  assertEquals(picked.tagSpend, 285);
  // Plaza keeps period charged until wallet override
  assertEquals(picked.chargedToDriver, 0);
});

Deno.test("pickTollCloseAmounts uses events when plaza missing", () => {
  const picked = pickTollCloseAmounts({
    fromEvents: {
      totalSpend: 100,
      reimbursed: 40,
      chargedToDriver: 10,
      cashWashSpend: 20,
      tagSpend: 80,
    },
    periodFallback: periodFallback(),
  });
  assertEquals(picked.source, "events");
  assertEquals(picked.totalSpend, 100);
  assertEquals(picked.chargedToDriver, 10);
});

Deno.test("pickTollCloseAmounts folds usage when spend empty", () => {
  const picked = pickTollCloseAmounts({
    fromEvents: {
      totalSpend: 0,
      reimbursed: 0,
      chargedToDriver: 0,
      cashWashSpend: 0,
      tagSpend: 0,
    },
    fromUsage: { tagSpend: 55.5 },
    periodFallback: periodFallback({ totalSpend: 0, cashWashSpend: 0 }),
  });
  assertEquals(picked.source, "financial_events");
  assertEquals(picked.totalSpend, 55.5);
  assertEquals(picked.tagSpend, 55.5);
});

Deno.test("pickTollCloseAmounts wallet charged overrides and upgrades period source", () => {
  const picked = pickTollCloseAmounts({
    periodFallback: periodFallback(),
    hasWalletCharged: true,
    walletCharged: 285,
  });
  assertEquals(picked.chargedToDriver, 285);
  assertEquals(picked.source, "financial_events");
});

Deno.test("pickTollCloseAmounts wallet charged on plaza keeps plaza source", () => {
  const picked = pickTollCloseAmounts({
    fromPlaza: {
      tollSpend: 3575,
      reimbursed: 3290,
      cashWashSpend: 3290,
      tagSpend: 285,
    },
    periodFallback: periodFallback(),
    hasWalletCharged: true,
    walletCharged: 285,
  });
  assertEquals(picked.source, "plaza");
  assertEquals(picked.chargedToDriver, 285);
  assertEquals(picked.totalSpend, 3575);
});

Deno.test("pickTollCloseAmounts falls back to period columns", () => {
  const picked = pickTollCloseAmounts({
    periodFallback: periodFallback(),
  });
  assertEquals(picked.source, "period_columns");
  assertEquals(picked.totalSpend, 3860);
});
