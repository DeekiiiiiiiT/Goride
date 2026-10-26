import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  displayedPlatformRole,
  dominionAccessDecision,
  dominionLoginDeniedBody,
  hasPlatformOwnerAppRole,
  mergePlatformStaffRole,
  removePlatformStaffRoles,
  userIsFleetManager,
} from "./dominion_access.ts";

Deno.test("dominion login refusal uses the same fields for every cause", () => {
  const body = dominionLoginDeniedBody(4);
  assertEquals(Object.keys(body).sort(), ["attemptsRemaining", "error"]);
  assertEquals(body, { error: "Incorrect credentials", attemptsRemaining: 4 });
  assertEquals("reason" in body, false);
});

Deno.test("dominion login allows a platform role on the trusted app record", () => {
  const owner = dominionAccessDecision({
    app_metadata: { role: "admin", roles: ["platform_owner", "admin", "driver"] },
    user_metadata: { role: "admin" },
  });
  assertEquals(owner, { ok: true, role: "platform_owner" });
});

Deno.test("dominion login ignores a profile field the person can edit", () => {
  assertEquals(
    dominionAccessDecision({
      app_metadata: { roles: ["driver"] },
      user_metadata: { role: "superadmin" },
    }),
    { ok: false, reason: "no_platform_role" },
  );
  assertEquals(
    dominionAccessDecision({
      app_metadata: { roles: ["courier_admin", "fleet_admin"] },
      user_metadata: { role: "superadmin" },
    }).ok,
    false,
  );
});

Deno.test("dominion login still accepts legacy superadmin on the trusted app record", () => {
  assertEquals(
    dominionAccessDecision({ app_metadata: { role: "superadmin" } }),
    { ok: true, role: "superadmin" },
  );
});

Deno.test("owner check reads the trusted app record, not the profile", () => {
  assertEquals(
    hasPlatformOwnerAppRole({
      app_metadata: { roles: ["platform_owner", "admin"] },
      user_metadata: { role: "admin" },
    }),
    true,
  );
  assertEquals(
    hasPlatformOwnerAppRole({ user_metadata: { role: "platform_owner" } }),
    false,
  );
});

Deno.test("fleet manager accepts trusted admin or the old profile admin label", () => {
  assertEquals(
    userIsFleetManager({
      app_metadata: { roles: ["platform_owner", "admin", "driver"] },
      user_metadata: { role: "admin" },
    }),
    true,
  );
  assertEquals(userIsFleetManager({ user_metadata: { role: "admin" } }), true);
  assertEquals(userIsFleetManager({ app_metadata: { roles: ["fleet_owner"] } }), true);
  assertEquals(userIsFleetManager({ user_metadata: { role: "superadmin" } }), false);
  assertEquals(userIsFleetManager({ user_metadata: { role: "driver" } }), false);
});

Deno.test("staff role change keeps fleet and driver roles", () => {
  assertEquals(
    mergePlatformStaffRole(
      { role: "admin", roles: ["admin", "driver", "platform_support"] },
      "platform_analyst",
    ),
    { role: "admin", roles: ["admin", "driver", "platform_analyst"] },
  );
});

Deno.test("removing staff access leaves the other roles in place", () => {
  assertEquals(
    removePlatformStaffRoles({ role: "driver", roles: ["driver", "platform_analyst"] }),
    { role: "driver", roles: ["driver"] },
  );
  assertEquals(
    displayedPlatformRole({ app_metadata: { roles: ["platform_owner", "admin"] } }),
    "platform_owner",
  );
  assertEquals(
    displayedPlatformRole({ user_metadata: { role: "platform_owner" } }),
    null,
  );
});
