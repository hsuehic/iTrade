import 'package:flutter/material.dart';
import 'preference.dart';

/// Service for managing app theme (light/dark mode)
class ThemeService {
  ThemeService._internal();
  static final ThemeService instance = ThemeService._internal();

  final ValueNotifier<ThemeMode> themeMode = ValueNotifier(ThemeMode.light);

  /// Initialize theme from saved preferences
  Future<void> init() async {
    final darkMode = await Preference.getDarkMode();
    themeMode.value = (darkMode ?? false) ? ThemeMode.dark : ThemeMode.light;
  }

  /// Toggle between light and dark mode
  Future<void> toggleTheme() async {
    final isDark = themeMode.value == ThemeMode.dark;
    themeMode.value = isDark ? ThemeMode.light : ThemeMode.dark;
    await Preference.setDarkMode(!isDark);
  }

  /// Set theme mode directly
  Future<void> setThemeMode(bool isDark) async {
    themeMode.value = isDark ? ThemeMode.dark : ThemeMode.light;
    await Preference.setDarkMode(isDark);
  }

  /// Check if current theme is dark
  bool get isDark => themeMode.value == ThemeMode.dark;
}
