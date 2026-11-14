import {
  buildHeaderMap,
  getColByMap,
  normalizeCsvTagId,
  normalizeTagForLookup,
  parseCsvDateTimeToJamaicaIso,
  parseCsvRows,
  toMinor,
} from './common.ts';
import type { AdapterProblem, TopupProviderCtx, TopupProviderResult, TopupRow } from './types.ts';

export function topupProvider(text: string, ctx: TopupProviderCtx = {}): TopupProviderResult {
  const problems: AdapterProblem[] = [];
  const rows: TopupRow[] = [];

  const matrix = parseCsvRows(text);
  const headerIndex = matrix.findIndex((row) =>
    row.some((cell) => {
      const lower = (cell || '').trim().toLowerCase();
      return (
        lower === 'transaction id' ||
        lower === 'transactions id' ||
        lower === 'topup amount' ||
        lower === 'product account number' ||
        lower === 'top up status'
      );
    }),
  );

  if (headerIndex === -1) {
    problems.push({ row: 1, reason: 'Missing top-up provider header' });
    return { kind: 'topups', rows, problems };
  }

  const headerMap = buildHeaderMap(matrix[headerIndex]);

  for (let i = headerIndex + 1; i < matrix.length; i++) {
    const parts = matrix[i].map((c) => (c || '').trim());
    // Blank lines (",,,,") at the end of an export are not rows.
    if (parts.every((c) => c === '')) continue;
    const rowNum = i + 1;

    const paymentStatus = getColByMap(parts, headerMap, 'payment status', 'payment').toLowerCase();
    const topUpStatus = getColByMap(parts, headerMap, 'top up status').toLowerCase();
    if (paymentStatus === 'failure' || topUpStatus === 'failure') {
      problems.push({ row: rowNum, reason: 'Failed top-up transaction' });
      continue;
    }

    const txId = getColByMap(parts, headerMap, 'transaction id', 'transactions id');
    if (!txId) {
      problems.push({ row: rowNum, reason: 'Missing transaction id' });
      continue;
    }

    const accountRaw = normalizeCsvTagId(
      getColByMap(parts, headerMap, 'product account number', 'tag id'),
    );
    const accountRef = normalizeTagForLookup(accountRaw);
    const dateStr =
      getColByMap(parts, headerMap, 'date & time') ||
      `${getColByMap(parts, headerMap, 'date')} ${getColByMap(parts, headerMap, 'time')}`.trim();
    const amountStr = getColByMap(parts, headerMap, 'topup amount', 'amount');

    const occurred = parseCsvDateTimeToJamaicaIso(dateStr);
    if (!occurred) {
      problems.push({ row: rowNum, reason: `Invalid date: ${dateStr}` });
      continue;
    }
    const amountMinor = toMinor(amountStr);
    if (amountMinor === null || amountMinor <= 0) {
      problems.push({ row: rowNum, reason: `Invalid top-up amount: ${amountStr}` });
      continue;
    }

    const vehicleId = ctx.tagToVehicle?.[accountRef] ?? ctx.tagToVehicle?.[accountRaw];

    const row: TopupRow = {
      source_ref: txId,
      topped_up_on: occurred.slice(0, 10),
      amount_minor: amountMinor,
      provider: 'transjam',
      account_ref: accountRef,
    };
    if (vehicleId) row.vehicle_id = vehicleId;
    rows.push(row);
  }

  return { kind: 'topups', rows, problems };
}
