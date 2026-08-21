import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Text, TextInput } from 'react-native';
import renderer, { act, type ReactTestRenderer, type ReactTestInstance } from 'react-test-renderer';

import { api } from '@/api/client';
import { Button } from '@/components/Button';

import { UsernameEditorSheet } from './UsernameEditorSheet';

import type { MeRead } from './me';

jest.mock('@/api/client', () => ({
  api: { GET: jest.fn(), POST: jest.fn(), PATCH: jest.fn(), DELETE: jest.fn() },
}));

function me(overrides: Partial<MeRead> = {}): MeRead {
  return {
    created_at: '2026-08-10T12:00:00Z',
    email: 'a@example.com',
    id: 'u1',
    timezone: 'UTC',
    username: null,
    ...overrides,
  };
}

function renderWithClient(element: React.ReactElement): { root: ReactTestInstance; client: QueryClient } {
  const client = new QueryClient();
  client.setQueryData(['me'], me());
  let tree: ReactTestRenderer;
  act(() => {
    tree = renderer.create(<QueryClientProvider client={client}>{element}</QueryClientProvider>);
  });
  return { root: tree!.root, client };
}

async function waitFor(check: () => boolean, timeoutMs = 1000): Promise<void> {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error('waitFor: condition never became true');
    }
    await new Promise((r) => setTimeout(r, 10));
  }
}

function findText(root: ReactTestInstance, text: string): ReactTestInstance | undefined {
  return root.findAllByType(Text).find((node) => node.props.children === text);
}

describe('UsernameEditorSheet', () => {
  it('lowercases input as it is typed', () => {
    const { root } = renderWithClient(<UsernameEditorSheet onClose={jest.fn()} />);
    const input = root.findByType(TextInput);
    act(() => {
      input.props.onChangeText('Jordan_R');
    });
    expect(root.findByType(TextInput).props.value).toBe('jordan_r');
  });

  it('disables Save for a too-short name', () => {
    const { root } = renderWithClient(<UsernameEditorSheet onClose={jest.fn()} />);
    act(() => {
      root.findByType(TextInput).props.onChangeText('ab');
    });
    const saveButton = root.findAllByType(Button).find((n) => n.props.label === 'Save')!;
    expect(saveButton.props.disabled).toBe(true);
  });

  it('disables Save for a name with a hyphen', () => {
    const { root } = renderWithClient(<UsernameEditorSheet onClose={jest.fn()} />);
    act(() => {
      root.findByType(TextInput).props.onChangeText('jordan-r');
    });
    const saveButton = root.findAllByType(Button).find((n) => n.props.label === 'Save')!;
    expect(saveButton.props.disabled).toBe(true);
  });

  it('disables Save for a name with a space', () => {
    const { root } = renderWithClient(<UsernameEditorSheet onClose={jest.fn()} />);
    act(() => {
      root.findByType(TextInput).props.onChangeText('jordan r');
    });
    const saveButton = root.findAllByType(Button).find((n) => n.props.label === 'Save')!;
    expect(saveButton.props.disabled).toBe(true);
  });

  it('enables Save for a valid name', () => {
    const { root } = renderWithClient(<UsernameEditorSheet onClose={jest.fn()} />);
    act(() => {
      root.findByType(TextInput).props.onChangeText('sam');
    });
    const saveButton = root.findAllByType(Button).find((n) => n.props.label === 'Save')!;
    expect(saveButton.props.disabled).toBe(false);
  });

  it('renders "That username is taken." inline on a 409, and does not dismiss the sheet', async () => {
    (api.PATCH as jest.Mock).mockResolvedValue({
      data: undefined,
      error: { detail: 'Username is already taken' },
      response: { ok: false, status: 409 },
    });

    const onClose = jest.fn();
    const { root } = renderWithClient(<UsernameEditorSheet onClose={onClose} />);

    act(() => {
      root.findByType(TextInput).props.onChangeText('sam');
    });

    await act(async () => {
      const saveButton = root.findAllByType(Button).find((n) => n.props.label === 'Save')!;
      saveButton.props.onPress();
      await waitFor(() => findText(root, 'That username is taken.') !== undefined);
    });

    expect(findText(root, 'That username is taken.')).toBeDefined();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('dismisses and refetches /me on a successful save', async () => {
    (api.PATCH as jest.Mock).mockResolvedValue({
      data: me({ username: 'sam' }),
      error: undefined,
      response: { ok: true, status: 200 },
    });

    const onClose = jest.fn();
    const { root, client } = renderWithClient(<UsernameEditorSheet onClose={onClose} />);
    const invalidateSpy = jest.spyOn(client, 'invalidateQueries');

    act(() => {
      root.findByType(TextInput).props.onChangeText('sam');
    });

    await act(async () => {
      const saveButton = root.findAllByType(Button).find((n) => n.props.label === 'Save')!;
      saveButton.props.onPress();
      await waitFor(() => onClose.mock.calls.length > 0);
    });

    expect(api.PATCH).toHaveBeenCalledWith('/me', expect.objectContaining({ body: { username: 'sam' } }));
    expect(invalidateSpy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['me'] }));
  });
});
