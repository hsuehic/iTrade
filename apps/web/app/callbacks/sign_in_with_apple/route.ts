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
 * Apple sends form-encoded data, not JSON
 */
export async function POST(req: NextRequest) {
  try {
    // Apple sends form data, not JSON
    const formData = await req.formData();

    const deepLinkUrl = new URL('signinwithapple://callback');

    const code = formData.get('code');
    const state = formData.get('state');
    const idToken = formData.get('id_token');
    const user = formData.get('user');

    if (code) deepLinkUrl.searchParams.set('code', code.toString());
    if (state) deepLinkUrl.searchParams.set('state', state.toString());
    if (idToken) deepLinkUrl.searchParams.set('id_token', idToken.toString());
    if (user) deepLinkUrl.searchParams.set('user', user.toString());

    return Response.redirect(deepLinkUrl.toString(), 302);
  } catch (error) {
    console.error('Error processing Apple Sign-In callback:', error);
    // Return a user-friendly error page
    return new Response(
      `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Sign in with Apple - Error</title>
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: system-ui; padding: 20px; text-align: center;">
          <h1>Authentication Error</h1>
          <p>There was an error processing your Apple Sign-In request.</p>
          <p>Please close this window and try again in the app.</p>
        </body>
      </html>
      `,
      {
        status: 400,
        headers: { 'Content-Type': 'text/html' },
      },
    );
  }
}
