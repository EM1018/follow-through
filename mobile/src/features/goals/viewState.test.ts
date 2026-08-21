import { shouldShowEmptyState, shouldShowSkeleton } from './viewState';

describe('shouldShowEmptyState', () => {
  it('does not render while a request is in flight, even with a cache present', () => {
    expect(shouldShowEmptyState(true, 0, true)).toBe(false);
  });

  it('renders once the call has returned and found zero goals', () => {
    expect(shouldShowEmptyState(true, 0, false)).toBe(true);
  });

  it('does not render before any response has ever arrived', () => {
    expect(shouldShowEmptyState(false, 0, false)).toBe(false);
  });

  it('does not render when there are goals to show', () => {
    expect(shouldShowEmptyState(true, 3, false)).toBe(false);
  });
});

describe('shouldShowSkeleton', () => {
  it('does not render when a cache is present, even while loading', () => {
    expect(shouldShowSkeleton(true, true)).toBe(false);
  });

  it('renders when there is no cache and the delayed-loading flag is on', () => {
    expect(shouldShowSkeleton(false, true)).toBe(true);
  });

  it('does not render when there is no cache but the delay has not elapsed yet', () => {
    expect(shouldShowSkeleton(false, false)).toBe(false);
  });
});
