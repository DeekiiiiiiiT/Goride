/**
 * Seed a standalone Warehouse door test org + owner, linked to Bootstrap Freight Co.
 *
 * Usage (from repo root, with service role in env):
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/seed-warehouse-door-user.mjs
 *
 * Or: loads apps/enterprise/.env.local if VITE_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY present.
 *
 * Does NOT print or commit the password to markdown in the repo — writes credentials to
 * docs/products/.local-warehouse-smoke-creds.txt (gitignored).
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  const text = readFileSync(path, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    const key = m[1];
    let val = m[2].trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnvFile(resolve(root, 'apps/enterprise/.env.local'));
loadEnvFile(resolve(root, '.env.local'));
loadEnvFile(resolve(root, '.env'));

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error(
    'Missing SUPABASE_URL / VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY',
  );
  process.exit(1);
}

const COURIER_ORG_ID = '801f14ff-b0ce-49b6-90b0-dfe26d19e6a6';
const EMAIL = 'warehouse.smoke@roamenterprise.test';
const PASSWORD = `Wh${randomBytes(6).toString('base64url')}!9`;

const sb = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  // Reuse user if email exists
  const { data: listed } = await sb.auth.admin.listUsers({ perPage: 200 });
  let user = listed?.users?.find((u) => u.email === EMAIL);

  if (!user) {
    const { data, error } = await sb.auth.admin.createUser({
      email: EMAIL,
      password: PASSWORD,
      email_confirm: true,
      app_metadata: {
        productLine: 'enterprise',
        role: 'enterprise_owner',
        businessType: 'warehouse',
      },
      user_metadata: {
        productLine: 'enterprise',
        full_name: 'Warehouse Smoke Owner',
        businessType: 'warehouse',
      },
    });
    if (error) throw new Error(`createUser: ${error.message}`);
    user = data.user;
  } else {
    const { error } = await sb.auth.admin.updateUserById(user.id, {
      password: PASSWORD,
      email_confirm: true,
      app_metadata: {
        ...user.app_metadata,
        productLine: 'enterprise',
        role: 'enterprise_owner',
        businessType: 'warehouse',
      },
      user_metadata: {
        ...user.user_metadata,
        productLine: 'enterprise',
        businessType: 'warehouse',
      },
    });
    if (error) throw new Error(`updateUser: ${error.message}`);
  }

  // Ensure warehouse org owned by this user
  let { data: org } = await sb
    .from('organizations')
    .select('id, name, business_type')
    .eq('owner_id', user.id)
    .eq('product_line', 'enterprise')
    .maybeSingle();

  if (!org) {
    const { data: created, error } = await sb
      .from('organizations')
      .insert({
        id: user.id,
        owner_id: user.id,
        name: 'Smoke Warehouse Co',
        product_line: 'enterprise',
        business_type: 'warehouse',
        subscribed_products: ['warehouse'],
      })
      .select('id, name, business_type')
      .single();
    if (error) {
      // id collision fallback — insert without fixed id
      const { data: created2, error: err2 } = await sb
        .from('organizations')
        .insert({
          owner_id: user.id,
          name: 'Smoke Warehouse Co',
          product_line: 'enterprise',
          business_type: 'warehouse',
          subscribed_products: ['warehouse'],
        })
        .select('id, name, business_type')
        .single();
      if (err2) throw new Error(`createOrg: ${err2.message}`);
      org = created2;
    } else {
      org = created;
    }
  } else {
    await sb
      .from('organizations')
      .update({
        business_type: 'warehouse',
        subscribed_products: ['warehouse'],
        name: org.name || 'Smoke Warehouse Co',
      })
      .eq('id', org.id);
  }

  // Stamp organizationId on user JWT metadata
  await sb.auth.admin.updateUserById(user.id, {
    app_metadata: {
      productLine: 'enterprise',
      role: 'enterprise_owner',
      organizationId: org.id,
    },
    user_metadata: {
      productLine: 'enterprise',
      organizationId: org.id,
      full_name: 'Warehouse Smoke Owner',
    },
  });

  // Active partnership with bootstrap courier
  const { error: linkErr } = await sb.schema('freight').from('warehouse_courier_links').upsert(
    {
      warehouse_org_id: org.id,
      courier_org_id: COURIER_ORG_ID,
      status: 'active',
      initiated_by: 'warehouse',
      invited_by_user_id: user.id,
      accepted_at: new Date().toISOString(),
    },
    { onConflict: 'warehouse_org_id,courier_org_id' },
  );
  if (linkErr) throw new Error(`link: ${linkErr.message}`);

  // Self-link for warehouse org (in-house ops on their facilities)
  await sb.schema('freight').from('warehouse_courier_links').upsert(
    {
      warehouse_org_id: org.id,
      courier_org_id: org.id,
      status: 'active',
      initiated_by: 'warehouse',
      accepted_at: new Date().toISOString(),
    },
    { onConflict: 'warehouse_org_id,courier_org_id' },
  );

  const outPath = resolve(root, 'docs/products/.local-warehouse-smoke-creds.txt');
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(
    outPath,
    [
      'Roam Warehouse smoke credentials (LOCAL ONLY — do not commit)',
      `Generated: ${new Date().toISOString()}`,
      '',
      'Freight Forwarder door: http://freight-forwarder.localhost:3003/login',
      '                        https://freight-forwarder.roamenterprise.co/login',
      `Email:    ${EMAIL}`,
      `Password: ${PASSWORD}`,
      `Org id:   ${org.id}`,
      '',
      'Courier door (existing): http://courier.localhost:3003/login',
      'Email:    freight.bootstrap+20260731232909@roamenterprise.test',
      `Courier org linked: ${COURIER_ORG_ID}`,
      '',
      'Partnership: active warehouse_courier_links row warehouse↔courier',
      '',
    ].join('\n'),
    'utf8',
  );

  console.log('Warehouse smoke user ready.');
  console.log(`Email: ${EMAIL}`);
  console.log(`Password written to docs/products/.local-warehouse-smoke-creds.txt`);
  console.log(`Org: ${org.id}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
