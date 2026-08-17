/**
 * Whether `notes` counts as something to show. Null, undefined, empty, and
 * whitespace-only all mean "nothing" -- every notes surface (Day view, the
 * Week view indicator, the actions sheet) shares this one check so none of
 * them can drift from the others on what counts as empty.
 */
export function visibleNotes(notes: string | null | undefined): string | null {
  if (!notes) {
    return null;
  }
  const trimmed = notes.trim();
  return trimmed.length > 0 ? trimmed : null;
}
