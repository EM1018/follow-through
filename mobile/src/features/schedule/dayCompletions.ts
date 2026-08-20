import type { CompletionRead } from '@/features/logs/completions';

// A client-side placeholder while a create request is in flight, so the
// circle fills immediately -- reconciled with the server's real id on
// success, or rolled back entirely on failure. Never sent to the server:
// the circle is disabled (see DaySection's completionFor) for the entire time
// this value could be visible, so a second tap can't turn it into a
// delete-by-this-id.
export const PENDING_COMPLETION_ID = '__pending__';

/**
 * The completion behind a resolved circle id, or undefined when there's
 * nothing to show an amount affordance for -- not logged, or logged but still
 * in flight (the pending placeholder doesn't exist on the server yet, so it
 * can't be in `completionsById`; the affordance simply appears a beat later,
 * once the tick settles and this day's completions are invalidated/refetched).
 */
export function resolveLoggedCompletion(
  completionId: string | null,
  completionsById: Map<string, CompletionRead>,
): CompletionRead | undefined {
  if (completionId === null || completionId === PENDING_COMPLETION_ID) {
    return undefined;
  }
  return completionsById.get(completionId);
}
