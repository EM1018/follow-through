import { api } from '@/api/client';

import { syncTimezone, timezoneNeedsSync } from './timezoneSync';

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

describe('timezoneNeedsSync', () => {
  it('is true when the device zone differs from the stored one', () => {
    expect(timezoneNeedsSync('America/Los_Angeles', 'UTC')).toBe(true);
  });

  it('is false when they already match', () => {
    expect(timezoneNeedsSync('America/Los_Angeles', 'America/Los_Angeles')).toBe(false);
  });
});

describe('syncTimezone', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('PATCHes /me when the device zone differs from what GET /me returned', async () => {
    (api.GET as jest.Mock).mockResolvedValue({
      data: me({ timezone: 'UTC' }),
      error: undefined,
      response: { ok: true, status: 200 },
    });
    (api.PATCH as jest.Mock).mockResolvedValue({
      data: me({ timezone: 'America/Los_Angeles' }),
      error: undefined,
      response: { ok: true, status: 200 },
    });

    await syncTimezone('America/Los_Angeles');

    expect(api.PATCH).toHaveBeenCalledWith(
      '/me',
      expect.objectContaining({ body: { timezone: 'America/Los_Angeles' } }),
    );
  });

  it('does not PATCH when the device zone already matches /me', async () => {
    (api.GET as jest.Mock).mockResolvedValue({
      data: me({ timezone: 'America/Los_Angeles' }),
      error: undefined,
      response: { ok: true, status: 200 },
    });

    await syncTimezone('America/Los_Angeles');

    expect(api.PATCH).not.toHaveBeenCalled();
  });

  it('swallows a failed GET without throwing', async () => {
    (api.GET as jest.Mock).mockResolvedValue({
      data: undefined,
      error: { detail: 'nope' },
      response: { ok: false, status: 500 },
    });

    await expect(syncTimezone('America/Los_Angeles')).resolves.toBeUndefined();
    expect(api.PATCH).not.toHaveBeenCalled();
  });

  it('swallows a failed PATCH without throwing', async () => {
    (api.GET as jest.Mock).mockResolvedValue({
      data: me({ timezone: 'UTC' }),
      error: undefined,
      response: { ok: true, status: 200 },
    });
    (api.PATCH as jest.Mock).mockResolvedValue({
      data: undefined,
      error: { detail: 'server error' },
      response: { ok: false, status: 500 },
    });

    await expect(syncTimezone('America/Los_Angeles')).resolves.toBeUndefined();
  });
});
