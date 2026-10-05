/**
 * Rush money doors: cancel quote, cash collection, wallet, payouts, chargebacks, risk.
 * Wallet and payout export stay off until the matching runtime flag is turned on.
 */
import type { Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authorizeCronOrServiceRole } from "../../_shared/authorizeCronOrServiceRole.ts";
import { requireProductAdmin } from "../../_shared/productAdmin.ts";
import { quoteCancel, POLICY_VERSION } from "../../_shared/rushMoney/cancelPolicy.ts";
import { protocolReady } from "../../_shared/rushMoney/protocol.ts";
import { walletDecision, applyCreditAtCheckout } from "../../_shared/rushMoney/walletRules.ts";
import { loadCustomerWallet } from "../../_shared/rushMoney/customerWallet.ts";
import { riskEffects } from "../../_shared/rushMoney/riskControls.ts";
import { captureLines, codShortLines, deductionReversalLines, merchantShortTopUpLines } from "../../_shared/rushMoney/journalLines.ts";
import type { DashOrderFeeFields } from "../../_shared/dashMoneySplit.ts";
import { settleDeliveredOrder } from "./settleOrder.ts";
import { requireCourierUser } from "../courierConsumerRoutes.ts";

type Deps = {
  // Callers pass the delivery-scoped client. Courier auth only needs getUser.
  getSupabase: (auth: string) => any;
  getServiceSupabase: () => any;
};

function publicDb() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}

async function flagOn(key: string): Promise<boolean> {
  const { data } = await publicDb().schema("rush_money").from("runtime_flags").select("enabled").eq("key", key).maybeSingle();
  return Boolean(data?.enabled);
}

function canMoveMoney(roles: string[]): boolean {
  return roles.some((role) => ["finance_approver", "platform_owner", "superadmin"].includes(role));
}

/** Full number for the payout file and the ready check. Falls back to the stored text if the vault is not on yet. */
async function bankAccountNumber(partyType: string, accountId: string, plaintext?: string | null): Promise<string> {
  const { data, error } = await publicDb().schema("payments").rpc("bank_account_number", {
    p_party: partyType,
    p_id: accountId,
  });
  if (!error && data) return String(data);
  return String(plaintext || "").trim();
}

/** Yesterday in Jamaica, so a batch does not lock money posted while it is being approved. */
function lastCompletedJamDay(): string {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Jamaica",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const [year, month, day] = today.split("-").map(Number);
  const prev = new Date(Date.UTC(year, month - 1, day));
  prev.setUTCDate(prev.getUTCDate() - 1);
  return prev.toISOString().slice(0, 10);
}

export function registerRushMoneyRoutes(app: Hono, deps: Deps) {
  app.get("/orders/:id/cancel-quote", async (c) => {
    const authHeader = c.req.header("Authorization");
    if (!authHeader) return c.json({ error: "Unauthorized" }, 401);
    const supabase = deps.getSupabase(authHeader);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return c.json({ error: "Unauthorized" }, 401);
    const serviceSb = deps.getServiceSupabase();
    const { data: customer } = await serviceSb.from("customers").select("id").eq("user_id", user.id).maybeSingle();
    const { data: order } = await serviceSb.from("orders").select("*").eq("id", c.req.param("id")).maybeSingle();
    if (!order || !customer || order.customer_id !== customer.id) return c.json({ error: "Not found" }, 404);
    const method = String(order.payment_method || "");
    const tender = method === "cash" || method === "cod" ? "cod" : "card";
    const quote = quoteCancel({
      order,
      actor: "customer",
      reason: "customer_cancel",
      tender,
    });
    return c.json({ quote, policyVersion: POLICY_VERSION });
  });

  app.get("/customer/wallet", async (c) => {
    const authHeader = c.req.header("Authorization");
    if (!authHeader) return c.json({ error: "Unauthorized" }, 401);
    const supabase = deps.getSupabase(authHeader);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return c.json({ error: "Unauthorized" }, 401);
    const serviceSb = deps.getServiceSupabase();
    const { data: customer } = await serviceSb.from("customers").select("id").eq("user_id", user.id).maybeSingle();
    if (!customer) return c.json({ error: "Not found" }, 404);
    const live = await flagOn("wallet_live");
    const wallet = await loadCustomerWallet(publicDb(), String(customer.id));
    const balanceMajor = wallet.balanceMajor;
    const creditMajor = wallet.creditMajor;
    const { count } = await serviceSb.from("orders").select("id", { count: "exact", head: true })
      .eq("customer_id", customer.id)
      .eq("payment_status", "paid")
      .in("status", ["delivered", "completed"]);
    const decision = walletDecision({
      balanceMajor,
      debtAgeDays: wallet.debtAgeDays,
      completedCardOrders: count || 0,
      walletLive: live,
    });
    const words = balanceMajor > 0
      ? `Balance due J$${balanceMajor.toFixed(2)}`
      : creditMajor > 0
      ? `Roam Rush credit J$${creditMajor.toFixed(2)}`
      : "No balance";
    return c.json({
      words,
      balanceMajor,
      creditMajor,
      walletLive: live,
      codAllowed: live && decision.codAllowed,
      orderingAllowed: decision.orderingAllowed,
      reason: decision.reason,
      checkout: applyCreditAtCheckout(0, creditMajor, true),
      history: wallet.history,
    });
  });

  app.get("/courier/deductions", async (c) => {
    const auth = await requireCourierUser(c.req.header("Authorization"), deps.getSupabase);
    if (auth instanceof Response) return auth;
    const { data: journals } = await publicDb().schema("rush_money").from("journals")
      .select("id, order_id, reason, evidence, created_at")
      .eq("event_type", "chargeback_loss")
      .contains("evidence", { courierId: auth.userId })
      .order("created_at", { ascending: false })
      .limit(30);
    const rows = journals || [];
    const ids = rows.map((row: { id?: string }) => String(row.id));
    const { data: appeals } = ids.length
      ? await publicDb().schema("rush_money").from("deduction_appeals").select("journal_id, status").in("journal_id", ids)
      : { data: [] };
    const appealStatus = new Map((appeals || []).map((row: { journal_id?: string; status?: string }) => [String(row.journal_id), String(row.status || "parked")]));
    return c.json({
      deductions: rows.map((row: { id?: string; order_id?: string; reason?: string; evidence?: { appealUntil?: string; amountMinor?: number }; created_at?: string }) => ({
        id: row.id,
        orderId: row.order_id,
        reason: row.reason || "Deduction",
        appealUntil: row.evidence?.appealUntil || null,
        amountMajor: Number(row.evidence?.amountMinor || 0) / 100,
        appealed: appealStatus.has(String(row.id)),
        appealStatus: appealStatus.get(String(row.id)) || null,
        createdAt: row.created_at,
      })),
    });
  });

  app.post("/courier/deductions/:id/appeal", async (c) => {
    const auth = await requireCourierUser(c.req.header("Authorization"), deps.getSupabase);
    if (auth instanceof Response) return auth;
    const { data: journal } = await publicDb().schema("rush_money").from("journals")
      .select("id, evidence")
      .eq("id", c.req.param("id"))
      .eq("event_type", "chargeback_loss")
      .maybeSingle();
    const evidence = (journal?.evidence || {}) as { courierId?: string; appealUntil?: string };
    if (!journal || evidence.courierId !== auth.userId) return c.json({ error: "Deduction not found" }, 404);
    if (!evidence.appealUntil || Date.parse(evidence.appealUntil) < Date.now()) {
      return c.json({ error: "The 7-day appeal window has closed" }, 409);
    }
    const { error } = await publicDb().schema("rush_money").from("deduction_appeals").insert({
      journal_id: journal.id,
      courier_id: auth.userId,
      status: "parked",
    });
    if (error) return c.json({ error: "This deduction is already with a person" }, 409);
    return c.json({ words: "Appeal parked for a person. The deduction stays until they decide." });
  });

  app.get("/courier/bank-account", async (c) => {
    const auth = await requireCourierUser(c.req.header("Authorization"), deps.getSupabase);
    if (auth instanceof Response) return auth;
    const { data } = await publicDb().schema("payments").from("courier_bank_accounts")
      .select("bank_name, branch, account_holder_name, account_last4, account_type, is_verified")
      .eq("courier_id", auth.userId)
      .eq("is_default", true)
      .maybeSingle();
    return c.json({ bankAccount: data || null });
  });

  app.post("/courier/bank-account", async (c) => {
    const auth = await requireCourierUser(c.req.header("Authorization"), deps.getSupabase);
    if (auth instanceof Response) return auth;
    const body = await c.req.json().catch(() => ({}));
    const bankName = String(body.bankName || "").trim();
    const branch = String(body.branch || "").trim();
    const accountHolderName = String(body.accountHolderName || "").trim();
    const accountNumber = String(body.accountNumber || "").replace(/\D/g, "");
    const accountType = body.accountType === "savings" ? "savings" : "checking";
    if (!bankName || !branch || !accountHolderName || accountNumber.length < 4) {
      return c.json({ error: "Enter the bank, branch, name, and account number" }, 400);
    }
    await publicDb().schema("payments").from("courier_bank_accounts").update({ is_default: false }).eq("courier_id", auth.userId);
    const { error } = await publicDb().schema("payments").from("courier_bank_accounts").insert({
      courier_id: auth.userId,
      bank_name: bankName,
      branch,
      account_holder_name: accountHolderName,
      account_number: accountNumber,
      account_last4: accountNumber.slice(-4),
      account_type: accountType,
      is_default: true,
      is_verified: false,
    });
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ words: "Bank account saved. It shows the last four digits until finance marks it ready.", last4: accountNumber.slice(-4) });
  });

  app.get("/admin/rush-money/bank-accounts", async (c) => {
    const admin = await requireProductAdmin(c, "dash");
    if (admin instanceof Response) return admin;
    if (!canMoveMoney(admin.roles)) return c.json({ error: "A finance approver must review bank accounts" }, 403);
    const payments = publicDb().schema("payments");
    const [merchants, couriers] = await Promise.all([
      payments.from("merchant_bank_accounts").select("id, merchant_id, bank_name, branch, account_holder_name, account_last4, account_type").eq("is_default", true).eq("is_verified", false),
      payments.from("courier_bank_accounts").select("id, courier_id, bank_name, branch, account_holder_name, account_last4, account_type").eq("is_default", true).eq("is_verified", false),
    ]);
    const waiting = [
      ...(merchants.data || []).map((row: { id?: string; merchant_id?: string; bank_name?: string; account_holder_name?: string; account_last4?: string }) => ({
        id: row.id, partyType: "merchant", partyId: row.merchant_id, name: row.account_holder_name, bank: row.bank_name, last4: row.account_last4,
      })),
      ...(couriers.data || []).map((row: { id?: string; courier_id?: string; bank_name?: string; account_holder_name?: string; account_last4?: string }) => ({
        id: row.id, partyType: "courier", partyId: row.courier_id, name: row.account_holder_name, bank: row.bank_name, last4: row.account_last4,
      })),
    ];
    return c.json({ waiting });
  });

  app.post("/admin/rush-money/bank-accounts/:partyType/:id/ready", async (c) => {
    const admin = await requireProductAdmin(c, "dash");
    if (admin instanceof Response) return admin;
    if (!canMoveMoney(admin.roles)) return c.json({ error: "A finance approver must mark an account ready" }, 403);
    const partyType = c.req.param("partyType") === "courier" ? "courier" : "merchant";
    const table = partyType === "courier" ? "courier_bank_accounts" : "merchant_bank_accounts";
    const { data, error } = await publicDb().schema("payments").from(table)
      .select("id, account_number, branch, account_holder_name, bank_name, is_verified")
      .eq("id", c.req.param("id"))
      .maybeSingle();
    if (error || !data) return c.json({ error: "Account not found" }, 404);
    const accountNumber = await bankAccountNumber(partyType, String(data.id), data.account_number);
    if (!accountNumber || !data.branch || !data.account_holder_name || !data.bank_name) {
      if (data.is_verified) {
        await publicDb().schema("payments").from(table).update({ is_verified: false }).eq("id", data.id);
      }
      return c.json({ error: "This account is missing a name, bank, branch, or number" }, 409);
    }
    const { error: updateError } = await publicDb().schema("payments").from(table)
      .update({ is_verified: true })
      .eq("id", data.id);
    if (updateError) return c.json({ error: "Account not found" }, 404);
    return c.json({ ready: true });
  });

  app.get("/admin/rush-money/deduction-appeals", async (c) => {
    const admin = await requireProductAdmin(c, "dash");
    if (admin instanceof Response) return admin;
    const { data: appeals } = await publicDb().schema("rush_money").from("deduction_appeals")
      .select("id, journal_id, courier_id, status, created_at")
      .eq("status", "parked")
      .order("created_at", { ascending: false })
      .limit(50);
    const rows = appeals || [];
    const journalIds = rows.map((row: { journal_id?: string }) => String(row.journal_id));
    const { data: journals } = journalIds.length
      ? await publicDb().schema("rush_money").from("journals").select("id, reason, evidence").in("id", journalIds)
      : { data: [] };
    const byId = new Map((journals || []).map((row: { id?: string; reason?: string; evidence?: { appealUntil?: string; amountMinor?: number } }) => [String(row.id), row]));
    return c.json({
      appeals: rows.map((row: { id?: string; journal_id?: string; courier_id?: string; status?: string; created_at?: string }) => {
        const journal = byId.get(String(row.journal_id)) as { reason?: string; evidence?: { appealUntil?: string; amountMinor?: number } } | undefined;
        return {
          id: row.id,
          courierId: row.courier_id,
          reason: journal?.reason || "Deduction",
          amountMajor: Number(journal?.evidence?.amountMinor || 0) / 100,
          appealUntil: journal?.evidence?.appealUntil || null,
          status: row.status,
          createdAt: row.created_at,
        };
      }),
    });
  });

  app.post("/admin/rush-money/deduction-appeals/:id", async (c) => {
    const admin = await requireProductAdmin(c, "dash");
    if (admin instanceof Response) return admin;
    if (!canMoveMoney(admin.roles)) return c.json({ error: "A finance approver must decide this appeal" }, 403);
    const body = await c.req.json().catch(() => ({}));
    const decision = body.decision === "upheld" ? "upheld" : body.decision === "reversed" ? "reversed" : "";
    if (!decision) return c.json({ error: "Uphold or reverse this appeal" }, 400);
    const { data: appeal } = await publicDb().schema("rush_money").from("deduction_appeals")
      .select("id, journal_id, status")
      .eq("id", c.req.param("id"))
      .maybeSingle();
    if (!appeal) return c.json({ error: "Appeal not found" }, 404);
    if (appeal.status !== "parked") return c.json({ words: "This appeal is already decided.", status: appeal.status });
    if (decision === "reversed") {
      const { data: original } = await publicDb().schema("rush_money").from("lines")
        .select("component, amount_minor, account_id")
        .eq("journal_id", appeal.journal_id);
      const accountIds = [...new Set((original || []).map((row: { account_id?: string }) => String(row.account_id || "")).filter(Boolean))];
      const { data: accounts } = accountIds.length
        ? await publicDb().schema("rush_money").from("accounts").select("id, kind, party_type, party_id").in("id", accountIds)
        : { data: [] };
      const accountById = new Map((accounts || []).map((row: { id?: string }) => [String(row.id), row]));
      const lines = deductionReversalLines((original || []).flatMap((row: { component?: string; amount_minor?: number; account_id?: string }) => {
        const account = accountById.get(String(row.account_id)) as { kind?: string; party_type?: "customer" | "courier" | "merchant" | "order" | "platform"; party_id?: string | null } | undefined;
        if (!account?.kind || !account.party_type) return [];
        return [{
          kind: account.kind,
          party_type: account.party_type,
          party_id: account.party_id ?? null,
          component: row.component || "",
          amount_minor: Number(row.amount_minor || 0),
        }];
      }));
      if (!lines.length) return c.json({ error: "This deduction has no lines to reverse" }, 409);
      const { error: journalError } = await publicDb().rpc("rush_post_journal", {
        p_idempotency_key: `deduction-appeal:${appeal.id}`,
        p_event_type: "deduction_reversed",
        p_order_id: null,
        p_correlation_id: appeal.id,
        p_lines: lines,
        p_actor_type: "admin",
        p_actor_id: admin.id,
        p_reason: "Courier appeal reversed the deduction",
        p_evidence: { journalId: appeal.journal_id },
        p_policy_version: POLICY_VERSION,
      });
      if (journalError) return c.json({ error: journalError.message }, 500);
    }
    const { error } = await publicDb().schema("rush_money").from("deduction_appeals")
      .update({ status: decision })
      .eq("id", appeal.id)
      .eq("status", "parked");
    if (error) return c.json({ error: error.message }, 500);
    return c.json({
      words: decision === "reversed" ? "The deduction was reversed." : "The deduction stands.",
      status: decision,
    });
  });

  app.post("/orders/:id/collect-cash", async (c) => {
    const auth = await requireCourierUser(c.req.header("Authorization"), deps.getSupabase);
    if (auth instanceof Response) return auth;
    const orderId = c.req.param("id");
    const body = await c.req.json().catch(() => ({}));
    const received = Number(body.amountReceived ?? body.amount_received);
    if (!Number.isFinite(received) || received < 0) return c.json({ error: "Enter the amount you received" }, 400);
    const serviceSb = deps.getServiceSupabase();
    const { data: order } = await serviceSb.from("orders").select("id, courier_id, customer_id, total, payment_method, payment_status, status, picked_up_at, money_state, cash_collected_minor").eq("id", orderId).maybeSingle();
    if (!order || order.courier_id !== auth.userId) return c.json({ error: "Forbidden" }, 403);
    const method = String(order.payment_method || "");
    if (method !== "cash" && method !== "cod") return c.json({ error: "This order is not paid in cash" }, 400);
    if (!order.picked_up_at && !["picked_up", "in_transit"].includes(String(order.status))) {
      return c.json({ error: "Collect cash when you arrive with the order" }, 409);
    }
    if (order.cash_collected_minor != null) {
      return c.json({ error: "Cash for this order was already recorded" }, 409);
    }
    const due = Number(order.total || 0);
    const minor = Math.round(received * 100);
    const short = Math.max(0, Math.round((due - received) * 100) / 100);
    const changeKept = body.changeKept === true ? Math.max(0, received - due) : 0;
    const nextState = short > 0 ? "short_collected" : "collected";
    const { error: transitionError } = await publicDb().rpc("rush_transition_money_state", {
      p_order_id: orderId,
      p_to: nextState,
    });
    if (transitionError) {
      return c.json({ error: "Cash cannot be recorded for this order yet" }, 409);
    }
    await serviceSb.from("orders").update({
      cash_collected_minor: minor,
      cash_change_kept_minor: Math.round(changeKept * 100),
      updated_at: new Date().toISOString(),
    }).eq("id", orderId).is("cash_collected_minor", null);
    if (short > 0 && await flagOn("wallet_live")) {
      await publicDb().rpc("rush_post_journal", {
        p_idempotency_key: `cod-short:${orderId}`,
        p_event_type: "wallet_debt",
        p_order_id: orderId,
        p_correlation_id: null,
        p_lines: codShortLines(String(order.customer_id), orderId, short),
        p_actor_type: "courier",
        p_actor_id: auth.userId,
        p_reason: "Cash short",
        p_evidence: { received },
        p_policy_version: POLICY_VERSION,
      });
    }
    const changeDue = received > due && !body.changeKept ? Math.round((received - due) * 100) / 100 : 0;
    return c.json({
      due,
      received,
      short,
      changeDue,
      words: short > 0
        ? `Customer still owes J$${short.toFixed(2)}`
        : changeDue > 0
        ? `Give back J$${changeDue.toFixed(2)}`
        : "Paid in full",
    });
  });

  app.post("/orders/:id/delivery-attempt", async (c) => {
    const auth = await requireCourierUser(c.req.header("Authorization"), deps.getSupabase);
    if (auth instanceof Response) return auth;
    const body = await c.req.json().catch(() => ({}));
    const attemptType = String(body.attemptType || body.attempt_type || "");
    if (!["call", "sms", "knock", "wait", "photo"].includes(attemptType)) {
      return c.json({ error: "attemptType must be call, sms, knock, wait, or photo" }, 400);
    }
    const serviceSb = deps.getServiceSupabase();
    const orderId = c.req.param("id");
    const { data: order } = await serviceSb.from("orders").select("courier_id, delivery_lat, delivery_lng").eq("id", orderId).maybeSingle();
    if (!order || order.courier_id !== auth.userId) return c.json({ error: "Forbidden" }, 403);
    const { error } = await serviceSb.from("delivery_attempts").insert({
      order_id: orderId,
      courier_id: auth.userId,
      attempt_type: attemptType,
      latitude: body.latitude ?? null,
      longitude: body.longitude ?? null,
      wait_seconds: body.waitSeconds ?? body.wait_seconds ?? null,
      photo_url: body.photoUrl ?? body.photo_url ?? null,
    });
    if (error) return c.json({ error: error.message }, 500);
    const { data: attempts } = await serviceSb.from("delivery_attempts")
      .select("attempt_type, at, wait_seconds, photo_url, latitude, longitude")
      .eq("order_id", orderId);
    const rows = attempts || [];
    const contacts = rows.filter((row: { attempt_type?: string }) => row.attempt_type === "call" || row.attempt_type === "sms").length;
    return c.json({
      logged: true,
      contactAttempts: contacts,
      protocolReady: protocolReady(rows, { latitude: order.delivery_lat, longitude: order.delivery_lng }),
    });
  });

  app.post("/courier/remittance/self-report", async (c) => {
    const auth = await requireCourierUser(c.req.header("Authorization"), deps.getSupabase);
    if (auth instanceof Response) return auth;
    const body = await c.req.json().catch(() => ({}));
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0) return c.json({ error: "Amount required" }, 400);
    const serviceSb = deps.getServiceSupabase();
    const { error } = await serviceSb.from("courier_remittance_settlements").insert({
      courier_id: auth.userId,
      amount_minor: Math.round(amount * 100),
      method: ["lynk", "bank_transfer", "cash_office", "wipay", "other"].includes(String(body.method)) ? String(body.method) : "lynk",
      status: "pending_confirmation",
      reference: `self:${auth.userId}:${Date.now()}`,
      external_ref: String(body.reference || ""),
      evidence_url: body.screenshot ? String(body.screenshot) : null,
      notes: "Courier reported a payment",
    });
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ words: "We'll confirm this payment. You're usually unlocked within 2 hours." });
  });

  app.post("/internal/rush-money/scores", async (c) => {
    const auth = await authorizeCronOrServiceRole(c.req.raw);
    if (!auth.ok) return c.json({ error: auth.error }, auth.status);
    const db = publicDb();
    const { data: debts } = await db.schema("rush_money").from("accounts")
      .select("party_id, party_type, balance_minor")
      .eq("kind", "customer_wallet")
      .eq("component", "")
      .gt("balance_minor", 0)
      .limit(200);
    let scored = 0;
    const dayStart = new Date();
    dayStart.setUTCHours(0, 0, 0, 0);
    for (const row of debts || []) {
      if (!row.party_id) continue;
      const { data: already } = await db.schema("risk").from("scores").select("id")
        .eq("party_id", row.party_id)
        .eq("version", POLICY_VERSION)
        .gte("created_at", dayStart.toISOString())
        .limit(1);
      if (already?.length) continue;
      await db.schema("risk").from("scores").insert({
        party_type: row.party_type || "customer",
        party_id: row.party_id,
        score: 1,
        version: POLICY_VERSION,
        inputs: { debtMinor: row.balance_minor, rule: "debt_hides_cash" },
      });
      scored += 1;
    }
    return c.json({ scored, deviceMatching: await flagOn("device_linking") });
  });

  app.post("/internal/rush-money/sweep", async (c) => {
    const auth = await authorizeCronOrServiceRole(c.req.raw);
    if (!auth.ok) return c.json({ error: auth.error }, auth.status);
    const { data, error } = await deps.getServiceSupabase().rpc("void_abandoned_unpaid_orders");
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ voided: data });
  });

  app.get("/admin/rush-money/orders/:id", async (c) => {
    const admin = await requireProductAdmin(c, "dash");
    if (admin instanceof Response) return admin;
    const orderId = c.req.param("id");
    const db = publicDb();
    const [journals, txns, refunds] = await Promise.all([
      db.schema("rush_money").from("journals").select("id, event_type, reason, created_at").eq("order_id", orderId),
      db.schema("payments").from("transactions").select("id, amount, status, provider_transaction_id").eq("order_id", orderId),
      db.schema("payments").from("refunds").select("id, amount, status, reason").eq("order_id", orderId),
    ]);
    return c.json({ journals: journals.data || [], transactions: txns.data || [], refunds: refunds.data || [] });
  });

  app.post("/admin/rush-money/payout-batches", async (c) => {
    const admin = await requireProductAdmin(c, "dash");
    if (admin instanceof Response) return admin;
    if (!admin.roles.some((role) => ["dash_admin", "platform_owner", "superadmin", "finance_approver"].includes(role))) {
      return c.json({ error: "You cannot move money" }, 403);
    }
    const body = await c.req.json().catch(() => ({}));
    const partyType = body.partyType === "courier" ? "courier" : "merchant";
    const kind = partyType === "merchant" ? "merchant_payable" : "courier_earnings";
    const periodStart = String(body.periodStart || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10));
    const periodEnd = String(body.periodEnd || lastCompletedJamDay());
    const { data: payable, error: payableError } = await publicDb().rpc("rush_week_payable", {
      p_kind: kind,
      p_start: periodStart,
      p_end: periodEnd,
    });
    if (payableError) return c.json({ error: payableError.message }, 500);
    let total = 0;
    const lineIds: string[] = [];
    const lines = (payable || []).flatMap((row: { party_id?: string; amount_minor?: number; line_ids?: string[] }) => {
      const amount = Number(row.amount_minor || 0);
      if (amount <= 0 || !row.party_id) return [];
      total += amount;
      for (const id of row.line_ids || []) lineIds.push(String(id));
      return [{ party_id: row.party_id, amount_minor: amount, reason: "Unpaid balance carried to this batch" }];
    });
    const { data: batch, error } = await publicDb().schema("rush_money").from("payout_batches").insert({
      party_type: partyType,
      period_start: periodStart,
      period_end: periodEnd,
      status: "prepared",
      total_minor: total,
      rail: "unconfigured",
      created_by: admin.id,
    }).select().single();
    if (error || !batch) return c.json({ error: error?.message || "Could not prepare the batch" }, 500);
    if (lines.length) {
      const inserted = await publicDb().schema("rush_money").from("payout_lines").insert(lines.map((line) => ({ ...line, batch_id: batch.id })));
      if (inserted.error) return c.json({ error: inserted.error.message }, 500);
      for (const line of lines) {
        await publicDb().rpc("rush_post_journal", {
          p_idempotency_key: `payout-hold:${batch.id}:${line.party_id}`,
          p_event_type: "payout_in_flight",
          p_order_id: null,
          p_correlation_id: batch.id,
          p_lines: [
            { kind, party_type: partyType, party_id: line.party_id, component: partyType === "merchant" ? "food" : "delivery", amount_minor: line.amount_minor },
            { kind: "payouts_in_flight", party_type: partyType, party_id: line.party_id, component: "batch", amount_minor: -line.amount_minor },
          ],
          p_actor_type: "admin",
          p_actor_id: admin.id,
          p_reason: "Moved to payout in progress",
          p_evidence: { periodStart, periodEnd },
          p_policy_version: POLICY_VERSION,
        });
      }
      await publicDb().rpc("rush_lock_lines", {
        p_batch_id: batch.id,
        p_line_ids: lineIds,
      });
    }
    const exportEnabled = await flagOn("payout_export");
    return c.json({
      batch,
      lineCount: lines.length,
      exportEnabled,
      words: exportEnabled
        ? "This week is ready. A second finance person must approve it before it is paid."
        : "Sending stays off until a payout method is chosen.",
    });
  });

  app.post("/admin/rush-money/payout-batches/:id/approve", async (c) => {
    const admin = await requireProductAdmin(c, "dash");
    if (admin instanceof Response) return admin;
    if (!admin.roles.some((role) => ["finance_approver", "platform_owner", "superadmin"].includes(role))) {
      return c.json({ error: "A finance approver must confirm this batch" }, 403);
    }
    const batchId = c.req.param("id");
    const db = publicDb().schema("rush_money");
    const { data: batch } = await db.from("payout_batches").select("created_by").eq("id", batchId).maybeSingle();
    if (batch?.created_by && batch.created_by === admin.id) {
      return c.json({ error: "A different person must approve this batch" }, 409);
    }
    await db.from("payout_approvals").insert({ batch_id: batchId, actor_id: admin.id });
    const { error } = await db.from("payout_batches").update({ status: "approved" }).eq("id", batchId).eq("status", "prepared");
    if (error) return c.json({ error: "A second person must approve this batch before it can be paid" }, 409);
    return c.json({ approved: true });
  });

  async function loadBatch(batchId: string) {
    const { data } = await publicDb().schema("rush_money").from("payout_batches").select("*").eq("id", batchId).maybeSingle();
    return data as Record<string, unknown> | null;
  }

  function csvCell(value: unknown): string {
    const text = String(value ?? "");
    if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
    return text;
  }

  async function payeeAccount(partyType: string, partyId: string) {
    const table = partyType === "courier" ? "courier_bank_accounts" : "merchant_bank_accounts";
    const idColumn = partyType === "courier" ? "courier_id" : "merchant_id";
    const { data } = await publicDb().schema("payments").from(table)
      .select("id, account_holder_name, bank_name, branch, account_number, account_type, is_verified")
      .eq(idColumn, partyId)
      .eq("is_default", true)
      .maybeSingle();
    if (!data) return null;
    const accountNumber = await bankAccountNumber(partyType, String(data.id), data.account_number);
    return {
      account_holder_name: data.account_holder_name as string | undefined,
      bank_name: data.bank_name as string | undefined,
      branch: data.branch as string | undefined,
      account_number: accountNumber,
      account_type: data.account_type as string | undefined,
      is_verified: data.is_verified as boolean | undefined,
    };
  }

  function accountReady(row: { account_holder_name?: string; bank_name?: string; branch?: string; account_number?: string; account_type?: string; is_verified?: boolean } | null): boolean {
    if (!row?.is_verified) return false;
    return [row.account_holder_name, row.bank_name, row.branch, row.account_number, row.account_type]
      .every((value) => String(value || "").trim().length > 0);
  }

  function payoutFile(
    rows: Array<{ name: string; bank: string; branch: string; accountNumber: string; accountType: string; amountMinor: number; partyId: string }>,
    batchId: string,
  ): string {
    const lines = ["name,bank,branch,account_number,account_type,amount_jmd,reference"];
    for (const row of rows) {
      lines.push([
        row.name,
        row.bank,
        row.branch,
        row.accountNumber,
        row.accountType,
        (row.amountMinor / 100).toFixed(2),
        `payout-${batchId}-${row.partyId}`,
      ].map(csvCell).join(","));
    }
    return lines.join("\n");
  }

  async function releaseHeldLine(batch: Record<string, unknown>, line: { id?: string; party_id?: string; amount_minor?: number }, actorId: string) {
    const partyType = String(batch.party_type || "merchant");
    const kind = partyType === "merchant" ? "merchant_payable" : "courier_earnings";
    const component = partyType === "merchant" ? "food" : "delivery";
    const minor = Number(line.amount_minor || 0);
    const { error: journalError } = await publicDb().rpc("rush_post_journal", {
      p_idempotency_key: `payout-hold-release:${batch.id}:${line.party_id}`,
      p_event_type: "payout_returned",
      p_order_id: null,
      p_correlation_id: batch.id,
      p_lines: [
        { kind: "payouts_in_flight", party_type: partyType, party_id: line.party_id, component: "batch", amount_minor: minor },
        { kind, party_type: partyType, party_id: line.party_id, component, amount_minor: -minor },
      ],
      p_actor_type: "admin",
      p_actor_id: actorId,
      p_reason: "Held until the bank account is ready",
      p_evidence: { batchId: batch.id },
      p_policy_version: POLICY_VERSION,
    });
    if (journalError) throw new Error(journalError.message);
    await publicDb().schema("rush_money").from("payout_lines").delete().eq("id", line.id);
  }

  app.get("/admin/rush-money/payout-batches/:id/file", async (c) => {
    const admin = await requireProductAdmin(c, "dash");
    if (admin instanceof Response) return admin;
    if (!canMoveMoney(admin.roles)) return c.json({ error: "A finance approver must download this file" }, 403);
    const batch = await loadBatch(c.req.param("id"));
    if (!batch) return c.json({ error: "Batch not found" }, 404);
    const { data: lines } = await publicDb().schema("rush_money").from("payout_lines").select("party_id, amount_minor").eq("batch_id", batch.id);
    const payable = [];
    for (const line of lines || []) {
      const account = await payeeAccount(String(batch.party_type || "merchant"), String(line.party_id));
      if (!accountReady(account) || !account) continue;
      payable.push({
        name: String(account.account_holder_name),
        bank: String(account.bank_name),
        branch: String(account.branch),
        accountNumber: String(account.account_number),
        accountType: String(account.account_type),
        amountMinor: Number(line.amount_minor || 0),
        partyId: String(line.party_id),
      });
    }
    return c.json({ filename: `payout-${batch.id}.csv`, csv: payoutFile(payable, String(batch.id)), status: batch.status });
  });

  app.post("/admin/rush-money/payout-batches/:id/export", async (c) => {
    const admin = await requireProductAdmin(c, "dash");
    if (admin instanceof Response) return admin;
    if (!canMoveMoney(admin.roles)) return c.json({ error: "A finance approver must download this file" }, 403);
    if (!await flagOn("payout_export")) return c.json({ error: "Sending stays off until a payout method is chosen" }, 409);
    const batchId = c.req.param("id");
    const batch = await loadBatch(batchId);
    if (!batch) return c.json({ error: "Batch not found" }, 404);
    if (batch.created_by && batch.created_by === admin.id) return c.json({ error: "A different person must send this batch" }, 409);
    const { data: lines } = await publicDb().schema("rush_money").from("payout_lines").select("id, party_id, amount_minor").eq("batch_id", batchId);
    if (!["approved", "exported", "sent", "paid"].includes(String(batch.status))) {
      return c.json({ error: "Approve this batch before downloading the file" }, 409);
    }
    const payable = [];
    const held: string[] = [];
    for (const line of lines || []) {
      const account = await payeeAccount(String(batch.party_type || "merchant"), String(line.party_id));
      if (accountReady(account) && account) {
        payable.push({
          name: String(account.account_holder_name),
          bank: String(account.bank_name),
          branch: String(account.branch),
          accountNumber: String(account.account_number),
          accountType: String(account.account_type),
          amountMinor: Number(line.amount_minor || 0),
          partyId: String(line.party_id),
        });
        continue;
      }
      if (batch.status !== "approved") continue;
      try {
        await releaseHeldLine(batch, line, admin.id);
      } catch (error) {
        return c.json({ error: error instanceof Error ? error.message : "Could not hold this payee" }, 500);
      }
      held.push(String(line.party_id));
    }
    if (batch.status === "approved") {
      if (!payable.length) {
        await publicDb().schema("rush_money").from("payout_batches").update({ total_minor: 0 }).eq("id", batchId);
        return c.json({
          csv: "",
          held,
          status: "approved",
          words: "Nobody in this batch has a bank account that is ready. They stay owed until next week.",
        });
      }
      const { error } = await publicDb().schema("rush_money").from("payout_batches").update({
        status: "exported",
        rail: "bank_file",
        exported_by: admin.id,
        total_minor: payable.reduce((sum, row) => sum + row.amountMinor, 0),
      }).eq("id", batchId).eq("status", "approved");
      if (error) return c.json({ error: "A second person must approve this batch before the file can be downloaded" }, 409);
    }
    return c.json({
      filename: `payout-${batchId}.csv`,
      csv: payoutFile(payable, batchId),
      held,
      status: batch.status === "approved" ? "exported" : batch.status,
      words: held.length ? `${held.length} people wait until next week. Their bank account is not ready.` : "Payment file ready.",
    });
  });

  app.post("/admin/rush-money/payout-batches/:id/sent", async (c) => {
    const admin = await requireProductAdmin(c, "dash");
    if (admin instanceof Response) return admin;
    if (!canMoveMoney(admin.roles)) return c.json({ error: "A finance approver must mark this sent" }, 403);
    const batch = await loadBatch(c.req.param("id"));
    if (!batch || batch.status !== "exported") return c.json({ error: "Download the file before marking it sent" }, 409);
    if (batch.exported_by && batch.exported_by === admin.id) return c.json({ error: "A different person must mark this sent" }, 409);
    const { error } = await publicDb().schema("rush_money").from("payout_batches").update({
      status: "sent",
      sent_by: admin.id,
    }).eq("id", batch.id).eq("status", "exported");
    if (error) return c.json({ error: "This batch could not be marked sent" }, 409);
    return c.json({ sent: true });
  });

  app.post("/admin/rush-money/payout-batches/:id/paid", async (c) => {
    const admin = await requireProductAdmin(c, "dash");
    if (admin instanceof Response) return admin;
    if (!canMoveMoney(admin.roles)) return c.json({ error: "A finance approver must mark this paid" }, 403);
    const batch = await loadBatch(c.req.param("id"));
    if (!batch || batch.status !== "sent") return c.json({ error: "Mark the file sent before marking it paid" }, 409);
    if (batch.sent_by === admin.id || batch.exported_by === admin.id) {
      return c.json({ error: "A different person must mark this paid" }, 409);
    }
    const { data: lines } = await publicDb().schema("rush_money").from("payout_lines").select("party_id, amount_minor").eq("batch_id", batch.id);
    const partyType = String(batch.party_type || "merchant");
    for (const line of lines || []) {
      const minor = Number(line.amount_minor || 0);
      if (minor <= 0 || !line.party_id) continue;
      const { error: journalError } = await publicDb().rpc("rush_post_journal", {
        p_idempotency_key: `payout-paid:${batch.id}:${line.party_id}`,
        p_event_type: "payout_paid",
        p_order_id: null,
        p_correlation_id: batch.id,
        p_lines: [
          { kind: "payouts_in_flight", party_type: partyType, party_id: line.party_id, component: "batch", amount_minor: minor },
          { kind: "bank", party_type: "platform", party_id: null, component: "", amount_minor: -minor },
        ],
        p_actor_type: "admin",
        p_actor_id: admin.id,
        p_reason: "Payout left the bank",
        p_evidence: { batchId: batch.id },
        p_policy_version: POLICY_VERSION,
      });
      if (journalError) return c.json({ error: journalError.message }, 500);
    }
    const { error } = await publicDb().schema("rush_money").from("payout_batches").update({
      status: "paid",
      paid_by: admin.id,
    }).eq("id", batch.id).eq("status", "sent");
    if (error) return c.json({ error: "This batch could not be marked paid" }, 409);
    return c.json({ paid: true });
  });

  app.post("/admin/rush-money/payout-batches/:id/returned", async (c) => {
    const admin = await requireProductAdmin(c, "dash");
    if (admin instanceof Response) return admin;
    if (!canMoveMoney(admin.roles)) return c.json({ error: "A finance approver must return this batch" }, 403);
    const batch = await loadBatch(c.req.param("id"));
    if (!batch || !["exported", "sent"].includes(String(batch.status))) {
      return c.json({ error: "Only a file that has not been marked paid can be returned" }, 409);
    }
    const partyType = String(batch.party_type || "merchant");
    const kind = partyType === "merchant" ? "merchant_payable" : "courier_earnings";
    const component = partyType === "merchant" ? "food" : "delivery";
    const { data: lines } = await publicDb().schema("rush_money").from("payout_lines").select("party_id, amount_minor").eq("batch_id", batch.id);
    for (const line of lines || []) {
      const minor = Number(line.amount_minor || 0);
      if (minor <= 0 || !line.party_id) continue;
      const { error: journalError } = await publicDb().rpc("rush_post_journal", {
        p_idempotency_key: `payout-return:${batch.id}:${line.party_id}`,
        p_event_type: "payout_returned",
        p_order_id: null,
        p_correlation_id: batch.id,
        p_lines: [
          { kind: "payouts_in_flight", party_type: partyType, party_id: line.party_id, component: "batch", amount_minor: minor },
          { kind, party_type: partyType, party_id: line.party_id, component, amount_minor: -minor },
        ],
        p_actor_type: "admin",
        p_actor_id: admin.id,
        p_reason: "Payout returned to what is owed",
        p_evidence: { batchId: batch.id },
        p_policy_version: POLICY_VERSION,
      });
      if (journalError) return c.json({ error: journalError.message }, 500);
    }
    const { error } = await publicDb().schema("rush_money").from("payout_batches").update({ status: "returned" })
      .eq("id", batch.id)
      .in("status", ["exported", "sent"]);
    if (error) return c.json({ error: "This batch could not be returned" }, 409);
    return c.json({ returned: true });
  });

  app.post("/admin/rush-money/chargebacks", async (c) => {
    const admin = await requireProductAdmin(c, "dash");
    if (admin instanceof Response) return admin;
    if (!canMoveMoney(admin.roles)) return c.json({ error: "A finance approver must open a card dispute" }, 403);
    const body = await c.req.json().catch(() => ({}));
    const { data, error } = await publicDb().schema("rush_money").from("chargebacks").insert({
      order_id: body.orderId,
      provider_ref: body.providerRef,
      reason_code: body.reasonCode,
      amount_minor: Math.round(Number(body.amount) * 100),
      deadline: body.deadline,
      status: "open",
    }).select().single();
    if (error) return c.json({ error: error.message }, 500);
    const minor = Math.round(Number(body.amount) * 100);
    if (minor > 0) {
      await publicDb().rpc("rush_post_journal", {
        p_idempotency_key: `chargeback:${data.id}`,
        p_event_type: "chargeback_reserve",
        p_order_id: body.orderId,
        p_correlation_id: data.id,
        p_lines: [
          { kind: "chargeback_reserve", party_type: "platform", party_id: null, component: "open", amount_minor: minor },
          { kind: "gateway_clearing", party_type: "platform", party_id: null, component: "wipay", amount_minor: -minor },
        ],
        p_actor_type: "admin",
        p_actor_id: admin.id,
        p_reason: "Card dispute opened",
        p_evidence: { reasonCode: body.reasonCode },
        p_policy_version: POLICY_VERSION,
      });
    }
    return c.json({ chargeback: data, openedBy: admin.id, words: "A reserve is held until the dispute is decided." });
  });

  app.post("/admin/rush-money/chargebacks/:id/outcome", async (c) => {
    const admin = await requireProductAdmin(c, "dash");
    if (admin instanceof Response) return admin;
    if (!canMoveMoney(admin.roles)) return c.json({ error: "A finance approver must decide a card dispute" }, 403);
    const body = await c.req.json().catch(() => ({}));
    const outcome = body.outcome === "won" ? "won" : body.outcome === "lost" ? "lost" : "";
    if (!outcome) return c.json({ error: "Say whether the dispute was won or lost" }, 400);
    const db = publicDb().schema("rush_money");
    const { data: row } = await db.from("chargebacks").select("*").eq("id", c.req.param("id")).maybeSingle();
    if (!row) return c.json({ error: "Dispute not found" }, 404);
    if (!["open", "fighting"].includes(String(row.status))) {
      return c.json({ error: "This dispute is already decided" }, 409);
    }
    const minor = Number(row.amount_minor || 0);
    let fault = String(body.fault || "platform");
    if (!["customer", "merchant", "courier", "platform"].includes(fault)) fault = "platform";
    if (row.order_id && (fault === "courier" || fault === "merchant")) {
      const { data: order } = await deps.getServiceSupabase().from("orders").select("courier_id, merchant_id").eq("id", row.order_id).maybeSingle();
      if (fault === "courier" && !body.courierId) body.courierId = order?.courier_id;
      if (fault === "merchant" && !body.merchantId) body.merchantId = order?.merchant_id;
    }
    const appealUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    if (outcome === "lost" && fault === "courier" && body.courierId) {
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { count } = await publicDb().schema("rush_money").from("journals")
        .select("id", { count: "exact", head: true })
        .eq("event_type", "chargeback_loss")
        .gte("created_at", since)
        .contains("evidence", { courierId: body.courierId });
      if ((count || 0) > 0) {
        return c.json({ error: "This courier already has a deduction this week. A person must review it.", appealUntil }, 409);
      }
    }
    const { data: claimed } = await db.from("chargebacks").update({ status: outcome, outcome }).eq("id", row.id).in("status", ["open", "fighting"]).select().maybeSingle();
    if (!claimed) return c.json({ error: "This dispute is already decided" }, 409);
    if (minor > 0 && outcome === "won") {
      await publicDb().rpc("rush_post_journal", {
        p_idempotency_key: `chargeback-outcome:${row.id}`,
        p_event_type: "chargeback_won",
        p_order_id: row.order_id,
        p_correlation_id: row.id,
        p_lines: [
          { kind: "gateway_clearing", party_type: "platform", party_id: null, component: "wipay", amount_minor: minor },
          { kind: "chargeback_reserve", party_type: "platform", party_id: null, component: "open", amount_minor: -minor },
        ],
        p_actor_type: "admin",
        p_actor_id: admin.id,
        p_reason: "Card dispute won. The reserve is released.",
        p_evidence: {},
        p_policy_version: POLICY_VERSION,
      });
    }
    if (outcome === "lost" && minor > 0) {
      const charge = fault === "merchant" && body.merchantId
        ? { kind: "merchant_receivable", party_type: "merchant", party_id: body.merchantId, component: "fault", amount_minor: minor }
        : fault === "courier" && body.courierId
          ? { kind: "courier_earnings", party_type: "courier", party_id: body.courierId, component: "delivery", amount_minor: minor }
          : { kind: "platform_cost", party_type: "platform", party_id: null, component: "subsidy", amount_minor: minor };
      await publicDb().rpc("rush_post_journal", {
        p_idempotency_key: `chargeback-outcome:${row.id}`,
        p_event_type: "chargeback_loss",
        p_order_id: row.order_id,
        p_correlation_id: row.id,
        p_lines: [charge, { kind: "chargeback_reserve", party_type: "platform", party_id: null, component: "open", amount_minor: -minor }],
        p_actor_type: "admin",
        p_actor_id: admin.id,
        p_reason: "Card dispute lost. The party at fault is charged once.",
        p_evidence: { appealUntil, courierId: body.courierId || null, fault, amountMinor: minor },
        p_policy_version: POLICY_VERSION,
      });
    }
    return c.json({
      words: outcome === "won"
        ? "The dispute was won. The reserve can be released."
        : "The dispute was lost. The party at fault is charged once. A courier can appeal for 7 days.",
    });
  });

  app.get("/admin/rush-money/remittance-reports", async (c) => {
    const admin = await requireProductAdmin(c, "dash");
    if (admin instanceof Response) return admin;
    const serviceSb = deps.getServiceSupabase();
    const { data } = await serviceSb.from("courier_remittance_settlements")
      .select("id, courier_id, amount_minor, method, status, external_ref, created_at")
      .eq("status", "pending_confirmation")
      .order("created_at", { ascending: false })
      .limit(50);
    const reports = data || [];
    const courierIds = [...new Set(reports.map((row: { courier_id?: string }) => row.courier_id).filter(Boolean))];
    const balances = new Map<string, number>();
    if (courierIds.length) {
      const { data: accounts } = await serviceSb.from("courier_remittance_accounts")
        .select("courier_id, balance_minor")
        .in("courier_id", courierIds);
      for (const account of accounts || []) balances.set(String(account.courier_id), Number(account.balance_minor || 0));
    }
    return c.json({
      reports: reports.map((row: { courier_id?: string }) => ({
        ...row,
        balance_minor: balances.get(String(row.courier_id)) ?? 0,
      })),
    });
  });

  app.post("/admin/rush-money/remittance-reports/:id/decide", async (c) => {
    const admin = await requireProductAdmin(c, "dash");
    if (admin instanceof Response) return admin;
    if (!canMoveMoney(admin.roles)) return c.json({ error: "A finance approver must decide this report" }, 403);
    const body = await c.req.json().catch(() => ({}));
    const accept = body.decision === "confirm";
    const serviceSb = deps.getServiceSupabase();
    const { data: report } = await serviceSb.from("courier_remittance_settlements").select("*").eq("id", c.req.param("id")).maybeSingle();
    if (!report || report.status !== "pending_confirmation") return c.json({ error: "Report not found" }, 404);
    if (!accept) {
      const { error } = await serviceSb.from("courier_remittance_settlements")
        .update({ status: "void", notes: "Finance rejected this report" })
        .eq("id", report.id)
        .eq("status", "pending_confirmation");
      if (error) return c.json({ error: error.message }, 500);
      return c.json({ words: "Report rejected. No money moved." });
    }
    if (body.expectedBalanceMinor == null || !Number.isFinite(Number(body.expectedBalanceMinor))) {
      return c.json({ error: "Send the courier's current balance" }, 400);
    }
    const { settleRemittance } = await import("../remittance/settleRemittance.ts");
    const settled = await settleRemittance(serviceSb, {
      courierId: String(report.courier_id),
      amountMinor: Number(report.amount_minor || 0),
      method: String(report.method || "lynk"),
      expectedBalanceMinor: Number(body.expectedBalanceMinor),
      idempotencyKey: `self-report:${report.id}`,
      actorId: admin.id,
      notes: "Courier reported a payment",
      externalRef: report.external_ref ? String(report.external_ref) : null,
    });
    if (!settled.ok) return c.json({ error: settled.error, words: "This report was not confirmed." }, settled.status as 400);
    const { error: voidError } = await serviceSb.from("courier_remittance_settlements").update({
      status: "void",
      notes: `Confirmed as settlement ${settled.settlementId}`,
    }).eq("id", report.id);
    if (voidError) return c.json({ error: voidError.message, words: "The payment posted, but the report was not closed." }, 500);
    return c.json({ words: "Payment confirmed. The courier's balance is updated.", settlementId: settled.settlementId });
  });

  app.get("/admin/rush-money/payout-batches", async (c) => {
    const admin = await requireProductAdmin(c, "dash");
    if (admin instanceof Response) return admin;
    const { data } = await publicDb().schema("rush_money").from("payout_batches").select("id, party_type, period_start, period_end, status, total_minor, created_by").order("created_at", { ascending: false }).limit(20);
    return c.json({ batches: data || [], exportEnabled: await flagOn("payout_export") });
  });

  app.post("/internal/rush-money/recon", async (c) => {
    const auth = await authorizeCronOrServiceRole(c.req.raw);
    if (!auth.ok) return c.json({ error: auth.error }, auth.status);
    const db = publicDb();
    let mismatches = 0;
    let backfilled = 0;
    let captureFound = 0;
    for (let page = 0; page < 50; page += 1) {
      const from = page * 100;
      const { data: missing, error } = await db.schema("rush_money").from("v_captures_missing_journal")
        .select("id, amount, order_id")
        .range(from, from + 99);
      if (error || !missing?.length) break;
      captureFound += missing.length;
      for (const txn of missing) {
        if (txn.order_id && Number(txn.amount) > 0) {
          const posted = await db.rpc("rush_post_journal", {
            p_idempotency_key: `capture:${txn.id}`,
            p_event_type: "capture",
            p_order_id: txn.order_id,
            p_correlation_id: txn.id,
            p_lines: captureLines(String(txn.order_id), Number(txn.amount)),
            p_actor_type: "system",
            p_reason: "Backfill capture",
            p_evidence: {},
            p_policy_version: null,
          });
          if (!posted.error) {
            backfilled += 1;
            continue;
          }
        }
        mismatches += 1;
        await db.schema("rush_money").from("recon_exceptions").upsert({
          source: "wipay",
          reference: String(txn.id),
          detail: "Completed card payment has no capture journal",
        }, { onConflict: "source,reference" });
      }
      if (missing.length < 100) break;
    }
    let settleFound = 0;
    let settleFixed = 0;
    for (let page = 0; page < 50; page += 1) {
      const from = page * 100;
      const { data: waiting, error } = await db.schema("rush_money").from("v_orders_missing_settle")
        .select("id")
        .range(from, from + 99);
      if (error || !waiting?.length) break;
      settleFound += waiting.length;
      for (const order of waiting) {
        await settleDeliveredOrder(deps.getServiceSupabase(), String(order.id));
        settleFixed += 1;
      }
      if (waiting.length < 100) break;
    }
    let restaurantsToppedUp = 0;
    const { data: cashOrders } = await deps.getServiceSupabase().from("orders")
      .select("id, total, cash_collected_minor, payment_method, merchant_id, courier_id, platform_fee, service_fee, processing_fee, delivery_fee, tip, courier_tip_net, subtotal, discount, merchant_commission_amount, delivery_fee_platform_amount, delivery_fee_courier_amount, peak_pay_amount, tax_food_jmd, tax_platform_jmd, small_order_fee")
      .in("payment_method", ["cash", "cod"])
      .in("money_state", ["settled", "short_collected"])
      .limit(200);
    for (const order of cashOrders || []) {
      const totalMinor = Math.round(Number(order.total || 0) * 100);
      const collectedMinor = Number(order.cash_collected_minor || 0);
      if (!order.id || collectedMinor <= 0 || collectedMinor >= totalMinor) continue;
      const { data: journals } = await db.schema("rush_money").from("journals")
        .select("id")
        .eq("order_id", order.id)
        .in("event_type", ["settle_order", "short_cash_merchant_topup"]);
      const journalIds = (journals || []).map((row: { id?: string }) => String(row.id || "")).filter(Boolean);
      if (!journalIds.length) continue;
      const { data: foodLines } = await db.schema("rush_money").from("lines")
        .select("amount_minor, account_id")
        .in("journal_id", journalIds)
        .eq("component", "food");
      const accountIds = [...new Set((foodLines || []).map((row: { account_id?: string }) => String(row.account_id || "")).filter(Boolean))];
      const { data: accounts } = accountIds.length
        ? await db.schema("rush_money").from("accounts").select("id, kind").in("id", accountIds)
        : { data: [] };
      const merchantAccounts = new Set((accounts || []).filter((row: { kind?: string }) => row.kind === "merchant_payable").map((row: { id?: string }) => String(row.id)));
      const credited = -((foodLines || []) as Array<{ amount_minor?: number; account_id?: string }>)
        .filter((row) => merchantAccounts.has(String(row.account_id)))
        .reduce((sum, row) => sum + Number(row.amount_minor || 0), 0);
      const topUp = merchantShortTopUpLines(order as DashOrderFeeFields, credited);
      if (!topUp.length) continue;
      const { error: topUpError } = await db.rpc("rush_post_journal", {
        p_idempotency_key: `short-cash-merchant-topup:${order.id}`,
        p_event_type: "short_cash_merchant_topup",
        p_order_id: order.id,
        p_correlation_id: null,
        p_lines: topUp,
        p_actor_type: "system",
        p_reason: "Restaurant paid in full after a short cash collection",
        p_evidence: { alreadyCreditedMinor: credited },
        p_policy_version: null,
      });
      if (!topUpError) restaurantsToppedUp += 1;
      else mismatches += 1;
    }
    const summary = { mismatches, backfilled, captureFound, settleFound, settleFixed, restaurantsToppedUp };
    const { error: reconError } = await db.schema("rush_money").from("recon_runs").insert({
      capture_found: captureFound,
      settle_found: settleFound,
      settle_fixed: settleFixed,
      mismatches,
      backfilled,
      detail: summary,
    });
    if (reconError) console.error("[rush-money] recon run", reconError.message);
    return c.json(summary);
  });

  app.get("/admin/rush-money/orders/:id/evidence", async (c) => {
    const admin = await requireProductAdmin(c, "dash");
    if (admin instanceof Response) return admin;
    const orderId = c.req.param("id");
    const db = deps.getServiceSupabase();
    const { data: order } = await db.from("orders").select("id, order_number, delivery_lat, delivery_lng").eq("id", orderId).maybeSingle();
    if (!order) return c.json({ error: "Order not found" }, 404);
    const { data: attempts } = await db.from("delivery_attempts").select("attempt_type, at, latitude, longitude, photo_url, wait_seconds").eq("order_id", orderId).order("at");
    const { data: issues } = await db.from("customer_order_issues").select("issue_type, notes, photo_url, created_at").eq("order_id", orderId).order("created_at");
    const rows = attempts || [];
    const firstContact = rows.find((row: { attempt_type?: string }) => row.attempt_type === "call" || row.attempt_type === "sms");
    const photo = rows.find((row: { attempt_type?: string }) => row.attempt_type === "photo");
    let waitWords = "No wait is recorded.";
    if (firstContact?.at && photo?.at) {
      const minutes = Math.max(0, Math.round((new Date(String(photo.at)).getTime() - new Date(String(firstContact.at)).getTime()) / 60000));
      waitWords = `The courier waited ${minutes} minutes between the first call or text and the photo.`;
    }
    const pinWords = order.delivery_lat != null && order.delivery_lng != null
      ? "A drop-off pin is on the order."
      : "This order has no drop-off pin.";
    return c.json({
      orderNumber: order.order_number,
      waitWords,
      pinWords,
      photo: photo?.photo_url || issues?.[0]?.photo_url || null,
      attempts: rows,
      issues: issues || [],
      dropoff: order.delivery_lat != null ? { lat: Number(order.delivery_lat), lng: Number(order.delivery_lng) } : null,
    });
  });

  app.get("/admin/rush-money/chargebacks", async (c) => {
    const admin = await requireProductAdmin(c, "dash");
    if (admin instanceof Response) return admin;
    const { data } = await publicDb().schema("rush_money").from("chargebacks").select("id, order_id, amount_minor, deadline, status, reason_code, created_at").order("created_at", { ascending: false }).limit(50);
    const rows = data || [];
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);
    const decided = rows.filter((row: { status?: string; created_at?: string }) => {
      if (row.status !== "won" && row.status !== "lost") return false;
      return new Date(String(row.created_at || 0)).getTime() >= monthStart.getTime();
    });
    const lost = decided.filter((row: { status?: string }) => row.status === "lost").length;
    const warning = decided.length >= 10 && lost / decided.length > 0.01;
    return c.json({
      chargebacks: rows,
      words: warning
        ? `${lost} of ${decided.length} chargebacks decided this month were lost. That is above the monthly warning.`
        : decided.length
          ? `${lost} of ${decided.length} chargebacks decided this month were lost.`
          : "No chargebacks were decided this month.",
    });
  });

  app.get("/admin/rush-money/risk", async (c) => {
    const admin = await requireProductAdmin(c, "dash");
    if (admin instanceof Response) return admin;
    const { data } = await publicDb().schema("risk").from("cases").select("*").eq("status", "open").limit(50);
    return c.json({ cases: data || [] });
  });

  app.post("/admin/rush-money/risk/review", async (c) => {
    const admin = await requireProductAdmin(c, "dash");
    if (admin instanceof Response) return admin;
    const body = await c.req.json().catch(() => ({}));
    const effects = riskEffects({
      debtMajor: Number(body.debtMajor || 0),
      completedCardOrders: Number(body.completedCardOrders || 0),
      autoRefunds30d: Number(body.autoRefunds30d || 0),
      autoRefundJmd30d: Number(body.autoRefundJmd30d || 0),
      issues7d: Number(body.issues7d || 0),
      merchantRejectionRate30d: Number(body.merchantRejectionRate30d || 0),
      linkedToBanned: body.linkedToBanned === true && await flagOn("device_linking"),
    });
    if (body.partyId) {
      const inputs = {
        debtMajor: Number(body.debtMajor || 0),
        completedCardOrders: Number(body.completedCardOrders || 0),
        linkedToBanned: body.linkedToBanned === true,
      };
      await publicDb().schema("risk").from("scores").insert({
        party_type: String(body.partyType || "customer"),
        party_id: body.partyId,
        score: effects.length,
        version: "rush-money-2026-10-04",
        inputs,
      });
      if (effects.length) {
        await publicDb().schema("risk").from("cases").insert({
          party_type: String(body.partyType || "customer"),
          party_id: body.partyId,
          reason_code: effects[0].reason,
          owner_id: admin.id,
        });
      }
    }
    return c.json({ effects, bans: "human_only", deviceMatching: "off" });
  });
}
