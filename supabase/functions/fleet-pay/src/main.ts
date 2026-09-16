/**
 * fleet-pay — settlements, driver financial periods, dispute refunds, payment ledger lines.
 * Week-close conductor stays on the monolith (ADR-0021 F4).
 * Built exclusively via createFleetFunction (ADR-0020).
 */
import { createFleetFunction } from "../../_shared/edgeKernel.ts";
import settlementCommandsApp from "../../_fleet-server/settlement_commands_controller.tsx";
import driverFinancialPeriodApp from "../../_fleet-server/driver_financial_period_controller.tsx";
import disputeRefundApp from "../../_fleet-server/dispute_refund_controller.tsx";
import paymentLedgerLineApp from "../../_fleet-server/payment_ledger_line_controller.tsx";
import { sealEarningsWeek } from "../../_fleet-server/earnings_week_seal.ts";
import { beginSealAttempt, completeSealAttempt } from "../../_fleet-server/week_seal_log.ts";

const app = createFleetFunction({
  slug: "fleet-pay",
  pathStyle: "slug",
  domainApp: settlementCommandsApp,
  registerParentRoutes: (parent) => {
    parent.route("/", driverFinancialPeriodApp);
    parent.route("/", disputeRefundApp);
    parent.route("/", paymentLedgerLineApp);

    parent.post("/internal/seal-earnings-week", async (c) => {
      const body = await c.req.json();
      const organizationId = String(body.organizationId ?? "");
      const weekKey = String(body.weekKey ?? "");
      const idempotencyKey =
        c.req.header("Idempotency-Key") ||
        c.req.header("idempotency-key") ||
        `${organizationId}:${weekKey}:earnings:legacy`;
      const correlationId =
        c.req.header("X-Request-Id") || crypto.randomUUID();

      try {
        const prior = await beginSealAttempt({
          organizationId,
          weekKey,
          lane: "earnings",
          idempotencyKey,
          correlationId,
          requestHash: JSON.stringify({
            organizationId,
            weekKey,
            force: Boolean(body.force),
          }),
        });
        if (prior?.status === "succeeded" && prior.result_json) {
          return c.json(prior.result_json);
        }

        const result = await sealEarningsWeek({
          organizationId,
          weekKey,
          actorId: body.actorId ? String(body.actorId) : undefined,
          force: Boolean(body.force),
          asOf: body.asOf ? String(body.asOf) : undefined,
        });

        await completeSealAttempt({
          organizationId,
          weekKey,
          lane: "earnings",
          idempotencyKey,
          correlationId,
          status: "succeeded",
          resultJson: result,
        });
        return c.json(result);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[fleet-pay] seal-earnings-week failed", msg);
        await completeSealAttempt({
          organizationId,
          weekKey,
          lane: "earnings",
          idempotencyKey,
          correlationId,
          status: "failed",
          lastError: msg,
        }).catch(() => {});
        return c.json({ error: msg }, 500);
      }
    });
  },
});

export default app;
