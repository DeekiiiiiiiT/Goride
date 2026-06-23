import { describe, expect, it } from 'vitest';
import {
  REALTIME_CONNECTED_HEARTBEAT_MS,
  REALTIME_DISCONNECTED_POLL_MS,
  resolveOrdersRefetchInterval,
} from './merchant-orders-sync-policy';

describe('resolveOrdersRefetchInterval', () => {
  it('pauses polling when tab is hidden', () => {
    expect(
      resolveOrdersRefetchInterval({ realtimeStatus: 'connected', isTabVisible: false }),
    ).toBe(false);
    expect(
      resolveOrdersRefetchInterval({ realtimeStatus: 'disconnected', isTabVisible: false }),
    ).toBe(false);
  });

  it('uses heartbeat when realtime is connected and tab visible', () => {
    expect(
      resolveOrdersRefetchInterval({ realtimeStatus: 'connected', isTabVisible: true }),
    ).toBe(REALTIME_CONNECTED_HEARTBEAT_MS);
  });

  it('uses aggressive polling when realtime is not connected', () => {
    expect(
      resolveOrdersRefetchInterval({ realtimeStatus: 'connecting', isTabVisible: true }),
    ).toBe(REALTIME_DISCONNECTED_POLL_MS);
    expect(
      resolveOrdersRefetchInterval({ realtimeStatus: 'disconnected', isTabVisible: true }),
    ).toBe(REALTIME_DISCONNECTED_POLL_MS);
    expect(
      resolveOrdersRefetchInterval({ realtimeStatus: 'error', isTabVisible: true }),
    ).toBe(REALTIME_DISCONNECTED_POLL_MS);
  });
});
