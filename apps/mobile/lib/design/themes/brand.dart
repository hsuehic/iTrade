import 'package:flutter/material.dart';
import '../tokens/color.dart';
import '../tokens/typography.dart';
import '../extensions/spacing_extension.dart';

final ThemeData brandTheme = ThemeData(
  primaryColor: ColorTokens.brandPrimary,
  brightness: Brightness.light,
  colorScheme: const ColorScheme(
    brightness: Brightness.light,
    primary: ColorTokens.brandPrimary,
    onPrimary: ColorTokens.brandOnPrimary,
    secondary: ColorTokens.brandSecondary,
    onSecondary: ColorTokens.brandOnSecondary,
    surface: ColorTokens.brandSurface,
    onSurface: ColorTokens.brandOnSurface,
    error: ColorTokens.brandError,
    onError: ColorTokens.brandOnError,
  ),
  scaffoldBackgroundColor: ColorTokens.brandBackground,
  textTheme: const TextTheme(
    headlineMedium: TypographyTokens.headline,
    bodyMedium: TypographyTokens.body,
  ),
  extensions: [AppSpacing.fromTokens()],
  useMaterial3: true,
);
