import { describe, expect, it } from 'vitest';
import { csvEscape, csvDocument } from './ledgerCsvEscape';

describe('csvEscape', () => {
  it('neutralizes formula injection', () => {
    expect(csvEscape('=HYPERLINK("http://x")')).toBe("\"'=HYPERLINK(\"\"http://x\"\")\"");
    expect(csvEscape('+cmd')).toBe("'+cmd");
    expect(csvEscape('-1+1')).toBe("'-1+1");
    expect(csvEscape('@sum')).toBe("'@sum");
  });

  it('keeps plain negative numbers numeric for Excel sums', () => {
    expect(csvEscape('-1500.00')).toBe('-1500.00');
    expect(csvEscape('1234.56')).toBe('1234.56');
  });

  it('still neutralizes formula-like leading minus', () => {
    expect(csvEscape('-1+1')).toBe("'-1+1");
  });

  it('csvDocument adds BOM and CRLF', () => {
    const doc = csvDocument(['a,b', '1,2']);
    expect(doc.startsWith('\uFEFF')).toBe(true);
    expect(doc.includes('\r\n')).toBe(true);
  });
});
