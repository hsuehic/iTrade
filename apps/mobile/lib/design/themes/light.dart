import 'package:flutter/material.dart';
import '../tokens/color.dart';
import '../tokens/typography.dart';
import '../extensions/spacing_extension.dart';

final ThemeData lightTheme = ThemeData(
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
  extensions: [AppSpacing.fromTokens()],
  useMaterial3: false,
);
