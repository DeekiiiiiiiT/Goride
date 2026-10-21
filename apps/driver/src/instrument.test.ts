import { describe, expect, it } from 'vitest';
import { webViewGoneReportLevel } from './instrument';

describe('webViewGoneReportLevel', () => {
  it('does not report an Android memory kill the app already recovered from', () => {
    expect(webViewGoneReportLevel('kill')).toBeNull();
  });

  it('reports a real renderer crash', () => {
    expect(webViewGoneReportLevel('crash')).toBe('error');
  });
});
