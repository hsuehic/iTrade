import { NextResponse } from 'next/server';
import { DEFAULT_SERVER_IP_WHITELIST, getServerIpWhitelist } from '@/lib/settings';

/**
 * GET /api/config/server-ips
 *
 * Public read-only endpoint — no auth required. The server IP whitelist is
 * shown to users on the accounts page and the exchange onboarding wizard
 * ("add these IPs to your exchange API key"), so any visitor needs it
 * before they can bind an exchange account. It contains no secrets — only
 * the public egress IPs users must whitelist at the exchange.
 */
export async function GET() {
  try {
    const ips = await getServerIpWhitelist();
    return NextResponse.json({ ips });
  } catch (error) {
    console.error('[Server IPs Config API] GET error:', error);
    // Settings store unreadable — fall back to built-in defaults rather than
    // breaking the accounts page / wizard render.
    return NextResponse.json({ ips: DEFAULT_SERVER_IP_WHITELIST });
  }
}
