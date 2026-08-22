import type { Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useState, type PropsWithChildren } from 'react';

import { supabase } from './supabase';

type SessionContextValue = {
  session: Session | null;
  isLoading: boolean;
  // Set while sign-up is still resolving the username claim, so the auth
  // layout doesn't redirect into the app the instant signUp() creates a
  // session -- a 409 on the username needs to keep the user on that screen
  // even though a valid session already exists. See mobile/app/(auth)/signup.tsx.
  suppressRedirect: boolean;
  setSuppressRedirect: (value: boolean) => void;
};

const SessionContext = createContext<SessionContextValue | undefined>(undefined);

export function SessionProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [suppressRedirect, setSuppressRedirect] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setIsLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  return (
    <SessionContext.Provider value={{ session, isLoading, suppressRedirect, setSuppressRedirect }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const context = useContext(SessionContext);
  if (context === undefined) {
    throw new Error('useSession must be used within a SessionProvider');
  }
  return context;
}
