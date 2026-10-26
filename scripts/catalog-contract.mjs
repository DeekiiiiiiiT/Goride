/**
 * Public catalog contract: versioned reads exist, and public selects do not
 * return a customer or an organization id.
 * Run: node scripts/catalog-contract.mjs
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const file = join(import.meta.dirname, '..', 'supabase', 'functions', 'platform-catalog', 'index.ts');
const text = readFileSync(file, 'utf8');
const required = ['/v1/stations', '/v1/changes', 'app.all("/v1/*"'];
const forbidden = ['organization_id', 'organizationId', 'customer_name'];
let failed = false;

for (const path of required) {
  if (!text.includes(path)) {
    console.error(`platform-catalog is missing ${path}`);
    failed = true;
  }
}

const selects = text.match(/\.select\("([^"]+)"\)/g) ?? [];
for (const select of selects) {
  for (const column of forbidden) {
    if (select.includes(column)) {
      console.error(`public catalog select includes ${column}: ${select}`);
      failed = true;
    }
  }
}

if (failed) process.exit(1);
console.log('OK — catalog contract (versioned reads, no private columns)');
