import { describe, expect, it } from 'vitest';
import {
  coverageGapMessage,
  coverageWideWarning,
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

  it('rejects a year-long declaration for a one-week file', () => {
    expect(
      coverageGapMessage({
        coverageStart: '2026-01-01',
        coverageEnd: '2026-12-31',
        dataStart: '2026-10-19',
        dataEnd: '2026-10-23',
        weekKey: '2026-10-19',
      }),
    ).toMatch(/this week/);
  });

  it('allows 31 days when the file has no printed period and no week', () => {
    expect(
      coverageGapMessage({
        coverageStart: '2026-10-01',
        coverageEnd: '2026-10-31',
        dataStart: '2026-10-05',
        dataEnd: '2026-10-10',
      }),
    ).toBeNull();
    expect(
      coverageGapMessage({
        coverageStart: '2026-10-01',
        coverageEnd: '2026-11-01',
        dataStart: '2026-10-05',
        dataEnd: '2026-10-10',
      }),
    ).toMatch(/31 days/);
  });

  it('lets an approver keep a wide range and warns how far it runs past the data', () => {
    expect(
      coverageGapMessage({
        coverageStart: '2026-01-01',
        coverageEnd: '2026-12-31',
        dataStart: '2026-10-19',
        dataEnd: '2026-10-25',
        weekKey: '2026-10-19',
        allowWide: true,
      }),
    ).toBeNull();
    expect(
      coverageWideWarning({
        coverageStart: '2026-10-12',
        coverageEnd: '2026-11-01',
        dataStart: '2026-10-19',
        dataEnd: '2026-10-25',
        sourceLabel: 'Toll usage',
      }),
    ).toBe('Toll usage declared to cover 2 weeks beyond its data');
  });
});
