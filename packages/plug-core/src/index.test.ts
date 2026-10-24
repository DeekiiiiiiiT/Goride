import { describe, expect, it } from 'vitest';
import {
  FLEET_MONEY_TABLES,
  contributorLevel,
  decidePlugStation,
  documentStatus,
  hashExplorerUser,
  impossibleTravel,
  planPlugFill,
  plugPriceDecision,
  projectServiceDue,
  sectionEnabled,
  suggestReview,
  writesTouchFleetMoney,
} from './index';

describe('Plug fill isolation', () => {
  it('never plans a write into fleet money', () => {
    const writes = planPlugFill({ decision: 'learnt', price: 'publish' });
    const tables = writes.map((w) => w.table);
    expect(writesTouchFleetMoney(tables)).toEqual([]);
    expect(tables).toContain('explorer.fuel_log');
    expect(tables).toContain('fleet.stations');
    expect(writes.find((w) => w.table === 'fleet.stations')?.organizationId).toBeNull();
    for (const banned of FLEET_MONEY_TABLES) {
      expect(tables).not.toContain(banned);
    }
  });

  it('a confirm does not open a new station row', () => {
    const tables = planPlugFill({ decision: 'confirm', price: 'hold' }).map((w) => w.table);
    expect(tables).not.toContain('fleet.stations');
    expect(tables).toContain('places.price_observation');
  });
});

describe('station and price decisions', () => {
  it('follows the shared match confidence', () => {
    expect(decidePlugStation({ confidence: 'high', station: { id: 's', name: 'A', brand: '', address: '', location: { lat: 1, lng: 1 }, status: 'verified' } })).toBe('confirm');
    expect(decidePlugStation({ confidence: 'ambiguous', station: null })).toBe('review');
    expect(decidePlugStation({ confidence: 'none', station: null })).toBe('learnt');
    expect(decidePlugStation({ confidence: 'high', station: { id: 'l', name: 'Learnt', brand: '', address: '', location: { lat: 1, lng: 1 }, status: 'learnt' } })).toBe('review');
  });

  it('reuses a learnt station instead of opening another one', () => {
    const tables = planPlugFill({ decision: 'review', price: 'hold' }).map((w) => w.table);
    expect(tables).not.toContain('fleet.stations');
  });

  it('publishes in-band prices and holds the rest', () => {
    expect(plugPriceDecision(270, 280)).toBe('publish');
    expect(plugPriceDecision(400, 280)).toBe('hold');
    expect(plugPriceDecision(20, 280)).toBe('hold');
  });
});

describe('care, trust, and review', () => {
  it('projects the earlier of km and time', () => {
    const due = projectServiceDue({
      intervalKm: 5000,
      intervalDays: 180,
      lastKm: 10000,
      lastDoneOn: '2026-01-01T00:00:00.000Z',
      kmPerDay: 100,
      now: '2026-02-01T00:00:00.000Z',
    });
    expect(due.status).toBe('upcoming');
    expect(due.dueOn).toBeTruthy();
  });

  it('flags documents the way the driver centre does', () => {
    expect(documentStatus(null, '2026-06-01')).toBe('missing');
    expect(documentStatus('2026-05-01', '2026-06-01')).toBe('overdue');
    expect(documentStatus('2026-06-15', '2026-06-01')).toBe('due_soon');
    expect(documentStatus('2026-12-01', '2026-06-01')).toBe('valid');
  });

  it('suggests a duplicate and only bulk-approves strong evidence', () => {
    expect(suggestReview({ distinctUsers: 5, bestAccuracyM: 12, nearbyVerifiedName: 'Rubis' }).label).toMatch(/Rubis/);
    expect(suggestReview({ distinctUsers: 5, bestAccuracyM: 12 }).bulkOk).toBe(true);
    expect(suggestReview({ distinctUsers: 2, bestAccuracyM: 12 }).bulkOk).toBe(false);
  });

  it('catches impossible travel and keeps badges free', () => {
    expect(impossibleTravel(
      { lat: 18.0, lng: -76.8, at: '2026-06-01T12:00:00.000Z' },
      { lat: 18.4, lng: -77.9, at: '2026-06-01T12:05:00.000Z' },
    )).toBe(true);
    expect(contributorLevel(0).name).toBe('Scout');
    expect(contributorLevel(5).name).toBe('Guide');
  });

  it('keeps sections off until a global flag or an allowlist', () => {
    expect(sectionEnabled('plug.explore', false, false)).toBe(false);
    expect(sectionEnabled('plug.explore', false, true)).toBe(true);
  });

  it('hashes a user so Dominion never stores the id', async () => {
    const a = await hashExplorerUser('user-1', 'pepper');
    const b = await hashExplorerUser('user-1', 'pepper');
    const c = await hashExplorerUser('user-2', 'pepper');
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).not.toContain('user-1');
  });
});
