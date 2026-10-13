import { describe, expect, it } from 'vitest';
import { parkDraft, shouldResumeOpen } from './pendingDrafts';

describe('parkDraft', () => {
  it('keeps every saved restaurant', () => {
    const first = { id: 'a', name: 'Chanz kitchen' };
    const second = { id: 'b', name: 'Sakura Express' };
    expect(parkDraft(parkDraft([], first), second)).toEqual([second, first]);
  });

  it('updates the restaurant they continued without dropping the others', () => {
    const stored = [
      { id: 'b', name: 'Sakura Express' },
      { id: 'a', name: 'Chanz kitchen' },
    ];
    expect(parkDraft(stored, { id: 'a', name: 'Chanz kitchen updated' })).toEqual([
      { id: 'a', name: 'Chanz kitchen updated' },
      { id: 'b', name: 'Sakura Express' },
    ]);
  });
});

describe('shouldResumeOpen', () => {
  it('leaves the create form empty when that restaurant is already pending', () => {
    expect(shouldResumeOpen({ id: 'a' }, [{ id: 'a' }])).toBe(false);
  });

  it('opens a restaurant only after Continue', () => {
    expect(shouldResumeOpen({ id: 'a', resume: true }, [{ id: 'a' }])).toBe(true);
  });

  it('keeps an unsaved restaurant they were still filling in', () => {
    expect(shouldResumeOpen({ id: 'new' }, [{ id: 'a' }])).toBe(true);
  });
});
