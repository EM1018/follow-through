import { completionIsEntryLinked } from './completions';

// completions.ts pulls in @/api/client -> @/lib/supabase's AsyncStorage-backed
// client, unavailable outside a native runtime. This test only exercises a
// pure function from the module, so the real client is never invoked.
jest.mock('@/api/client', () => ({
  api: { GET: jest.fn(), POST: jest.fn(), PATCH: jest.fn(), DELETE: jest.fn() },
}));

describe('completionIsEntryLinked', () => {
  it('is true for a completion still linked to a schedule entry', () => {
    expect(completionIsEntryLinked({ schedule_entry_id: 'entry-1' })).toBe(true);
  });

  it('is false for a standalone log', () => {
    expect(completionIsEntryLinked({ schedule_entry_id: null })).toBe(false);
  });

  it('is false once the entry has been deleted (schedule_entry_id nulled), even though source stays scheduled', () => {
    // completionIsEntryLinked only looks at schedule_entry_id, not source --
    // there's nothing live on the schedule to invalidate once the entry is gone.
    expect(completionIsEntryLinked({ schedule_entry_id: null })).toBe(false);
  });
});
