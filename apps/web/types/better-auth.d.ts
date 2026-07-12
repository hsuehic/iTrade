import 'better-auth';

declare module 'better-auth' {
  interface User {
    role?: string | null;
    banned?: boolean | null;
    banReason?: string | null;
    banExpires?: number | null;
  }
  interface Session {
    user: User;
    /**
     * Set while an admin is impersonating this session's user (Better Auth
     * admin plugin). Holds the impersonating admin's user id.
     */
    impersonatedBy?: string | null;
  }
}
