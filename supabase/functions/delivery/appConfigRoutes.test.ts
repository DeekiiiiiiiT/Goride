/**
 * Contract: /app-config must never leak betaUserIds (enterprise.rollouts bags).
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

/** Same strip logic as handleAppConfig — keep in sync with appConfigRoutes.ts */
function stripRolloutBags(
  settings: Record<string, unknown>,
  rolloutKey: string,
): Record<string, unknown> {
  const next = { ...settings };
  delete next[rolloutKey];
  for (const k of Object.keys(next)) {
    if (k.startsWith("enterprise.rollouts.")) delete next[k];
  }
  return next;
}

function buildAppConfigBody(
  app: string,
  settingsIn: Record<string, unknown>,
  rollout: { mode: string; percent: number; enabled: boolean },
) {
  const rolloutKey = `enterprise.rollouts.${app}`;
  const settings = stripRolloutBags(settingsIn, rolloutKey);
  return {
    version: "test",
    app,
    marketId: null,
    settings,
    features: {
      busy: {
        active: false,
        extraEtaMinutes: 0,
        pauseNewRestaurants: false,
        bannerMessage: "",
        autoEndAt: null,
      },
      rollout,
    },
  };
}

Deno.test("app-config body never contains betaUserIds for any app", () => {
  for (const app of ["customer", "courier", "partner"] as const) {
    const leaked = {
      [`enterprise.rollouts.${app}`]: {
        mode: "beta_list",
        percent: 0,
        betaUserIds: ["user-secret-1", "user-secret-2"],
      },
      "courier.signup.vehicle_types": ["bicycle", "car"],
    };
    const body = buildAppConfigBody(app, leaked, {
      mode: "beta_list",
      percent: 0,
      enabled: true,
    });
    const json = JSON.stringify(body);
    assertEquals(json.includes("betaUserIds"), false, `${app}: betaUserIds leaked`);
    assertEquals(json.includes("user-secret-1"), false, `${app}: beta id leaked`);
    assertEquals(
      body.settings[`enterprise.rollouts.${app}`],
      undefined,
      `${app}: rollout bag still in settings`,
    );
    assertEquals(body.features.rollout.enabled, true);
    assertEquals(body.features.rollout.mode, "beta_list");
  }
});
