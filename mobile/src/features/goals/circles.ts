import type { BlockRead, BlockStatus } from './commitments';

const ONGOING_CIRCLE_CAP = 4;

/**
 * Blocks are already ordered oldest-to-newest and capped at 8 by the API.
 * Ongoing goals only ever show the most recent 4 (there's no fixed end to
 * anchor a longer row to); a fixed-length goal shows every block it has,
 * which is never more than 8 since duration_weeks itself is capped there.
 */
export function circlesFor(blocks: BlockRead[], durationWeeks: number | null): BlockStatus[] {
  const statuses = blocks.map((block) => block.status);
  return durationWeeks === null ? statuses.slice(-ONGOING_CIRCLE_CAP) : statuses;
}
