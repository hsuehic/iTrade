import 'package:flutter/material.dart';
import '../tokens/color.dart';
import '../tokens/typography.dart';
import '../extensions/spacing_extension.dart';

final ThemeData lightTheme = ThemeData(
  primaryColor: ColorTokens.lightPrimary,
  brightness: Brightness.light,
  colorScheme: const ColorScheme(
    brightness: Brightness.light,
    primary: ColorTokens.lightPrimary,
    onPrimary: ColorTokens.lightOnPrimary,
    secondary: ColorTokens.lightSecondary,
    onSecondary: ColorTokens.lightOnSecondary,
    surface: ColorTokens.lightSurface,
    onSurface: ColorTokens.lightOnSurface,
    error: ColorTokens.lightError,
    onError: ColorTokens.lightOnError,
  ),
  scaffoldBackgroundColor: ColorTokens.lightBackground,
  textTheme: const TextTheme(
    headlineMedium: TypographyTokens.headline,
    bodyMedium: TypographyTokens.body,
  ),
  switchTheme: SwitchThemeData(
    thumbColor: WidgetStateProperty.resolveWith<Color>((states) {
      if (states.contains(WidgetState.selected)) {
        return Colors.white;
      }
      return Colors.grey[400]!;
    }),
    trackColor: WidgetStateProperty.resolveWith<Color>((states) {
      if (states.contains(WidgetState.selected)) {
        return ColorTokens.darkPrimary;
      }
      return Colors.grey[700]!;
    }),
    trackOutlineColor: WidgetStateProperty.resolveWith<Color?>((states) {
      if (states.contains(WidgetState.selected)) {
        return null;
      }
      return Colors.grey[600];
    }),
  ),
  extensions: [AppSpacing.fromTokens()],
  useMaterial3: false,
);
