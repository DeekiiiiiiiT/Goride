/**
 * fleet-toll — extracted toll HTTP surface (ADR-0021 F1).
 * Built exclusively via createFleetFunction (ADR-0020).
 */
import { createFleetFunction } from "../../_shared/edgeKernel.ts";
import tollApp from "../../_fleet-server/toll_controller.tsx";
import tollPeriodApp from "../../_fleet-server/toll_period_controller.tsx";
import { sealTollWeek } from "../../_fleet-server/toll_week_seal.ts";
import { beginSealAttempt, completeSealAttempt } from "../../_fleet-server/week_seal_log.ts";

const app = createFleetFunction({
  slug: "fleet-toll",
  pathStyle: "slug",
  domainApp: tollApp,
  registerParentRoutes: (parent) => {
    parent.route("/", tollPeriodApp);

    parent.post("/internal/seal-toll-week", async (c) => {
      const body = await c.req.json();
      const organizationId = String(body.organizationId ?? "");
      const weekKey = String(body.weekKey ?? "");
      const idempotencyKey =
        c.req.header("Idempotency-Key") ||
        c.req.header("idempotency-key") ||
        `${organizationId}:${weekKey}:toll:legacy`;
      const correlationId =
        c.req.header("X-Request-Id") || crypto.randomUUID();

      try {
        const prior = await beginSealAttempt({
          organizationId,
          weekKey,
          lane: "toll",
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

        const result = await sealTollWeek({
          organizationId,
          weekKey,
          actorId: body.actorId ? String(body.actorId) : undefined,
          force: Boolean(body.force),
          asOf: body.asOf ? String(body.asOf) : undefined,
          chargedAmountsMajor: body.chargedAmountsMajor,
          nettingByDriver: body.nettingByDriver,
        });

        await completeSealAttempt({
          organizationId,
          weekKey,
          lane: "toll",
          idempotencyKey,
          correlationId,
          status: "succeeded",
          resultJson: result,
        });
        return c.json(result);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[fleet-toll] seal-toll-week failed", msg);
        await completeSealAttempt({
          organizationId,
          weekKey,
          lane: "toll",
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
