import { readFile, stat } from 'node:fs/promises';

import { resolveAvatarPath } from '@/lib/uploads';

type RouteContext = {
  params: Promise<{ file: string }>;
};

/**
 * GET /api/avatars/:file — serve a stored avatar from the uploads volume.
 *
 * Avatars are public (they are shown next to a display name), so no session is
 * required; the filename is unguessable and validated by resolveAvatarPath,
 * which also blocks path traversal.
 *
 * The filename changes every time a user uploads a new avatar, so the bytes for
 * a given URL never change and can be cached immutably — that is the whole point
 * of moving avatars out of `user.image`, where they were re-sent on every
 * session lookup.
 */
export async function GET(_req: Request, context: RouteContext) {
  const { file } = await context.params;
  const filePath = resolveAvatarPath(file);
  if (!filePath) {
    return new Response('Not found', { status: 404 });
  }

  try {
    const info = await stat(filePath);
    if (!info.isFile()) return new Response('Not found', { status: 404 });

    const body = await readFile(filePath);
    return new Response(new Uint8Array(body), {
      status: 200,
      headers: {
        'Content-Type': 'image/webp',
        'Content-Length': String(info.size),
        'Cache-Control': 'public, max-age=31536000, immutable',
        ETag: `"${info.size.toString(16)}-${info.mtimeMs.toString(16)}"`,
      },
    });
  } catch {
    return new Response('Not found', { status: 404 });
  }
}
