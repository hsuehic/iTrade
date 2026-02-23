import 'dart:ui';

import '../design/themes/theme_overrides.dart';

class RemoteConfigRefs {
  const RemoteConfigRefs({
    required this.themeDocPath,
    this.copyIndexDocPath,
    this.copyIndexInline,
    required this.copyDefaultDocPath,
  });

  final String themeDocPath;
  final String? copyIndexDocPath;
  final Map<String, dynamic>? copyIndexInline;
  final String copyDefaultDocPath;

  static String? parseFirestoreDocPath(String raw) {
    if (raw.isEmpty) return null;
    if (raw.startsWith('firestore:/')) {
      return raw.replaceFirst('firestore:/', '');
    }
    if (raw.startsWith('/')) {
      return raw.substring(1);
    }
    return raw;
  }
}

class CopyIndex {
  const CopyIndex({
    required this.defaultLocale,
    required this.locales,
  });

  final String defaultLocale;
  final Map<String, String> locales;

  List<Locale> get supportedLocales {
    final List<Locale> locales = [];
    for (final entry in this.locales.keys) {
      locales.add(parseLocaleTag(entry));
    }
    return locales;
  }
}

class CopyBundle {
  const CopyBundle({
    required this.localeTag,
    required this.strings,
  });

  final String localeTag;
  final Map<String, String> strings;
}

class ThemeConfig {
  const ThemeConfig({
    required this.version,
    required this.light,
    required this.dark,
  });

  final String? version;
  final ThemeOverrides? light;
  final ThemeOverrides? dark;
}

Locale parseLocaleTag(String tag) {
  final normalized = tag.replaceAll('_', '-');
  final parts = normalized.split('-');
  if (parts.isEmpty) return const Locale('en');
  if (parts.length == 1) return Locale(parts[0]);
  return Locale(parts[0], parts[1]);
}

String toLocaleTag(Locale locale) {
  if (locale.countryCode == null || locale.countryCode!.isEmpty) {
    return locale.languageCode;
  }
  return '${locale.languageCode}-${locale.countryCode}';
}

String pickBestLocaleTag({
  required String deviceLocaleTag,
  required String defaultLocaleTag,
  required Iterable<String> supported,
}) {
  if (supported.contains(deviceLocaleTag)) return deviceLocaleTag;
  final dashIndex = deviceLocaleTag.indexOf('-');
  if (dashIndex > 0) {
    final language = deviceLocaleTag.substring(0, dashIndex);
    if (supported.contains(language)) return language;
  }
  if (supported.contains(defaultLocaleTag)) return defaultLocaleTag;
  return supported.isNotEmpty ? supported.first : defaultLocaleTag;
}

Map<String, String> coerceStringMap(Object? raw) {
  if (raw is Map) {
    return raw.map((key, value) => MapEntry('$key', '$value'));
  }
  return const {};
}

CopyIndex parseCopyIndex(Map<String, dynamic> json) {
  final defaultLocale = json['defaultLocale']?.toString() ?? 'en';
  final locales = coerceStringMap(json['locales']);
  return CopyIndex(defaultLocale: defaultLocale, locales: locales);
}

CopyBundle parseCopyBundle(Map<String, dynamic> json, String localeTag) {
  final strings = coerceStringMap(json['strings']);
  return CopyBundle(localeTag: localeTag, strings: strings);
}

ThemeConfig parseThemeConfig(Map<String, dynamic> json) {
  final version = json['version']?.toString();
  ThemeOverrides? light;
  ThemeOverrides? dark;
  if (json['light'] is Map<String, dynamic>) {
    light = ThemeOverrides.fromJson(json['light'] as Map<String, dynamic>);
  }
  if (json['dark'] is Map<String, dynamic>) {
    dark = ThemeOverrides.fromJson(json['dark'] as Map<String, dynamic>);
  }
  if (light == null && dark == null) {
    final overrides = ThemeOverrides.fromJson(json);
    light = overrides;
    dark = overrides;
  }
  return ThemeConfig(version: version, light: light, dark: dark);
}
