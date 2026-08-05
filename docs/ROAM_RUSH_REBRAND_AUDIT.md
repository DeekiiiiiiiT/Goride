# Roam Dash → Roam Rush Rebrand Audit

**Date:** 2026-08-05  
**Status:** Implemented in code (2026-08-05). Ops cutover checklist still required (DNS / Vercel / Supabase Dashboard).

**Locked naming:** Roam Rush · Roam Rush Courier · Roam Rush Partner  
**Locked hosts:** `roamrush.app` · `courier.roamrush.app` · `partner.roamrush.app`

## What landed in the repo
- Auth recovery maps (client + edge) hard-cut to `*.roamrush.app`
- User-facing "Roam Dash*" copy → Rush names across dash apps, SMS, admin/fleet labels
- PWA titles/manifests updated; courier short name stays "Roam Courier"
- Enterprise marketing path `/rush` with redirect `/dash` → `/rush`
- Play Store customer redirect URL → `https://roamrush.app/`; package IDs unchanged
- Partner production origin / defaults → `https://partner.roamrush.app`
- Docs: auth redirect checklist, password recovery, product lines

## Explicitly deferred (unchanged)
- Folder/package rename `dash-*` → `rush-*`
- DB taxonomy values (`roam_dash`, `roam_partner`, `roam_courier`)
- Logo asset redesign (SVG wordmark text updated to ROAM RUSH; raster logos later)
- Support email inboxes (`@roamdash.com`)
- Retiring old `roamdash.co` DNS

## Ops cutover (you must click)
1. Point GoDaddy DNS for `roamrush.app`, `courier.roamrush.app`, `partner.roamrush.app` at the matching Vercel projects.
2. Attach those domains on each Vercel project.
3. Supabase Auth → URL Configuration: replace old Dash allowlist entries with the new hosts (see `docs/auth/SUPABASE_REDIRECT_CHECKLIST.md`); remove `roamdash.co` entries.
4. Set edge secret/env `PARTNER_PORTAL_URL=https://partner.roamrush.app`.

## Original inventory scope (pre-implementation)
Full pre-change inventory lived in this file’s earlier revision: ~91 source files with "Roam Dash", PWA metadata, Capacitor, logos, package names, domains, DB identifiers, admin folders, marketing, docs, Play Store catalogs, and SMS templates. Implementation followed the priority in the Roam Rush Full Rebrand Plan (auth → SMS/UI/PWA → marketing → store → admin labels → docs).
