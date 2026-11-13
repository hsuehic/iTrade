import 'reflect-metadata';
import { getDataManager } from '@/lib/data-manager';
import type { AccountListItem } from '@/lib/types/account';
import { AccountInfoEntity } from '@itrade/data-manager';
import type { CredentialVerificationResult } from '@itrade/core';
import { CryptoUtils } from '@itrade/utils/CryptoUtils';
import {
  BinanceExchange,
  CoinbaseExchange,
  OKXExchange,
} from '@itrade/exchange-connectors';

export interface AccountDto {
  id?: number;
  userId: string;
  exchange: string;
  accountId: string;
  apiKey: string;
  secretKey: string;
  passphrase?: string;
  isActive: boolean;
}

/** Machine-readable reason codes surfaced to the UI. */
export type CredentialVerifyErrorCode =
  | 'invalid_api_key'
  | 'invalid_passphrase'
  | 'invalid_signature'
  | 'ip_restriction'
  | 'rate_limited'
  | 'timeout'
  | 'unreachable'
  | 'stored_credentials_unreadable'
  | 'venue_error'
  | 'credentials_required';

/**
 * Thrown when the user-supplied exchange credentials fail verification at
 * account bind/edit time. `venueCode`/`venueMessage` carry the exchange's
 * own error (e.g. OKX 50105 "OK-ACCESS-PASSPHRASE incorrect") for display;
 * they never contain credential material (axios sanitizer guarantees this).
 */
export class CredentialVerificationError extends Error {
  constructor(
    public readonly reason: CredentialVerifyErrorCode,
    public readonly venueCode: string,
    public readonly venueMessage: string,
  ) {
    super(`Credential verification failed (${reason}) [${venueCode}]: ${venueMessage}`);
    this.name = 'CredentialVerificationError';
  }
}

/** Axios-like error status extraction (works on AxiosError and plain Error). */
function getHttpStatus(error: unknown): number | undefined {
  const err = error as { response?: { status?: number } };
  return err?.response?.status;
}

/**
 * True when the error is OUR OWN timeout race, or a venue/network timeout.
 * `code` covers AxiosError.code (ETIMEDOUT / ECONNABORTED) which can be set
 * even when the human message lacks the word "timeout".
 */
function isTimeoutError(message: string, code?: string): boolean {
  if (code === 'ETIMEDOUT' || code === 'ECONNABORTED') return true;
  return /timed? ?out|ETIMEDOUT|ECONNABORTED|timeout/i.test(message);
}

/** Network-level DNS/connect failures (AxiosError.code or message). */
function isNetworkUnreachable(message: string, code?: string): boolean {
  if (code && /^(ENOTFOUND|ECONNREFUSED|EAI_AGAIN|ECONNRESET)$/.test(code)) return true;
  return /ENOTFOUND|ECONNREFUSED|EAI_AGAIN|ECONNRESET/i.test(message);
}

/**
 * Maps a raw connector error to a user-facing reason code.
 * Exchange error semantics (verified against venue docs):
 *  - OKX 50111 invalid key, 50105 wrong passphrase, 50113 bad signature,
 *    50110 IP restricted; HTTP 429 rate limited
 *  - Binance -2014/-2015 invalid key, -1022 bad signature; HTTP 401/429
 *  - Coinbase 401 invalid key/JWT
 */
function mapVenueError(exchange: string, error: unknown): CredentialVerificationError {
  const anyErr = error as {
    message?: string;
    code?: string;
    response?: {
      status?: number;
      data?: { code?: string | number; msg?: string; message?: string };
    };
  };
  const message = anyErr?.message ?? String(error);
  const httpStatus = getHttpStatus(error);
  const venueBodyCode = anyErr?.response?.data?.code;
  // Our own verifyCredentials() throws "Venue API error <code>: <msg>" on
  // HTTP 200 + error-body venues (OKX/Binance); AxiosError carries the raw
  // body on 4xx. Normalize both into one code+message pair. Coinbase error
  // bodies use `message` instead of `msg`.
  const extracted = /^(\w+ API error) (-?\d+): (.*)$/.exec(message);
  const venueCode = String(extracted?.[2] ?? venueBodyCode ?? httpStatus ?? 'unknown');
  const venueMessage =
    extracted?.[3] ??
    anyErr?.response?.data?.msg ??
    anyErr?.response?.data?.message ??
    message;

  // Classification order: DEFINITIVE venue auth codes first, free-text
  // matching second. A venue 5xx whose message happens to contain the word
  // "timeout" must not shadow a clear auth code, and a hanging venue must
  // never be reported as a bad key (that pushes users to rotate GOOD keys).
  let reason: CredentialVerifyErrorCode;
  if (exchange === 'okx') {
    if (venueCode === '50105') reason = 'invalid_passphrase';
    // 50113 = signature check failed — the secret does not match this key;
    // same semantics as Binance -1022, so use the same reason.
    else if (venueCode === '50113') reason = 'invalid_signature';
    else if (venueCode === '50111') reason = 'invalid_api_key';
    else if (venueCode === '50110') reason = 'ip_restriction';
    // 501xx = auth family. Anything else (5xxxx service errors, unknowns)
    // falls through to the shared chain below.
    else if (venueCode.startsWith('501') || httpStatus === 401 || httpStatus === 403) {
      reason = 'invalid_api_key';
    } else if (isTimeoutError(message, anyErr?.code)) {
      reason = 'timeout';
    } else if (isNetworkUnreachable(message, anyErr?.code)) {
      reason = 'unreachable';
    } else if (httpStatus === 429 || /Too Many Requests|Rate limit/i.test(message)) {
      reason = 'rate_limited';
    } else {
      reason = 'venue_error';
    }
  } else if (exchange === 'binance') {
    if (venueCode === '-2014' || venueCode === '-2015') reason = 'invalid_api_key';
    else if (venueCode === '-1022') reason = 'invalid_signature';
    else if (httpStatus === 401 || httpStatus === 403) reason = 'invalid_api_key';
    else if (isTimeoutError(message, anyErr?.code)) {
      reason = 'timeout';
    } else if (isNetworkUnreachable(message, anyErr?.code)) {
      reason = 'unreachable';
    } else if (httpStatus === 429 || /Too Many Requests|Rate limit/i.test(message)) {
      reason = 'rate_limited';
    } else {
      reason = 'venue_error';
    }
  } else {
    // Coinbase and unknown venues: no definitive venue error-code contract
    // in this path; 401/403 = bad key or JWT, then the shared chain.
    if (httpStatus === 401 || httpStatus === 403) reason = 'invalid_api_key';
    else if (isTimeoutError(message, anyErr?.code)) {
      reason = 'timeout';
    } else if (isNetworkUnreachable(message, anyErr?.code)) {
      reason = 'unreachable';
    } else if (httpStatus === 429 || /Too Many Requests|Rate limit/i.test(message)) {
      reason = 'rate_limited';
    } else {
      reason = 'venue_error';
    }
  }
  return new CredentialVerificationError(reason, venueCode, venueMessage);
}

/**
 * Verifies the given (plaintext) credentials against the venue by calling a
 * signed/authenticated endpoint. Throws CredentialVerificationError on
 * failure. Bounded by a hard timeout so a hanging venue cannot stall the
 * save-account request. On success, returns the connector's
 * CredentialVerificationResult; its balanceSummary is used by upsertAccount
 * to seed an initial balance_history row at bind time. Today ONLY Coinbase
 * returns a summary (raw per-currency sums — the same unit its poller
 * persists); OKX/Binance deliberately return none because their pollers
 * persist USD/BTC-converted equity the verification endpoint cannot
 * reproduce. summary is undefined when the venue could not derive one
 * (e.g. Coinbase paginated response).
 */
export async function verifyExchangeCredentials(params: {
  exchange: string;
  apiKey: string;
  secretKey: string;
  passphrase?: string;
}): Promise<CredentialVerificationResult> {
  const exchangeName = params.exchange.toLowerCase();
  const useTestnet = process.env.EXCHANGE_TESTNET === 'true';
  let timer: ReturnType<typeof setTimeout> | undefined;
  // Hard bound: a hanging venue must not stall the save-account request
  // (and must be reported as `timeout`, never as a bad key).
  const VERIFY_TIMEOUT_MS = 15000;

  // One helper per venue keeps the switch flat; every instance is disposed
  // in finally — connect() may open WebSocket managers / keepalive timers
  // that would otherwise leak on every save attempt.
  const runVerified = async (
    exchange: OKXExchange | BinanceExchange | CoinbaseExchange,
    credentials: Parameters<typeof exchange.connect>[0],
  ): Promise<CredentialVerificationResult> => {
    try {
      await exchange.connect(credentials);
      return await exchange.verifyCredentials();
    } finally {
      await exchange.disconnect().catch(() => undefined);
    }
  };

  const attempt = async (): Promise<CredentialVerificationResult> => {
    switch (exchangeName) {
      case 'okx': {
        // connect() stores credentials + pings a PUBLIC endpoint (harmless);
        // the credential check itself is verifyCredentials().
        return runVerified(new OKXExchange(useTestnet), {
          apiKey: params.apiKey,
          secretKey: params.secretKey,
          passphrase: params.passphrase ?? '',
          sandbox: useTestnet,
        });
      }
      case 'binance': {
        return runVerified(new BinanceExchange(useTestnet), {
          apiKey: params.apiKey,
          secretKey: params.secretKey,
          sandbox: useTestnet,
        });
      }
      case 'coinbase': {
        return runVerified(new CoinbaseExchange(), {
          apiKey: params.apiKey,
          secretKey: params.secretKey,
          sandbox: useTestnet,
        });
      }
      default:
        throw new Error('Unsupported exchange');
    }
  };

  try {
    const attemptPromise = attempt();
    // attach a catch to attemptPromise: when OUR timeout wins the race,
    // attempt() may still reject LATER (venue finally answers with a 40x
    // after 15s) — without this, that late rejection would be an
    // unhandledRejection crash candidate in the server process. Log it at
    // debug level so ops can still see what the venue actually answered
    // after the timeout was already reported to the user.
    attemptPromise.catch((lateError) => {
      console.log(
        '[verifyExchangeCredentials] late venue answer (already reported as timeout):',
        lateError instanceof Error ? lateError.message : lateError,
      );
    });
    return await Promise.race([
      attemptPromise,
      new Promise<never>((_, reject) => {
        // Keep a handle so the timer never outlives the call — otherwise
        // every save leaves a dangling 15s timer in the server process.
        timer = setTimeout(
          () => reject(new Error('Credential verification timed out')),
          VERIFY_TIMEOUT_MS,
        );
      }),
    ]);
  } catch (error) {
    // Log a COMPACT summary, not the raw error graph: even though every
    // credential-bearing axios instance is sanitized (interceptor strips
    // credentials before the error reaches this point), dumping the full
    // axios object prints the whole request/socket graph on every failed
    // bind — noisy in docker logs. Message + code is enough to triage;
    // the mapped CredentialVerificationError carries the venue detail.
    const errAny = error as { message?: string; code?: string };
    console.error(
      '[verifyExchangeCredentials] failed:',
      errAny?.message ?? String(error),
      errAny?.code ? `(code: ${errAny.code})` : '',
    );
    throw mapVenueError(exchangeName, error);
  } finally {
    clearTimeout(timer);
  }
}

export async function getUserAccounts(userId: string): Promise<AccountListItem[]> {
  const dm = await getDataManager();
  const repo = dm.getAccountInfoRepository();

  const accounts = await repo.find({
    where: { userId },
    order: { createdAt: 'DESC' },
  });

  const encryptionKey = process.env.ENCRYPTION_KEY;

  return accounts.map((acc) => {
    let maskedKey = '************';
    if (acc.apiKey && encryptionKey) {
      try {
        const decrypted = CryptoUtils.decrypt(acc.apiKey, encryptionKey);
        maskedKey = CryptoUtils.maskApiKey(decrypted);
      } catch {
        maskedKey = 'Invalid Key';
      }
    }

    return {
      id: acc.id,
      exchange: acc.exchange,
      accountId: acc.accountId,
      isActive: acc.isActive,
      updatedTime: acc.updateTime,
      apiKey: maskedKey,
    };
  });
}

export async function upsertAccount(data: AccountDto) {
  const encryptionKey = process.env.ENCRYPTION_KEY;
  if (!encryptionKey)
    throw new Error('Server configuration error: ENCRYPTION_KEY missing');

  const dm = await getDataManager();
  const repo = dm.getAccountInfoRepository();

  let entity: AccountInfoEntity;

  if (data.id) {
    const existing = await repo.findOne({
      where: { id: data.id, userId: data.userId },
    });
    if (!existing) throw new Error('Account not found');
    entity = existing;
  } else {
    entity = new AccountInfoEntity();
    entity.userId = data.userId;
  }

  // On EDIT, blank credential fields mean "keep the stored value". The web
  // edit form pre-fills apiKey with the MASKED key and leaves secretKey /
  // passphrase empty — blindly overwriting would destroy the stored
  // credentials (verified in prod: account 148248's OKX key was clobbered).
  // A masked value (contains '*') or '' falls back to the existing secret.
  // On CREATE, credentials are required and validated by the callers.
  //
  // EXCEPTION — venue change: the stored credentials belong to the OLD
  // venue, so a bare exchange switch must NOT carry them over. The full new
  // set is required (guarded below) and the stored passphrase is dropped.
  // Exchange names are normalized to lowercase because legacy rows may
  // store e.g. 'OKX' while forms submit 'okx' — a case-only difference must
  // NOT look like a venue change (it would spuriously demand credentials).
  const isEdit = !!data.id;
  const normalizedNewExchange = data.exchange.toLowerCase();
  const storedExchange = data.id ? entity.exchange?.toLowerCase() : undefined;
  const exchangeChanged = isEdit && normalizedNewExchange !== storedExchange;
  const apiKeyProvided = !isEdit || (!!data.apiKey && !data.apiKey.includes('*'));
  const secretKeyProvided = !isEdit || !!data.secretKey;
  const passphraseProvided = !isEdit || !!data.passphrase;

  if (!isEdit) {
    if (!data.apiKey || !data.secretKey) {
      throw new Error('apiKey and secretKey are required');
    }
  }

  const encryptedApiKey = apiKeyProvided
    ? CryptoUtils.encrypt(data.apiKey, encryptionKey)
    : entity.apiKey;
  const encryptedSecretKey = secretKeyProvided
    ? CryptoUtils.encrypt(data.secretKey, encryptionKey)
    : entity.secretKey;
  // Blank = keep stored value EXCEPT on a venue change: the stored
  // passphrase belongs to the OLD venue's key and must not be persisted
  // onto the new venue's row (the credentials_required guard below
  // ensures key+secret are fresh; the passphrase is optional for venues
  // that do not use one).
  const encryptedPassphrase = passphraseProvided
    ? data.passphrase
      ? CryptoUtils.encrypt(data.passphrase, encryptionKey)
      : undefined
    : exchangeChanged
      ? undefined
      : entity.passphrase;

  entity.exchange = normalizedNewExchange;
  entity.accountId = data.accountId;
  entity.apiKey = encryptedApiKey;
  entity.secretKey = encryptedSecretKey;
  entity.passphrase = encryptedPassphrase;
  entity.isActive = data.isActive;
  entity.updateTime = new Date();

  if (!data.id) {
    entity.canTrade = true;
    entity.canDeposit = true;
    entity.canWithdraw = true;
  }

  // Verify credentials against the venue BEFORE persisting (fail-closed):
  // - CREATE: always verify the submitted credentials.
  // - EDIT: verify only when the user supplied at least one NEW credential
  //   value; the effective set is (new value where provided, stored value
  //   where blank). An all-blank edit changes nothing about credentials and
  //   was already verified at bind time.
  //
  // FRAGILITY NOTE: entity fields are mutated above but repo.save runs ONLY
  // after verification. Safe because repo.findOne returns a FRESH entity
  // per call (no identity map in this stack) — a future caching layer would
  // leak these mutations; if you add one, move the mutation after verify.
  const hasNewCredentials =
    !isEdit || apiKeyProvided || secretKeyProvided || passphraseProvided;
  // exchangeChanged is computed BEFORE the entity mutation block above
  // (storedExchange was captured first) — the guard below is live.
  if (exchangeChanged && !(apiKeyProvided && secretKeyProvided)) {
    throw new CredentialVerificationError(
      'credentials_required',
      'exchange_changed',
      `Credentials are required when changing the exchange from ${storedExchange} to ${data.exchange}.`,
    );
  }
  // OKX requires a passphrase — both on CREATE and on a venue change.
  // Without it the venue would fail later with a confusing
  // invalid_passphrase; tell the user to fill the field up front.
  // NOTE: test `!data.passphrase`, NOT `!passphraseProvided` — the latter
  // is `!isEdit || !!data.passphrase`, which is ALWAYS true on create
  // (the `!isEdit ||` short-circuit) and would make this guard dead code
  // on exactly the create path it needs to cover.
  if (
    (exchangeChanged || !isEdit) &&
    normalizedNewExchange === 'okx' &&
    !(data.passphrase && data.passphrase.trim())
  ) {
    throw new CredentialVerificationError(
      'credentials_required',
      'passphrase_required',
      `A passphrase is required for OKX accounts.`,
    );
  }
  let verificationResult: CredentialVerificationResult | undefined;
  if (hasNewCredentials || exchangeChanged) {
    // Stored values may be undecryptable (rotated key, corrupted row — see
    // prod account 148248). Surface a typed, actionable error instead of a
    // raw 500 so the user knows to re-enter all credential fields.
    const decryptStored = (field: string | undefined): string | undefined => {
      if (!field) return undefined;
      try {
        return CryptoUtils.decrypt(field, encryptionKey);
      } catch {
        throw new CredentialVerificationError(
          'stored_credentials_unreadable',
          'decrypt_failed',
          'Stored credentials could not be decrypted (key rotated or data corrupted). Re-enter all credential fields.',
        );
      }
    };
    const effectiveApiKey = apiKeyProvided ? data.apiKey : decryptStored(entity.apiKey);
    const effectiveSecretKey = secretKeyProvided
      ? data.secretKey
      : decryptStored(entity.secretKey);
    // When the venue CHANGED, never fall back to the OLD venue's stored
    // passphrase — it belongs to a different venue's key (sending the old
    // OKX passphrase to Binance would both fail verification and leak a
    // credential across venues).
    const effectivePassphrase = exchangeChanged
      ? passphraseProvided
        ? data.passphrase
        : undefined
      : passphraseProvided && data.passphrase
        ? data.passphrase
        : decryptStored(entity.passphrase);
    if (!effectiveApiKey || !effectiveSecretKey) {
      throw new CredentialVerificationError(
        'stored_credentials_unreadable',
        'missing_stored_credentials',
        'Stored credentials are incomplete. Re-enter all credential fields.',
      );
    }
    verificationResult = await verifyExchangeCredentials({
      exchange: data.exchange,
      apiKey: effectiveApiKey,
      secretKey: effectiveSecretKey,
      passphrase: effectivePassphrase,
    });
  }

  await repo.save(entity);

  // Seed an initial balance_history row from the venue response that proved
  // the credentials, so the dashboard is not empty in the window between
  // bind and the console poller's first tick (pg_notify → refreshBots →
  // first poll writes the real snapshot; the seed only shortens the gap).
  // FIRST-BIND ONLY: skip when the account already has balance history —
  // credential rotations and re-binds must not inject extra seed rows, and
  // a venue change must not seed over the old venue's history (the new
  // venue's poller owns those rows now).
  // Semantics are venue-consistent by contract: connectors only return a
  // balanceSummary when its unit matches the poller's (Coinbase: raw sums,
  // matching its getAccountInfo snapshot; OKX/Binance: no summary — their
  // pollers persist USD/BTC-converted equity the verification endpoint
  // cannot reproduce).
  // NON-FATAL by design: a failed snapshot write must not fail an
  // otherwise-successful bind; the poller backfills regardless.
  if (verificationResult?.balanceSummary) {
    try {
      const dm = await getDataManager();
      const balanceRepo = dm.getBalanceHistoryRepository();
      const hasHistory = await balanceRepo.hasAnyHistory(entity.id);
      if (!hasHistory) {
        await dm.updateBalanceHistory(
          entity,
          verificationResult.balanceSummary.free,
          verificationResult.balanceSummary.locked,
          verificationResult.balanceSummary.total,
          new Date(),
          verificationResult.balanceSummary.saving,
          null, // no position data at bind time → no unrealized PnL
        );
      }
    } catch (error) {
      console.error(
        `[upsertAccount] initial balance snapshot failed (non-fatal, poller will backfill): account=${entity.id}`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  return entity;
}

export async function removeAccount(id: number, userId: string) {
  const dm = await getDataManager();
  const repo = dm.getAccountInfoRepository();

  // Fetch the account before deletion so we know the exchange to clean up
  const account = await repo.findOne({ where: { id, userId } });
  if (!account) return false;

  const exchange = account.exchange;

  // All four deletes in a single transaction: if any step fails, the
  // account_info row stays too, so the user can retry the whole operation.
  // Without this, a partial failure leaves account_info gone but orphaned
  // orders/positions/transfers remain — with no account to re-delete from.
  const queryRunner = dm.dataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();
  try {
    // 0. Delete the account_info row (balance_* and account_snapshots cascade automatically)
    await queryRunner.manager.delete(AccountInfoEntity, { id, userId });

    // Clean up orphaned data that has no FK to account_info.
    // All three tables (orders, positions, transfers) are keyed by userId + exchange,
    // not by account_info.id, so they survive the account_info deletion.

    // 1. Delete orders (order_fills cascade via FK ON DELETE CASCADE on orders.internalId)
    await queryRunner.manager
      .createQueryBuilder()
      .delete()
      .from('orders')
      .where('"userId" = :userId', { userId })
      .andWhere('LOWER(exchange) = LOWER(:exchange)', { exchange })
      .execute();

    // 2. Delete positions
    await queryRunner.manager
      .createQueryBuilder()
      .delete()
      .from('positions')
      .where('"userId" = :userId', { userId })
      .andWhere('LOWER(exchange) = LOWER(:exchange)', { exchange })
      .execute();

    // 3. Delete transfers
    await queryRunner.manager
      .createQueryBuilder()
      .delete()
      .from('transfers')
      .where('"userId" = :userId', { userId })
      .andWhere('LOWER(exchange) = LOWER(:exchange)', { exchange })
      .execute();

    await queryRunner.commitTransaction();
    return true;
  } catch (err) {
    await queryRunner.rollbackTransaction();
    throw err;
  } finally {
    await queryRunner.release();
  }
}
