/**
 * Normalized MD5 for migration bodies — matches production check in docs/ci-red-root-cause.md:
 * strip `--…` line comments, remove all whitespace, MD5 hex digest.
 */
import { createHash } from 'node:crypto';

export const MIGRATION_SYNC_VERSION_MIN = '20261029140000';
/** No upper bound — new migrations must stay in MD5 sync checks (audit R20-03). */
export const MIGRATION_SYNC_VERSION_MAX = '99999999999999';

/** Prod recorded placeholder-only rows; keep repo file as-is. */
/** Replay guard — repo body differs from prod on purpose (safe empty-DB replay). */
export const MIGRATION_SYNC_SKIP_VERSIONS = new Set([
  '20261029214649',
  '20261030022441',
  '20261031000834',
  '20261101022741',
  '20261101024022',
  '20261101032731',
  '20261101172128',
  '20261101174625',
  '20261029210000',
  '20261101181057',
  '20261101181109',
  '20261101181112',
]);

export function normalizeMigrationSqlForMd5(sql) {
  const noComments = sql.replace(/--[^\n]*/g, '');
  const noWs = noComments.replace(/\s+/g, '');
  return noWs;
}

/** Body for repo replay: prod statement array with semicolon boundaries. */
export function migrationBodyFromProdStatements(statements) {
  if (!statements?.length) return '';
  const parts = statements.map((s) => String(s).trimEnd().replace(/;\s*$/, ''));
  return `${parts.join(';\n')};\n`;
}

export function migrationBodyMd5(sql) {
  return createHash('md5').update(normalizeMigrationSqlForMd5(sql), 'utf8').digest('hex');
}

export function versionInSyncRange(version) {
  return version >= MIGRATION_SYNC_VERSION_MIN && version <= MIGRATION_SYNC_VERSION_MAX;
}
