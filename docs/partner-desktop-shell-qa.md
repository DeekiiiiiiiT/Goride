# Partner desktop shell — Phase A QA

Manual checks after App-level `PartnerDesktopShell` rollout.

## Desktop (1280×800)

1. Sign in to Partner.
2. Open **Analytics** from the side nav.
3. Confirm side nav stays visible (Orders, Dashboard, Menu, etc.).
4. Click **Orders** — Queue / Orders desktop view loads (no browser Back, no blank page).
5. Open **Earnings** — side nav still present; Earnings/History tabs visible in-page.
6. Confirm TopBar store Open/Pause toggle works on every tab.

## Mobile (390×844)

1. Bottom nav still shows Dashboard / Orders / Menu / Analytics / Account.
2. Analytics still uses bottom Health/Reviews sub-nav.
3. Hamburger drawer still opens from page headers.
4. No desktop side nav visible.

## Tablet (md–lg, e.g. 820×1180)

1. Bottom nav still visible until `lg`.
2. Analytics Health/Reviews switch via in-page tabs (not only the mobile bottom bar).
3. Earnings Earnings/History via in-page tabs.

## Release note

Do **not** promote “Install Partner on desktop” until Phase C PWA is live **and** Phase D desktop exit-nav smokes are green.
