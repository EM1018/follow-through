import { Redirect, Slot } from 'expo-router';

import { useSession } from '@/lib/session';

export default function AuthLayout() {
  const { session, isLoading } = useSession();

  if (isLoading) {
    return null;
  }

  if (session) {
    return <Redirect href="/(app)/(tabs)" />;
  }

  return <Slot />;
}
