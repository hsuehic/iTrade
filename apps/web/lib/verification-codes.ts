// Utility functions for verification codes
export function generateVerificationCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Cookie name for delete account verification
export const DELETE_ACCOUNT_VERIFICATION_COOKIE = 'delete_account_verification';

// Cookie options
export const VERIFICATION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  maxAge: 10 * 60, // 10 minutes
  path: '/',
};
