import 'dart:convert';
import 'dart:ui';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:shared_preferences/shared_preferences.dart';

class CopyService extends ChangeNotifier {
  CopyService._internal();

  static final CopyService instance = CopyService._internal();

  static const String _prefsLocaleKey = 'copy_locale_override';
  static const String _prefsCopyKeyLongPressEnabled =
      'copy_key_long_press_enabled';

  Locale _locale = const Locale('en');
  Map<String, String> _strings = const {};
  Map<String, String> _fallbackStrings = const {};
  List<Locale> _supportedLocales = const [Locale('en')];
  Locale? _localeOverride;
  String? _version;
  bool _copyKeyLongPressEnabled = false;

  Locale get locale => _locale;
  List<Locale> get supportedLocales => _supportedLocales;
  Locale? get localeOverride => _localeOverride;
  String? get version => _version;
  bool get copyKeyLongPressEnabled => _copyKeyLongPressEnabled;

  String get currentLocaleTag => _formatLocale(_locale);

  Future<void> initialize() async {
    await loadPreferences();
    await preloadLocalCopy();
  }

  Future<void> loadPreferences() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final override = prefs.getString(_prefsLocaleKey);
      _localeOverride = override == null ? null : _parseLocale(override);
      _copyKeyLongPressEnabled =
          prefs.getBool(_prefsCopyKeyLongPressEnabled) ?? false;
      notifyListeners();
    } catch (e) {
      debugPrint('[CopyService] Failed to load prefs: $e');
    }
  }

  Future<void> preloadLocalCopy() async {
    try {
      await _loadLocalBundle();
    } catch (e) {
      debugPrint('[CopyService] Local copy preload failed: $e');
    }
  }

  Future<void> setLocaleOverride(Locale? locale) async {
    _localeOverride = locale;
    try {
      final prefs = await SharedPreferences.getInstance();
      if (locale == null) {
        await prefs.remove(_prefsLocaleKey);
      } else {
        await prefs.setString(_prefsLocaleKey, _formatLocale(locale));
      }
    } catch (e) {
      debugPrint('[CopyService] Failed to save locale override: $e');
    }
    final loaded = await _loadLocalBundle();
    if (!loaded) {
      notifyListeners();
    }
  }

  Future<void> setCopyKeyLongPressEnabled(bool enabled) async {
    if (_copyKeyLongPressEnabled == enabled) return;
    _copyKeyLongPressEnabled = enabled;
    notifyListeners();
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setBool(_prefsCopyKeyLongPressEnabled, enabled);
    } catch (e) {
      debugPrint('[CopyService] Failed to save copy-key toggle: $e');
    }
  }

  void setBundle({
    required Locale locale,
    required Map<String, String> strings,
    required Map<String, String> fallbackStrings,
    required List<Locale> supportedLocales,
    String? version,
  }) {
    _locale = locale;
    _strings = Map.unmodifiable(strings);
    _fallbackStrings = Map.unmodifiable(fallbackStrings);
    _supportedLocales = List.unmodifiable(supportedLocales);
    _version = version;
    notifyListeners();
  }

  void updateString(String key, String value) {
    final updated = Map<String, String>.from(_strings);
    updated[key] = value;
    _strings = Map.unmodifiable(updated);

    final updatedFallback = Map<String, String>.from(_fallbackStrings);
    if (updatedFallback.containsKey(key)) {
      updatedFallback[key] = value;
      _fallbackStrings = Map.unmodifiable(updatedFallback);
    }
    notifyListeners();
  }

  String t(String key, {Map<String, String>? params, String? fallback}) {
    final template = _strings[key] ?? _fallbackStrings[key] ?? fallback ?? key;
    if (params == null || params.isEmpty) return template;
    var output = template;
    for (final entry in params.entries) {
      output = output.replaceAll('{{${entry.key}}}', entry.value);
    }
    return output.replaceAllMapped(
      RegExp(r'\\{\\{([^}]+)\\}\\}'),
      (match) => params[match.group(1)] ?? match.group(0) ?? '',
    );
  }

  Locale _parseLocale(String raw) {
    final normalized = raw.replaceAll('_', '-');
    final parts = normalized.split('-');
    if (parts.isEmpty) return const Locale('en');
    if (parts.length == 1) return Locale(parts[0]);
    return Locale(parts[0], parts[1]);
  }

  String _formatLocale(Locale locale) {
    if (locale.countryCode == null || locale.countryCode!.isEmpty) {
      return locale.languageCode;
    }
    return '${locale.languageCode}-${locale.countryCode}';
  }

  String? _extractDocId(String ref) {
    if (ref.isEmpty) return null;
    var cleaned = ref.replaceFirst('firestore:/', '');
    if (cleaned.startsWith('/')) {
      cleaned = cleaned.substring(1);
    }
    final segments = cleaned.split('/');
    if (segments.isEmpty) return null;
    return segments.last;
  }

  Future<bool> _loadLocalBundle() async {
    final indexRaw = await rootBundle.loadString('assets/copy/index_v1.json');
    final indexJson = jsonDecode(indexRaw) as Map<String, dynamic>;
    final defaultLocaleTag = indexJson['defaultLocale']?.toString() ?? 'en';
    final localesRaw = indexJson['locales'];
    if (localesRaw is! Map) return false;

    final supported = localesRaw.keys
        .map((entry) => _parseLocale(entry.toString()))
        .toList();
    final deviceLocale = _localeOverride ?? PlatformDispatcher.instance.locale;
    final deviceLocaleTag = _formatLocale(deviceLocale);
    final localeTag = _pickBestLocaleTag(
      deviceLocaleTag: deviceLocaleTag,
      defaultLocaleTag: defaultLocaleTag,
      supported: localesRaw.keys.map((e) => e.toString()),
    );
    final docRef = localesRaw[localeTag]?.toString() ?? '';
    final docId = _extractDocId(docRef);
    if (docId == null) return false;

    final docRaw = await rootBundle.loadString('assets/copy/$docId.json');
    final docJson = jsonDecode(docRaw) as Map<String, dynamic>;
    final strings = _coerceStringMap(docJson['strings']);
    if (strings.isEmpty) return false;

    setBundle(
      locale: _parseLocale(localeTag),
      strings: strings,
      fallbackStrings: strings,
      supportedLocales: supported,
      version: null,
    );
    return true;
  }

  Map<String, String> _coerceStringMap(Object? raw) {
    if (raw is Map) {
      return raw.map((key, value) => MapEntry('$key', '$value'));
    }
    return const {};
  }

  String _pickBestLocaleTag({
    required String deviceLocaleTag,
    required String defaultLocaleTag,
    required Iterable<String> supported,
  }) {
    final normalizedDevice = deviceLocaleTag.replaceAll('_', '-');
    if (supported.contains(normalizedDevice)) return normalizedDevice;
    final dashIndex = normalizedDevice.indexOf('-');
    if (dashIndex > 0) {
      final language = normalizedDevice.substring(0, dashIndex);
      if (supported.contains(language)) return language;
    }
    if (supported.contains(defaultLocaleTag)) return defaultLocaleTag;
    return supported.isNotEmpty ? supported.first : defaultLocaleTag;
  }
}
