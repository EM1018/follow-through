import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import { api } from '@/api/client';

import { NewGoalSheet } from './NewGoalSheet';

jest.mock('@/api/client', () => ({
  api: { GET: jest.fn(), POST: jest.fn(), PATCH: jest.fn(), DELETE: jest.fn() },
}));

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

const ACTIVITIES = {
  activities: [{ activity: 'running', default_unit: null, display_name: 'Running', units: [] }],
  units: [],
};

/** Serves /activities and /me; `myUsername` null is a sender who never claimed one. */
function serve(myUsername: string | null) {
  (api.GET as jest.Mock).mockImplementation((path: string) =>
    Promise.resolve({
      data: path === '/me' ? { username: myUsername, timezone: 'UTC' } : ACTIVITIES,
      error: undefined,
      response: { ok: true, status: 200 },
    }),
  );
}

function postFails(status: number, detail: unknown) {
  (api.POST as jest.Mock).mockResolvedValue({ data: undefined, error: { detail }, response: { ok: false, status } });
}

function postSucceeds() {
  (api.POST as jest.Mock).mockResolvedValue({ data: { id: 'new' }, error: undefined, response: { ok: true, status: 201 } });
}

async function openSheet({ myUsername = 'alex' as string | null } = {}) {
  serve(myUsername);
  const onClose = jest.fn();
  const onSaved = jest.fn();
  render(
    // gcTime Infinity: no cache-cleanup timer left behind to hold jest open.
    <QueryClientProvider
      client={new QueryClient({
        defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { gcTime: Infinity } },
      })}
    >
      <NewGoalSheet onClose={onClose} onSaved={onSaved} />
    </QueryClientProvider>,
  );
  // Pick an activity, as a user would -- the one row without a default.
  fireEvent.press(await screen.findByText('Choose an activity'));
  fireEvent.press(await screen.findByLabelText('Running'));
  await screen.findByText('Running');
  // Let /me land too, so blur checks run against a known username.
  await waitFor(() => expect(api.GET).toHaveBeenCalledWith('/me'));
  return { onClose, onSaved };
}

function sendTo(text: string) {
  fireEvent.changeText(screen.getByLabelText('Send to'), text);
}

function blurSendTo() {
  fireEvent(screen.getByLabelText('Send to'), 'blur');
}

function save() {
  fireEvent.press(screen.getByRole('button', { name: 'Save' }));
}

/** The body of the one POST /commitments the sheet made. */
function postedBody() {
  const [path, init] = (api.POST as jest.Mock).mock.calls[0];
  expect(path).toBe('/commitments');
  return init.body;
}

function ongoingDisabled(): boolean {
  return Boolean(screen.getByRole('button', { name: 'Ongoing' }).props.accessibilityState?.disabled);
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('NewGoalSheet: goal or challenge', () => {
  it('with Send to empty, creates a goal exactly as before -- no recipient_username at all', async () => {
    postSucceeds();
    const { onSaved } = await openSheet();
    expect(screen.getByText('New goal')).toBeTruthy();

    save();

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(postedBody()).toEqual({
      activity: 'running',
      target_value: null,
      target_unit: null,
      sessions_per_week: 2,
      duration_weeks: 2,
    });
  });

  it('entering a username flips the title and greys out Ongoing', async () => {
    await openSheet();
    expect(ongoingDisabled()).toBe(false);

    sendTo('Sam');

    expect(screen.getByText('New challenge')).toBeTruthy();
    expect(screen.queryByText('New goal')).toBeNull();
    expect(ongoingDisabled()).toBe(true);
  });

  it('clearing the field turns it back into a goal', async () => {
    await openSheet();
    sendTo('Sam');
    sendTo('');

    expect(screen.getByText('New goal')).toBeTruthy();
    expect(ongoingDisabled()).toBe(false);
  });

  it('moves an already-chosen Ongoing to weeks when it becomes a challenge', async () => {
    await openSheet();
    fireEvent.press(screen.getByRole('button', { name: 'Ongoing' }));
    sendTo('Sam');

    expect(screen.getByRole('button', { name: 'Weeks' }).props.accessibilityState?.selected).toBe(true);
  });

  it('names the recipient in the summary sentence', async () => {
    await openSheet();
    sendTo('Sam');
    expect(screen.getByText('Run 2 times a week, for 2 weeks, with Sam.')).toBeTruthy();
  });
});

describe('NewGoalSheet: submission', () => {
  it('sends recipient_username with mixed case exactly as typed, then hands off for a refetch', async () => {
    postSucceeds();
    const { onSaved } = await openSheet();
    sendTo('Jordan_R');

    save();

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(postedBody()).toEqual(expect.objectContaining({ recipient_username: 'Jordan_R', duration_weeks: 2 }));
  });
});

describe('NewGoalSheet: Send to errors, on the field', () => {
  it('does not validate while typing -- only on blur', async () => {
    await openSheet();
    sendTo('ab');
    expect(screen.queryByText('3-20 characters: letters, numbers, underscores')).toBeNull();

    blurSendTo();

    expect(screen.getByText('3-20 characters: letters, numbers, underscores')).toBeTruthy();
  });

  it('a new keystroke clears the error', async () => {
    await openSheet();
    sendTo('ab');
    blurSendTo();
    sendTo('abc');
    expect(screen.queryByText('3-20 characters: letters, numbers, underscores')).toBeNull();
  });

  it('no such user: the 404 from send', async () => {
    postFails(404, 'User not found');
    await openSheet();
    sendTo('Nobody');
    save();
    expect(await screen.findByText('No one goes by Nobody.')).toBeTruthy();
  });

  it("that's you: caught on blur, ignoring case, before anything is sent", async () => {
    await openSheet({ myUsername: 'alex' });
    sendTo('ALEX');
    blurSendTo();
    expect(screen.getByText("That's you. Send it to someone else.")).toBeTruthy();

    save();
    expect(api.POST).not.toHaveBeenCalled();
  });

  it("that's you: the server's 422, if it ever gets that far", async () => {
    postFails(422, 'You cannot challenge yourself');
    await openSheet({ myUsername: 'alex' });
    sendTo('alex2');
    save();
    expect(await screen.findByText("That's you. Send it to someone else.")).toBeTruthy();
  });

  it('duplicate: the 409 from send, worded for either direction', async () => {
    postFails(409, { code: 'duplicate_challenge', message: 'x' });
    await openSheet();
    sendTo('Sam');
    save();
    expect(await screen.findByText('You already have a challenge going with Sam for this activity.')).toBeTruthy();
  });

  it('recipient errors go on the field, not in the general error box', async () => {
    postFails(409, { code: 'duplicate_challenge', message: 'x' });
    await openSheet();
    sendTo('Sam');
    save();
    await screen.findByText('You already have a challenge going with Sam for this activity.');
    expect(screen.queryByText("That doesn't match what's on the server anymore.")).toBeNull();
  });
});

describe('NewGoalSheet: the username soft gate', () => {
  const GATE = 'Set your username first, so Sam knows who the challenge is from.';

  it('renders as a prompt with a way to Profile, on blur, for a sender with no username', async () => {
    await openSheet({ myUsername: null });
    sendTo('Sam');
    blurSendTo();

    expect(screen.getByText(GATE)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Set username in Profile' })).toBeTruthy();
  });

  it('renders the same prompt from the server\'s username_required', async () => {
    postFails(409, { code: 'username_required', message: 'x' });
    // /me says they have one -- the server knows better (e.g. cleared on another device).
    await openSheet({ myUsername: 'alex' });
    sendTo('Sam');
    save();
    expect(await screen.findByText(GATE)).toBeTruthy();
  });

  it('the Profile button closes the sheet and routes to Profile', async () => {
    const { onClose } = await openSheet({ myUsername: null });
    sendTo('Sam');
    blurSendTo();

    fireEvent.press(screen.getByRole('button', { name: 'Set username in Profile' }));

    expect(onClose).toHaveBeenCalled();
    expect(router.push).toHaveBeenCalledWith('/(app)/(tabs)/profile');
  });

  it('blocks Save rather than sending', async () => {
    await openSheet({ myUsername: null });
    sendTo('Sam');
    save();
    expect(screen.getByText(GATE)).toBeTruthy();
    expect(api.POST).not.toHaveBeenCalled();
  });
});
