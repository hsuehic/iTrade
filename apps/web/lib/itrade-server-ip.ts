/**
 * Default egress IPs of the iTrade production servers (GCE).
 *
 * Client-safe module (no server-only imports). The canonical, admin-editable
 * copy lives in the `app_settings` table under `server_ip_whitelist`
 * (see lib/settings.ts + /api/admin/settings/ip-whitelist); this constant is
 * only the built-in fallback used before the first fetch resolves, and the
 * default shown on fresh deployments where no admin edit has been made.
 */
export const DEFAULT_SERVER_IPS: string[] = ['202.73.36.25', '34.143.244.107'];

/** Strict IPv4 validator — dotted quad, each octet 0-255, no CIDR. */
const IPV4_PATTERN =
  /^(25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])(\.(25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])){3}$/;

export function isValidIp(ip: string): boolean {
  return IPV4_PATTERN.test(ip);
}
