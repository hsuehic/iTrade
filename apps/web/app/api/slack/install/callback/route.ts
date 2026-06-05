/**
 * GET /api/slack/install/callback
 *
 * Handles the OAuth v2 redirect after a workspace admin installs the Slack app.
 * This is SEPARATE from /api/auth/callback/slack which handles Sign-in with Slack (OIDC).
 *
 * Slack app setup:
 *   OAuth & Permissions → Redirect URLs → add:
 *     https://itrade.ihsueh.com/api/slack/install/callback
 *     http://localhost:3000/api/slack/install/callback   (for local dev)
 */
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get('code');
  const error = searchParams.get('error');

  // User declined the installation
  if (error) {
    console.warn('[Slack Install] User declined or error:', error);
    return NextResponse.redirect(new URL('/slack/install?error=cancelled', request.url));
  }

  if (!code) {
    return NextResponse.redirect(
      new URL('/slack/install?error=missing_code', request.url),
    );
  }

  const clientId = process.env.SLACK_BOT_CLIENT_ID || process.env.SLACK_OAUTH_CLIENT_ID;
  const clientSecret =
    process.env.SLACK_BOT_CLIENT_SECRET || process.env.SLACK_OAUTH_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error(
      '[Slack Install] Missing SLACK_BOT_CLIENT_ID / SLACK_BOT_CLIENT_SECRET env vars',
    );
    return NextResponse.redirect(new URL('/slack/install?error=config', request.url));
  }

  // Exchange the code for a bot token via oauth.v2.access
  const tokenRes = await fetch('https://slack.com/api/oauth.v2.access', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!tokenRes.ok) {
    console.error('[Slack Install] Token exchange HTTP error:', tokenRes.status);
    return NextResponse.redirect(
      new URL('/slack/install?error=token_exchange', request.url),
    );
  }

  const data = (await tokenRes.json()) as SlackOAuthV2Response;

  if (!data.ok) {
    console.error('[Slack Install] Slack API error:', data.error);
    return NextResponse.redirect(
      new URL(`/slack/install?error=${data.error}`, request.url),
    );
  }

  // Log the installation details (replace with DB storage for multi-workspace support)
  console.log('[Slack Install] App installed successfully:', {
    teamId: data.team?.id,
    teamName: data.team?.name,
    botUserId: data.bot_user_id,
    scope: data.scope,
  });

  // TODO: For multi-workspace support, store data.access_token, data.team.id,
  // data.team.name, data.bot_user_id in your database here.

  return NextResponse.redirect(new URL('/slack/install?success=true', request.url));
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface SlackOAuthV2Response {
  ok: boolean;
  error?: string;
  access_token?: string;
  token_type?: string;
  scope?: string;
  bot_user_id?: string;
  app_id?: string;
  team?: { id: string; name: string };
  enterprise?: { id: string; name: string } | null;
  authed_user?: { id: string };
}
