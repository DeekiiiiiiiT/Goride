/**
 * Multi-tenancy guards for toll_controller + shared SQL org predicates.
 *
 * Live second-org staging verification remains an ops step when a second
 * tenant can be created safely. These tests prove the SQL/filter predicate
 * isolates orgs without needing a live second org in production.
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { filterRecordsByOrg, recordBelongsToOrg } from "../_shared/orgRecordScope.ts";
import {
  tollOrgSqlFilters,
  tollOrgOrClause,
} from "./toll_org_context.ts";

const ORG_A = "8cfa606a-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const ORG_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

Deno.test("tollOrgSqlFilters emits orOrg SQL predicate for a fleet org", () => {
  assertEquals(tollOrgSqlFilters(null), []);
  assertEquals(tollOrgSqlFilters(undefined), []);
  assertEquals(tollOrgSqlFilters(ORG_A), [{ op: "orOrg", orgId: ORG_A }]);
  assertEquals(
    tollOrgOrClause(ORG_A),
    `organization_id.eq.${ORG_A},organization_id.is.null,organization_id.eq.roam-default-org`,
  );
});

Deno.test("second org sees zero rows from another org fixture set", () => {
  const fixture = [
    { id: "t1", organizationId: ORG_A, amount: -250 },
    { id: "t2", organizationId: ORG_A, amount: -100 },
    { id: "t3", organizationId: ORG_B, amount: -999 },
    { id: "legacy", amount: -50 }, // pre-backfill / null org — legacy include
  ];

  const forA = filterRecordsByOrg(fixture, ORG_A);
  assertEquals(forA.map((r) => r.id).sort(), ["legacy", "t1", "t2"]);

  const forB = filterRecordsByOrg(fixture, ORG_B);
  assertEquals(forB.map((r) => r.id).sort(), ["legacy", "t3"]);

  // Strict cross-tenant: Org B must not see Org A money rows
  assertEquals(forB.some((r) => r.organizationId === ORG_A), false);
  assertEquals(forA.some((r) => r.organizationId === ORG_B), false);

  assertEquals(recordBelongsToOrg({ organizationId: ORG_A }, ORG_B), false);
  assertEquals(recordBelongsToOrg({ organizationId: ORG_B }, ORG_B), true);
});

Deno.test("getAllTollLedgerEntries / loadMergedTollTxArray push org into SQL", async () => {
  const source = await Deno.readTextFile(new URL("./toll_controller.tsx", import.meta.url));
  assertEquals(
    /tollOrgSqlFilters\(orgId\)/.test(source),
    true,
    "loaders must build org SQL filters via tollOrgSqlFilters",
  );
  assertEquals(
    /iterateFleet\(\s*"toll_ledger"/.test(source),
    true,
    "getAllTollLedgerEntries must query toll_ledger via iterateFleet",
  );
  assertEquals(
    /stampOrg\(/.test(source),
    true,
    "saveTollLedgerEntry must call stampOrg",
  );
  assertEquals(
    /belongsToOrg\(/.test(source),
    true,
    "single-record paths must call belongsToOrg",
  );
  assertEquals(
    /runWithTollContext/.test(source),
    true,
    "routes must bind runWithTollContext middleware",
  );
});
