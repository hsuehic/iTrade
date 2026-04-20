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
  }
}
