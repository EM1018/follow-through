import { Redirect, Slot } from 'expo-router';

import { useTimezoneSync } from '@/features/profile/timezoneSync';
import { useSession } from '@/lib/session';

export default function AppLayout() {
  const { session, isLoading } = useSession();
  useTimezoneSync(session?.user.id);

  if (isLoading) {
    return null;
  }

  if (!session) {
    return <Redirect href="/(auth)/login" />;
  }

  return <Slot />;
}
