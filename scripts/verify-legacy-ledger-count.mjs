#!/usr/bin/env node
/**
 * Preflight: GET /ledger/count (canonical ledger events, trips, transactions).
 * Legacy `ledger:*` counts are no longer on this endpoint — use Delete Center (dry run)
 * or POST /ledger/purge-legacy-all with { "dryRun": true } while signed in with data.backfill.
 *
 * Usage: npm run verify:legacy-ledger
 */

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function readInfoFromRepo() {
  const infoPath = join(__dirname, '../src/utils/supabase/info.tsx');
  const raw = readFileSync(infoPath, 'utf8');
  const projectId = raw.match(/export const projectId = "([^"]+)"/)?.[1];
  const publicAnonKey = raw.match(/export const publicAnonKey = "([^"]+)"/)?.[1];
  if (!projectId || !publicAnonKey) {
    throw new Error(`Could not parse projectId / publicAnonKey from ${infoPath}`);
  }
  return { projectId, publicAnonKey };
}

const { projectId: fromFile, publicAnonKey: keyFromFile } = readInfoFromRepo();
const projectId = process.env.SUPABASE_PROJECT_REF || fromFile;
const publicAnonKey = process.env.SUPABASE_ANON_KEY || keyFromFile;

const url = `https://${projectId}.supabase.co/functions/v1/make-server-37f42386/ledger/count`;

async function main() {
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${publicAnonKey}`,
      apikey: publicAnonKey,
    },
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`HTTP ${res.status} ${res.statusText}`);
    console.error(text);
    process.exit(1);
  }
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    console.error('Invalid JSON:', text.slice(0, 500));
    process.exit(1);
  }

  const canonical = data.ledgerEntries ?? 0;
  const trips = data.trips ?? 0;
  const tx = data.transactions ?? 0;

  console.log('');
  console.log('Ledger preflight (GET /ledger/count)');
  console.log('──────────────────────────────────────');
  console.log(`  ledger_event:* (canonical)  ${canonical.toLocaleString()}`);
  console.log(`  trip:*                      ${trips.toLocaleString()}`);
  console.log(`  transaction:*               ${tx.toLocaleString()}`);
  console.log('');
  console.log('Legacy ledger:* count: open Imports → Delete Center (refreshes dry run), or deploy and use Remove legacy there.');
  console.log('');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
