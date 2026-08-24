/**
 * Live smoke for geofence follow-ups: delivery-zones, check-point parity, markets list.
 * Usage: node scripts/smoke-geofence-markets.mjs
 */
import { DROP_OFF, deliveryApi, getApiKeys, signIn, SUPABASE_URL } from './smoke/_shared.mjs';

const ADMIN_EMAIL = 'user-mgmt-smoke@roamrush.app';
const ADMIN_PASSWORD = 'RoamUserMgmtSmoke2026!';
const DELIVERY = `${SUPABASE_URL}/functions/v1/delivery`;

const results = [];
const pass = (name, detail = '') => {
  results.push(['PASS', name, detail]);
  console.log(`PASS  ${name}${detail ? ` — ${detail}` : ''}`);
};
const fail = (name, detail = '') => {
  results.push(['FAIL', name, detail]);
  console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
};

async function main() {
  const { anonKey } = getApiKeys();

  // 1. Public customer zones endpoint
  {
    const res = await fetch(`${DELIVERY}/geo/delivery-zones`, {
      headers: { apikey: anonKey },
    });
    const body = await res.json().catch(() => ({}));
    const zones = Array.isArray(body?.zones) ? body.zones : body;
    if (res.status === 200 && Array.isArray(zones)) {
      pass('GET /geo/delivery-zones', `zones=${zones.length}`);
    } else {
      fail('GET /geo/delivery-zones', `${res.status} ${JSON.stringify(body).slice(0, 160)}`);
    }
  }

  let adminToken = null;
  try {
    adminToken = await signIn(anonKey, ADMIN_EMAIL, ADMIN_PASSWORD);
    pass('admin sign-in', ADMIN_EMAIL);
  } catch (e) {
    fail('admin sign-in', e.message);
  }

  async function adminMarkets(path, init = {}) {
    const suffix = path === '/' ? '' : path;
    return deliveryApi(anonKey, adminToken, `/admin/markets${suffix}`, init);
  }

  if (adminToken) {
    // 2. Markets list (draft zones path)
    {
      const res = await adminMarkets('/');
      if (res.status === 200 && Array.isArray(res.body?.markets)) {
        pass('GET /admin/markets', `markets=${res.body.markets.length} parishes=${(res.body.parishes || []).length}`);
      } else {
        fail('GET /admin/markets', `${res.status} ${res.text?.slice(0, 160)}`);
      }
    }

    // 3. check-point parity — Spanish Town pin from shared smoke coords
    {
      const res = await adminMarkets('/check-point', {
        method: 'POST',
        body: JSON.stringify({ lat: DROP_OFF.lat, lng: DROP_OFF.lng }),
      });
      const b = res.body || {};
      const hasParityFields =
        Object.prototype.hasOwnProperty.call(b, 'parishBoundaryMode') &&
        Object.prototype.hasOwnProperty.call(b, 'outsideParish') &&
        Object.prototype.hasOwnProperty.call(b, 'parishId');
      if (res.status === 200 && hasParityFields) {
        pass(
          'POST /admin/markets/check-point (parish parity fields)',
          `inZone=${b.inZone} marketId=${b.marketId ?? 'null'} outsideParish=${b.outsideParish}`,
        );
      } else {
        fail('POST /admin/markets/check-point', `${res.status} ${JSON.stringify(b).slice(0, 200)}`);
      }
    }

    // 4. Kingston pin — expect out of zone when ST-only active (common seed state)
    {
      const res = await adminMarkets('/check-point', {
        method: 'POST',
        body: JSON.stringify({ lat: 18.0179, lng: -76.8096 }),
      });
      const b = res.body || {};
      if (res.status === 200 && typeof b.inZone === 'boolean') {
        pass('POST check-point Kingston', `inZone=${b.inZone} reason=${(b.reason || '').slice(0, 60)}`);
      } else {
        fail('POST check-point Kingston', `${res.status} ${JSON.stringify(b).slice(0, 160)}`);
      }
    }

    // 5. backfill accepts unlock_after query param (dry run — include_locked=false, no mutation expected)
    {
      const res = await adminMarkets('/backfill-merchant-markets?include_locked=false&unlock_after=true', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      const b = res.body || {};
      if (res.status === 200 && typeof b.unlocked === 'number') {
        pass('POST backfill-merchant-markets unlock_after param', `unlocked=${b.unlocked} updated=${b.updated ?? 0}`);
      } else {
        fail('POST backfill-merchant-markets', `${res.status} ${JSON.stringify(b).slice(0, 160)}`);
      }
    }
  }

  const failed = results.filter(([s]) => s === 'FAIL');
  console.log(`\n${failed.length ? 'SMOKE FAILED' : 'SMOKE PASSED'} (${results.length} checks, ${failed.length} failed)`);
  if (failed.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
