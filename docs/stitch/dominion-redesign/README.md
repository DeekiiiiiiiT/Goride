# Stitch project: Dominion Redesign

- **Project id:** `7083594865949473827`
- **Design system:** Dominion (`assets/16242062400491894691`)
- **Shell screen:** `d2798e5c0de74b93857cc67b7b940b23`

HTML lives in `docs/stitch/dominion-redesign/html/` only. Do not copy these files into an app `public/` folder.

The five place screens below are the canonical Plug designs, confirmed in Stitch on 26 Oct 2026. Plug still holds the originals. Fake contributor names, trust scores, OCR scores, and mesh widgets are not to be built. The new shell is S1.

| # | Screen | Stitch id | HTML file | Dominion page id | React file | Status |
|---|---|---|---|---|---|---|
| D1 | Places review queue | `19c9df8ede1f4635be7f188be5c24f94` | `html/D1-review-queue.html` | `plug-places` | `packages/platform-ops-ui/src/places/PlacesReview.tsx` | Built. Fake names, scores, and Fleet export removed. |
| D2 | Review one place | `6348f0f2c36149fa9bb2cc9e8fa39577` | `html/D2-review-item.html` | `plug-places` | `packages/platform-ops-ui/src/places/PlacesReview.tsx` | Live inside Places review, This place. |
| D3 | Merge into an existing place | `a87e5505779043e2a48a64a6f6266d2e` | `html/D3-merge.html` | `plug-places` | `packages/platform-ops-ui/src/places/PlacesReview.tsx` | Live as the merge window. |
| D4 | Coverage overview | `7da088e95e1e4fe088a2add010bf9bd3` | `html/D4-coverage.html` | `plug-places` | `packages/platform-ops-ui/src/places/PlacesReview.tsx` | Live as Parish coverage. The Jamaica border map stays on its own page. |
| D5 | Parish coverage table | `53ad2876cac241b1aaceeb7bbc307045` | `html/D5-parish-coverage.html` | `plug-places` | `packages/platform-ops-ui/src/places/PlacesReview.tsx` | Live as the parish table on Parish coverage. |
| S1 | App shell | `d2798e5c0de74b93857cc67b7b940b23` | — | all | `apps/admin/src/components/admin/AdminLayout.tsx` | Built. Approved 26 Oct 2026. |
| S2 | Sign in and authenticator | `d8107f1d4b7c4c8bbb570fed4a8216be` | — | login | `apps/admin/src/components/admin/AdminLoginPage.tsx` | Built. Approved 26 Oct 2026. |
| S3 | States kit | `9f614905032a4b24ae49582568108a9e` | — | all | `apps/admin/src/components/admin/DominionStates.tsx` | Built. Approved 26 Oct 2026. |
| S4 | Overview health board | `282dc999dca64dcfbb7050e1bf24254b` | — | `dashboard` | `apps/admin/src/components/admin/AdminDashboard.tsx` | Built. Approved 26 Oct 2026. |
| S5 | Record editor drawer | `23f682ed913f4930b9c446cd902aa284` | — | every master list | `apps/admin/src/components/admin/DominionRecordDrawer.tsx` | Built. Approved 26 Oct 2026. |
| S6 | Master list | `8923fc739cb14e808622165b97bafd8c` | — | list pages | `apps/admin/src/components/admin/DominionMasterList.tsx` | Built. Approved 26 Oct 2026. |
| S7 | Section home | `2a625fdca609418f988ee8a290e9695e` | — | `vehicles-home` | `apps/admin/src/components/admin/DominionHomes.tsx` | Built. Same layout on Places, Fuel, Tolls, and Tax homes. Counts stay blank until the live source answers. |
| S19 | Station analytics | `2a625fdca609418f988ee8a290e9695e` | — | `fuel-analytics` | `apps/admin/src/components/admin/DominionHomes.tsx` | Live as station list health. Customer fuel spending stays on the moved notice. |

Screens S2–S34 are not designed yet. Do not build a page that has no row here.
