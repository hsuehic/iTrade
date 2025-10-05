import 'dart:ui';
import 'package:flutter/material.dart';
import '../tokens/spacing.dart';

@immutable
class AppSpacing extends ThemeExtension<AppSpacing> {
  final double xs;
  final double sm;
  final double md;
  final double lg;

  const AppSpacing({
    required this.xs,
    required this.sm,
    required this.md,
    required this.lg,
  });

  factory AppSpacing.fromTokens() {
    return const AppSpacing(
      xs: SpacingTokens.xs,
      sm: SpacingTokens.sm,
      md: SpacingTokens.md,
      lg: SpacingTokens.lg,
    );
  }

  @override
  AppSpacing copyWith({double? xs, double? sm, double? md, double? lg}) {
    return AppSpacing(
      xs: xs ?? this.xs,
      sm: sm ?? this.sm,
      md: md ?? this.md,
      lg: lg ?? this.lg,
    );
  }

  @override
  AppSpacing lerp(ThemeExtension<AppSpacing>? other, double t) {
    if (other is! AppSpacing) return this;
    return AppSpacing(
      xs: lerpDouble(xs, other.xs, t)!,
      sm: lerpDouble(sm, other.sm, t)!,
      md: lerpDouble(md, other.md, t)!,
      lg: lerpDouble(lg, other.lg, t)!,
    );
  }
}
