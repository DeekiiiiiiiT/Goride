# Give Cursor this — Round C3d: Dominion Vehicle pictures routes

The plan is `docs/vehicle-pictures-and-add-vehicle-audit.md` (Rev 6). Read **§5.2 (with the "Dominion rule" paragraph), §6 (the `/admin/vehicle-pictures` rows) and §10**. Rounds C1–C3c are done. This round adds the server routes the Dominion screens will call. The screens are Claude's round UI3.

**Settings store:** every vehicle-picture setting named below lives in the one KV row `kv_store_37f42386.key = 'vehicle_pictures:settings'` (a JSON object), never in `platform:settings:*`. Missing keys use the defaults in the audit.

## The Dominion rule (most important)
Dominion is Roam's master database. **No route in this round may return anything from Roam Fleet:** no organisation ids or names, no vehicle ids, plates, drivers, vehicle counts, "used by" lists, certificate text, or per-fleet settings. The only usage fact allowed is a boolean `inUse` (whether any app uses the picture), so the screen can disable Remove with "Apps already use this picture".

## Routes
Put them in `supabase/functions/_fleet-server/vehicle_picture_admin_routes.ts` and register them like the other `/admin/catalog` routes.

Access rules:
- every route requires platform staff with 2FA (the existing `aal2` gate)
- reads need `catalog.read`
- writes need `catalog.write`
- the switch and remake-all need `platform_owner`
- use the same helpers `catalog_routes.ts` uses (`assertPlatformStaffResponse`, `assertCatalogWriteResponse`, `hasPlatformOwnerAccess`)

| Route | Does |
|---|---|
| `GET /make-server-37f42386/admin/vehicle-pictures` | Query: `search`, `color`, `status`, `rating`, `stale=1`, `page` (24 per page). Returns `items` (id, make, model, generation, bodyType, startYear, endYear, color, status, rating, source, madeAt, url (card size), stale), `total`, counts `{ ready, beingMade (queued + generating), failed, stale }`, `pictureSpend { usedUsd, budgetUsd }` from the Gemini budget in `api_usage_logger.ts`, `aiPicturesOn`, `pause { until, reason } \| null`, `remakePausedLeft \| null`. **Stale** = no active `vehicle_catalog` row produces this look any more (build look keys with C2's `buildLook`; cache the set for 10 minutes). |
| `GET /make-server-37f42386/admin/vehicle-pictures/:id` | The picture, `inUse` (boolean only), `howMade { promptVersion, aiModel, costUsd, madeAt, attempts, lastError }`, `versions` (version, source, createdAt, retiredAt, url when the file still exists). |
| `POST …/:id/rate` | `{ rating: "good" \| "wrong" }` |
| `POST …/:id/regenerate` | C3c `regeneratePicture`; per staff user at most 30 per day (`_shared/rateLimit.ts`) → 429 |
| `POST …/:id/replace/start` + `…/replace/finish` | The R2 upload flow (`_shared/objectStorage`, purpose `catalogue-images`, scope `platform`), then C3c `replacePicture` |
| `POST …/:id/restore` | C3c `restorePrevious` |
| `DELETE …/:id` | C3c `removePicture`; used → 409 `PICTURE_IN_USE` with message "Apps already use this picture — regenerate or replace it instead." |
| `POST /make-server-37f42386/admin/vehicle-pictures/toggle` | Owner only. `{ enabled }`. Sets the **one global** `ai_vehicle_pictures` flag (no per-org overrides). |
| `POST /make-server-37f42386/admin/vehicle-pictures/remake-outdated/preview` | Owner only. Returns `{ count, costUsd (count × 0.04), hours (count / 120), fitsThisMonth }` for ready pictures whose `prompt_version` or `ai_model` is older than the current settings. |
| `POST /make-server-37f42386/admin/vehicle-pictures/remake-outdated` | Owner only. Queues those rows in the **`remake`** lane (version + 1, queued); kicks the worker once. |

**Audit log:** every write route calls `logAdminAction` from `_shared/auditLog.ts` (action, picture id, staff user).

Error replies are always `{ error: "<plain sentence>", code: "<UPPER_SNAKE>" }`.

## Tests (write them first)
`supabase/functions/_fleet-server/vehicle_picture_admin_routes.test.ts`, with fake database and auth contexts in the style of `catalog_trust_routes.test.ts`:
- **T16:** fleet user → 403 on every route; staff without `catalog.write` → 403 on writes; toggle and remake-all → 403 for non-owners
- **T15 (Dominion half):** no response from any route contains an organisation id, vehicle id, plate, or the words "fleet", "driver" or "used by". Scan the JSON of every reply in the test.
- **T11:** DELETE on a used picture → 409 `PICTURE_IN_USE`; unused → 200, soft-deleted
- **T32:** the approve route re-matching an existing vehicle to another catalogue car → that vehicle's `picture_id` is null in the same write, and the lookup runs (C3b hook)
- **T31 (server half):** `POST /fleet-core/vehicles/:id/color` Grey→White → `picture_id` null in the same write, the white look is looked up; another org's vehicle id → 404
- regenerate 31 times in a day → the 31st is 429
- toggle writes one global flag and has no `organizationId` parameter
- every write route logs one audit entry

## Run
- `deno test --no-check --allow-env --allow-read` on this file plus all earlier vehicle picture tests. All pass.
- Add it to the "Deno test vehicle pictures" CI step.
- At the end, run `pnpm install` at the repo root.

## Rules
- Don't create, switch or commit git branches. Don't push. Never touch the production database or real R2 / Imagen. Leave other uncommitted work alone.
- In your report, give clickable links to the files you changed and the results of what you ran. Don't paste file contents — I'll read the files.
- Before you finish, stop any app, dev server or test server you started (check ports 3000, 3001, 4173, 5173, 5180–5183).
