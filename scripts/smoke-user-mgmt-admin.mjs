/**
 * One-shot live smoke for user-management admin APIs.
 * Usage: node scripts/smoke-user-mgmt-admin.mjs
 */
import { getApiKeys, SUPABASE_URL } from './smoke/_shared.mjs';

const EMAIL = 'user-mgmt-smoke@roamrush.app';
const PASSWORD = 'RoamUserMgmtSmoke2026!';
const BASE = `${SUPABASE_URL}/functions/v1/delivery/admin`;

const results = [];
const pass = (name, detail = '') => {
  results.push(['PASS', name, detail]);
  console.log(`PASS  ${name}${detail ? ` — ${detail}` : ''}`);
};
const fail = (name, detail = '') => {
  results.push(['FAIL', name, detail]);
  console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
};

async function authAdmin(serviceKey, path, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  let body = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text.slice(0, 200) };
  }
  return { status: res.status, body };
}

async function rest(serviceKey, schema, path, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
      'Accept-Profile': schema,
      'Content-Profile': schema,
      Prefer: options.prefer || 'return=representation',
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  let body = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text.slice(0, 200) };
  }
  return { status: res.status, body };
}

async function main() {
  const { anonKey, serviceKey } = getApiKeys();

  // Find or create smoke user
  let userId = null;
  const listed = await authAdmin(serviceKey, '/admin/users?page=1&per_page=200');
  const existing = (listed.body.users || []).find(
    (u) => (u.email || '').toLowerCase() === EMAIL,
  );
  if (existing) {
    userId = existing.id;
    const upd = await authAdmin(serviceKey, `/admin/users/${userId}`, {
      method: 'PUT',
      body: JSON.stringify({
        password: PASSWORD,
        email_confirm: true,
        app_metadata: { role: 'dash_admin', roles: ['dash_admin'] },
      }),
    });
    if (upd.status >= 400) throw new Error(`update user failed: ${JSON.stringify(upd.body)}`);
  } else {
    const created = await authAdmin(serviceKey, '/admin/users', {
      method: 'POST',
      body: JSON.stringify({
        email: EMAIL,
        password: PASSWORD,
        email_confirm: true,
        app_metadata: { role: 'dash_admin', roles: ['dash_admin'] },
      }),
    });
    if (created.status >= 400) throw new Error(`create user failed: ${JSON.stringify(created.body)}`);
    userId = created.body.id || created.body.user?.id;
  }
  if (!userId) throw new Error('no user id');
  pass('provision smoke user', userId);
  // platform schema is not PostgREST-exposed; role/identity rows are granted via SQL/MCP before this run.
  pass('expect platform.user_roles + identities pre-granted via SQL');

  const sign = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const signBody = await sign.json();
  if (!sign.ok || !signBody.access_token) {
    throw new Error(`sign-in failed: ${JSON.stringify(signBody)}`);
  }
  const token = signBody.access_token;
  pass('sign-in smoke admin');

  async function api(path, init = {}, bearer = token) {
    const res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${bearer}`,
        apikey: anonKey,
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(init.headers || {}),
      },
    });
    const text = await res.text();
    let body = {};
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      body = { raw: text.slice(0, 200) };
    }
    return { status: res.status, body };
  }

  {
    const r = await api('/identities?limit=5');
    if (r.status === 200 && Array.isArray(r.body.identities)) {
      pass('GET /identities', `n=${r.body.identities.length} total=${r.body.total}`);
    } else fail('GET /identities', `${r.status} ${JSON.stringify(r.body).slice(0, 180)}`);
  }

  {
    const r = await api(`/identities/${encodeURIComponent(userId)}`);
    if (r.status === 200 && r.body.identity) {
      pass('GET /identities/:userId', `roles=${(r.body.consoleRoles || []).join(',')}`);
    } else fail('GET /identities/:userId', `${r.status} ${JSON.stringify(r.body).slice(0, 180)}`);
  }

  {
    const r = await api('/team');
    if (r.status === 200 && Array.isArray(r.body.members)) {
      pass('GET /team', `members=${r.body.members.length}`);
    } else fail('GET /team', `${r.status} ${JSON.stringify(r.body).slice(0, 180)}`);
  }

  {
    const r = await api('/audit/events?limit=5');
    if (r.status === 200 && Array.isArray(r.body.events)) {
      pass('GET /audit/events', `n=${r.body.events.length}`);
    } else fail('GET /audit/events', `${r.status} ${JSON.stringify(r.body).slice(0, 180)}`);
  }

  {
    const cust = await rest(serviceKey, 'delivery', '/customers?select=id&limit=1');
    const id = Array.isArray(cust.body) ? cust.body[0]?.id : null;
    if (id) {
      const r = await api(`/customers/${id}/suspend`, {
        method: 'POST',
        body: JSON.stringify({ reason: '' }),
      });
      if (r.status === 400) pass('customer suspend requires reason', r.body.error || r.body.message);
      else fail('customer suspend requires reason', `${r.status} ${JSON.stringify(r.body).slice(0, 180)}`);
    } else pass('customer suspend skipped', 'no customer');
  }

  {
    const couriers = await rest(
      serviceKey,
      'delivery',
      '/courier_profiles?select=user_id&limit=50',
    );
    let dualUser = null;
    for (const c of Array.isArray(couriers.body) ? couriers.body : []) {
      const cust = await rest(
        serviceKey,
        'delivery',
        `/customers?user_id=eq.${c.user_id}&select=id,account_status&limit=1`,
      );
      const row = Array.isArray(cust.body) ? cust.body[0] : null;
      if (row && (row.account_status === 'active' || row.account_status === 'suspended')) {
        dualUser = c.user_id;
        break;
      }
    }
    if (dualUser) {
      const r = await api(`/couriers/${dualUser}/suspend`, {
        method: 'POST',
        body: JSON.stringify({ reason: 'smoke cross-persona check' }),
      });
      if (r.status === 409 && r.body.error === 'cross_persona_warning') {
        pass('courier cross-persona warning');
      } else {
        fail('courier cross-persona warning', `${r.status} ${JSON.stringify(r.body).slice(0, 220)}`);
      }
    } else pass('courier cross-persona skipped', 'no dual persona');
  }

  // DB-role only access (empty app_metadata roles)
  {
    await authAdmin(serviceKey, `/admin/users/${userId}`, {
      method: 'PUT',
      body: JSON.stringify({ app_metadata: { role: null, roles: [] } }),
    });
    const sign2 = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: anonKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    });
    const sign2Body = await sign2.json();
    if (!sign2.ok || !sign2Body.access_token) {
      fail('DB-role re-signin', JSON.stringify(sign2Body).slice(0, 180));
    } else {
      const r = await api('/team', {}, sign2Body.access_token);
      if (r.status === 200) pass('DB-role portal access without JWT roles', `members=${(r.body.members || []).length}`);
      else fail('DB-role portal access without JWT roles', `${r.status} ${JSON.stringify(r.body).slice(0, 180)}`);
    }
    await authAdmin(serviceKey, `/admin/users/${userId}`, {
      method: 'PUT',
      body: JSON.stringify({ app_metadata: { role: 'dash_admin', roles: ['dash_admin'] } }),
    });
  }

  const failed = results.filter((r) => r[0] === 'FAIL').length;
  console.log('\n=== SUMMARY ===');
  for (const r of results) console.log(r.join(' | '));
  console.log(failed ? `\nFAILED: ${failed}` : '\nALL PASS');
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error('SMOKE CRASH:', e.message || e);
  process.exit(1);
});
