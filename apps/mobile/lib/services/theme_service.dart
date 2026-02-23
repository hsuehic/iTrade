import 'package:flutter/material.dart';
import '../design/themes/theme.dart';
import '../design/themes/theme_overrides.dart';
import 'preference.dart';

/// Service for managing app theme (light/dark mode)
class ThemeService extends ChangeNotifier {
  ThemeService._internal();
  static final ThemeService instance = ThemeService._internal();

  ThemeMode _themeMode = ThemeMode.system;
  ThemeOverrides? _lightOverrides;
  ThemeOverrides? _darkOverrides;
  String? _remoteVersion;

  /// Initialize theme from saved preferences
  Future<void> init() async {
    final storedMode = await Preference.getThemeMode();
    if (storedMode != null) {
      _themeMode = storedMode;
    } else {
      final darkMode = await Preference.getDarkMode();
      _themeMode = (darkMode ?? false) ? ThemeMode.dark : ThemeMode.light;
    }
    notifyListeners();
  }

  ThemeMode get themeMode => _themeMode;

  ThemeData get lightThemeData =>
      _applyOverrides(AppTheme.brand, _lightOverrides);

  ThemeData get darkThemeData => _applyOverrides(AppTheme.dark, _darkOverrides);

  String? get remoteThemeVersion => _remoteVersion;

  void applyRemoteTheme({
    required ThemeOverrides? light,
    required ThemeOverrides? dark,
    String? version,
  }) {
    _lightOverrides = light;
    _darkOverrides = dark;
    _remoteVersion = version;
    notifyListeners();
  }

  /// Toggle between light and dark mode
  Future<void> toggleTheme() async {
    final isDark = _themeMode == ThemeMode.dark;
    _themeMode = isDark ? ThemeMode.light : ThemeMode.dark;
    notifyListeners();
    await Preference.setThemeMode(_themeMode);
    await Preference.setDarkMode(!isDark);
  }

  /// Set theme mode directly
  Future<void> setThemeMode(ThemeMode mode) async {
    if (_themeMode == mode) return;
    _themeMode = mode;
    notifyListeners();
    await Preference.setThemeMode(mode);
    if (mode == ThemeMode.system) return;
    await Preference.setDarkMode(mode == ThemeMode.dark);
  }

  /// Check if current theme is dark
  bool isDarkMode(BuildContext context) {
    switch (_themeMode) {
      case ThemeMode.dark:
        return true;
      case ThemeMode.light:
        return false;
      case ThemeMode.system:
        return MediaQuery.platformBrightnessOf(context) == Brightness.dark;
    }
  }

  ThemeData _applyOverrides(ThemeData base, ThemeOverrides? overrides) {
    if (overrides == null) return base;
    return overrides.applyTo(base);
  }
}
