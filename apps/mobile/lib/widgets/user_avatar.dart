import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import '../services/auth_service.dart';

/// UserAvatar displays the logged-in user's image from AuthService,
/// supporting both base64 data URI and network image.
///
/// - [radius]: Avatar circle radius (default: 28)
/// - [backgroundColor]: Optional background color
/// - [icon]: Fallback icon
/// - [iconColor]: Color of fallback icon
/// - [iconSize]: Size of fallback icon (defaults to 60% of radius)
class UserAvatar extends StatelessWidget {
  final double radius;
  final Color? backgroundColor;
  final IconData icon;
  final Color? iconColor;
  final double? iconSize;

  const UserAvatar({
    Key? key,
    this.radius = 28,
    this.backgroundColor,
    this.icon = Icons.person,
    this.iconColor,
    this.iconSize,
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    final Color effectiveBg = backgroundColor ?? Colors.white.withOpacity(0.3);
    // Use the radius and iconSize as-is (caller decides if they want to adapt)
    final double effectiveIconSize = iconSize ?? radius * 0.6;
    final String? imgStr = AuthService.instance.user?.image;
    ImageProvider? provider;
    if (imgStr != null && imgStr.isNotEmpty) {
      if (imgStr.startsWith('data:image/')) {
        try {
          final base64Data = imgStr.split(',').last;
          final bytes = base64Decode(base64Data);
          provider = MemoryImage(bytes);
        } catch (_) {
          // If parsing fails, fallback to icon
        }
      } else {
        provider = NetworkImage(imgStr);
      }
    }
    return CircleAvatar(
      radius: radius,  // ✅ Use as-is
      backgroundImage: provider,
      backgroundColor: effectiveBg,
      child: provider == null
          ? Icon(
              icon,
              size: effectiveIconSize,  // ✅ Use as-is
              color: iconColor ?? Colors.white,
            )
          : null,
    );
  }
}
