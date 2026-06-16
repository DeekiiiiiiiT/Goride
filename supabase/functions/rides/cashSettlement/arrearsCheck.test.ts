import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";

const MOCK_FLAG_STATE = { arrearsBlockEnabled: false };

const mockGetAccountByKey = async (
  _db: unknown,
  accountKey: string,
  _currency: string,
): Promise<{ balance_minor: number } | null> => {
  if (accountKey === "user:rider-with-arrears:rider") {
    return { balance_minor: -5000 };
  }
  if (accountKey === "user:rider-no-arrears:rider") {
    return { balance_minor: 2000 };
  }
  if (accountKey === "user:rider-zero-balance:rider") {
    return { balance_minor: 0 };
  }
  return null;
};

const mockWalletBalanceFromMinor = (balanceMinor: number, currency: string) => {
  const balance = Number(balanceMinor) || 0;
  return {
    currency,
    balance_minor: balance,
    available_minor: Math.max(0, balance),
    arrears_minor: Math.max(0, -balance),
    credit_minor: Math.max(0, balance),
  };
};

async function getRiderArrearsMinorMock(
  db: unknown,
  riderUserId: string,
  currency: string,
): Promise<number> {
  const key = `user:${riderUserId}:rider`;
  const account = await mockGetAccountByKey(db, key, currency);
  if (!account) return 0;
  return mockWalletBalanceFromMinor(account.balance_minor, currency).arrears_minor;
}

async function isRiderArrearsBlockedMock(
  db: unknown,
  riderUserId: string,
  paymentMethod: string,
  currency: string,
): Promise<{ blocked: boolean; arrearsMinor: number }> {
  if (!MOCK_FLAG_STATE.arrearsBlockEnabled) {
    return { blocked: false, arrearsMinor: 0 };
  }

  if (paymentMethod !== "cash") {
    return { blocked: false, arrearsMinor: 0 };
  }

  const arrearsMinor = await getRiderArrearsMinorMock(db, riderUserId, currency);
  
  if (arrearsMinor > 0) {
    return { blocked: true, arrearsMinor };
  }

  return { blocked: false, arrearsMinor: 0 };
}

Deno.test("getRiderArrearsMinor returns arrears for rider with negative balance", async () => {
  const result = await getRiderArrearsMinorMock(null, "rider-with-arrears", "JMD");
  assertEquals(result, 5000);
});

Deno.test("getRiderArrearsMinor returns 0 for rider with positive balance", async () => {
  const result = await getRiderArrearsMinorMock(null, "rider-no-arrears", "JMD");
  assertEquals(result, 0);
});

Deno.test("getRiderArrearsMinor returns 0 for rider with zero balance", async () => {
  const result = await getRiderArrearsMinorMock(null, "rider-zero-balance", "JMD");
  assertEquals(result, 0);
});

Deno.test("getRiderArrearsMinor returns 0 for non-existent rider", async () => {
  const result = await getRiderArrearsMinorMock(null, "non-existent-rider", "JMD");
  assertEquals(result, 0);
});

Deno.test("isRiderArrearsBlocked returns blocked=false when flag is disabled", async () => {
  MOCK_FLAG_STATE.arrearsBlockEnabled = false;
  const result = await isRiderArrearsBlockedMock(null, "rider-with-arrears", "cash", "JMD");
  assertEquals(result.blocked, false);
  assertEquals(result.arrearsMinor, 0);
});

Deno.test("isRiderArrearsBlocked returns blocked=false for card payment method even with arrears", async () => {
  MOCK_FLAG_STATE.arrearsBlockEnabled = true;
  const result = await isRiderArrearsBlockedMock(null, "rider-with-arrears", "card", "JMD");
  assertEquals(result.blocked, false);
  assertEquals(result.arrearsMinor, 0);
});

Deno.test("isRiderArrearsBlocked returns blocked=true for cash payment with arrears when flag enabled", async () => {
  MOCK_FLAG_STATE.arrearsBlockEnabled = true;
  const result = await isRiderArrearsBlockedMock(null, "rider-with-arrears", "cash", "JMD");
  assertEquals(result.blocked, true);
  assertEquals(result.arrearsMinor, 5000);
});

Deno.test("isRiderArrearsBlocked returns blocked=false for cash payment without arrears", async () => {
  MOCK_FLAG_STATE.arrearsBlockEnabled = true;
  const result = await isRiderArrearsBlockedMock(null, "rider-no-arrears", "cash", "JMD");
  assertEquals(result.blocked, false);
  assertEquals(result.arrearsMinor, 0);
});

Deno.test("isRiderArrearsBlocked returns blocked=false for rider with zero balance", async () => {
  MOCK_FLAG_STATE.arrearsBlockEnabled = true;
  const result = await isRiderArrearsBlockedMock(null, "rider-zero-balance", "cash", "JMD");
  assertEquals(result.blocked, false);
  assertEquals(result.arrearsMinor, 0);
});

Deno.test("isRiderArrearsBlocked returns blocked=false for non-existent rider account", async () => {
  MOCK_FLAG_STATE.arrearsBlockEnabled = true;
  const result = await isRiderArrearsBlockedMock(null, "non-existent-rider", "cash", "JMD");
  assertEquals(result.blocked, false);
  assertEquals(result.arrearsMinor, 0);
});
