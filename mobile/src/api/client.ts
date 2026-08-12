import createClient, { type Middleware } from 'openapi-fetch';

import { supabase } from '@/lib/supabase';

import type { paths } from './schema';

export const api = createClient<paths>({
  baseUrl: process.env.EXPO_PUBLIC_API_URL,
});

// Reads the session on every request rather than caching the token, so a token
// refreshed in the background (see the AppState listener in lib/supabase.ts) is
// picked up automatically on the very next call.
const authMiddleware: Middleware = {
  async onRequest({ request }) {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (token) {
      request.headers.set('Authorization', `Bearer ${token}`);
    }
    return request;
  },
};

api.use(authMiddleware);
