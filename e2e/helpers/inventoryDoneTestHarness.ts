import { test } from '@playwright/test';
import { applyInventoryDoneSeed, teardownInventoryDone } from './inventoryDoneTestCore';
import { attachInventoryNoLiveGuard, getInventoryNoLiveHits } from './inventoryDoneTestAuth';
import { withInventoryFlagGuard } from './inventoryDoneTestFlags';
import type { Page } from '@playwright/test';

export function defineInventoryDoneTest(
  label: string,
  scenario: string | undefined,
  run: (page: Page) => Promise<void>,
) {
  test.describe(label, () => {
    test.describe.configure({ mode: 'serial' });

    test.beforeAll(() => {
      applyInventoryDoneSeed(scenario);
    });
    test.afterAll(() => {
      teardownInventoryDone();
    });
    test.beforeEach(({ page }) => {
      attachInventoryNoLiveGuard(page);
    });
    test.afterEach(() => {
      const hits = getInventoryNoLiveHits();
      if (hits.length) {
        throw new Error(
          `Inventory E2E must not call live Supabase:\n${hits.slice(0, 10).join('\n')}${hits.length > 10 ? `\n…+${hits.length - 10} more` : ''}`,
        );
      }
    });
    test(label, async ({ page }) => {
      await withInventoryFlagGuard(async () => {
        await run(page);
      });
    });
  });
}
