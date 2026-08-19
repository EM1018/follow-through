import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Text, TextInput, TouchableOpacity } from 'react-native';
import renderer, { act, type ReactTestRenderer, type ReactTestInstance } from 'react-test-renderer';

import { LogSheet } from './LogSheet';

import type { ActivitiesResponse } from './activities';
import type { CompletionRead } from './completions';

// LogSheet pulls in `@/api/client` (via useActivities), which in turn pulls
// in `@/lib/supabase`'s AsyncStorage-backed client -- unavailable outside a
// native runtime. Every test here seeds the query cache directly, so the
// real client is never actually called.
jest.mock('@/api/client', () => ({
  api: { GET: jest.fn(), POST: jest.fn(), PATCH: jest.fn(), DELETE: jest.fn() },
}));

const ACTIVITIES: ActivitiesResponse = {
  activities: [
    {
      activity: 'running',
      default_unit: 'miles',
      display_name: 'Running',
      units: ['minutes', 'hours', 'miles', 'kilometers'],
    },
    {
      activity: 'strength_training',
      default_unit: null,
      display_name: 'Strength training',
      units: ['sets', 'reps'],
    },
  ],
  units: [
    { unit: 'minutes', dimension: 'time' },
    { unit: 'hours', dimension: 'time' },
    { unit: 'miles', dimension: 'distance' },
    { unit: 'kilometers', dimension: 'distance' },
    { unit: 'sets', dimension: 'count' },
    { unit: 'reps', dimension: 'count' },
  ],
};

function completion(overrides: Partial<CompletionRead>): CompletionRead {
  return {
    activity: 'running',
    created_at: '2026-08-10T12:00:00Z',
    id: 'c1',
    label: 'Running',
    note: null,
    on_date: '2026-08-10',
    schedule_entry_id: null,
    source: 'standalone',
    unit: 'miles',
    value: 3,
    ...overrides,
  };
}

function renderWithClient(element: React.ReactElement): ReactTestInstance {
  const client = new QueryClient();
  client.setQueryData(['activities'], ACTIVITIES);
  let tree: ReactTestRenderer;
  act(() => {
    tree = renderer.create(<QueryClientProvider client={client}>{element}</QueryClientProvider>);
  });
  return tree!.root;
}

function findText(root: ReactTestInstance, text: string): ReactTestInstance | undefined {
  return root.findAllByType(Text).find((node) => {
    const { children } = node.props;
    return children === text || (Array.isArray(children) && children.join('') === text);
  });
}

function isInsideTouchable(node: ReactTestInstance): boolean {
  let ancestor = node.parent;
  while (ancestor) {
    if (ancestor.type === TouchableOpacity) {
      return true;
    }
    ancestor = ancestor.parent;
  }
  return false;
}

describe('LogSheet edit mode', () => {
  it('renders activity and date as read-only text, not inside any pressable', () => {
    const root = renderWithClient(
      <LogSheet mode="edit" completion={completion({})} onClose={jest.fn()} onSaved={jest.fn()} />,
    );

    const activityText = findText(root, 'Running');
    expect(activityText).toBeDefined();
    expect(isInsideTouchable(activityText!)).toBe(false);

    // 2026-08-10 is safely in the past relative to any run of this suite, so
    // sectionLabel always takes the "older date" branch, not Today/Yesterday.
    const dateText = findText(root, 'Monday, August 10');
    expect(dateText).toBeDefined();
    expect(isInsideTouchable(dateText!)).toBe(false);
  });

  it('shows the locked-fields hint', () => {
    const root = renderWithClient(
      <LogSheet mode="edit" completion={completion({})} onClose={jest.fn()} onSaved={jest.fn()} />,
    );
    expect(findText(root, 'To change these, delete this log and add it again.')).toBeDefined();
  });

  it('titles the sheet "Edit log" and the primary action "Save changes"', () => {
    const root = renderWithClient(
      <LogSheet mode="edit" completion={completion({})} onClose={jest.fn()} onSaved={jest.fn()} />,
    );
    expect(findText(root, 'Edit log')).toBeDefined();
    expect(findText(root, 'Save changes')).toBeDefined();
  });

  it('offers every unit, not zero, when editing amount on a completion with no activity', () => {
    // An entry-linked log whose workout has no activity set -- there's no
    // permitted set to constrain against, so every known unit must still be
    // pickable, not none of them.
    const root = renderWithClient(
      <LogSheet
        mode="edit"
        completion={completion({ activity: null, unit: null, value: null, schedule_entry_id: 'entry-1', source: 'scheduled' })}
        onClose={jest.fn()}
        onSaved={jest.fn()}
      />,
    );

    const amountInput = root
      .findAllByType(TextInput)
      .find((node) => node.props.placeholder === 'Leave blank to log without an amount')!;
    act(() => {
      amountInput.props.onChangeText('30');
    });

    // "sets" belongs to strength_training, not running -- its presence here
    // proves the picker fell back to the full unit list, not one activity's.
    expect(findText(root, 'sets')).toBeDefined();
    expect(findText(root, 'miles')).toBeDefined();
  });
});

describe('LogSheet create mode', () => {
  it('titles the sheet and primary action "Log activity", with nothing preselected', () => {
    const root = renderWithClient(<LogSheet mode="create" onClose={jest.fn()} onSaved={jest.fn()} />);
    const titleAndButton = root.findAllByType(Text).filter((node) => node.props.children === 'Log activity');
    expect(titleAndButton.length).toBeGreaterThanOrEqual(2);
    expect(findText(root, 'Choose an activity')).toBeDefined();
  });
});
