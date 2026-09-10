import { describe, expect, it } from 'vitest';
import {
  SETTLED_NOT_SIGNED_TOOLTIP,
  settledSignedLabel,
} from './settlementDeskUx';

describe('settledSignedLabel', () => {
  it('labels signed freeze as Settled · signed', () => {
    expect(settledSignedLabel(true)).toBe('Settled · signed');
  });

  it('labels unsettled freeze as Settled · not signed', () => {
    expect(settledSignedLabel(false)).toBe('Settled · not signed');
  });

  it('exposes operator tooltip for not-signed', () => {
    expect(SETTLED_NOT_SIGNED_TOOLTIP).toMatch(/Close Week/i);
    expect(SETTLED_NOT_SIGNED_TOOLTIP).toMatch(/click/i);
  });
});
