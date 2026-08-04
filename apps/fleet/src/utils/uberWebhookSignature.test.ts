import { describe, expect, it } from 'vitest';
import { hmacSha256Hex, verifyUberSignature } from './uberWebhookSignature';
import { UBER_FLEET_PORTAL } from '../constants/uberFleetPortal';

describe('uberWebhookSignature', () => {
  it('verifies X-Uber-Signature style HMAC-SHA256 hex', async () => {
    const secret = 'test-client-secret';
    const body = JSON.stringify({ event_id: 'abc', event_type: 'test' });
    const sig = await hmacSha256Hex(secret, body);
    expect(await verifyUberSignature(secret, body, sig)).toBe(true);
    expect(await verifyUberSignature(secret, body, 'deadbeef')).toBe(false);
    expect(await verifyUberSignature(secret, body + 'x', sig)).toBe(false);
  });
});

describe('UBER_FLEET_PORTAL', () => {
  it('has production redirect and privacy URLs', () => {
    expect(UBER_FLEET_PORTAL.privacyPolicyUrl).toContain('roamenterprise.co/privacy');
    expect(UBER_FLEET_PORTAL.redirectUriProduction).toContain('roamfleet.co/uber-callback');
    expect(UBER_FLEET_PORTAL.webhookUrl).toContain('/uber/webhook');
    expect(UBER_FLEET_PORTAL.phase1Scopes.length).toBeGreaterThan(0);
  });
});
