import { describe, expect, it } from 'vitest';
import {
  coverageGapMessage,
  defaultDeclaredCoverage,
  formatCoverDay,
  parseStatementPeriodBanner,
} from './statementCoverage';

describe('statement coverage', () => {
  it('prefills the run week when the file has no stated period', () => {
    const declared = defaultDeclaredCoverage({
      weekKey: '2026-10-12',
      dataStart: '2026-10-14',
      dataEnd: '2026-10-16',
    });
    expect(declared).toEqual({ coverageStart: '2026-10-12', coverageEnd: '2026-10-18' });
    expect(formatCoverDay('2026-10-12')).toBe('Mon 12 Oct');
    expect(formatCoverDay('2026-10-18')).toBe('Sun 18 Oct');
  });

  it('keeps a mid-week toll file covered for the whole declared week', () => {
    const declared = defaultDeclaredCoverage({
      weekKey: '2026-10-19',
      dataStart: '2026-10-21',
      dataEnd: '2026-10-23',
    });
    expect(declared.coverageStart).toBe('2026-10-19');
    expect(declared.coverageEnd).toBe('2026-10-25');
    expect(
      coverageGapMessage({
        coverageStart: declared.coverageStart,
        coverageEnd: declared.coverageEnd,
        dataStart: '2026-10-21',
        dataEnd: '2026-10-23',
      }),
    ).toBeNull();
  });

  it('uses a period printed on the file', () => {
    const banner = parseStatementPeriodBanner(
      'Tag statement\nPeriod: 12 Oct 2026 to 18 Oct 2026\nPlaza Name,Date & Time,Amount\n',
    );
    expect(banner).toEqual({ start: '2026-10-12', end: '2026-10-18' });
    expect(
      defaultDeclaredCoverage({
        weekKey: '2026-10-19',
        filePeriodStart: banner.start,
        filePeriodEnd: banner.end,
        dataStart: '2026-10-14',
        dataEnd: '2026-10-16',
      }),
    ).toEqual({ coverageStart: '2026-10-12', coverageEnd: '2026-10-18' });
  });

  it('blocks a range that cuts off a transaction that will be saved', () => {
    expect(
      coverageGapMessage({
        coverageStart: '2026-10-15',
        coverageEnd: '2026-10-18',
        dataStart: '2026-10-14',
        dataEnd: '2026-10-16',
      }),
    ).toMatch(/Wed 14 Oct/);
  });
});
