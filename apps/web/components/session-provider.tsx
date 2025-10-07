// components/session-provider.tsx
'use client';

import { createContext, useContext, ReactNode } from 'react';

type Session = {
  user: {
    id: string;
    name: string;
    email: string;
    image?: string | null;
  };
} | null;

const SessionContext = createContext<Session>(null);

export function SessionProvider({
  children,
  session,
}: {
  children: ReactNode;
  session: Session;
}) {
  return (
    <SessionContext.Provider value={session}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  return useContext(SessionContext);
}
