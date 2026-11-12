import { join } from 'node:path';
import {
  applyInventoryDoneSeed,
  gotoDriverCarKit,
  gotoFleetInventory,
  seedInventoryDriverSession,
  seedInventoryFleetSession,
  teardownInventoryDone,
} from './inventoryDoneTestAuth';
import { INV_DONE_ORG } from './inventoryDoneTestDb';

// Test screenshots go to the git-ignored test-results folder, never into docs/ (the owner never saves them).
export const STITCH_FLEET = join(process.cwd(), 'test-results', 'screen-live', 'roam-fleet-app', 'inventory');
export const STITCH_DRIVER = join(process.cwd(), 'test-results', 'screen-live', 'roam-driver-app', 'car-kit');

export async function saveLiveScreenshot(
  page: import('@playwright/test').Page,
  stitchFolder: string,
  fleet = true,
) {
  const base = fleet ? STITCH_FLEET : STITCH_DRIVER;
  const out = join(base, stitchFolder, 'screen-live.png');
  await page.screenshot({ path: out, fullPage: true });
  return out;
}

export {
  applyInventoryDoneSeed,
  teardownInventoryDone,
  gotoFleetInventory,
  gotoDriverCarKit,
  seedInventoryFleetSession,
  seedInventoryDriverSession,
  INV_DONE_ORG,
};
