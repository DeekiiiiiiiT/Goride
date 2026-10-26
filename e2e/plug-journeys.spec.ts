import { expect, test, type Page } from '@playwright/test';
import { standIn } from './plug-stand-in';

async function wayOut(page: Page) {
  const hash = await page.evaluate(() => location.hash);
  if (hash === '' || hash === '#' || hash === '#/') return;
  await expect(page.locator('[data-plug-tabs], [data-way-out="back"], [data-way-out="primary"]').first()).toBeVisible();
}

async function press(page: Page, name: RegExp) {
  await page.getByRole('button', { name }).first().click();
  await wayOut(page);
}

test.beforeEach(async ({ page }) => {
  await standIn(page);
});

test('eight Plug journeys', async ({ page }) => {
  await page.goto('/#/');
  await page.getByRole('button', { name: /Get Started/ }).click();
  await wayOut(page);

  await press(page, /^Next/);
  await page.getByRole('textbox', { name: /Phone Number/ }).fill('5550199');
  await press(page, /^Continue/);
  await page.getByRole('textbox', { name: /^Code$/ }).fill('123456');
  await press(page, /Verify/);
  await press(page, /Complete Setup/);
  await press(page, /I Agree/);
  await press(page, /^Continue/);
  await page.getByRole('button', { name: /Toyota/ }).first().click();
  await press(page, /Continue with Toyota/);
  await page.getByRole('button', { name: /Roomy/ }).first().click();
  await press(page, /^2019$/);
  await press(page, /Continue with Roomy/);
  await press(page, /Finish & Go to Radar/);
  await press(page, /Go to Home/);
  await expect(page).toHaveURL(/#\/explore/);
  await expect(page.getByRole('navigation', { name: 'Plug sections' })).toBeVisible();

  await page.getByRole('button', { name: /^person Account$/ }).click();
  await wayOut(page);
  await press(page, /Sign Out/);
  await expect(page).toHaveURL(/#\/welcome/);

  await press(page, /Explore without an account/);
  await page.getByRole('button', { name: /Total Half Way Tree/ }).first().click();
  await wayOut(page);
  await press(page, /Directions/);
  await page.getByRole('link', { name: /Waze/ }).click();
  await page.getByRole('button', { name: /Log Fuel Action/ }).click();
  await expect(page.getByRole('dialog', { name: 'Sign in' })).toBeVisible();
  await page.getByRole('textbox', { name: 'Phone' }).fill('5550199');
  await page.getByRole('button', { name: 'Send code' }).click();
  await page.getByRole('textbox', { name: 'Code' }).fill('123456');
  await page.getByRole('button', { name: /^Verify$/ }).click();
  await expect(page).toHaveURL(/#\/fuel/);
  await wayOut(page);

  await press(page, /Type it instead/);
  await press(page, /Confirm & Continue/);
  await press(page, /Save Fuel Log/);
  await expect(page.getByText(/first log|Fuel Logged/i).first()).toBeVisible();
  await press(page, /Fuel History/);
  await expect(page).toHaveURL(/#\/garage\//);

  await press(page, /View All/);
  await press(page, /Log a Service/);
  await press(page, /Mark as Done/);
  await press(page, /Save Service Log/);
  await expect(page).toHaveURL(/schedule/);
  await page.getByRole('button', { name: /directions_car Garage/ }).click();
  await page.getByRole('button', { name: /Overview/ }).first().click();
  await wayOut(page);
  await page.getByRole('button', { name: /Docs/ }).click();
  await wayOut(page);
  await page.getByRole('heading', { name: 'Certificate of Fitness' }).click();
  await expect(page).toHaveURL(/documents\/edit/);
  await press(page, /Save Reminder/);

  await page.getByRole('button', { name: /go back/i }).first().click();
  await page.getByRole('button', { name: /Find Parts/ }).click();
  await wayOut(page);
  await page.getByRole('link', { name: /Brakes/ }).click();
  await wayOut(page);
  await page.getByRole('link', { name: /Tier 1/ }).click();
  await wayOut(page);
  await page.getByRole('button', { name: /Parts stores/ }).click();
  await expect(page).toHaveURL(/#\/explore/);
  await expect(page.getByText('Nearby places')).toBeVisible();

  await page.getByRole('button', { name: /Map It/ }).click();
  await wayOut(page);
  await page.getByRole('radio', { name: /Mechanic/ }).click();
  await wayOut(page);
  await press(page, /confirm pin location/i);
  await press(page, /Snap station/);
  await page.locator('#place-name').fill('Corner shop');
  await press(page, /Submit for Review/);
  await page.getByRole('button', { name: /My Contributions/ }).click();
  await wayOut(page);
  await page.getByRole('button', { name: /Awaiting approval/ }).click();
  await expect(page).toHaveURL(/#\/pending/);
  await press(page, /Withdraw Pin/);
  await page.getByRole('dialog').getByRole('button', { name: /Withdraw Pin/ }).click();

  await page.getByRole('button', { name: /^explore Explore$/ }).click();
  await wayOut(page);
  await page.getByRole('textbox', { name: /Search stations/ }).click();
  await page.getByRole('searchbox', { name: 'Search query' }).fill('Total');
  await page.getByRole('button', { name: /Total Half Way Tree/ }).first().click();
  await expect(page).toHaveURL(/#\/stations\//);
  await page.getByRole('button', { name: /go back/i }).first().click();
  await page.getByRole('button', { name: /^explore Explore$/ }).click();
  await page.getByRole('button', { name: /^toll Tolls$/ }).click();
  await expect(page).toHaveURL(/#\/tolls/);
  await page.getByRole('button', { name: /go back/i }).first().click();
  await page.getByRole('button', { name: /Parish Selection & Alerts/ }).click();
  await expect(page).toHaveURL(/#\/inbox/);
  await page.getByRole('button', { name: /go back/i }).first().click();
  await page.getByRole('button', { name: /^Filters$/ }).click();
  await page.getByRole('button', { name: /show \d+ stations/i }).click();
  await expect(page).toHaveURL(/#\/explore\/list/);

  await page.getByRole('button', { name: /^person Account$/ }).click();
  await page.getByRole('link', { name: /Privacy & Data/ }).click();
  await wayOut(page);
  await press(page, /Download My Data/);
  await page.getByRole('button', { name: /go back/i }).first().click();
  await page.getByRole('link', { name: /App Settings/ }).click();
  await press(page, /Dark/);
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.getByRole('button', { name: /go back/i }).first().click();
  await page.getByRole('link', { name: /Help & Support/ }).click();
  await expect(page).toHaveURL(/#\/help/);
  await page.getByRole('button', { name: /go back/i }).first().click();
  await press(page, /Sign Out/);
  await expect(page).toHaveURL(/#\/welcome/);
});

const SAMPLE_COPY = [
  '123 Hope Road',
  'Rubis Hope Road',
  'Rubis Ultra',
  'RUBIS ULTRA',
  '84,210',
  'Invoice_Dunrobin_8241.jpg',
  'Road Scouts',
  'community XP',
];

test('public screens stay free of sample people', async ({ page }) => {
  const routes = [
    '/explore',
    '/tolls',
    '/stations/st_live',
    '/stations/st_live/directions',
    '/fuel',
    '/fuel/confirm',
    '/garage/added',
    '/garage/car-1/spend',
    '/garage/car-1/log-service',
  ];
  for (const route of routes) {
    await page.goto(`/#${route}`);
    await page.locator('body').waitFor({ state: 'visible' });
    const text = await page.locator('body').innerText();
    for (const phrase of SAMPLE_COPY) {
      expect(text, `${route} shows “${phrase}”`).not.toContain(phrase);
    }
  }
  await page.goto('/#/explore');
  await expect(page.getByText('DEMO')).toHaveCount(0);
  await expect(page.getByText('Tariq Campbell')).toHaveCount(0);
  await expect(page.getByText('Total Half Way Tree').first()).toBeVisible();
  await page.goto('/#/tolls');
  await expect(page.getByText('DEMO')).toHaveCount(0);
  await expect(page.getByText('Tariq Campbell')).toHaveCount(0);
});
