import { QueryClientProvider } from '@tanstack/react-query';
import { Slot } from 'expo-router';

import { queryClient } from '@/lib/query-client';
import { SessionProvider } from '@/lib/session';

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <Slot />
      </SessionProvider>
    </QueryClientProvider>
  );
}
