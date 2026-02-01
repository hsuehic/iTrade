import 'dart:convert';
import 'dart:math';

import 'package:logger/logger.dart';
import 'package:shared_preferences/shared_preferences.dart';

class Preference {
  static const String keySavedEmail = 'saved_email';
  static const String keySavedPassword = 'saved_password';
  static const String keyNotificationsEnabled = 'notifications_enabled';
  static const String keyBiometricEnabled = 'biometric_enabled';
  static const String keyDarkMode = 'dark_mode';
  static const String keyPushDeviceId = 'push_device_id';
  static const String keyPushCategoryGeneral = 'push_category_general';
  static const String keyPushCategoryMarketing = 'push_category_marketing';
  static const String keyPushCategoryTrading = 'push_category_trading';
  static const String keyPushCategorySecurity = 'push_category_security';
  static const String keyPushCategorySystem = 'push_category_system';
  static const String keyApiBaseUrl = 'api_base_url';
  static const String keyPushReadIds = 'push_read_ids';
  static const String keyPushUnreadCount = 'push_unread_count';
  static const String keyPushInboxMessages = 'push_inbox_messages';
  static const int pushInboxMax = 100;

  static SharedPreferences? _prefs;
  static final Logger _logger = Logger();

  static Future<SharedPreferences> _getPrefs() async {
    _prefs ??= await SharedPreferences.getInstance();
    return _prefs!;
  }

  static String encryptPassword(String password) {
    return password;
  }

  static String? decryptPassword(String? encryptedPassword) {
    return encryptedPassword; // Note: SHA-256 is one-way, cannot decrypt. This is a placeholder for future implementation.
  }

  static Future<void> remove(String key) async {
    try {
      final prefs = await _getPrefs();
      await prefs.remove(key);
    } catch (e) {
      _logger.e('Failed to remove value for key: $key', error: e);
    }
  }

  static Future<void> setValue<T>(String key, T value) async {
    try {
      final prefs = await _getPrefs();
      if (value is String) {
        await prefs.setString(key, value);
      } else if (value is bool) {
        await prefs.setBool(key, value);
      } else if (value is int) {
        await prefs.setInt(key, value);
      } else if (value is double) {
        await prefs.setDouble(key, value);
      } else if (value is List<String>) {
        await prefs.setStringList(key, value);
      }
    } catch (e) {
      _logger.e('Failed to set value for key: $key', error: e);
    }
  }

  static Future<T?> getValue<T>(String key) async {
    try {
      final prefs = await _getPrefs();
      if (T == String) {
        return prefs.getString(key) as T?;
      } else if (T == bool) {
        return prefs.getBool(key) as T?;
      } else if (T == int) {
        return prefs.getInt(key) as T?;
      } else if (T == double) {
        return prefs.getDouble(key) as T?;
      } else if (T == List<String>) {
        return prefs.getStringList(key) as T?;
      }
      return null;
    } catch (e) {
      _logger.e('Failed to get value for key: $key', error: e);
      return null;
    }
  }

  static Future<void> setSavedEmail(String email) async {
    await setValue(keySavedEmail, email);
  }

  static Future<String?> getSavedEmail() async {
    return await getValue<String>(keySavedEmail);
  }

  static Future<void> setSavedPassword(String password) async {
    final encryptedPassword = encryptPassword(password);
    await setValue(keySavedPassword, encryptedPassword);
  }

  static Future<String?> getSavedPassword() async {
    final encryptedPassword = await getValue<String>(keySavedPassword);
    return decryptPassword(encryptedPassword);
  }

  static Future<void> setNotificationsEnabled(bool enabled) async {
    await setValue(keyNotificationsEnabled, enabled);
  }

  static Future<bool?> getNotificationsEnabled() async {
    return await getValue<bool>(keyNotificationsEnabled);
  }

  static Future<bool> getPushCategoryEnabled(String category) async {
    switch (category) {
      case 'general':
        return (await getValue<bool>(keyPushCategoryGeneral)) ?? true;
      case 'marketing':
        return (await getValue<bool>(keyPushCategoryMarketing)) ?? false;
      case 'trading':
        return (await getValue<bool>(keyPushCategoryTrading)) ?? true;
      case 'security':
        return (await getValue<bool>(keyPushCategorySecurity)) ?? true;
      case 'system':
        return (await getValue<bool>(keyPushCategorySystem)) ?? true;
      default:
        return true;
    }
  }

  static Future<void> setPushCategoryEnabled(
    String category,
    bool enabled,
  ) async {
    switch (category) {
      case 'general':
        await setValue(keyPushCategoryGeneral, enabled);
        return;
      case 'marketing':
        await setValue(keyPushCategoryMarketing, enabled);
        return;
      case 'trading':
        await setValue(keyPushCategoryTrading, enabled);
        return;
      case 'security':
        await setValue(keyPushCategorySecurity, enabled);
        return;
      case 'system':
        await setValue(keyPushCategorySystem, enabled);
        return;
      default:
        await setValue('push_category_$category', enabled);
    }
  }

  static Future<void> setBiometricEnabled(bool enabled) async {
    await setValue(keyBiometricEnabled, enabled);
  }

  static Future<bool?> getBiometricEnabled() async {
    return await getValue<bool>(keyBiometricEnabled);
  }

  static Future<void> setDarkMode(bool enabled) async {
    await setValue(keyDarkMode, enabled);
  }

  static Future<bool?> getDarkMode() async {
    return await getValue<bool>(keyDarkMode);
  }

  static Future<void> setApiBaseUrl(String value) async {
    await setValue(keyApiBaseUrl, value);
  }

  static Future<String?> getApiBaseUrl() async {
    return await getValue<String>(keyApiBaseUrl);
  }

  static Future<void> clearApiBaseUrl() async {
    await remove(keyApiBaseUrl);
  }

  static Future<Set<String>> getPushReadIds() async {
    final list = await getValue<List<String>>(keyPushReadIds);
    return list == null ? <String>{} : list.toSet();
  }

  static Future<void> setPushReadIds(Set<String> ids) async {
    await setValue<List<String>>(keyPushReadIds, ids.toList());
  }

  static Future<void> markPushRead(String id) async {
    if (id.isEmpty) return;
    final ids = await getPushReadIds();
    if (ids.add(id)) {
      await setPushReadIds(ids);
    }
  }

  static Future<int> getPushUnreadCount() async {
    return (await getValue<int>(keyPushUnreadCount)) ?? 0;
  }

  static Future<void> setPushUnreadCount(int count) async {
    final normalized = count < 0 ? 0 : count;
    await setValue<int>(keyPushUnreadCount, normalized);
  }

  static Future<List<Map<String, dynamic>>> getPushInboxMessages() async {
    final raw = await getValue<String>(keyPushInboxMessages);
    if (raw == null || raw.isEmpty) return <Map<String, dynamic>>[];
    try {
      final decoded = jsonDecode(raw);
      if (decoded is! List) return <Map<String, dynamic>>[];
      return decoded
          .whereType<Map>()
          .map((item) => Map<String, dynamic>.from(item))
          .toList();
    } catch (_) {
      return <Map<String, dynamic>>[];
    }
  }

  static Future<void> setPushInboxMessages(
    List<Map<String, dynamic>> messages,
  ) async {
    final trimmed = messages.take(pushInboxMax).toList();
    await setValue<String>(keyPushInboxMessages, jsonEncode(trimmed));
  }

  static Future<void> addPushInboxMessage(Map<String, dynamic> message) async {
    final id = message['id']?.toString();
    if (id == null || id.isEmpty) return;
    final existing = await getPushInboxMessages();
    existing.removeWhere((item) => item['id']?.toString() == id);
    existing.insert(0, message);
    await setPushInboxMessages(existing);
  }

  static Future<void> clearPushInboxMessages() async {
    await remove(keyPushInboxMessages);
  }

  static String pushLastReportedTokenKey(String platform, String provider) {
    return 'push_last_reported_token_${platform}_$provider';
  }

  static Future<String> getOrCreatePushDeviceId() async {
    final existing = await getValue<String>(keyPushDeviceId);
    if (existing != null && existing.isNotEmpty) {
      return existing;
    }
    final id = _generateRandomId();
    await setValue(keyPushDeviceId, id);
    return id;
  }

  static String _generateRandomId() {
    final rand = Random.secure();
    final bytes = List<int>.generate(16, (_) => rand.nextInt(256));
    return bytes.map((b) => b.toRadixString(16).padLeft(2, '0')).join();
  }
}
