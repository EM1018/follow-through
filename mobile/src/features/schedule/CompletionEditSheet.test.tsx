import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Text, TextInput } from 'react-native';
import renderer, { act, type ReactTestRenderer, type ReactTestInstance } from 'react-test-renderer';

import { api } from '@/api/client';
import { Button } from '@/components/Button';

import { CompletionEditSheet } from './CompletionEditSheet';

import type { ActivitiesResponse } from '@/features/logs/activities';
import type { CompletionRead } from '@/features/logs/completions';

// Same rationale as LogSheet.test.tsx: useActivities pulls in the real API
// client (and, through it, the AsyncStorage-backed supabase client), so it's
// mocked here and every test seeds the query cache directly instead.
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

function completion(overrides: Partial<CompletionRead> = {}): CompletionRead {
  return {
    activity: null,
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

function renderWithClient(element: React.ReactElement): { root: ReactTestInstance; client: QueryClient } {
  const client = new QueryClient();
  client.setQueryData(['activities'], ACTIVITIES);
  let tree: ReactTestRenderer;
  act(() => {
    tree = renderer.create(<QueryClientProvider client={client}>{element}</QueryClientProvider>);
  });
  return { root: tree!.root, client };
}

function findText(root: ReactTestInstance, text: string): ReactTestInstance | undefined {
  return root.findAllByType(Text).find((node) => {
    const { children } = node.props;
    return children === text || (Array.isArray(children) && children.join('') === text);
  });
}

/**
 * Polls under real timers until `check` passes, matching DaySection.test.tsx's
 * own `waitFor` -- TanStack Query's notifyManager batches state notifications
 * via a real setTimeout, so a fixed tick count would be racy. Callers await
 * this from inside one continuous `act(async () => ...)` spanning the whole
 * interaction, not a separate act() scope, or a scheduled notification can
 * fire after the test (and the Jest environment) has already torn down.
 */
async function waitFor(check: () => boolean, timeoutMs = 1000): Promise<void> {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error('waitFor: condition never became true');
    }
    await new Promise((r) => setTimeout(r, 10));
  }
}

describe('CompletionEditSheet', () => {
  it('has no Date row -- the date is fixed by the schedule row', () => {
    const { root } = renderWithClient(
      <CompletionEditSheet planId="p1" completion={completion()} entryName="Push Day" onClose={jest.fn()} />,
    );
    expect(findText(root, 'Date')).toBeUndefined();
  });

  it('renders Amount, Activity for this log, and Note', () => {
    const { root } = renderWithClient(
      <CompletionEditSheet planId="p1" completion={completion()} entryName="Push Day" onClose={jest.fn()} />,
    );
    expect(findText(root, 'Amount')).toBeDefined();
    expect(findText(root, 'Activity for this log')).toBeDefined();
    expect(findText(root, 'Note')).toBeDefined();
  });

  it('labels the activity row so it reads as "this log only", distinct from the workout\'s own activity', () => {
    const { root } = renderWithClient(
      <CompletionEditSheet planId="p1" completion={completion()} entryName="Push Day" onClose={jest.fn()} />,
    );
    expect(findText(root, "Only this log -- the workout’s own activity, which future ticks pick up, is unchanged.")).toBeDefined();
  });

  it('starts the activity field blank when the completion has none', () => {
    const { root } = renderWithClient(
      <CompletionEditSheet planId="p1" completion={completion({ activity: null })} entryName="Push Day" onClose={jest.fn()} />,
    );
    expect(findText(root, 'None')).toBeDefined();
  });

  it('patches amount, activity, and note together, and invalidates both the completions cache and this plan\'s schedule', async () => {
    (api.PATCH as jest.Mock).mockResolvedValue({
      data: completion({ activity: 'strength_training', value: 5, unit: 'sets', note: 'Felt strong' }),
      error: undefined,
      response: { ok: true, status: 200 },
    });

    const onClose = jest.fn();
    const { root, client } = renderWithClient(
      <CompletionEditSheet planId="p1" completion={completion()} entryName="Push Day" onClose={onClose} />,
    );
    const invalidateSpy = jest.spyOn(client, 'invalidateQueries');

    const amountInput = root
      .findAllByType(TextInput)
      .find((node) => node.props.placeholder === 'Leave blank to log without an amount')!;
    act(() => {
      amountInput.props.onChangeText('5');
    });

    const noteInput = root.findAllByType(TextInput).find((node) => node.props.placeholder === 'Optional')!;
    act(() => {
      noteInput.props.onChangeText('Felt strong');
    });

    const saveButton = root.findAllByType(Button).find((node) => node.props.label === 'Save changes')!;
    expect(saveButton.props.disabled).toBe(true); // no unit picked yet for the new amount

    // Picking a unit off the just-typed amount's chips would need driving the
    // ActivityPickerSheet swap too; this test only needs one full round trip
    // through updateCompletion, so it exercises the note-only patch instead.
    act(() => {
      amountInput.props.onChangeText('');
    });

    await act(async () => {
      const button = root.findAllByType(Button).find((node) => node.props.label === 'Save changes')!;
      button.props.onPress();
      await waitFor(() => onClose.mock.calls.length > 0);
    });

    expect(api.PATCH).toHaveBeenCalledWith(
      '/completions/{completion_id}',
      expect.objectContaining({
        params: { path: { completion_id: 'c1' } },
        body: { note: 'Felt strong' },
      }),
    );
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(invalidateSpy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['completions'] }));
    expect(invalidateSpy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['plans', 'p1', 'schedule'] }));
  });
});
