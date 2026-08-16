import { readdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

import sharp from 'sharp';

import { getSession, getAuthFromRequest } from '@/lib/auth';
import {
  buildAvatarFilename,
  buildAvatarUrl,
  ensureAvatarsDir,
  getAvatarOwnerPrefix,
  getAvatarsDir,
} from '@/lib/uploads';

/** Reject the upload before decoding if the raw file is implausibly large. */
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024; // 8 MB

/** Stored avatars are normalised to this square size. */
const AVATAR_SIZE = 256;

const ACCEPTED_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/avif',
]);

/**
 * POST /api/settings/avatar
 *
 * multipart/form-data with a single `file` field. The image is re-encoded to a
 * 256x256 webp and written to the uploads volume; `user.image` is then set to
 * the short URL of that file.
 *
 * Re-encoding is the point: it caps what can ever land in the row (a few KB of
 * URL instead of megabytes of base64) and strips EXIF. Previously an avatar was
 * stored inline as a `data:` URL, and better-auth re-sent that blob with every
 * session lookup — one 3.3 MB avatar was enough to make the whole app feel slow.
 */
export async function POST(req: Request) {
  const session = await getSession(req);
  if (!session?.user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let file: File;
  try {
    const form = await req.formData();
    const candidate = form.get('file');
    if (!candidate || typeof candidate === 'string') {
      return Response.json({ error: 'No file uploaded (field: file)' }, { status: 400 });
    }
    file = candidate as File;
  } catch {
    return Response.json(
      { error: 'Expected multipart/form-data with a file field' },
      { status: 400 },
    );
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return Response.json(
      { error: `Image is too large (max ${MAX_UPLOAD_BYTES / 1024 / 1024} MB)` },
      { status: 413 },
    );
  }
  if (file.type && !ACCEPTED_MIME.has(file.type)) {
    return Response.json(
      { error: `Unsupported image type: ${file.type}` },
      { status: 415 },
    );
  }

  const input = Buffer.from(await file.arrayBuffer());

  let webp: Buffer;
  try {
    webp = await sharp(input, { failOn: 'error' })
      .rotate() // honour EXIF orientation before we drop the metadata
      .resize(AVATAR_SIZE, AVATAR_SIZE, { fit: 'cover', position: 'centre' })
      .webp({ quality: 82 })
      .toBuffer();
  } catch {
    return Response.json(
      { error: 'Could not decode the image — please upload a valid PNG/JPEG/WebP' },
      { status: 400 },
    );
  }

  const dir = await ensureAvatarsDir();
  const filename = buildAvatarFilename(session.user.id);
  await writeFile(path.join(dir, filename), webp);
  const url = buildAvatarUrl(filename);

  try {
    const auth = getAuthFromRequest(req);
    await auth.api.updateUser({ body: { image: url }, headers: req.headers });
  } catch (error) {
    // The row still points at the old avatar, so drop the orphan file we just
    // wrote instead of leaving it on the volume forever.
    await unlink(path.join(dir, filename)).catch(() => {});
    console.error('Failed to persist avatar URL on user', error);
    return Response.json({ error: 'Failed to save avatar' }, { status: 500 });
  }

  // Best-effort cleanup of this user's previous avatar files. Never fatal: the
  // new avatar is already live at this point.
  void pruneOldAvatars(session.user.id, filename);

  return Response.json({ success: true, url, bytes: webp.byteLength });
}

/**
 * DELETE /api/settings/avatar — clear the avatar and remove the files on disk.
 */
export async function DELETE(req: Request) {
  const session = await getSession(req);
  if (!session?.user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const auth = getAuthFromRequest(req);
    await auth.api.updateUser({
      // better-auth's generated body type is `image?: string`, but null is what
      // actually clears the column (the profile form relies on this too).
      body: { image: null } as unknown as { image?: string },
      headers: req.headers,
    });
  } catch (error) {
    console.error('Failed to clear avatar on user', error);
    return Response.json({ error: 'Failed to clear avatar' }, { status: 500 });
  }

  await pruneOldAvatars(session.user.id, null);
  return Response.json({ success: true });
}

async function pruneOldAvatars(userId: string, keepFilename: string | null) {
  try {
    const dir = getAvatarsDir();
    const prefix = `${getAvatarOwnerPrefix(userId)}-`;
    const entries = await readdir(dir);
    await Promise.all(
      entries
        .filter((name) => name.startsWith(prefix) && name !== keepFilename)
        .map((name) => unlink(path.join(dir, name)).catch(() => {})),
    );
  } catch {
    // Directory missing or unreadable — nothing to prune.
  }
}
