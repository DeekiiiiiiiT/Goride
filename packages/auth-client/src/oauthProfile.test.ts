import { describe, expect, it } from 'vitest';
import {
  clearOAuthProfileMetadataPatch,
  hasOAuthInjectedProfileMetadata,
  userHasGoogleIdentity,
} from './oauthProfile';

describe('userHasGoogleIdentity', () => {
  it('returns true when a google identity exists', () => {
    expect(
      userHasGoogleIdentity({
        identities: [{ provider: 'google' }],
      }),
    ).toBe(true);
  });

  it('returns false when identities are missing', () => {
    expect(userHasGoogleIdentity(null)).toBe(false);
    expect(userHasGoogleIdentity({ identities: [{ provider: 'email' }] })).toBe(false);
  });
});

describe('clearOAuthProfileMetadataPatch', () => {
  it('nulls oauth profile metadata keys', () => {
    expect(clearOAuthProfileMetadataPatch()).toEqual({
      name: null,
      full_name: null,
      avatar_url: null,
      picture: null,
    });
  });
});

describe('hasOAuthInjectedProfileMetadata', () => {
  it('detects injected profile fields', () => {
    expect(hasOAuthInjectedProfileMetadata({ name: 'Ada Lovelace' })).toBe(true);
    expect(hasOAuthInjectedProfileMetadata({ surface: 'hauler' })).toBe(false);
  });
});
