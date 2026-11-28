import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  APPS,
  appShouldBuild,
  selectSecretsToFire,
} from "./vercel-path-deploy-lib.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function labelsFor(secrets) {
  return APPS.filter((a) => secrets.has(a.secret)).map((a) => a.label).sort();
}

describe("selectSecretsToFire", () => {
  it("fleet-only app path → roam-fleet only", () => {
    const { secrets } = selectSecretsToFire(
      ["apps/fleet/src/App.tsx", "apps/fleet/src/pages/FuelManagement.tsx"],
      { repoRoot: REPO_ROOT },
    );
    assert.deepEqual(labelsFor(secrets), ["roam-fleet"]);
  });

  it("docs-only → nobody", () => {
    const { secrets } = selectSecretsToFire(["docs/vercel-path-deploy-setup.md"], {
      repoRoot: REPO_ROOT,
    });
    assert.equal(secrets.size, 0);
  });

  it("lockfile-only → nobody", () => {
    const { secrets } = selectSecretsToFire(["pnpm-lock.yaml"], {
      repoRoot: REPO_ROOT,
    });
    assert.equal(secrets.size, 0);
  });

  it("root package.json alone → nobody", () => {
    const { secrets } = selectSecretsToFire(["package.json"], {
      repoRoot: REPO_ROOT,
    });
    assert.equal(secrets.size, 0);
  });

  it("packages/fuel-core → fleet, driver, dominion only", () => {
    const { secrets } = selectSecretsToFire(
      ["packages/fuel-core/src/index.ts"],
      { repoRoot: REPO_ROOT },
    );
    assert.deepEqual(labelsFor(secrets), [
      "roam-dominion",
      "roam-driver",
      "roam-fleet",
    ]);
  });

  it("packages/ui → every app that depends on @roam/ui (not all 10 if some lack it)", () => {
    const { secrets } = selectSecretsToFire(["packages/ui/src/button.tsx"], {
      repoRoot: REPO_ROOT,
    });
    // Every app that is not paused and uses @roam/ui is selected; paused apps never are.
    const expected = APPS.filter((a) => !a.paused).map((a) => a.secret);
    for (const s of ["VERCEL_DEPLOY_HOOK_FLEET", "VERCEL_DEPLOY_HOOK_DRIVER", "VERCEL_DEPLOY_HOOK_DOMINION"]) {
      assert.ok(secrets.has(s), s);
    }
    for (const s of secrets) assert.ok(expected.includes(s), `${s} is paused or unknown`);
    assert.ok(!secrets.has("VERCEL_DEPLOY_HOOK_MISSING"));
  });

  it("paused apps never deploy, even when their own folder changes", () => {
    const { secrets, reasons } = selectSecretsToFire(
      ["apps/dash-customer/src/main.tsx", "packages/types/src/index.ts"],
      { repoRoot: REPO_ROOT },
    );
    for (const app of APPS.filter((a) => a.paused)) assert.ok(!secrets.has(app.secret), app.label);
    assert.ok(reasons.some((r) => r.startsWith("paused:")));
  });
});

describe("appShouldBuild", () => {
  it("skips driver when only fleet files changed", () => {
    assert.equal(
      appShouldBuild(
        "apps/driver",
        ["apps/fleet/src/App.tsx"],
        REPO_ROOT,
      ),
      false,
    );
  });

  it("builds fleet when fleet files changed", () => {
    assert.equal(
      appShouldBuild("apps/fleet", ["apps/fleet/src/App.tsx"], REPO_ROOT),
      true,
    );
  });

  it("builds driver when fuel-core package changes", () => {
    assert.equal(
      appShouldBuild(
        "apps/driver",
        ["packages/fuel-core/src/index.ts"],
        REPO_ROOT,
      ),
      true,
    );
  });

  it("skips haul when fuel-core package changes", () => {
    assert.equal(
      appShouldBuild(
        "apps/haul",
        ["packages/fuel-core/src/index.ts"],
        REPO_ROOT,
      ),
      false,
    );
  });
});
