import { expect, test } from '@playwright/test';
import { standIn } from './plug-stand-in';

async function bar(page: import('@playwright/test').Page) {
  const nav = page.getByRole('navigation', { name: 'Plug sections' });
  await expect(nav).toBeVisible();
  return (await nav.innerText()).replace(/\s+/g, ' ').trim();
}

test('a signed-in bar matches a signed-out bar when every switch is off', async ({ browser }) => {
  const guest = await browser.newPage();
  await standIn(guest, { flagsOff: true });
  await guest.goto('/#/explore');
  await expect(guest.getByRole('heading', { name: 'Paused for now' })).toBeVisible();
  const guestBar = await bar(guest);

  const member = await browser.newPage();
  await standIn(member, { flagsOff: true, persist: true });
  await member.goto('/#/explore');
  await expect(member.getByRole('heading', { name: 'Paused for now' })).toBeVisible();
  expect(await bar(member)).toBe(guestBar);
  await member.getByRole('button', { name: /Garage/ }).click();
  await expect(member.getByRole('heading', { name: 'Paused for now' })).toBeVisible();
  await guest.close();
  await member.close();
});
