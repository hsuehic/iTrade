import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import {
  DEFAULT_SERVER_IP_WHITELIST,
  getServerIpWhitelist,
  setServerIpWhitelist,
  isValidIp,
} from '@/lib/settings';

// ── GET /api/admin/settings/ip-whitelist ─────────────────────────────────────

/**
 * Returns the configured server IP whitelist. Admin-only — used by the
 * admin Settings page to render the editable list.
 */
export async function GET(request: NextRequest) {
  const session = await getSession(request);
  const role = (session?.user as { role?: string } | undefined)?.role;

  if (!session || role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const ips = await getServerIpWhitelist();
    return NextResponse.json({
      ips,
      isDefault: JSON.stringify(ips) === JSON.stringify(DEFAULT_SERVER_IP_WHITELIST),
    });
  } catch (error) {
    console.error('[IP Whitelist API] GET error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// ── PUT /api/admin/settings/ip-whitelist ─────────────────────────────────────

/**
 * Replaces the full whitelist with the submitted list.
 *
 * Body: { ips: string[] } — the complete new list (the UI sends add / edit /
 * delete results as the whole array). Entries are validated server-side:
 * strict IPv4, no duplicates, non-empty list.
 */
export async function PUT(request: NextRequest) {
  const session = await getSession(request);
  const role = (session?.user as { role?: string } | undefined)?.role;

  if (!session || role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = (await request.json()) as { ips?: unknown };
    if (!Array.isArray(body.ips)) {
      return NextResponse.json(
        { error: 'Body must contain an "ips" array' },
        { status: 400 },
      );
    }

    const rawIps = body.ips.filter((v): v is string => typeof v === 'string');
    if (rawIps.length === 0) {
      return NextResponse.json(
        { error: 'IP whitelist cannot be empty' },
        { status: 400 },
      );
    }

    // Validate before persisting so we never store a partial bad list.
    for (const ip of rawIps) {
      if (!isValidIp(ip.trim())) {
        return NextResponse.json(
          { error: `Invalid IP address: ${ip.trim()}` },
          { status: 400 },
        );
      }
    }
    const seen = new Set<string>();
    for (const ip of rawIps) {
      const normalized = ip.trim();
      if (seen.has(normalized)) {
        return NextResponse.json(
          { error: `Duplicate IP address: ${normalized}` },
          { status: 400 },
        );
      }
      seen.add(normalized);
    }

    const ips = await setServerIpWhitelist(rawIps);

    return NextResponse.json({ ips });
  } catch (error) {
    const msg = error instanceof Error ? error.message : '';
    if (
      msg.startsWith('Invalid IP') ||
      msg.startsWith('Duplicate IP') ||
      msg === 'IP whitelist cannot be empty'
    ) {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    console.error('[IP Whitelist API] PUT error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
