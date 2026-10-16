import { describe, expect, it } from 'vitest';
import { ALL_SETTINGS, SETTINGS_BY_KEY } from './catalog';

describe('rush-settings registry snapshot', () => {
  it('has unique keys', () => {
    expect(SETTINGS_BY_KEY.size).toBe(ALL_SETTINGS.length);
  });

  it('matches keys, defaults, clientVisible, and risk', () => {
    const snapshot = ALL_SETTINGS.map((s) => ({
      key: s.key,
      default: s.default,
      clientVisible: s.clientVisible,
      risk: s.risk,
    }));
    expect(snapshot).toMatchSnapshot();
  });
});
