import {
  buildHeaderMap,
  getColByMap,
  isoToMinuteKey,
  normalizeCsvTagId,
  normalizePlazaNameForRef,
  normalizeTagForLookup,
  parseCsvDateTimeToJamaicaIso,
  parseCsvRows,
  resolvePlazaIdByName,
  toMinor,
} from './common.ts';
import type {
  AdapterProblem,
  TagStatementChargeRow,
  TagStatementCtx,
  TagStatementResult,
  TopupRow,
} from './types.ts';

function isTagStatementHeader(map: Record<string, number>): boolean {
  const hasPlaza = 'plaza name' in map;
  const hasAmount = 'amount' in map || 'topup amount' in map;
  const hasDate = 'date & time' in map;
  const isTopupOnly =
    ('transaction id' in map || 'transactions id' in map) && !hasPlaza;
  return hasPlaza && hasAmount && hasDate && !isTopupOnly;
}

export function tagStatement(text: string, ctx: TagStatementCtx): TagStatementResult {
  const problems: AdapterProblem[] = [];
  const rows: TagStatementChargeRow[] = [];
  const topups: TopupRow[] = [];
  const crossingOccurrenceCount = new Map<string, number>();
  const topupOccurrenceCount = new Map<string, number>();

  const matrix = parseCsvRows(text);
  const headerIndex = matrix.findIndex((row) =>
    row.some((cell) => {
      const lower = (cell || '').trim().toLowerCase();
      return lower === 'plaza name' || lower === 'tag id' || lower === 'date & time';
    }),
  );

  if (headerIndex === -1) {
    problems.push({ row: 1, reason: 'Missing tag statement header' });
    return { kind: 'tag_statement', rows, topups, problems };
  }

  const headerMap = buildHeaderMap(matrix[headerIndex]);
  if (!isTagStatementHeader(headerMap)) {
    problems.push({ row: headerIndex + 1, reason: 'Unrecognized tag statement format' });
    return { kind: 'tag_statement', rows, topups, problems };
  }

  for (let i = headerIndex + 1; i < matrix.length; i++) {
    const parts = matrix[i].map((c) => (c || '').trim());
    if (parts.length === 0) continue;
    const rowNum = i + 1;
    const first = (parts[0] || '').toLowerCase();
    if (first.startsWith('tag id') || first.startsWith('plaza name')) continue;

    const tagId = normalizeCsvTagId(getColByMap(parts, headerMap, 'tag id'));
    const plazaName = getColByMap(parts, headerMap, 'plaza name');
    const plazaRef = normalizePlazaNameForRef(plazaName);
    const laneId = getColByMap(parts, headerMap, 'plaza lane id');
    const dateStr = getColByMap(parts, headerMap, 'date & time', 'date');
    const amountStr = getColByMap(parts, headerMap, 'amount', 'topup amount');

    if (!dateStr) {
      problems.push({ row: rowNum, reason: 'Missing date & time' });
      continue;
    }
    const occurredAt = parseCsvDateTimeToJamaicaIso(dateStr);
    if (!occurredAt) {
      problems.push({ row: rowNum, reason: `Invalid date: ${dateStr}` });
      continue;
    }

    const amountMinor = toMinor(amountStr);
    if (amountMinor === null) {
      problems.push({ row: rowNum, reason: `Invalid amount: ${amountStr}` });
      continue;
    }

    if (amountMinor === 0) {
      problems.push({ row: rowNum, reason: `Invalid amount: ${amountStr}` });
      continue;
    }

    const tagKey = normalizeTagForLookup(tagId);
    const vehicleId = ctx.tagToVehicle[tagKey] ?? ctx.tagToVehicle[tagId];
    if (!vehicleId) {
      problems.push({ row: rowNum, reason: `Vehicle not found for tag ${tagId}` });
      continue;
    }
    const driverId = ctx.vehicleToDriver[vehicleId];

    if (amountMinor > 0) {
      const minuteIso = isoToMinuteKey(occurredAt);
      const topupKey = `tagtopup:${tagKey}|${minuteIso}|${amountMinor}`;
      const n = (topupOccurrenceCount.get(topupKey) ?? 0) + 1;
      topupOccurrenceCount.set(topupKey, n);
      const toppedUpOn = occurredAt.slice(0, 10);
      topups.push({
        source_ref: `${topupKey}#${n}`,
        topped_up_on: toppedUpOn,
        amount_minor: amountMinor,
        provider: 'transjam',
        account_ref: tagKey,
        vehicle_id: vehicleId,
      });
      continue;
    }

    const plazaId = resolvePlazaIdByName(plazaName, ctx.plazaIdByName);
    if (!plazaId) {
      problems.push({ row: rowNum, reason: `Plaza not known: ${plazaName}` });
      continue;
    }

    const crossingMinor = Math.abs(amountMinor);
    const minuteIso = isoToMinuteKey(occurredAt);
    const baseKey = `tag:${tagKey}|${plazaRef}|${laneId}|${minuteIso}|${crossingMinor}`;
    const n = (crossingOccurrenceCount.get(baseKey) ?? 0) + 1;
    crossingOccurrenceCount.set(baseKey, n);

    const charge: TagStatementChargeRow = {
      source_ref: `${baseKey}#${n}`,
      occurred_at: minuteIso + ':00-05:00',
      amount_minor: crossingMinor,
      plaza_id: plazaId,
      vehicle_id: vehicleId,
      time_precision: 'minute',
    };
    if (driverId) charge.driver_id = driverId;
    rows.push(charge);
  }

  return { kind: 'tag_statement', rows, topups, problems };
}
