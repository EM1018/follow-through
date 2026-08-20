import type { CompletionRead } from '@/features/logs/completions';

import { PENDING_COMPLETION_ID, resolveLoggedCompletion } from './dayCompletions';

function completion(overrides: Partial<CompletionRead> = {}): CompletionRead {
  return {
    activity: 'strength_training',
    created_at: '2026-08-10T12:00:00Z',
    id: 'c1',
    label: 'Push Day',
    note: null,
    on_date: '2026-08-10',
    schedule_entry_id: 'entry-1',
    source: 'scheduled',
    unit: null,
    value: null,
    ...overrides,
  };
}

describe('resolveLoggedCompletion', () => {
  it('is undefined when the row is not logged', () => {
    expect(resolveLoggedCompletion(null, new Map())).toBeUndefined();
  });

  it('is undefined while the log is still in flight', () => {
    const byId = new Map([['c1', completion()]]);
    expect(resolveLoggedCompletion(PENDING_COMPLETION_ID, byId)).toBeUndefined();
  });

  it('is undefined when the id resolves but this day\'s completions have not loaded that row yet', () => {
    expect(resolveLoggedCompletion('c1', new Map())).toBeUndefined();
  });

  it('returns the completion once it is logged and loaded', () => {
    const row = completion();
    const byId = new Map([['c1', row]]);
    expect(resolveLoggedCompletion('c1', byId)).toBe(row);
  });
});
