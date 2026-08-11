/**
 * End-to-end verification helper for the admin users/trading-pairs/impersonate
 * APIs. Creates a temporary admin user + normal user via Better Auth itself,
 * signs in through the real email sign-in endpoint, exercises the new routes
 * over HTTP, then cleans up all rows it created.
 *
 * Run from apps/web:  pnpm exec tsx scripts/e2e-verify-admin.ts
 */
import { auth } from '../lib/auth';

const BASE = 'http://localhost:3000';
const ADMIN_EMAIL = 'e2e-admin@example.test';
const USER_EMAIL = 'e2e-user@example.test';
const PASSWORD = 'E2e-password-123!';

type Db = {
  query: (
    text: string,
    params?: unknown[],
  ) => Promise<{ rows: Record<string, unknown>[] }>;
  end: () => Promise<void>;
};

async function getPool(): Promise<Db> {
  const { Pool } = await import('pg');
  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_DB || 'itrade',
  });
  return pool;
}

let failures = 0;
function check(name: string, cond: boolean, detail = '') {
  const mark = cond ? 'PASS' : 'FAIL';
  if (!cond) failures++;
  console.log(`  [${mark}] ${name}${detail ? ` — ${detail}` : ''}`);
}

async function signInCookie(email: string): Promise<string> {
  const csrfRes = await fetch(`${BASE}/api/mobile/sign-in/csrf`);
  const setCookie = csrfRes.headers.get('set-cookie') || '';
  const csrfCookie = /csrfToken=([^;]+)/.exec(setCookie)?.[1] || '';
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };

  const res = await fetch(`${BASE}/api/mobile/sign-in/email`, {
    method: 'POST',
    redirect: 'manual',
    headers: {
      'content-type': 'application/json',
      'x-csrf-token': csrfToken,
      cookie: `csrfToken=${csrfCookie}`,
    },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  if (res.status !== 200) {
    throw new Error(`sign-in failed for ${email}: ${res.status} ${await res.text()}`);
  }
  const loginSetCookie = res.headers.get('set-cookie') || '';
  // Multiple Set-Cookie values may be merged; peel out the session token.
  const match = /better-auth\.session_token=([^;,]+)/.exec(loginSetCookie);
  if (!match) throw new Error('no session cookie in sign-in response');
  return `better-auth.session_token=${match[1]}`;
}

async function main() {
  const pool = await getPool();

  // --- Setup: ensure clean slate ------------------------------------------
  for (const email of [ADMIN_EMAIL, USER_EMAIL]) {
    const { rows } = await pool.query('SELECT id FROM "user" WHERE email=$1', [email]);
    for (const row of rows) {
      await pool.query('DELETE FROM session WHERE "userId"=$1', [row.id]);
      await pool.query('DELETE FROM account WHERE "userId"=$1', [row.id]);
      await pool.query('DELETE FROM "user" WHERE id=$1', [row.id]);
    }
  }

  console.log('== Setup: creating test users via Better Auth ==');
  const adminSignUp = await auth.api.signUpEmail({
    body: { email: ADMIN_EMAIL, password: PASSWORD, name: 'E2E Admin' },
  });
  const userSignUp = await auth.api.signUpEmail({
    body: { email: USER_EMAIL, password: PASSWORD, name: 'E2E User' },
  });
  const adminId = adminSignUp?.user?.id as string;
  const userId = userSignUp?.user?.id as string;
  if (!adminId || !userId) throw new Error('sign-up failed');

  await pool.query('UPDATE "user" SET "emailVerified"=true, role=\'admin\' WHERE id=$1', [
    adminId,
  ]);
  await pool.query('UPDATE "user" SET "emailVerified"=true, role=\'user\' WHERE id=$1', [
    userId,
  ]);

  const adminCookie = await signInCookie(ADMIN_EMAIL);
  const userCookie = await signInCookie(USER_EMAIL);
  console.log('  signed in both users');

  // Also verify get-session reports role=admin for the admin cookie
  const sessRes = await fetch(`${BASE}/api/auth/get-session`, {
    headers: { cookie: adminCookie },
  });
  const sess = (await sessRes.json()) as { user?: { role?: string } };
  check('get-session returns role=admin', sess?.user?.role === 'admin');

  // --- 1. GET /api/admin/users --------------------------------------------
  console.log('== GET /api/admin/users ==');
  const listRes = await fetch(`${BASE}/api/admin/users?limit=5`, {
    headers: { cookie: adminCookie },
  });
  const listBody = (await listRes.json()) as {
    users?: { id: string; email: string; role: string }[];
  };
  check(
    'admin lists users',
    listRes.status === 200 && Array.isArray(listBody.users),
    `status=${listRes.status} count=${listBody.users?.length}`,
  );
  check(
    'list includes both test users',
    !!listBody.users?.some((u) => u.email === ADMIN_EMAIL) &&
      !!listBody.users?.some((u) => u.email === USER_EMAIL),
  );

  // --- 2. PATCH /api/admin/users/[id] --------------------------------------
  console.log('== PATCH /api/admin/users/[id] (promote role) ==');
  const promoteRes = await fetch(`${BASE}/api/admin/users/${userId}`, {
    method: 'PATCH',
    headers: { cookie: adminCookie, 'content-type': 'application/json' },
    body: JSON.stringify({ role: 'admin' }),
  });
  check('promote returns 200', promoteRes.status === 200);
  const { rows: afterPromote } = await pool.query('SELECT role FROM "user" WHERE id=$1', [
    userId,
  ]);
  check('DB role updated to admin', afterPromote[0]?.role === 'admin');
  // revert
  await fetch(`${BASE}/api/admin/users/${userId}`, {
    method: 'PATCH',
    headers: { cookie: adminCookie, 'content-type': 'application/json' },
    body: JSON.stringify({ role: 'user' }),
  });

  console.log('== PATCH /api/admin/users/[id] (ban) ==');
  const banRes = await fetch(`${BASE}/api/admin/users/${userId}`, {
    method: 'PATCH',
    headers: { cookie: adminCookie, 'content-type': 'application/json' },
    body: JSON.stringify({ banned: true }),
  });
  const banBody = await banRes.text();
  check(
    'ban returns 200',
    banRes.status === 200,
    `status=${banRes.status} body=${banBody}`,
  );
  const { rows: afterBan } = await pool.query('SELECT banned FROM "user" WHERE id=$1', [
    userId,
  ]);
  check('DB banned=true', afterBan[0]?.banned === true);
  const unbanRes = await fetch(`${BASE}/api/admin/users/${userId}`, {
    method: 'PATCH',
    headers: { cookie: adminCookie, 'content-type': 'application/json' },
    body: JSON.stringify({ banned: false }),
  });
  check('unban returns 200', unbanRes.status === 200);

  console.log('== PATCH self-guard ==');
  const selfRes = await fetch(`${BASE}/api/admin/users/${adminId}`, {
    method: 'PATCH',
    headers: { cookie: adminCookie, 'content-type': 'application/json' },
    body: JSON.stringify({ role: 'user' }),
  });
  check('self-demotion rejected with 400', selfRes.status === 400);

  // --- 3. trading pairs ----------------------------------------------------
  console.log('== POST /api/admin/trading-pairs ==');
  const createRes = await fetch(`${BASE}/api/admin/trading-pairs`, {
    method: 'POST',
    headers: { cookie: adminCookie, 'content-type': 'application/json' },
    body: JSON.stringify({
      symbol: 'E2ET/E2EQ',
      baseAsset: 'E2ET',
      quoteAsset: 'E2EQ',
      exchange: 'binance',
      type: 'spot',
      name: 'E2E Test Pair',
    }),
  });
  const created = (await createRes.json()) as { id?: number };
  check('create trading pair', createRes.status === 200 && !!created.id);

  if (created.id) {
    const getRes = await fetch(`${BASE}/api/admin/trading-pairs`, {
      headers: { cookie: adminCookie },
    });
    const pairs = (await getRes.json()) as { id: number; symbol: string }[];
    check(
      'list includes new pair',
      pairs.some((p) => p.symbol === 'E2ET/E2EQ'),
    );
    const delRes = await fetch(`${BASE}/api/admin/trading-pairs/${created.id}`, {
      method: 'DELETE',
      headers: { cookie: adminCookie },
    });
    check('delete trading pair', delRes.status === 200);
  }

  // --- 4. impersonation -----------------------------------------------------
  console.log('== POST /api/admin/impersonate ==');
  const impRes = await fetch(`${BASE}/api/admin/impersonate`, {
    method: 'POST',
    redirect: 'manual',
    headers: {
      cookie: adminCookie,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ userId }),
  });
  // Better Auth sets BOTH a new session_token (impersonated) and an
  // admin_session cookie (signed pointer back to the admin session) — both
  // are required later by stopImpersonating. Node fetch merges Set-Cookie
  // values, so split on comma boundaries between cookie pairs.
  const impSetCookies = (impRes.headers as Headers & { getSetCookie?: () => string[] })
    .getSetCookie
    ? (impRes.headers as Headers & { getSetCookie: () => string[] }).getSetCookie()
    : [impRes.headers.get('set-cookie') || ''];
  const impCookieParts: string[] = [];
  for (const sc of impSetCookies) {
    for (const name of ['better-auth.session_token', 'better-auth.admin_session']) {
      const m = new RegExp(`${name.replace('.', '\\.')}=([^;,]+)`).exec(sc);
      if (m) impCookieParts.push(`${name}=${m[1]}`);
    }
  }
  const impMatch = impCookieParts.some((p) => p.startsWith('better-auth.session_token='));
  check(
    'impersonate returns 200 + new session cookie',
    impRes.status === 200 && impMatch,
    `status=${impRes.status} cookies=${impCookieParts.map((p) => p.split('=')[0]).join(',')}`,
  );

  if (impMatch) {
    const impCookie = impCookieParts.join('; ');
    const impSessRes = await fetch(`${BASE}/api/auth/get-session`, {
      headers: { cookie: impCookie },
    });
    const impSess = (await impSessRes.json()) as {
      user?: { email?: string };
      session?: { impersonatedBy?: string };
    };
    check(
      'impersonated session is target user with impersonatedBy set',
      impSess?.user?.email === USER_EMAIL && impSess?.session?.impersonatedBy === adminId,
      `email=${impSess?.user?.email} by=${impSess?.session?.impersonatedBy}`,
    );

    console.log('== DELETE /api/admin/impersonate ==');
    const stopRes = await fetch(`${BASE}/api/admin/impersonate`, {
      method: 'DELETE',
      redirect: 'manual',
      headers: { cookie: impCookie },
    });
    const stopBody = await stopRes.text();
    const stopSetCookies = (
      stopRes.headers as Headers & { getSetCookie?: () => string[] }
    ).getSetCookie
      ? (stopRes.headers as Headers & { getSetCookie: () => string[] }).getSetCookie()
      : [stopRes.headers.get('set-cookie') || ''];
    const stopCookieParts: string[] = [];
    for (const sc of stopSetCookies) {
      const m = /better-auth\.session_token=([^;,]+)/.exec(sc);
      if (m) stopCookieParts.push(`better-auth.session_token=${m[1]}`);
    }
    check(
      'stop impersonate returns 200',
      stopRes.status === 200,
      `status=${stopRes.status} body=${stopBody}`,
    );
    if (stopCookieParts.length > 0) {
      const backRes = await fetch(`${BASE}/api/auth/get-session`, {
        headers: { cookie: stopCookieParts.join('; ') },
      });
      const back = (await backRes.json()) as { user?: { email?: string } };
      check('session restored to admin after stop', back?.user?.email === ADMIN_EMAIL);
    }
  }

  // --- 5. negative: non-admin rejected --------------------------------------
  console.log('== Negative: non-admin user gets 401 ==');
  const naList = await fetch(`${BASE}/api/admin/users`, {
    headers: { cookie: userCookie },
  });
  check('non-admin GET /api/admin/users → 401', naList.status === 401);
  const naPairs = await fetch(`${BASE}/api/admin/trading-pairs`, {
    headers: { cookie: userCookie },
  });
  check('non-admin GET /api/admin/trading-pairs → 401', naPairs.status === 401);

  // --- 6. audit log entries exist for impersonation -------------------------
  const { rows: audits } = await pool.query(
    'SELECT action FROM audit_logs WHERE "actorId"=$1 ORDER BY "createdAt" DESC LIMIT 5',
    [adminId],
  );
  check(
    'audit log recorded impersonate.start',
    audits.some((r) => r.action === 'impersonate.start'),
    `found=${audits.map((r) => r.action).join(',') || 'none'}`,
  );

  // --- Cleanup --------------------------------------------------------------
  console.log('== Cleanup ==');
  for (const id of [adminId, userId]) {
    await pool.query('DELETE FROM session WHERE "userId"=$1', [id]);
    await pool.query('DELETE FROM account WHERE "userId"=$1', [id]);
    await pool.query('DELETE FROM audit_logs WHERE "actorId"=$1 OR "targetUserId"=$1', [
      id,
    ]);
    await pool.query('DELETE FROM "user" WHERE id=$1', [id]);
  }
  // Also drop the earlier verify-* probe sessions if the DBA left them
  await pool.query(
    "DELETE FROM session WHERE id IN ('verify-sess-admin','verify-sess-user')",
  );

  await pool.end();

  console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('E2E script error:', err);
  process.exit(1);
});
