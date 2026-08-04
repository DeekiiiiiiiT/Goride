# Data Center Audit — Import / Export / Delete

**Scope:** `apps/fleet/src/components/imports/*` (ImportsPage, ExportCenter, DeleteCenter and their supporting components), plus the backend routes/services they call (`_fleet-server/index.tsx`, `rbac_middleware.ts`, `payment_ledger_line_controller.tsx`, `dispute_refund_controller.tsx`, `expense_hub_routes.ts`, `data-export.ts`, `csv-helper.ts`, `audit-log.ts`).

**Method:** Full read-through of every file in the three tabs plus their direct dependencies (not a lint pass — actual line-by-line review), cross-referenced against the backend handlers that implement `bulkDeletePreview`, `bulkDeleteExecute`, batch cascade-delete, and export fetchers. Audit only — no code was changed.

**A note on timing:** there's an uncommitted diff in your working tree right now that removes the "Database Record Counts" diagnostic panel from Delete Center, the `ImportBatchAuditPanel`, and the "Activity Log" (`ImportExportHistory`) render calls from both Import and Export tabs, plus the onboarding banner. That looks like an in-progress cleanup — I audited the *current* file state (with those removals applied), and I did not re-flag the removed panel. I did flag what that removal breaks (see §1).

---

## 1. Fix first — highest severity

These are the findings I'd act on before anything else. They involve either **silent data loss/corruption** or a **real security hole**, not just polish.

### 1.1 The batch cascade-delete endpoint has no authentication at all
`DELETE /make-server-37f42386/batches/:id` (`supabase/functions/_fleet-server/index.tsx:8932`) has no `requireAuth()` and no `requirePermission()` — confirmed absent through the full ~350-line handler (8932–9280). Every comparable destructive endpoint in the same file *is* gated (`bulk-delete-execute` requires `data.backfill`, `DELETE /trips/:id` requires `transactions.edit`, `ledger/delete-by-source` requires `transactions.edit`). This one is the outlier, and it's the one with the largest blast radius — it deletes trips, transactions, ledger events, dispute refunds, and metrics in a single call. The Delete Center UI gates it with a "type DELETE" step, but that's a client-side courtesy; the endpoint itself will execute for anyone who can reach it directly (e.g. via a replayed request or a script), completely bypassing the UI, RBAC, and the confirmation dialog.

### 1.2 "Factory Reset" doesn't actually reset everything
`FACTORY_RESET_PREFIXES` (`DeleteCenter.tsx:617-623`) is a hand-maintained list of KV prefixes, and it's missing several prefixes that are actively written elsewhere in the codebase:
- `payment_ledger_line:` / `payment_ledger_line-dedup:` and `driver_period_snapshot:` (Uber payment-line imports)
- `dispute-refund:` / `dispute-refund-dedup:` (interestingly, the *single-batch* cascade delete does clean these up correctly — Factory Reset, which should be a superset, does not)
- The entire Expense Hub module: `expense_audit:`, `fixed_expense:`, `expense_doc:`, `expense_payment:`, `expense_journal:`
- `organization_settings:`

The UI's own confirmation checklist tells the user this will erase "**ALL** data from the system." For any org using Expense Hub, dispute refunds, or Uber payment-line imports, that claim is false — data survives a reset the user was told was total. This is the kind of gap that surfaces months later as "why do I still see old data after I wiped everything."

### 1.3 Deleting an import batch orphans payment ledger lines
`handleConfirmImport` in `ImportsPage.tsx` writes `payment_ledger_line:*` records and `driver_period_snapshot:{driverId}:{batchId}` (batch-scoped by design, per that controller's own doc comment). The batch cascade-delete handler (`index.tsx:8932-9280`) cleans up `ledger_event:*`, `dispute-refund:*`, trips, transactions, and metrics — but never touches `payment_ledger_line:*` or the driver period snapshots. Delete a batch that came from a Uber payments_transaction.csv import, and those records become permanent orphans pointing at a `batchId` that no longer exists.

### 1.4 No real server-side audit trail for destructive actions
The only "audit log" in this whole feature (`apps/fleet/src/services/audit-log.ts`) is a `localStorage` ring buffer. It never leaves the deleting user's browser, is trivially cleared by that same user, and — this is the bigger issue — its `AuditEntry` shape has **no actor/user field at all**. Even if you never cleared it, it can't answer "who ran this delete." Server-side, the delete endpoints only `console.log` (ephemeral function logs, not queryable). `BatchDeleteModal` and the bulk-batch-delete flow in Delete Center don't even call the client-side logger — the highest-blast-radius per-click actions in the entire app (cascade batch delete, bulk batch delete, factory reset) leave the thinnest trail. For an enterprise product, "who deleted what and when" needs to be a durable, server-side, queryable record — this doesn't exist today.

### 1.5 The import commit flow has no rollback, and can leave a "completed" batch with nothing behind it
In `ImportsPage.tsx`, `api.createBatch(batchMeta)` (status hardcoded to `'completed'`) runs *before* the actual trip/fleet-state save. If that save throws, the catch block only sets a UI error — the batch record stays in the database marked completed with a record count, even though no trips or ledger data were ever written. There's no compensating delete, no status correction to `'failed'`. Anyone looking at Import History later sees a phantom successful import.

### 1.6 The "reconciliation passed" indicator on the success screen is fake
`verifyPassed: true` is hardcoded at the end of `handleConfirmImport` — it's never actually computed from checking anything. The success screen has a conditional "Reconciliation check failed" warning that, as a direct result, can never fire. It reads as a real integrity signal to the user and isn't one.

---

## 2. Import Tab

### Bugs
- **`handleMerge` vs `handleAnalyze` have already drifted.** These two code paths (non-AI merge vs. AI-assisted merge) duplicate ~70% of their logic — fleet-name persistence, cash-total recompute, import-warning toasts — and the wording of the toast messages has already diverged between the two copies. This is a live demonstration of the risk: a fix applied to one path doesn't automatically apply to the other.
- **Popup-blocker leak in Uber OAuth sync.** The `setInterval` that polls for the Uber OAuth popup closing only clears when `popup.closed` is true. If the browser's popup blocker returns `null` for `window.open`, the interval never clears, and `isParsing` never resets — the UI stays stuck in a "parsing" state.
- **Silent AI-mapping failures.** If fuel-card loading or AI column-mapping fails, it's `console.error`'d only — no toast, no visible indicator. A user can walk through an entire import unaware that AI mapping silently failed and fields weren't auto-mapped.
- **Content fingerprint isn't really a content fingerprint.** `computeImportBundleFingerprint` hashes `name:rowCount` pairs, not file bytes. Two structurally different files with the same name and row count produce an identical fingerprint — so a corrected re-upload of a bad file can be indistinguishable from the original when the system checks for duplicate imports.
- **Inconsistent chunking on the commit path.** Canonical ledger events are chunked at 200 per call; fuel entries, dispute refunds, payment ledger lines, and driver quality snapshots are each sent as one unbounded call. A large statement import could hit a request-size or timeout limit on any of those paths with no chunking to fall back on.

### Gaps
- **No file size limit anywhere** in the upload path — large CSV/XLSX files are parsed entirely client-side with no size check before parsing starts.
- **No role/permission gating on who can import**, and the "Replace all data" full-system restore in `SystemBackupRestore.tsx` is gated only by typing a confirmation phrase, not by role.
- **No retry mechanism** for any of the ~5 independent save sub-steps in `handleConfirmImport` (ledger events, fuel entries, payment lines, quality snapshots, dispute refunds). A failure in one means re-running the entire import to retry, not just the failed piece.
- **No real progress indicator during commit** — just a static busy-lock message, unlike the proper 0–100% progress bars used in Bulk Entity Import, Trip Re-Import, and the backup/restore flows. Inconsistent, and unhelpful on a long multi-step commit.
- **Org-level settings live in `localStorage`, not the server** — `roam_fleet_name` and the custom field mapping (`roam_fields`) are per-browser, per-device. Two admins on two machines can silently drift out of sync.
- **No per-record "who imported this" trail** beyond one email/id stamped on the whole batch — sub-flows like Bulk Entity Import and Trip Re-Import don't pass an uploader identity at all.
- No malware/virus scanning of uploaded files is mentioned anywhere in the pipeline.

### Redundancy
- **`BulkEntityImportFlow.tsx` and `TripReImportFlow.tsx` are ~80% the same component**, duplicated across two ~520–550 line files (same step machine, same dropzone/validation/preview/progress structure, same date formatting helper). This is a strong candidate to collapse into one generic flow parameterized by entity type.
- `CollapsibleSection` in `ImportsPage.tsx` re-implements open/close + a "Hidden" badge on top of the already-imported `Collapsible` primitives, instead of being a shared component other pages could reuse.

### Enterprise readiness
- 18+ `console.log`/`console.error` calls left in `ImportsPage.tsx` alone (plus more in `csvHelpers.ts`), some logging AI payloads and internal counts straight to the browser console in production. No structured/remote logging layer.
- Staged file IDs use `Math.random().toString(36)` while everything else in the same file uses `crypto.randomUUID()` — low risk (client/session-scoped) but an inconsistent pattern.
- A **hardcoded production redirect URI** (`https://chorus-tech-15470154.figma.site`) is baked into the Uber OAuth handler instead of coming from environment config — this will break Uber sync in any non-production environment.
- Secondary actions (template download, change platform, add more files) stay clickable while a parse/upload is in progress, letting users navigate away mid-operation.
- Dropzones have no `aria-label`; icon-only buttons in the quarantine list rely on hover tooltips only, which doesn't help keyboard or screen-reader users.
- Raw exception messages and raw backend error payloads are occasionally surfaced directly to the fleet-admin-facing UI instead of a friendlier, sanitized message.

---

## 3. Export Tab

### Bugs
- **Most non-trip categories fetch with no pagination.** `fetchAllTransactions`, `fetchAllTollTags`, `fetchAllTollPlazas`, `fetchAllStations`, `fetchAllClaims`, `fetchAllEquipment`, and `fetchAllInventory` all call their API once with no page-size loop — only trips actually paginate. If the backend has any default/max response cap, both the export file *and* the record-count badge shown on the card would silently truncate together, so the user has no way to notice the export is incomplete (the displayed count and the exported count would agree — and both be wrong).
- **Toll transaction export is explicitly documented as unpaginated** in its own code comment ("no pagination"), and fetches everything in one call.
- **No lock preventing overlapping exports.** Nothing stops a user from clicking an individual category's export while "Export All" is mid-run — only the Export All button itself is disabled. Compare this to the backup/restore flow, which correctly uses a shared exclusive-action lock.
- **Per-category failures inside "Export All" are silently swallowed** beyond a toast that may already be dismissed — there's no final summary of *which* categories failed.
- **N+1 request patterns** for service logs, odometer readings, and check-ins — one API call per vehicle, with no batching, which for a large fleet means hundreds or thousands of concurrent requests on a single export click.

### Gaps
- No scheduled/recurring export — every export is a manual click.
- No cloud-storage delivery (S3/GCS) — browser download only.
- No true streaming: CSV generation and the full ZIP backup both build the entire dataset in memory before producing a downloadable blob. Large fleets will hold the fetched array *and* the CSV string in memory simultaneously.
- No column/field selection — the column set per category is fixed in code, not user-configurable.
- No role-based restriction on who can export — driver PII (email, phone, license number, emergency contact) and financial transaction data are exposed to any user who can open this tab, with no permission check per card.
- No encryption option on exported files (including the ZIP backup).
- Individual CSV downloads aren't compressed — only the full-system backup is.

### Redundancy
- **The Uber/InDrive/Roam per-platform trip cards permanently show no record count** (`recordCount={null}`) while "All Trips" shows a live number — no per-platform count is ever fetched, even though the underlying fetch function already supports platform filtering. Minor, but it's a visible inconsistency users will notice.
- **A hardcoded `"17"` in the backup card's description text** doesn't derive from the actual category list the way `SystemBackupRestore.tsx` correctly does elsewhere — if a category is ever added or removed, this string will quietly go stale while the other one stays correct. (The "Export All (17 files)" button label, for what it's worth, *is* accurate today — I verified the count.)
- **The Activity Log is now write-only.** `logAuditEntry` is still actively called on every export, but its only UI surface (`ImportExportHistory`, shared across all three Data Center tabs) was just removed in your pending diff. Data continues to accumulate in `localStorage` with nowhere to view it. Worth deciding deliberately whether Activity Log is coming back or being retired — right now it's neither.

### Enterprise readiness
- The audit log's `AuditEntry` type has no actor/user field — even restored, it could never answer "who exported this." Combined with `localStorage`-only, per-browser, user-clearable storage, this doesn't meet a real compliance bar for exporting financial/PII data.
- Errors are `console.error`-only with no remote/structured error reporting — invisible to anyone but a developer with devtools open.
- The search input lacks an `aria-label`; the CSV/JSON format toggle buttons lack `aria-pressed`/tab semantics.
- Record counts show a static `—` while loading, indistinguishable from "permanently unavailable" — no skeleton/spinner state.

---

## 4. Delete Tab

This is the highest-risk surface in the section, and it's where the most severe findings are (see §1.1–1.4 above — all four came from here). A few additional points beyond those:

### Bugs
- **Toll transaction dedup logic (toll_ledger vs. legacy transaction records) is copy-pasted three separate times** within `DeleteCenter.tsx` alone — once for the delete-preview fetch, once for the mount-time count, once for the post-delete refetch. All three currently agree, but nothing enforces that; the next person to tweak one dedup rule (e.g. adding a new transaction-type variant) can silently desync the preview count from what actually gets deleted.
- **Factory Reset has no per-chunk error handling.** It loops through delete chunks of 1,000 with no try/catch per chunk, so a network blip partway through leaves no accurate record of how much was actually deleted — for the one operation where that matters most.
- **The bulk-delete-preview endpoint silently caps at 50,000 rows** with no `truncated` flag returned to the client. A user could believe a "Delete All" covers everything when more rows exist beyond the cap.

### Gaps
- **No soft-delete or recovery window anywhere** — every delete is a hard `kv.mdel` with no tombstone or undo. There's no built-in "export this before you delete it" safety net; the user has to think to do that themselves on a different tab.
- **Factory Reset requires no more than typing a confirmation phrase** — same mechanism as deleting 5 records, just a longer string. No re-authentication, no MFA, no second-approver flow, no notification to other org admins that a full wipe just happened.
- **Confirmation friction isn't scaled to risk.** Per-category thresholds for requiring typed confirmation vary (100 for trips/fuel/toll/transactions, 50 for maintenance records, 5 for vehicles) and look ad hoc rather than based on data sensitivity — deleting 99 financial transactions takes one click, the same friction as deleting a single record, while deleting 6 vehicles requires typing DELETE.
- **The single highest-risk operation has the weakest progress feedback.** Factory Reset shows a static spinner with no running count, despite internally looping in trackable 1,000-record chunks that could easily report progress.

### Redundancy
- Category membership (search terms, display grouping, card-grid rendering) is defined in three separate places that all have to be kept in sync by hand — adding one new deletable entity type currently means touching five different spots in the file.

### Enterprise readiness
- Pervasive `console.log`/`console.error`/`console.warn` in place of any structured, queryable event stream.
- Partial-failure handling quality varies a lot across the three delete surfaces in this tab — the bulk-batch-delete flow actually has the *best* per-item success/failure reporting in the file; Factory Reset has the worst, which is backwards given the relative blast radius of each.

---

## 5. Cross-cutting themes

A few things showed up independently in all three sub-audits, which makes them worth calling out as *patterns*, not one-off bugs:

1. **No durable, server-side, actor-attributed audit trail anywhere in Data Center.** Every "audit log" in this feature is a client-side `localStorage` ring buffer with no user-identity field. For a feature that imports, exports, and permanently deletes financial and driver PII data, this is the single biggest gap standing between where this is today and "enterprise-ready." I'd treat this as the top investment.
2. **Copy-pasted business logic across sibling files.** The toll-transaction dedup rule, the Import/Export/Delete category-grouping pattern, and the Merge/Analyze import paths all show the same shape: near-identical logic duplicated 2–3 times with no shared helper, which is already showing early drift in at least one case (the Merge/Analyze toast wording).
3. **Hardcoded lists that need to stay in sync with the rest of the codebase, but aren't derived from a single source of truth.** `FACTORY_RESET_PREFIXES` is the most consequential example (§1.2) — it's a plain string array that someone has to remember to update every time a new data type is added anywhere in the app.
4. **RBAC coverage is inconsistent.** Most destructive/bulk endpoints correctly require `requirePermission(...)`; the batch cascade-delete endpoint doesn't, which is the kind of thing that's easy to miss in review because everything *around* it is properly gated.
5. **No file-size limits, no pagination on most non-trip data fetches, no streaming.** Individually low-severity, but collectively this is the reason the section will behave fine in testing and then degrade specifically at real enterprise fleet scale (tens of thousands of trips/transactions), which is exactly the scenario a "fully functional at an enterprise level" bar needs to hold up under.

---

## 6. Suggested priority order

If you want a place to start:

1. Add auth/permission checks to `DELETE /make-server-37f42386/batches/:id` (§1.1) — this is a real, currently-open security hole, not a nice-to-have.
2. Fix `FACTORY_RESET_PREFIXES` to cover every live prefix, or better, derive it from a single registry instead of a hand-maintained list (§1.2).
3. Extend the batch cascade-delete to also clean up `payment_ledger_line:*` / `driver_period_snapshot:*` (§1.3).
4. Design a real server-side audit trail (actor + action + target + timestamp, queryable, not clearable by the actor) and back-fill it into every import/export/delete action — this single change addresses §1.4 and a good chunk of the "enterprise readiness" findings across all three tabs.
5. Make `handleConfirmImport` transactional-ish: either don't mark the batch `completed` until every sub-step succeeds, or add a reconciliation pass that corrects batch status after the fact (§1.5), and make the "reconciliation passed" success-screen indicator real instead of hardcoded (§1.6).
6. Everything else in §2–§5 is real but lower-stakes — worth working through, but none of it will silently destroy or misrepresent data the way the six items above can.
