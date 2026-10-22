/**
 * Per-test teardown for everything a test can leave running.
 *
 * @testing-library/react-native already unmounts its own renders after each
 * test; react-test-renderer and @tanstack/react-query don't, and between them
 * they leaked two ways:
 *
 * - A tree that's never unmounted keeps its queries subscribed. When a mocked
 *   request resolves after the test, react-query re-renders it -- by then the
 *   environment is torn down, and the error lands in whichever test is
 *   running next in that worker (the flaky MonthView.daySection failures,
 *   "Cannot log after tests are done", "import after teardown").
 * - Once a query has no screen or a mutation settles, react-query schedules a
 *   5-minute cache-cleanup timer, which keeps the worker alive past the run
 *   ("A worker process has failed to exit gracefully").
 *
 * So: every renderer tree is unmounted, and every QueryClient is created
 * timer-free and cleared, after each test. A test's own options still win.
 */

const mountedTrees: { unmount: () => void }[] = [];
const queryClients: { clear: () => void }[] = [];

jest.mock('react-test-renderer', () => {
  const actual = jest.requireActual('react-test-renderer');
  return {
    ...actual,
    create: (...args: Parameters<typeof actual.create>) => {
      const tree = actual.create(...args);
      mountedTrees.push(tree);
      return tree;
    },
  };
});

jest.mock('@tanstack/react-query', () => {
  const actual = jest.requireActual<typeof import('@tanstack/react-query')>('@tanstack/react-query');
  class TestQueryClient extends actual.QueryClient {
    constructor(config: import('@tanstack/react-query').QueryClientConfig = {}) {
      super({
        ...config,
        defaultOptions: {
          ...config.defaultOptions,
          // gcTime Infinity means react-query never schedules a cleanup timer at all.
          queries: { retry: false, gcTime: Infinity, ...config.defaultOptions?.queries },
          mutations: { gcTime: Infinity, ...config.defaultOptions?.mutations },
        },
      });
      queryClients.push(this);
    }
  }
  return { ...actual, QueryClient: TestQueryClient };
});

afterEach(() => {
  const { act } = jest.requireActual('react-test-renderer');
  act(() => {
    for (const tree of mountedTrees.splice(0)) {
      tree.unmount();
    }
  });
  for (const client of queryClients.splice(0)) {
    client.clear();
  }
});
