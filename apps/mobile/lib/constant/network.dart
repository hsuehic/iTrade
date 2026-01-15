import 'package:flutter_dotenv/flutter_dotenv.dart';

class NetworkParameter {
  static const String defaultHost = 'https://itrade.ihsueh.com';
  static final String host = resolveBaseUrl();
  static final String origin = Uri.parse(host).host;

  static String resolveBaseUrl([String? override]) {
    try {
      final String? overrideValue = override?.trim();
      if (overrideValue != null && overrideValue.isNotEmpty) {
        return normalizeBaseUrl(overrideValue);
      }

      final String? envValue = dotenv.env['API_BASE_URL']?.trim();
      if (envValue == null || envValue.isEmpty) {
        return defaultHost;
      }

      return normalizeBaseUrl(envValue);
    } catch (_) {
      return defaultHost;
    }
  }

  static String normalizeBaseUrl(String value) {
    final String trimmed = value.trim();
    if (trimmed.isEmpty) {
      return defaultHost;
    }

    // Ensure scheme is present to avoid Uri parse errors.
    final String valueWithScheme =
        trimmed.startsWith('http') ? trimmed : 'https://$trimmed';
    final Uri? parsed = Uri.tryParse(valueWithScheme);
    if (parsed == null || !parsed.hasScheme || parsed.host.isEmpty) {
      return defaultHost;
    }

    String normalized = parsed.toString();
    if (normalized.endsWith('/')) {
      normalized = normalized.substring(0, normalized.length - 1);
    }
    return normalized;
  }
}
