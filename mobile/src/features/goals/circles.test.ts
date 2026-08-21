import { circlesFor } from './circles';

import type { BlockRead, BlockStatus } from './commitments';

function block(status: BlockStatus, index: number): BlockRead {
  return {
    index,
    starts_on: '2026-01-01',
    ends_on: '2026-01-07',
    sessions_done: status === 'passed' ? 3 : 0,
    sessions_required: 3,
    status,
  };
}

describe('circlesFor', () => {
  it('maps passed/missed/in_progress blocks to their matching statuses, in order', () => {
    const blocks = [block('passed', 0), block('missed', 1), block('in_progress', 2)];
    expect(circlesFor(blocks, null)).toEqual(['passed', 'missed', 'in_progress']);
  });

  it('caps an ongoing goal at the 4 most recent circles', () => {
    const blocks = Array.from({ length: 8 }, (_, i) => block('passed', i));
    const circles = circlesFor(blocks, null);
    expect(circles).toHaveLength(4);
  });

  it('renders every block for a 6-week fixed-length goal', () => {
    const blocks = Array.from({ length: 6 }, (_, i) => block('passed', i));
    const circles = circlesFor(blocks, 6);
    expect(circles).toHaveLength(6);
  });

  it('does not cap a fixed-length goal even though it happens to have 8 blocks', () => {
    const blocks = Array.from({ length: 8 }, (_, i) => block('passed', i));
    expect(circlesFor(blocks, 8)).toHaveLength(8);
  });
});
