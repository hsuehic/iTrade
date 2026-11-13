import axios, { AxiosError, type AxiosInstance } from 'axios';

/**
 * Redacts exchange API credentials from AxiosError objects before they
 * reach `console.error` / logger.error call sites.
 *
 * Why: an AxiosError serializes `config.headers` (and the underlying Node
 * ClientRequest's raw `_header` string) which contain the FULL plaintext
 * exchange credentials (`OK-ACCESS-KEY`, `OK-ACCESS-PASSPHRASE`,
 * `X-MBX-APIKEY`, `CB-ACCESS-KEY`, JWT `Authorization`, ...). Any code that
 * logs the error object with `console.error(err)` prints those credentials
 * verbatim into container logs — verified in production (account 148248,
 * 2026-11-13: 156 dumps with plaintext OKX apiKey + passphrase).
 *
 * The same credential appears in MULTIPLE places on one error object; the
 * known surfaces are scrubbed by NAME first, and a value-match deep walk
 * then catches every remaining internal copy:
 *   1. error.config.headers                (AxiosHeaders instance)
 *   2. error.request._header                (raw HTTP request header string)
 *   3. error.response.config.headers        (same config, second reference)
 *   4. error.response.request._header       (same request, second reference)
 *   5. error.request._redirectable._options.headers  (follow-redirects)
 *   6. Symbol(kOutHeaders) tuples on the ClientRequest  (value-walk)
 *   7. request.path / config.url query strings carrying `signature=` HMAC
 *      params (Binance signs via query params, not headers)
 * Shared pool objects (http.Agent and FOREIGN in-flight ClientRequests)
 * are never touched — see deepRedactValues SAFETY note. This error's OWN
 * request internals (kOutHeaders, path, socket connect-options snapshots)
 * ARE scrubbed.
 *
 * Axios's own err.toJSON() only serializes config/request/res partially, but
 * Node's console util.inspect (what console.error uses) walks ALL enumerable
 * properties — hence the leak. We mutate the error object in place so every
 * downstream logger (console.error, pino, winston, ...) sees redacted values.
 */

/** Header names (lowercased at HTTP layer) that carry exchange credentials. */
const SENSITIVE_HEADER_NAMES = [
  'ok-access-key',
  'ok-access-passphrase',
  'ok-access-sign',
  'x-mbx-apikey',
  'cb-access-key',
  'cb-access-passphrase',
  'cb-access-sign',
  'authorization',
];

const REDACTED = '[REDACTED]';

/** Redacts sensitive header values inside an AxiosHeaders-like object. */
function redactHeaders(headers: unknown): void {
  if (!headers || typeof headers !== 'object') return;
  const record = headers as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (SENSITIVE_HEADER_NAMES.includes(key.toLowerCase())) {
      record[key] = REDACTED;
    }
  }
}

/** Query param names whose values are request signatures (Binance-style). */
const SIGNATURE_PARAM_NAMES = ['signature', 'signaturev2'];

/**
 * Collects HMAC signature values from query-param objects so the deep
 * value-walk can scrub every internal copy (request.path, config.url,
 * the raw _header request line — all contain the signature as a
 * SUBSTRING, which the walk handles via substring replacement).
 */
function collectQuerySignatureValues(params: unknown, into: Set<string>): void {
  if (!params || typeof params !== 'object') return;
  const record = params as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!SIGNATURE_PARAM_NAMES.includes(key.toLowerCase())) continue;
    const value = record[key];
    if (typeof value === 'string' && value.length > 0) into.add(value);
  }
}

/** Replaces signature values inside a params object (config.params). */
function redactSignatureInParams(params: unknown): void {
  if (!params || typeof params !== 'object') return;
  const record = params as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (SIGNATURE_PARAM_NAMES.includes(key.toLowerCase())) {
      record[key] = REDACTED;
    }
  }
}

/**
 * Collects the sensitive credential VALUES currently on an error's config
 * headers (before they are redacted), so a deep value-match pass can scrub
 * every internal copy (Node internals copy headers in several places:
 * kOutHeaders symbol tuples, follow-redirects snapshots, TLS agent socket
 * pools — enumerating them all is whack-a-mole; matching the VALUES finds
 * them wherever they hide).
 */
function collectSensitiveValues(headers: unknown, into: Set<string>): void {
  if (!headers || typeof headers !== 'object') return;
  const record = headers as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!SENSITIVE_HEADER_NAMES.includes(key.toLowerCase())) continue;
    const value = record[key];
    if (typeof value === 'string' && value.length > 0) into.add(value);
    else if (Array.isArray(value)) {
      for (const v of value) {
        if (typeof v === 'string' && v.length > 0) into.add(v);
      }
    }
  }
}

/**
 * Replaces every occurrence of `sensitiveValues` found anywhere in the error
 * object graph (own properties AND symbols, cycle-safe, node-bounded) with
 * REDACTED. This is the safety net that ends the whack-a-mole against Node
 * http internals: whatever internal snapshot still holds a credential string
 * gets scrubbed without needing to know its location.
 *
 * SAFETY: the error graph is reachable from SHARED process objects (the
 * axios httpAgent socket pool serves every request). Mutating another
 * in-flight request's outgoing headers would corrupt live traffic — a
 * concurrent request for the same account whose headers have not yet been
 * flushed would get [REDACTED] written into its kOutHeaders and then fail
 * with a spurious 401. Therefore:
 *   - http.Agent is NEVER descended into (its pools serve every request).
 *   - A ClientRequest is descended into ONLY if it is this error's OWN
 *     request (err.request / err.response.request, including the
 *     follow-redirects inner _currentRequest) — that is where the
 *     symbol-hidden copies (kOutHeaders tuples, path, _header) live.
 *   - Sockets reachable WITHOUT passing through the agent are safe to
 *     walk: the only such socket is this request's OWN socket, whose
 *     connect-options snapshot is historical data for an already-completed
 *     request. Foreign sockets are reachable only via the agent, which is
 *     blocked above; and new outgoing headers are always constructed on
 *     the ClientRequest, never read back from pooled sockets.
 */

/**
 * Minimum length for a collected credential value to be used in the
 * value-walk's substring replacement. Real credentials (apiKey, secretKey,
 * HMAC signatures, passphrases) are practically always longer; short values
 * are likely to false-positive on unrelated data (e.g. a 3-char passphrase
 * colliding with "BTC" in a ticker list).
 *
 * RESIDUAL SURFACE (accepted): a credential SHORTER than 6 chars is still
 * redacted from all NAME-based surfaces (headers objects, _header string)
 * but NOT from symbol-hidden value copies (kOutHeaders tuples) — substring
 * replacement of a 2-3 char string would mangle unrelated URLs/paths.
 * Exchanges reject sub-6-char API credentials at creation time, so a real
 * key/secret/passphrase this short effectively cannot exist.
 */
const MIN_REDACTABLE_VALUE_LENGTH = 6;

function deepRedactValues(
  root: object,
  sensitiveValues: Set<string>,
  ownRequests: Set<object>,
): void {
  // Drop implausibly short values before walking: substring replacement of
  // a 2-char string would mangle unrelated URLs/paths.
  const values = [...sensitiveValues].filter(
    (v) => v.length >= MIN_REDACTABLE_VALUE_LENGTH,
  );
  if (values.length === 0) return;
  const seen = new WeakSet<object>();
  const stack: Array<{ node: object }> = [];
  let visited = 0;
  const MAX_VISIT_NODES = 5000;
  const visit = (node: object) => {
    if (seen.has(node)) return;
    seen.add(node);
    stack.push({ node });
  };
  visit(root);
  while (stack.length > 0) {
    const { node } = stack.pop()!;
    const keys: PropertyKey[] = [
      ...Object.getOwnPropertyNames(node),
      ...Object.getOwnPropertySymbols(node),
    ];
    for (const key of keys) {
      // `OutgoingMessage.prototype._headers` / `_headerNames` are deprecated
      // getters — merely reading them emits DEP0066 warnings on every
      // sanitized error. The live header data is under Symbol(kOutHeaders),
      // so skip the shims (but NOT `_header` — that is a real data
      // property holding the raw header string, which we scrub above).
      if (key === '_headers' || key === '_headerNames') continue;
      let value: unknown;
      try {
        value = (node as Record<PropertyKey, unknown>)[key];
      } catch {
        continue; // getter that throws (deprecated accessors etc.)
      }
      if (typeof value === 'string') {
        let replaced = value;
        for (const secret of values) {
          if (replaced.includes(secret)) {
            replaced = replaced.split(secret).join(REDACTED);
          }
        }
        if (replaced !== value) {
          try {
            (node as Record<PropertyKey, unknown>)[key] = replaced;
          } catch {
            // read-only accessor — the name-based passes already covered
            // the meaningful header objects; a stale internal copy that
            // cannot be reassigned is acceptable.
          }
        }
      } else if (value && (typeof value === 'object' || typeof value === 'function')) {
        if (visited++ > MAX_VISIT_NODES) continue;
        // Never mutate shared pool internals: agents and foreign in-flight
        // requests are skipped; this error's OWN request graph IS walked
        // (kOutHeaders / path / own-socket snapshots live there).
        if (isSharedPoolObject(value, ownRequests)) continue;
        visit(value as object);
      }
    }
  }
}

/**
 * True for objects shared across requests or belonging to OTHER in-flight
 * requests. Redacting into these would corrupt LIVE traffic, not just the
 * error dump. `ownRequests` whitelists this error's own ClientRequest (and
 * its response's request, when present) so their internals still get
 * scrubbed — the agent's socket pool holds copies of EVERY account's
 * headers and serves other requests, while err.request belongs solely to
 * the errored call.
 */
function isSharedPoolObject(value: object, ownRequests: Set<object>): boolean {
  // This error's own request (or the response's request) — walk it.
  if (ownRequests.has(value)) return false;
  const ctorName = value.constructor?.name ?? '';
  if (ctorName === 'Agent' || ctorName === 'HttpAgent' || ctorName === 'HttpsAgent') {
    return true;
  }
  // A ClientRequest that is NOT one of the errored request's own client
  // objects: reachable only via an agent's internal maps
  // (requests/sockets/freeSockets) — belongs to another in-flight request.
  if (ctorName === 'ClientRequest') {
    return true;
  }
  // Sockets are NOT blocked: the only paths from the error graph to a
  // socket are (a) this request's own socket — whose connect-options
  // snapshot is historical data for a request that already completed or
  // failed, and mutating it cannot affect any future request the agent
  // will build; (b) a FOREIGN socket via the agent, which is already
  // blocked above. (New outgoing headers are always constructed on the
  // ClientRequest, never read back from the pool.)
  return false;
}

/**
 * Scrubs every credential-bearing surface of an AxiosError in place.
 * Returns the same error object so it can be re-thrown transparently.
 *
 * Two-layer defense:
 * 1. NAME-based redaction of the known header objects (config.headers,
 *    response.config.headers, _redirectable._options.headers) and the raw
 *    `_header` string — semantic, keeps header names visible.
 * 2. VALUE-based deep redaction — collects the credential strings and
 *    replaces every copy anywhere in the error graph (verified necessary:
 *    Symbol(kOutHeaders) tuples and TLS-agent free-socket connect-options
 *    both carry plaintext copies that util.inspect happily prints).
 */
export function sanitizeAxiosError(error: unknown): unknown {
  if (!error || typeof error !== 'object') return error;
  const err = error as AxiosError & {
    request?: {
      _header?: unknown;
      _redirectable?: { _options?: { headers?: unknown } };
    };
    response?: {
      config?: { headers?: unknown };
      request?: {
        _header?: unknown;
        _redirectable?: { _options?: { headers?: unknown } };
      };
    };
  };

  if (!err.isAxiosError) return err;

  // Collect credential values BEFORE redacting their containers. Also grab
  // Binance-style query-param signatures — the HMAC `signature` value rides
  // in config.params / config.url / request.path, not in headers.
  const sensitiveValues = new Set<string>();
  collectSensitiveValues(
    (err.config as { headers?: unknown } | undefined)?.headers,
    sensitiveValues,
  );
  collectSensitiveValues(err.response?.config?.headers, sensitiveValues);
  collectQuerySignatureValues(
    (err.config as { params?: unknown } | undefined)?.params,
    sensitiveValues,
  );

  // 1. config.headers (AxiosHeaders)
  redactHeaders((err.config as { headers?: unknown } | undefined)?.headers);

  // 1b. Binance signs requests via query params (`signature=<hmac>`); scrub
  //     the signature from config.params. The signature VALUE is collected
  //     above, so the deep walk also scrubs it from every longer string
  //     (config.url, request.path, the request line inside _header) via
  //     substring replacement. apiKey itself is a header (already covered).
  redactSignatureInParams((err.config as { params?: unknown } | undefined)?.params);

  const requests: Array<{
    _header?: unknown;
    _redirectable?: { _options?: { headers?: unknown } };
  }> = [];
  if (err.request && typeof err.request === 'object') {
    requests.push(err.request);
  }
  if (err.response?.request && typeof err.response.request === 'object') {
    requests.push(err.response.request);
  }
  for (const req of requests) {
    // 2. request._header — raw HTTP header string. Strings are immutable, so
    //    we replace the property value on the request object.
    if (typeof req._header === 'string') {
      const redactedLines = req._header.split('\r\n').map((line) => {
        const colonIdx = line.indexOf(':');
        if (colonIdx === -1) return line;
        const name = line.slice(0, colonIdx).trim().toLowerCase();
        if (SENSITIVE_HEADER_NAMES.includes(name)) {
          return `${line.slice(0, colonIdx + 1)} ${REDACTED}`;
        }
        return line;
      });
      req._header = redactedLines.join('\r\n');
    }
    // 3. request._redirectable._options.headers — follow-redirects' internal
    //    snapshot of the request headers.
    redactHeaders(req._redirectable?._options?.headers);
  }

  // 4. response.config.headers (second reference to the same config)
  redactHeaders(err.response?.config?.headers);

  // 5. VALUE-based safety net: scrub every remaining copy of the credential
  //    strings anywhere in the graph (kOutHeaders tuples, own-socket
  //    connect-options snapshots, request.path query strings, future
  //    axios/node internals). Shared pool objects (the http.Agent and
  //    FOREIGN in-flight requests reachable through it) are never touched —
  //    see deepRedactValues SAFETY note; this error's OWN request graph IS
  //    walked, which is where the symbol-hidden copies live.
  const ownRequests = new Set<object>();
  const addOwnRequest = (req: unknown) => {
    if (!req || typeof req !== 'object') return;
    ownRequests.add(req);
    // follow-redirects wraps the real ClientRequest in a
    // RedirectableRequest; the inner `_currentRequest` holds kOutHeaders,
    // path and the raw _header — whitelist it so the walk scrubs those.
    const inner = (req as { _currentRequest?: unknown })._currentRequest;
    if (inner && typeof inner === 'object') ownRequests.add(inner);
  };
  addOwnRequest(err.request);
  addOwnRequest(err.response?.request);
  deepRedactValues(err, sensitiveValues, ownRequests);

  return err;
}

/**
 * Attaches a response interceptor that redacts credentials from any AxiosError
 * rejected by this instance BEFORE it reaches calling code / loggers.
 *
 * Attach to every axios instance that carries exchange credentials:
 *   - BaseExchange `httpClient` (THE real base — OKX/Binance/Coinbase all
 *     extend it; their signed calls go through it)
 *   - MarketDataExchange `httpClient` (defense-in-depth; no in-repo
 *     subclass carries credentials through it today)
 *   - BinanceExchange `spotClient` / `futuresClient` / `coinFuturesClient`
 *   - CoinbaseExchange `publicHttpClient` (public data — cheap insurance)
 */
export function attachCredentialRedactionInterceptor(client: AxiosInstance): void {
  client.interceptors.response.use(
    (response) => response,
    (error: unknown) => {
      throw sanitizeAxiosError(error);
    },
  );
}

/**
 * Creates an axios instance with credential redaction pre-attached.
 * Drop-in replacement for `axios.create(...)`.
 */
export function createRedactedAxiosInstance(
  config: Parameters<typeof axios.create>[0],
): AxiosInstance {
  const client = axios.create(config);
  attachCredentialRedactionInterceptor(client);
  return client;
}
