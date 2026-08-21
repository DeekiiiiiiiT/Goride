# Partner desktop + PWA — release checklist

Use before promoting **Install Roam Partner on desktop** to merchants.

## Nav (must pass first)

- [ ] `pnpm test:e2e:rush:partner:exit-nav` green on **partner-mobile** and **partner-desktop**
- [ ] Manual: `docs/partner-desktop-shell-qa.md` (1280 Analytics → Orders via side nav; mobile bottom nav unchanged)

## PWA

- [ ] Staging Chrome/Edge: site is installable; Install banner or Account → Install on desktop works
- [ ] Installed app opens standalone; update banner appears after a redeploy
- [ ] Web push test notification still received after SW merge
- [ ] Capacitor Android/iOS: **no** browser Install chrome

## Pack

- [ ] `pnpm test:e2e:rush:partner` green (full UI pack, both viewports) or at least analytics + exit-nav + auth + orders

## Promote

Only after all boxes above: announce Install to merchants / update help copy.
