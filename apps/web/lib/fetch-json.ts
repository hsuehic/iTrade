/**
 * JSON fetch helper with in-flight request dedupe.
 *
 * Multiple dashboard effects fire the same analytics URL on mount / on
 * exchange change (e.g. the Balance Change card and the Realized P&L card both
 * default to `period=1m&align=calendar`). Sharing the in-flight promise turns
 * those into a single HTTP request; distinct URLs still fetch independently.
 *
 * There is deliberately NO time-based cache here: polling callers decide their
 * own cadence, and the server already applies a short analytics cache.
 */

const inflight = new Map<string, Promise<unknown>>();

/**
 * Fetch JSON from `url`, sharing the promise with any concurrent identical
 * request. Resolves to `null` on HTTP or network errors (callers treat null
 * as "no data" and keep their previous state).
 */
export function fetchJsonShared<T = unknown>(url: string): Promise<T | null> {
  const existing = inflight.get(url);
  if (existing) {
    return existing as Promise<T | null>;
  }

  const promise: Promise<T | null> = fetch(url)
    .then((res) => (res.ok ? (res.json() as Promise<T>) : null))
    .catch(() => null)
    .finally(() => {
      // Delete only our own entry in case a new request for the same URL was
      // started after this one resolved.
      if (inflight.get(url) === promise) {
        inflight.delete(url);
      }
    });

  inflight.set(url, promise);
  return promise;
}
