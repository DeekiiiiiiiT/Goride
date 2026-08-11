# Fleet domain route map (production cutover)

Canonical HTTP surface for fleet business domains after KV→`fleet.*` cutover.
Prefer these paths over guessing REST names.

| Domain | Table | Canonical routes |
|--------|-------|------------------|
| drivers | `fleet.drivers` | `GET/POST /drivers`, `GET/PUT/DELETE /drivers/:id` |
| vehicles | `fleet.vehicles` | `GET/POST /vehicles`, `GET/PUT/DELETE /vehicles/:id` |
| trips | `fleet.trips` | `GET /trips`, `POST /trips`, `POST /trips/search`, `POST /trips/stats` |
| import_batches | `fleet.import_batches` | `GET/POST /batches`, `PATCH/DELETE /batches/:id`, `GET /batches/:id/delete-preview` |
| transactions | `fleet.transactions` | `GET/POST /transactions` (+ fuel payment paths) |
| fuel_entries | `fleet.fuel_entries` | `GET/POST /fuel-entries` |
| fuel_cards | `fleet.fuel_cards` | fuel controller card routes |
| stations | `fleet.stations` | `GET /stations/search`, admin station routes |
| claims | `fleet.claims` | `GET/POST /claims` |
| payment_ledger_lines | `fleet.payment_ledger_lines` | `GET /payment-ledger-lines` |
| toll_ledger | `fleet.toll_ledger` | `GET /toll-reconciliation/toll-logs` (alias: `GET /toll-ledger`) |
| toll_tags / toll_plazas | `fleet.toll_*` | toll controller tag/plaza routes |
| equipment | `fleet.equipment` | `GET /fleet/equipment/all`, `GET /equipment/:vehicleId` (alias: `GET /equipment`) |
| inventory | `fleet.inventory` | `GET/POST /inventory` |
| fixed_expenses | `fleet.fixed_expenses` | Expense Hub `/fixed-expenses` + rule projection |
| checkins | `fleet.checkins` | check-in review / vehicle check-in routes |
| maintenance_logs | `fleet.maintenance_logs` | maintenance schedule/records (Postgres) + migrated `maintenance_log:` |
| dashboard | (agg) | `GET /dashboard/init`, `GET /dashboard/stats` |

## Read helpers (edge)

- Prefer `queryFleet` / `listByBatch` / `countBy` / `fleetSelect` / `kv.get` / `kv.getByPrefix`
- Legacy chained reads: `fromKvStore()` (`fleet_sql_bridge.ts`) — SQL pushdown for mapped prefixes
- Do **not** call `supabase.from("kv_store_37f42386")` for mapped domains

## Still on KV (by design)

`organization_metric:`, `ledger_event:`, `ledger_event_idem:`, `dispute-refund:`, dedup keys, `expense_audit:`, locks/caches, `fleet_kv_backup:*`
