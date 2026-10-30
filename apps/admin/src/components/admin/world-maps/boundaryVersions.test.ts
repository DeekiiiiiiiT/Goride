import { describe, expect, it } from 'vitest';
import { isOldTemplate, sortBoundaryVersions } from './boundaryVersions';

describe('boundary versions', () => {
  it('T10 puts the live version first when it was created last and tags old templates', () => {
    const rows = sortBoundaryVersions([
      { id: 'old', version: 4, status: 'retired', created_at: '2026-08-27T00:00:00Z', notes: 'Retired parish template' },
      { id: 'live', version: 1, status: 'published', created_at: '2026-10-24T12:00:00Z', notes: 'Published' },
      { id: 'snap', version: 2, status: 'retired', created_at: '2026-10-24T01:00:00Z', notes: 'Pre-promote snapshot' },
    ]);
    expect(rows[0].id).toBe('live');
    expect(rows[0].status).toBe('published');
    expect(isOldTemplate(rows[1].notes)).toBe(true);
    expect(isOldTemplate('Retired parish template')).toBe(true);
    expect(isOldTemplate('Published')).toBe(false);
  });
});
