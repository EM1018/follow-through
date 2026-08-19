import type { ResolvedEntry } from './api';
import { visibleNotes } from './notes';

describe('visibleNotes', () => {
  it('returns trimmed notes when present', () => {
    expect(visibleNotes('  Bring extra chalk  ')).toBe('Bring extra chalk');
  });

  it('returns null for null', () => {
    expect(visibleNotes(null)).toBeNull();
  });

  it('returns null for undefined', () => {
    expect(visibleNotes(undefined)).toBeNull();
  });

  it('returns null for an empty string', () => {
    expect(visibleNotes('')).toBeNull();
  });

  it('returns null for a whitespace-only string', () => {
    expect(visibleNotes('   \n\t  ')).toBeNull();
  });
});

describe('visibleNotes against resolved schedule entries', () => {
  it('shows the replacement workout\'s notes for a substituted entry, not the original\'s', () => {
    // The backend's resolve()/_display() already swap in the replacement
    // before notes ever reaches the client -- entry.notes here IS the
    // replacement's notes. This locks in that the client reads it as-is.
    const entry: ResolvedEntry = {
      entry_id: 'entry-1',
      workout_id: 'workout-2',
      name: 'Tempo Run',
      notes: 'Negative split the back half',
      status: 'substituted',
      replaced: { entry_id: 'entry-0', name: 'Easy Run' },
      completion_id: null,
    };
    expect(visibleNotes(entry.notes)).toBe('Negative split the back half');
  });

  it('renders nothing for a name_override replacement with no workout', () => {
    const entry: ResolvedEntry = {
      entry_id: 'entry-1',
      workout_id: null,
      name: 'Rest Day',
      notes: null,
      status: 'substituted',
      replaced: { entry_id: 'entry-0', name: 'Easy Run' },
      completion_id: null,
    };
    expect(visibleNotes(entry.notes)).toBeNull();
  });
});
