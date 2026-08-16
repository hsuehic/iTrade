import { createHash, randomBytes } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

/**
 * On-disk storage for user-uploaded files (currently avatars only).
 *
 * Why this exists: `user.image` used to hold the avatar as a base64 `data:` URL.
 * better-auth serializes the whole user row on every `/api/auth/get-session`
 * call, so a 3.3 MB avatar was re-sent to the browser on practically every page
 * load and pushed some API responses past 3.5 MB. Now the bytes live on disk and
 * `user.image` only stores a short URL, which the browser can cache.
 *
 * IMPORTANT — the directory must be a mounted volume, not a path inside the
 * image. Next.js bakes `public/` in at build time, so anything written there at
 * runtime disappears on the next deploy. In production, docker-compose mounts
 * the host directory `/opt/itrade/uploads` at `/app/uploads` and sets
 * `UPLOADS_DIR` accordingly.
 */
export const AVATAR_SUBDIR = 'avatars';

/** Root directory for uploads. Override with UPLOADS_DIR. */
export function getUploadsRoot(): string {
  const configured = process.env.UPLOADS_DIR?.trim();
  if (configured) return configured;
  // Dev fallback: a gitignored folder in the app directory.
  return path.join(process.cwd(), '.uploads');
}

export function getAvatarsDir(): string {
  return path.join(getUploadsRoot(), AVATAR_SUBDIR);
}

export async function ensureAvatarsDir(): Promise<string> {
  const dir = getAvatarsDir();
  await mkdir(dir, { recursive: true });
  return dir;
}

/**
 * Build the stored filename for a user's avatar.
 *
 * The userId is hashed rather than used verbatim so the filename does not leak
 * the raw user id, and a random suffix is added so that replacing an avatar
 * produces a NEW URL — the read route serves files with an immutable long-lived
 * cache header, so reusing the filename would leave stale images in browser and
 * proxy caches.
 */
export function buildAvatarFilename(userId: string): string {
  const owner = createHash('sha256').update(userId).digest('hex').slice(0, 16);
  const suffix = randomBytes(6).toString('hex');
  return `${owner}-${suffix}.webp`;
}

/** Hashed owner prefix for a user — used to find/clean up their old avatars. */
export function getAvatarOwnerPrefix(userId: string): string {
  return createHash('sha256').update(userId).digest('hex').slice(0, 16);
}

/** Public URL for a stored avatar file. */
export function buildAvatarUrl(filename: string): string {
  return `/api/avatars/${filename}`;
}

/**
 * Resolve a request-supplied filename to an absolute path inside the avatars
 * directory, or null if it escapes the directory / is not a plausible avatar.
 *
 * Guards against path traversal (`..%2F..%2Fetc%2Fpasswd`): the name must match
 * exactly the shape produced by buildAvatarFilename, and the resolved path must
 * still be inside the avatars directory.
 */
export function resolveAvatarPath(filename: string): string | null {
  if (!/^[0-9a-f]{16}-[0-9a-f]{12}\.webp$/.test(filename)) return null;
  const dir = getAvatarsDir();
  const resolved = path.resolve(dir, filename);
  const dirWithSep = path.resolve(dir) + path.sep;
  if (!resolved.startsWith(dirWithSep)) return null;
  return resolved;
}
