#!/usr/bin/env node
/**
 * I7: two-session concurrent seal_week (local Docker only).
 */
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const CONTAINER = 'supabase_db_Goride';

const OWNER = 'e7011111-1111-4111-8111-111111111111';
const ORG = 'e7111111-1111-4111-8111-111111111101';
const WEEK_RACE1 = '2026-05-11';
const WEEK_RACE2 = '2026-05-18';

function die(msg) {
  console.error(`toll-concurrency-test: ${msg}`);
  process.exit(1);
}

function dockerPsName() {
  const r = spawnSync(
    'docker',
    ['ps', '--format', '{{.Names}}'],
    { encoding: 'utf8', shell: process.platform === 'win32' },
  );
  const names = (r.stdout || '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  if (!names.includes(CONTAINER)) {
    die(`refusing to run: expected container ${CONTAINER}, found: ${names.join(', ') || '(none)'}`);
  }
}

function psql(sql, label) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'docker',
      ['exec', '-i', CONTAINER, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'],
      { stdio: ['pipe', 'pipe', 'pipe'], shell: process.platform === 'win32' },
    );
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`${label} failed (${code}): ${err || out}`));
      } else {
        resolve({ out, err });
      }
    });
    child.stdin.write(sql);
    child.stdin.end();
  });
}

function jwtBlock() {
  return `
  PERFORM set_config('request.jwt.claims', json_build_object(
    'sub', '${OWNER}',
    'role', 'authenticated',
    'app_metadata', json_build_object('organizationId', '${ORG}')
  )::text, true);
  SET LOCAL ROLE authenticated;`;
}

const SETUP = `
INSERT INTO auth.users (id, email)
SELECT '${OWNER}'::uuid, 'toll-concurrency@example.com'
WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = '${OWNER}'::uuid);

INSERT INTO public.organizations (id, owner_id, name, slug, product_line, status)
VALUES ('${ORG}'::uuid, '${OWNER}'::uuid, 'Toll Concurrency Org', 'toll-concurrency', 'fleet', 'active')
ON CONFLICT (id) DO NOTHING;

INSERT INTO toll.switch_state (organization_id, tolls_v2)
VALUES ('${ORG}'::uuid, true)
ON CONFLICT (organization_id) DO UPDATE SET tolls_v2 = true;

SELECT toll_system.ensure_accounts('${ORG}'::uuid);
`;

function raceSealSql(week, commandId, sleepSec, noticeTag) {
  return `
DO $$
DECLARE v_resp jsonb; v_msg text;
BEGIN
  ${jwtBlock()}
  v_resp := public.toll_v2_command('seal_week', jsonb_build_object(
    'command_id', '${commandId}',
    'week_key', '${week}'::date,
    'expected_week_version', 0
  ));
  RAISE NOTICE '${noticeTag}:resp:%', v_resp::text;
  IF ${sleepSec > 0 ? 'true' : 'false'} THEN
    PERFORM pg_sleep(${sleepSec});
  END IF;
EXCEPTION WHEN SQLSTATE 'P0001' THEN
  GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
  RAISE NOTICE '${noticeTag}:code:%', v_msg;
END;
$$;
`;
}

function raceSealSqlFailOk(week, commandId, noticeTag) {
  return `
DO $$
DECLARE v_msg text;
BEGIN
  ${jwtBlock()}
  PERFORM public.toll_v2_command('seal_week', jsonb_build_object(
    'command_id', '${commandId}',
    'week_key', '${week}'::date,
    'expected_week_version', 0
  ));
  RAISE EXCEPTION '${noticeTag}: unexpected success';
EXCEPTION WHEN SQLSTATE 'P0001' THEN
  GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
  IF v_msg NOT IN ('VERSION_CHANGED', 'WEEK_SEALED') THEN
    RAISE EXCEPTION '${noticeTag}: expected VERSION_CHANGED or WEEK_SEALED, got %', v_msg;
  END IF;
  RAISE NOTICE '${noticeTag}:code:%', v_msg;
END;
$$;
`;
}

function extractNotice(out, tag, suffix) {
  const re = new RegExp(`${tag}:${suffix}:([^\\n]+)`, 'i');
  const m = out.match(re);
  return m ? m[1].trim() : null;
}

function firstQueryInt(out) {
  const rows = out.match(/^\s*(\d+)\s*$/gm);
  if (!rows || !rows.length) return NaN;
  return Number(rows[rows.length - 1].trim());
}

function decisionIdFromResp(respText) {
  if (!respText) return null;
  const m = respText.match(/"decision_id"\s*:\s*"([0-9a-f-]{36})"/i);
  return m ? m[1] : null;
}

async function main() {
  dockerPsName();
  await psql(SETUP, 'setup');

  const cmd1 = 'toll-concurrency-race-1';
  const race1A = raceSealSql(WEEK_RACE1, cmd1, 3, 'race1a');
  const race1B = raceSealSql(WEEK_RACE1, cmd1, 0, 'race1b');

  const pA = psql(race1A, 'race1-A');
  await new Promise((r) => setTimeout(r, 1000));
  const pB = psql(race1B, 'race1-B');
  const [resA, resB] = await Promise.all([pA, pB]);

  const respA = extractNotice(resA.out + resA.err, 'race1a', 'resp');
  const respB = extractNotice(resB.out + resB.err, 'race1b', 'resp');
  const idA = decisionIdFromResp(respA);
  const idB = decisionIdFromResp(respB);
  if (!idA || !idB || idA !== idB) {
    die(`race1: decision_id mismatch (A=${idA} B=${idB})`);
  }
  if (!respB || !/\"replay\"\s*:\s*true/.test(respB)) {
    die('race1: session B must return replay:true');
  }

  const verify1 = await psql(
    `SELECT count(*)::int FROM ledger.week_statements ws
     WHERE ws.organization_id = '${ORG}'::uuid AND ws.kind = 'toll_week' AND ws.driver_id = '*'
       AND ws.week_key = '${WEEK_RACE1}'::date AND ws.status = 'closed';`,
    'race1-verify',
  );
  if (firstQueryInt(verify1.out) !== 1) {
    die(`race1: expected 1 closed statement, got: ${verify1.out.trim()}`);
  }

  const race2A = raceSealSql(WEEK_RACE2, 'toll-concurrency-race-2a', 3, 'race2a');
  const race2B = raceSealSqlFailOk(WEEK_RACE2, 'toll-concurrency-race-2b', 'race2b');
  const p2A = psql(race2A, 'race2-A');
  await new Promise((r) => setTimeout(r, 1000));
  const p2B = psql(race2B, 'race2-B');
  const [, res2B] = await Promise.all([p2A, p2B]);

  const codeB = extractNotice(res2B.out + res2B.err, 'race2b', 'code');
  if (!codeB) {
    die('race2: session B should fail with VERSION_CHANGED or WEEK_SEALED');
  }

  const verify2 = await psql(
    `SELECT count(*)::int FROM ledger.week_statements ws
     WHERE ws.organization_id = '${ORG}'::uuid AND ws.kind = 'toll_week' AND ws.driver_id = '*'
       AND ws.week_key = '${WEEK_RACE2}'::date AND ws.status = 'closed';`,
    'race2-verify',
  );
  if (firstQueryInt(verify2.out) !== 1) {
    die(`race2: expected 1 closed statement, got: ${verify2.out.trim()}`);
  }

  console.log(
    'ok  toll-concurrency-test (dedicated e711… org; no row cleanup — db reset in run-toll-tests)',
  );
}

main().catch((e) => die(e.message));
