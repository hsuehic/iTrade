import 'package:flutter/foundation.dart';

import 'api_client.dart';

/// Default egress IPs of the iTrade production servers (GCE).
///
/// Mirrors `DEFAULT_SERVER_IPS` from `apps/web/lib/itrade-server-ip.ts`.
/// The canonical, admin-editable copy lives in the web backend's
/// `app_settings` table (see /api/config/server-ips); this constant is only
/// the built-in fallback used before the first fetch resolves or when the
/// fetch fails, so display surfaces always render a sensible list.
const List<String> kDefaultServerIps = ['202.73.36.25', '34.143.244.107'];

/// In-memory TTL cache for the configured server IP whitelist so the
/// wizard doesn't refetch the public endpoint on every rebuild.
const Duration _kCacheTtl = Duration(seconds: 30);

List<String>? _cachedIps;
DateTime? _cachedAt;

/// Returns the admin-configured server IP whitelist from
/// GET /api/config/server-ips (public read-only), falling back to
/// [kDefaultServerIps] while loading or on any failure.
///
/// Never throws — the IP notice is display-only and must always render.
Future<List<String>> fetchServerIps() async {
  final cachedAt = _cachedAt;
  if (_cachedIps != null &&
      cachedAt != null &&
      DateTime.now().difference(cachedAt) < _kCacheTtl) {
    return _cachedIps!;
  }

  try {
    final response = await ApiClient.instance.getJson<Map<String, dynamic>>(
      '/api/config/server-ips',
    );
    final data = response.data;
    final ips = data == null
        ? const <String>[]
        : (data['ips'] as List<dynamic>? ?? const <dynamic>[])
            .whereType<String>()
            .map((ip) => ip.trim())
            .where((ip) => ip.isNotEmpty)
            .toList();
    if (ips.isNotEmpty) {
      _cachedIps = ips;
      _cachedAt = DateTime.now();
      return ips;
    }
  } catch (_) {
    // Keep defaults — server list is unavailable, not empty.
  }

  // Failure or empty payload: fall back to defaults but do NOT cache them,
  // so a later successful fetch replaces the fallback quickly.
  return kDefaultServerIps;
}

/// Test hook — clears the in-memory cache.
@visibleForTesting
void resetServerIpsCacheForTest() {
  _cachedIps = null;
  _cachedAt = null;
}
