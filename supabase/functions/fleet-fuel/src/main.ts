/**
 * fleet-fuel — extracted fuel HTTP surface (strangler cutover from make-server-37f42386).
 * Built exclusively via createFleetFunction (ADR-0020).
 */
import { createFleetFunction } from "../../_shared/edgeKernel.ts";
import fuelApp from "../../_fleet-server/fuel_controller.tsx";
import { sealFuelWeek } from "../../_fleet-server/fuel_week_seal.ts";
import { beginSealAttempt, completeSealAttempt } from "../../_fleet-server/week_seal_log.ts";

const app = createFleetFunction({
  slug: "fleet-fuel",
  pathStyle: "slug",
  domainApp: fuelApp,
  registerParentRoutes: (parent) => {
    parent.post("/internal/seal-fuel-week", async (c) => {
      const body = await c.req.json();
      const organizationId = String(body.organizationId ?? "");
      const weekKey = String(body.weekKey ?? "");
      const idempotencyKey =
        c.req.header("Idempotency-Key") ||
        c.req.header("idempotency-key") ||
        `${organizationId}:${weekKey}:fuel:legacy`;
      const correlationId =
        c.req.header("X-Request-Id") || crypto.randomUUID();

      try {
        const prior = await beginSealAttempt({
          organizationId,
          weekKey,
          lane: "fuel",
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

        const result = await sealFuelWeek({
          organizationId,
          weekKey,
          actorId: body.actorId ? String(body.actorId) : undefined,
          force: Boolean(body.force),
          asOf: body.asOf ? String(body.asOf) : undefined,
          amountsByDriver: body.amountsByDriver,
        });

        await completeSealAttempt({
          organizationId,
          weekKey,
          lane: "fuel",
          idempotencyKey,
          correlationId,
          status: "succeeded",
          resultJson: result,
        });
        return c.json(result);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[fleet-fuel] seal-fuel-week failed", msg);
        await completeSealAttempt({
          organizationId,
          weekKey,
          lane: "fuel",
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
