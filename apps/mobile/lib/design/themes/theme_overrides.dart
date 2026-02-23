import 'package:flutter/material.dart';

class ThemeOverrides {
  ThemeOverrides({
    this.primary,
    this.onPrimary,
    this.secondary,
    this.onSecondary,
    this.surface,
    this.onSurface,
    this.error,
    this.onError,
    this.background,
    this.onBackground,
    this.scaffoldBackgroundColor,
  });

  final Color? primary;
  final Color? onPrimary;
  final Color? secondary;
  final Color? onSecondary;
  final Color? surface;
  final Color? onSurface;
  final Color? error;
  final Color? onError;
  final Color? background;
  final Color? onBackground;
  final Color? scaffoldBackgroundColor;

  ThemeData applyTo(ThemeData base) {
    final resolvedSurface = surface ?? background ?? base.colorScheme.surface;
    final resolvedOnSurface =
        onSurface ?? onBackground ?? base.colorScheme.onSurface;
    final colorScheme = base.colorScheme.copyWith(
      primary: primary ?? base.colorScheme.primary,
      onPrimary: onPrimary ?? base.colorScheme.onPrimary,
      secondary: secondary ?? base.colorScheme.secondary,
      onSecondary: onSecondary ?? base.colorScheme.onSecondary,
      surface: resolvedSurface,
      onSurface: resolvedOnSurface,
      error: error ?? base.colorScheme.error,
      onError: onError ?? base.colorScheme.onError,
    );

    return base.copyWith(
      colorScheme: colorScheme,
      primaryColor: primary ?? base.primaryColor,
      scaffoldBackgroundColor:
          scaffoldBackgroundColor ?? base.scaffoldBackgroundColor,
    );
  }

  factory ThemeOverrides.fromJson(Map<String, dynamic>? json) {
    if (json == null) return ThemeOverrides();
    final rawColors = json['colors'];
    final colorJson = rawColors is Map<String, dynamic> ? rawColors : json;
    return ThemeOverrides(
      primary: _parseColor(colorJson['primary']),
      onPrimary: _parseColor(colorJson['onPrimary']),
      secondary: _parseColor(colorJson['secondary']),
      onSecondary: _parseColor(colorJson['onSecondary']),
      surface: _parseColor(colorJson['surface']),
      onSurface: _parseColor(colorJson['onSurface']),
      error: _parseColor(colorJson['error']),
      onError: _parseColor(colorJson['onError']),
      background: _parseColor(colorJson['background']),
      onBackground: _parseColor(colorJson['onBackground']),
      scaffoldBackgroundColor:
          _parseColor(colorJson['scaffoldBackgroundColor']) ??
              _parseColor(colorJson['scaffoldBackground']),
    );
  }
}

Color? _parseColor(Object? raw) {
  if (raw == null) return null;
  if (raw is int) return Color(raw);
  if (raw is String) {
    final value = raw.trim();
    if (value.isEmpty) return null;
    final normalized = value.startsWith('#') ? value.substring(1) : value;
    if (normalized.length == 6) {
      final parsed = int.tryParse('FF$normalized', radix: 16);
      if (parsed != null) return Color(parsed);
    }
    if (normalized.length == 8) {
      final parsed = int.tryParse(normalized, radix: 16);
      if (parsed != null) return Color(parsed);
    }
  }
  return null;
}
