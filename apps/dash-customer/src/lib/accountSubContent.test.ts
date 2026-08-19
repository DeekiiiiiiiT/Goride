import { describe, expect, it } from 'vitest';
import { DEFAULT_NOTIFICATION_PREFS, faqsForTopic, mergeNotificationPrefs } from './accountSubContent';

describe('faqsForTopic', () => {
  it('filters account answers when that tile is selected', () => {
    const items = faqsForTopic('account');
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((item) => item.topic === 'account')).toBe(true);
  });

  it('matches search across topics when none is selected', () => {
    expect(faqsForTopic(null, 'refund').some((item) => item.id === 'refunds')).toBe(true);
  });
});

describe('mergeNotificationPrefs', () => {
  it('fills missing keys from defaults', () => {
    expect(mergeNotificationPrefs({ promotions: false }).promotions).toBe(false);
    expect(mergeNotificationPrefs({ promotions: false }).smsUpdates).toBe(DEFAULT_NOTIFICATION_PREFS.smsUpdates);
  });
});
