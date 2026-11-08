import type { Page } from "@playwright/test";
import {
  MOCK_CHECKLIST_JOBS,
  MOCK_CHECKLIST_SPECS,
  MOCK_OTHER_PARTS,
  MOCK_SPEC_KEYS,
  vehiclesCaptureFixtureRecords,
  VEHICLES_CAPTURE_MAKERS,
  VEHICLES_CAPTURE_SISTER_ROWS,
} from "./vehiclesCaptureFixtureData";

export async function installVehiclesCaptureMocks(page: Page) {
  const fixtures = vehiclesCaptureFixtureRecords;

  await page.route((url) => {
    const p = url.pathname;
    if (p.includes("/src/") || p.endsWith(".tsx") || p.endsWith(".ts")) return false;
    return p.includes("/admin/vehicle-catalog") && !p.includes("/bulk");
  }, async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    await route.fulfill({
      json: { items: fixtures, total: fixtures.length },
    });
  });

  await page.route((url) => url.pathname.includes("/admin/catalog/makers"), async (route) => {
    await route.fulfill({ json: { items: VEHICLES_CAPTURE_MAKERS } });
  });

  await page.route((url) => url.pathname.includes("/admin/catalog/add-part/sister-vehicles"), async (route) => {
    await route.fulfill({
      json: { items: VEHICLES_CAPTURE_SISTER_ROWS },
    });
  });

  await page.route((url) => url.pathname.includes("/admin/catalog/variants/") && url.pathname.includes("/checklist"), async (route) => {
    await route.fulfill({
      json: {
        specs: MOCK_CHECKLIST_SPECS,
        jobs: MOCK_CHECKLIST_JOBS,
        otherParts: MOCK_OTHER_PARTS,
        supplies: [],
      },
    });
  });

  await page.route((url) => url.pathname.includes("/revisions"), async (route) => {
    await route.fulfill({
      json: {
        items: [
          {
            id: "rev-1",
            createdAt: "2026-11-07T14:00:00.000Z",
            actor: "Deeki T",
            oldRow: { brake_fluid: null },
            newRow: { brake_fluid: "Toyota 2500H-A" },
          },
          {
            id: "rev-2",
            createdAt: "2026-11-06T10:00:00.000Z",
            actor: "Deeki T",
            oldRow: { production_end_year: 2019 },
            newRow: { production_end_year: 2020 },
          },
        ],
      },
    });
  });

  await page.route((url) => url.pathname.includes("/admin/catalog/spec-keys"), async (route) => {
    await route.fulfill({ json: { items: MOCK_SPEC_KEYS } });
  });
}
