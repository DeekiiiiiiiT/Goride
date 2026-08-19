import { describe, expect, it } from 'vitest';
import { DEFAULT_NOTIFICATION_PREFS, mergeNotificationPrefs } from './accountSubContent';

describe('mergeNotificationPrefs', () => {
  it('fills missing keys from defaults', () => {
    expect(mergeNotificationPrefs({ promotions: false }).promotions).toBe(false);
    expect(mergeNotificationPrefs({ promotions: false }).smsUpdates).toBe(DEFAULT_NOTIFICATION_PREFS.smsUpdates);
  });
});
