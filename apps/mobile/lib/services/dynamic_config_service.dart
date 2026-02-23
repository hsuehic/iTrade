import 'dart:convert';
import 'dart:ui';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_remote_config/firebase_remote_config.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'copy_service.dart';
import 'dynamic_config_models.dart';
import 'theme_service.dart';

class DynamicConfigService {
  DynamicConfigService._internal();

  static final DynamicConfigService instance = DynamicConfigService._internal();

  static const String _themeRefKey = 'theme_base_ref_v3';
  static const String _copyIndexRefKey = 'copy_index_ref_v5';
  static const String _copyDefaultRefKey = 'copy_default_ref_v5';
  static const String _adminsCollection = 'configs_admins';
  static const String _copyEditorsDoc = 'copy_editors';
  static const String _themeEditorsDoc = 'theme_editors';

  static const String _prefsThemeDocKey = 'dynamic_theme_doc';
  static const String _prefsCopyIndexKey = 'dynamic_copy_index';
  static const String _prefsCopyDocKey = 'dynamic_copy_doc';
  static const String _prefsCopyFallbackDocKey = 'dynamic_copy_fallback_doc';

  final FirebaseRemoteConfig _remoteConfig = FirebaseRemoteConfig.instance;
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;

  DateTime? _lastRefreshAt;
  static const String _prefsCopyAdminsKey = 'dynamic_copy_admins';
  static const String _prefsThemeAdminsKey = 'dynamic_theme_admins';

  List<String> _copyAdminEmails = const [];
  List<String> _themeAdminEmails = const [];
  String? _currentCopyDocPath;
  Map<String, dynamic>? _currentCopyDoc;
  String? _currentThemeDocPath;

  String? get currentThemeDocPath => _currentThemeDocPath;

  Future<void> initialize() async {
    try {
      await _remoteConfig.setConfigSettings(
        RemoteConfigSettings(
          fetchTimeout: const Duration(seconds: 10),
          minimumFetchInterval: const Duration(minutes: 15),
        ),
      );
    } catch (e) {
      debugPrint('[DynamicConfig] Remote config settings failed: $e');
    }
  }

  Future<void> refresh({bool force = false}) async {
    final now = DateTime.now();
    if (!force &&
        _lastRefreshAt != null &&
        now.difference(_lastRefreshAt!) < const Duration(minutes: 5)) {
      return;
    }
    _lastRefreshAt = now;

    final copyService = CopyService.instance;
    final themeService = ThemeService.instance;
    final overrideLocale = copyService.localeOverride;
    final deviceLocale = overrideLocale ?? PlatformDispatcher.instance.locale;

    try {
      await _remoteConfig.fetchAndActivate();
      await _loadAdminEmails();
      final refs = _readRefsFromRemoteConfig();
      if (refs == null) {
        await _loadFromCache(themeService, copyService);
        return;
      }

      final themeDoc = await _fetchFirestoreDoc(refs.themeDocPath);
      final copyIndexDoc = refs.copyIndexDocPath == null
          ? refs.copyIndexInline
          : await _fetchFirestoreDoc(refs.copyIndexDocPath!);
      final copyDefaultDoc = await _fetchFirestoreDoc(refs.copyDefaultDocPath);
      if (themeDoc == null || copyIndexDoc == null || copyDefaultDoc == null) {
        await _loadFromCache(themeService, copyService);
        return;
      }

      final themeConfig = parseThemeConfig(themeDoc);
      final copyIndex = parseCopyIndex(copyIndexDoc);
      final copySnapshot = await _loadCopyBundle(
        copyIndex: copyIndex,
        deviceLocale: deviceLocale,
        fallbackDoc: copyDefaultDoc,
      );
      if (copySnapshot == null) {
        await _loadFromCache(themeService, copyService);
        return;
      }

      themeService.applyRemoteTheme(
        light: themeConfig.light,
        dark: themeConfig.dark,
        version: themeConfig.version,
      );
      _currentThemeDocPath = refs.themeDocPath;
      copyService.setBundle(
        locale: parseLocaleTag(copySnapshot.localeTag),
        strings: copySnapshot.strings,
        fallbackStrings: copySnapshot.fallbackStrings,
        supportedLocales: copyIndex.supportedLocales,
        version: themeConfig.version,
      );
      _currentCopyDocPath = copySnapshot.docPath;
      _currentCopyDoc = Map<String, dynamic>.from(copySnapshot.rawDoc);

      await _cacheSnapshot(
        themeDoc: themeDoc,
        copyIndexDoc: copyIndexDoc,
        copyDoc: copySnapshot.rawDoc,
        copyFallbackDoc: copyDefaultDoc,
      );
    } catch (e) {
      debugPrint('[DynamicConfig] Refresh failed: $e');
      await _loadAdminEmails(fromCacheOnly: true);
      await _loadFromCache(themeService, copyService);
    }
  }

  bool isCopyAdmin(String? email) {
    if (email == null) return false;
    final normalized = email.trim().toLowerCase();
    if (normalized.isEmpty) return false;
    return _copyAdminEmails.contains(normalized);
  }

  bool isThemeAdmin(String? email) {
    if (email == null) return false;
    final normalized = email.trim().toLowerCase();
    if (normalized.isEmpty) return false;
    return _themeAdminEmails.contains(normalized);
  }

  RemoteConfigRefs? _readRefsFromRemoteConfig() {
    final themeRefRaw = _readRemoteConfigValue(_themeRefKey);
    final copyIndexRaw = _readRemoteConfigValue(_copyIndexRefKey);
    final copyDefaultRaw = _readRemoteConfigValue(_copyDefaultRefKey);
    if (themeRefRaw.isEmpty || copyIndexRaw.isEmpty || copyDefaultRaw.isEmpty) {
      debugPrint(
        '[DynamicConfig] Missing refs env=$_envName '
        'themeRefEmpty=${themeRefRaw.isEmpty} '
        'copyIndexEmpty=${copyIndexRaw.isEmpty} '
        'copyDefaultEmpty=${copyDefaultRaw.isEmpty}',
      );
      return null;
    }
    final themeJson = jsonDecode(themeRefRaw) as Map<String, dynamic>;
    final copyIndexJson = jsonDecode(copyIndexRaw) as Map<String, dynamic>;
    final copyDefaultJson = jsonDecode(copyDefaultRaw) as Map<String, dynamic>;
    final themeDoc = RemoteConfigRefs.parseFirestoreDocPath(
      themeJson['doc']?.toString() ?? '',
    );
    final copyIndexDoc = RemoteConfigRefs.parseFirestoreDocPath(
      copyIndexJson['doc']?.toString() ?? '',
    );
    final copyDefaultDoc = RemoteConfigRefs.parseFirestoreDocPath(
      copyDefaultJson['doc']?.toString() ?? '',
    );
    final hasInlineIndex = copyIndexJson['locales'] is Map;
    if (themeDoc == null || copyDefaultDoc == null) {
      return null;
    }
    if (!hasInlineIndex && copyIndexDoc == null) {
      return null;
    }
    return RemoteConfigRefs(
      themeDocPath: themeDoc,
      copyIndexDocPath: hasInlineIndex ? null : copyIndexDoc,
      copyIndexInline: hasInlineIndex ? copyIndexJson : null,
      copyDefaultDocPath: copyDefaultDoc,
    );
  }

  String _readRemoteConfigValue(String baseKey) {
    final envKey = '${baseKey}_$_envName';
    final envValue = _remoteConfig.getString(envKey);
    if (envValue.isNotEmpty) {
      debugPrint('[DynamicConfig] Using key=$envKey');
      return envValue;
    }
    final value = _remoteConfig.getString(baseKey);
    if (value.isNotEmpty) {
      debugPrint('[DynamicConfig] Using key=$baseKey (fallback)');
    } else {
      debugPrint('[DynamicConfig] Missing keys: $envKey and $baseKey');
    }
    return value;
  }

  Future<Map<String, dynamic>?> _fetchFirestoreDoc(String path) async {
    try {
      final snapshot = await _firestore.doc(path).get();
      if (!snapshot.exists) return null;
      final data = snapshot.data();
      if (data == null) return null;
      return Map<String, dynamic>.from(data);
    } catch (_) {
      return null;
    }
  }

  Future<CopySnapshot?> _loadCopyBundle({
    required CopyIndex copyIndex,
    required Locale deviceLocale,
    required Map<String, dynamic> fallbackDoc,
  }) async {
    if (copyIndex.locales.isEmpty) return null;
    final deviceLocaleTag = toLocaleTag(deviceLocale);
    final localeTag = pickBestLocaleTag(
      deviceLocaleTag: deviceLocaleTag,
      defaultLocaleTag: copyIndex.defaultLocale,
      supported: copyIndex.locales.keys,
    );
    final ref = copyIndex.locales[localeTag];
    if (ref == null || ref.isEmpty) return null;
    final docPath = RemoteConfigRefs.parseFirestoreDocPath(ref);
    if (docPath == null) return null;
    final doc = await _fetchFirestoreDoc(docPath);
    if (doc == null) return null;
    final copyBundle = parseCopyBundle(doc, localeTag);
    return CopySnapshot(
      docPath: docPath,
      localeTag: copyBundle.localeTag,
      strings: copyBundle.strings,
      fallbackStrings: coerceStringMap(fallbackDoc['strings']),
      rawDoc: doc,
    );
  }

  Future<Map<String, dynamic>?> fetchThemeDoc() async {
    final refs = _readRefsFromRemoteConfig();
    final docPath = _currentThemeDocPath ?? refs?.themeDocPath;
    if (docPath == null) return null;
    final doc = await _fetchFirestoreDoc(docPath);
    if (doc != null) {
      _currentThemeDocPath = docPath;
    }
    return doc;
  }

  Future<bool> updateThemeDoc({
    required Map<String, dynamic> themeDoc,
  }) async {
    if (FirebaseAuth.instance.currentUser == null) {
      return false;
    }
    final refs = _readRefsFromRemoteConfig();
    final docPath = _currentThemeDocPath ?? refs?.themeDocPath;
    if (docPath == null) return false;
    await _firestore.doc(docPath).set(themeDoc, SetOptions(merge: true));
    _currentThemeDocPath = docPath;
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_prefsThemeDocKey, jsonEncode(themeDoc));
    } catch (_) {}
    final themeConfig = parseThemeConfig(themeDoc);
    ThemeService.instance.applyRemoteTheme(
      light: themeConfig.light,
      dark: themeConfig.dark,
      version: themeConfig.version,
    );
    return true;
  }

  Future<CopyEditSnapshot?> fetchCopyEditSnapshot(String key) async {
    final copyIndex = await _loadCopyIndexForEditing();
    if (copyIndex == null) return null;
    final localeTags = copyIndex.locales.keys.toList()..sort();
    final values = <String, String>{};
    for (final localeTag in localeTags) {
      final rawPath = copyIndex.locales[localeTag] ?? '';
      final docPath = RemoteConfigRefs.parseFirestoreDocPath(rawPath);
      if (docPath == null) {
        values[localeTag] = '';
        continue;
      }
      Map<String, dynamic>? doc;
      if (docPath == _currentCopyDocPath && _currentCopyDoc != null) {
        doc = _currentCopyDoc;
      } else {
        doc = await _fetchFirestoreDoc(docPath);
      }
      final strings = coerceStringMap(doc?['strings']);
      values[localeTag] = strings[key] ?? '';
    }
    return CopyEditSnapshot(localeTags: localeTags, values: values);
  }

  Future<bool> updateCopyValueForLocale({
    required String key,
    required String value,
    required String localeTag,
    required CopyService copyService,
  }) async {
    if (FirebaseAuth.instance.currentUser == null) {
      return false;
    }
    final trimmed = value.trim();
    if (trimmed.isEmpty) return false;
    final copyIndex = await _loadCopyIndexForEditing();
    if (copyIndex == null) return false;
    final rawPath = copyIndex.locales[localeTag] ?? '';
    final docPath = RemoteConfigRefs.parseFirestoreDocPath(rawPath);
    if (docPath == null) return false;
    final existing = docPath == _currentCopyDocPath && _currentCopyDoc != null
        ? _currentCopyDoc
        : await _fetchFirestoreDoc(docPath);
    if (existing == null) return false;
    final stringsRaw = existing['strings'];
    final strings = stringsRaw is Map
        ? Map<String, dynamic>.from(stringsRaw)
        : <String, dynamic>{};
    if (strings[key]?.toString() == trimmed) return true;
    strings[key] = trimmed;
    await _firestore.doc(docPath).set(
      {'strings': strings},
      SetOptions(merge: true),
    );
    if (docPath == _currentCopyDocPath) {
      _currentCopyDoc = {
        ...existing,
        'strings': strings,
      };
    }
    if (localeTag == copyService.currentLocaleTag) {
      copyService.updateString(key, trimmed);
    }
    return true;
  }

  Future<void> _loadAdminEmails({bool fromCacheOnly = false}) async {
    if (!fromCacheOnly) {
      try {
        final copyDoc = await _fetchFirestoreDoc(
          '$_adminsCollection/$_copyEditorsDoc',
        );
        final themeDoc = await _fetchFirestoreDoc(
          '$_adminsCollection/$_themeEditorsDoc',
        );
        if (copyDoc != null) {
          _copyAdminEmails = _coerceEmailList(copyDoc['emails']);
        }
        if (themeDoc != null) {
          _themeAdminEmails = _coerceEmailList(themeDoc['emails']);
        }
        final prefs = await SharedPreferences.getInstance();
        await prefs.setString(
          _prefsCopyAdminsKey,
          jsonEncode(_copyAdminEmails),
        );
        await prefs.setString(
          _prefsThemeAdminsKey,
          jsonEncode(_themeAdminEmails),
        );
        return;
      } catch (_) {
        // Fallback to cache below.
      }
    }
    try {
      final prefs = await SharedPreferences.getInstance();
      final copyRaw = prefs.getString(_prefsCopyAdminsKey);
      final themeRaw = prefs.getString(_prefsThemeAdminsKey);
      if (copyRaw != null) {
        _copyAdminEmails = _coerceEmailList(jsonDecode(copyRaw));
      }
      if (themeRaw != null) {
        _themeAdminEmails = _coerceEmailList(jsonDecode(themeRaw));
      }
    } catch (_) {
      // Ignore cache failures.
    }
  }

  List<String> _coerceEmailList(Object? raw) {
    if (raw is List) {
      return raw
          .map((entry) => entry.toString().trim().toLowerCase())
          .where((entry) => entry.isNotEmpty)
          .toSet()
          .toList();
    }
    if (raw is String) {
      final parts = raw.split(RegExp(r'[,\n; ]+'));
      return parts
          .map((entry) => entry.trim().toLowerCase())
          .where((entry) => entry.isNotEmpty)
          .toSet()
          .toList();
    }
    return const [];
  }

  Future<CopyIndex?> _loadCopyIndexForEditing() async {
    Map<String, dynamic>? indexDoc;
    final refs = _readRefsFromRemoteConfig();
    if (refs?.copyIndexInline != null) {
      indexDoc = refs?.copyIndexInline;
    } else if (refs?.copyIndexDocPath != null) {
      indexDoc = await _fetchFirestoreDoc(refs!.copyIndexDocPath!);
    }
    if (indexDoc == null) {
      try {
        final prefs = await SharedPreferences.getInstance();
        final raw = prefs.getString(_prefsCopyIndexKey);
        if (raw != null) {
          indexDoc = jsonDecode(raw) as Map<String, dynamic>;
        }
      } catch (_) {}
    }
    if (indexDoc == null) {
      try {
        final raw = await rootBundle.loadString('assets/copy/index_v1.json');
        indexDoc = jsonDecode(raw) as Map<String, dynamic>;
      } catch (_) {
        return null;
      }
    }
    return parseCopyIndex(indexDoc);
  }

  Future<void> _cacheSnapshot({
    required Map<String, dynamic> themeDoc,
    required Map<String, dynamic> copyIndexDoc,
    required Map<String, dynamic> copyDoc,
    required Map<String, dynamic> copyFallbackDoc,
  }) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_prefsThemeDocKey, jsonEncode(themeDoc));
      await prefs.setString(_prefsCopyIndexKey, jsonEncode(copyIndexDoc));
      await prefs.setString(_prefsCopyDocKey, jsonEncode(copyDoc));
      await prefs.setString(
        _prefsCopyFallbackDocKey,
        jsonEncode(copyFallbackDoc),
      );
    } catch (_) {}
  }

  Future<void> _loadFromCache(
    ThemeService themeService,
    CopyService copyService,
  ) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final themeRaw = prefs.getString(_prefsThemeDocKey);
      final copyIndexRaw = prefs.getString(_prefsCopyIndexKey);
      final copyDocRaw = prefs.getString(_prefsCopyDocKey);
      final copyFallbackRaw = prefs.getString(_prefsCopyFallbackDocKey);
      if (themeRaw == null ||
          copyIndexRaw == null ||
          copyDocRaw == null ||
          copyFallbackRaw == null) {
        return;
      }
      final themeDoc = jsonDecode(themeRaw) as Map<String, dynamic>;
      final copyIndexDoc = jsonDecode(copyIndexRaw) as Map<String, dynamic>;
      final copyDoc = jsonDecode(copyDocRaw) as Map<String, dynamic>;
      final copyFallbackDoc =
          jsonDecode(copyFallbackRaw) as Map<String, dynamic>;

      final themeConfig = parseThemeConfig(themeDoc);
      themeService.applyRemoteTheme(
        light: themeConfig.light,
        dark: themeConfig.dark,
        version: themeConfig.version,
      );

      final copyIndex = parseCopyIndex(copyIndexDoc);
      final copyBundle = parseCopyBundle(copyDoc, copyIndex.defaultLocale);
      copyService.setBundle(
        locale: parseLocaleTag(copyBundle.localeTag),
        strings: copyBundle.strings,
        fallbackStrings: coerceStringMap(copyFallbackDoc['strings']),
        supportedLocales: copyIndex.supportedLocales,
        version: themeConfig.version,
      );
    } catch (_) {}
  }

  String get _envName {
    const raw = String.fromEnvironment(
      'APP_ENV',
      defaultValue: kReleaseMode ? 'production' : 'development',
    );
    return _normalizeEnvName(raw);
  }

  String _normalizeEnvName(String value) {
    switch (value.toLowerCase()) {
      case 'prod':
        return 'production';
      case 'stage':
        return 'staging';
      case 'dev':
        return 'development';
      default:
        return value.toLowerCase();
    }
  }
}

class CopySnapshot {
  const CopySnapshot({
    required this.docPath,
    required this.localeTag,
    required this.strings,
    required this.fallbackStrings,
    required this.rawDoc,
  });

  final String docPath;
  final String localeTag;
  final Map<String, String> strings;
  final Map<String, String> fallbackStrings;
  final Map<String, dynamic> rawDoc;
}

class CopyEditSnapshot {
  const CopyEditSnapshot({
    required this.localeTags,
    required this.values,
  });

  final List<String> localeTags;
  final Map<String, String> values;
}
