import 'package:flutter/material.dart';
import '../tokens/color.dart';
import '../tokens/typography.dart';
import '../extensions/spacing_extension.dart';

final ThemeData darkTheme = ThemeData(
  brightness: Brightness.dark,
  colorScheme: const ColorScheme(
    brightness: Brightness.dark,
    primary: ColorTokens.darkPrimary,
    onPrimary: ColorTokens.darkOnPrimary,
    secondary: ColorTokens.darkSecondary,
    onSecondary: ColorTokens.darkOnSecondary,
    surface: ColorTokens.darkSurface,
    onSurface: ColorTokens.darkOnSurface,
    error: ColorTokens.darkError,
    onError: ColorTokens.darkOnError,
  ),
  scaffoldBackgroundColor: ColorTokens.darkBackground,
  textTheme: const TextTheme(
    headlineMedium: TypographyTokens.headline,
    bodyMedium: TypographyTokens.body,
  ),
  // Enhanced Switch theme for better visibility in dark mode
  switchTheme: SwitchThemeData(
    thumbColor: WidgetStateProperty.resolveWith<Color>((states) {
      if (states.contains(WidgetState.selected)) {
        return Colors.white; // White thumb when ON - high contrast
      }
      return Colors.grey[400]!; // Light gray when OFF
    }),
    trackColor: WidgetStateProperty.resolveWith<Color>((states) {
      if (states.contains(WidgetState.selected)) {
        return ColorTokens.darkPrimary; // Primary color track when ON
      }
      return Colors.grey[800]!; // Dark gray track when OFF
    }),
    trackOutlineColor: WidgetStateProperty.resolveWith<Color?>((states) {
      if (states.contains(WidgetState.selected)) {
        return null; // No outline when ON
      }
      return Colors.grey[700]; // Subtle outline when OFF
    }),
  ),
  extensions: [AppSpacing.fromTokens()],
  useMaterial3: false,
);
