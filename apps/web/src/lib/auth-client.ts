'use client';
import { createAuthClient as createSocailAuthClient } from 'better-auth/client';
import { createAuthClient } from 'better-auth/react';

export const authClient = createAuthClient({
  baseURL:
    (typeof window !== 'undefined'
      ? window.location.origin
      : process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000') +
    '/api/auth',
});

export const socialAuthClient = createSocailAuthClient({});

export const signInWithGoogle = async () => {
  const data = await socialAuthClient.signIn.social({
    provider: 'google',
    callbackURL: '/',
  });
  if (data.error) {
    throw new Error(data.error.message);
  }
  return data;
};
