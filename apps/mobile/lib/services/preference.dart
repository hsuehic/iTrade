import 'package:shared_preferences/shared_preferences.dart';
import 'package:logger/logger.dart';

class Preference {
  static const String keySavedEmail = 'saved_email';
  static const String keySavedPassword = 'saved_password';
  static const String keyNotificationsEnabled = 'notifications_enabled';
  static const String keyBiometricEnabled = 'biometric_enabled';

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

  static Future<void> setBiometricEnabled(bool enabled) async {
    await setValue(keyBiometricEnabled, enabled);
  }

  static Future<bool?> getBiometricEnabled() async {
    return await getValue<bool>(keyBiometricEnabled);
  }
}
