import { describe, expect, it } from 'vitest';
import { csvEscape, csvDocument } from './ledgerCsvEscape';

describe('csvEscape', () => {
  it('neutralizes formula injection', () => {
    expect(csvEscape('=HYPERLINK("http://x")')).toBe("\"'=HYPERLINK(\"\"http://x\"\")\"");
    expect(csvEscape('+cmd')).toBe("'+cmd");
    expect(csvEscape('-1+1')).toBe("'-1+1");
    expect(csvEscape('@sum')).toBe("'@sum");
  });

  it('quotes commas and embedded quotes', () => {
    expect(csvEscape('a,b')).toBe('"a,b"');
    expect(csvEscape('say "hi"')).toBe('"say ""hi"""');
  });

  it('csvDocument adds BOM and CRLF', () => {
    const doc = csvDocument(['a,b', '1,2']);
    expect(doc.startsWith('\uFEFF')).toBe(true);
    expect(doc.includes('\r\n')).toBe(true);
  });
});
