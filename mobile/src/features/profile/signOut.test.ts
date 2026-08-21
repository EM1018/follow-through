import { QueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

import { signOut } from './signOut';

jest.mock('@/lib/supabase', () => ({
  supabase: { auth: { signOut: jest.fn() } },
}));

function seededClient(): QueryClient {
  const client = new QueryClient();
  client.setQueryData(['commitments'], { active: [], finished: [] });
  client.setQueryData(['completions'], [{ id: 'c1' }]);
  client.setQueryData(['plans', 'p1', 'schedule', '2026-08-01', '2026-08-07'], { days: {} });
  client.setQueryData(['me'], { username: 'sam' });
  return client;
}

describe('signOut', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('clears every cached query -- schedule, log, goals, and /me alike', async () => {
    (supabase.auth.signOut as jest.Mock).mockResolvedValue({ error: null });
    const client = seededClient();

    await signOut(client);

    expect(client.getQueryData(['commitments'])).toBeUndefined();
    expect(client.getQueryData(['completions'])).toBeUndefined();
    expect(client.getQueryData(['plans', 'p1', 'schedule', '2026-08-01', '2026-08-07'])).toBeUndefined();
    expect(client.getQueryData(['me'])).toBeUndefined();
    expect(client.getQueryCache().getAll()).toHaveLength(0);
  });

  it('still clears the cache even if the network sign-out call fails', async () => {
    (supabase.auth.signOut as jest.Mock).mockRejectedValue(new Error('network down'));
    const client = seededClient();

    await expect(signOut(client)).rejects.toThrow('network down');

    expect(client.getQueryCache().getAll()).toHaveLength(0);
  });
});
