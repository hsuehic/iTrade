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
  extensions: [AppSpacing.fromTokens()],
  useMaterial3: false,
);
