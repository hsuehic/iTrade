import { NextRequest } from 'next/server';

/**
 * Apple Sign-In callback endpoint for mobile app (Android)
 *
 * This endpoint receives the OAuth callback from Apple and redirects back to the mobile app
 * using the custom deep link scheme configured in AndroidManifest.xml
 *
 * Flow:
 * 1. User initiates Apple Sign-In on Android
 * 2. Apple OAuth opens in browser with redirect_uri pointing here
 * 3. This endpoint extracts the authorization code and state
 * 4. Redirects to signinwithapple://callback with the parameters
 * 5. The sign_in_with_apple package intercepts and completes the flow
 */
export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;

  // Extract OAuth parameters from Apple's callback
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const idToken = searchParams.get('id_token');
  const user = searchParams.get('user'); // Apple sends user info on first auth

  // Build the deep link URL to redirect back to the mobile app
  const deepLinkUrl = new URL('signinwithapple://callback');

  if (code) deepLinkUrl.searchParams.set('code', code);
  if (state) deepLinkUrl.searchParams.set('state', state);
  if (idToken) deepLinkUrl.searchParams.set('id_token', idToken);
  if (user) deepLinkUrl.searchParams.set('user', user);

  // Redirect back to the mobile app
  // The sign_in_with_apple package will intercept this and complete the authentication
  return Response.redirect(deepLinkUrl.toString(), 302);
}

/**
 * Handle POST requests from Apple's callback
 * Some OAuth flows use POST instead of GET
 */
export async function POST(req: NextRequest) {
  const body = await req.json();

  const deepLinkUrl = new URL('signinwithapple://callback');

  if (body.code) deepLinkUrl.searchParams.set('code', body.code);
  if (body.state) deepLinkUrl.searchParams.set('state', body.state);
  if (body.id_token) deepLinkUrl.searchParams.set('id_token', body.id_token);
  if (body.user) deepLinkUrl.searchParams.set('user', body.user);

  return Response.redirect(deepLinkUrl.toString(), 302);
}
