import 'dart:typed_data';
import 'package:flutter/material.dart';
import '../services/auth_service.dart';

/// A reusable Avatar widget supporting [MemoryImage], [NetworkImage], or fallback icon.
///
/// - [imageBytes]: Raw image data, displayed with [MemoryImage].
/// - [imageUrl]: Network image URL.
/// - [radius]: Avatar circle radius.
/// - [backgroundColor]: Avatar background color (default: white w/ 0.3 alpha).
/// - [icon]: Fallback icon when no image is provided (default: Icons.person).
/// - [iconColor]: Color of fallback icon.
/// - [iconSize]: Size of fallback icon (defaults to 60% of radius).
class CommonAvatar extends StatelessWidget {
  final Uint8List? imageBytes;
  final String? imageUrl;
  final double radius;
  final Color? backgroundColor;
  final IconData icon;
  final Color? iconColor;
  final double? iconSize;

  const CommonAvatar({
    Key? key,
    this.imageBytes,
    this.imageUrl,
    this.radius = 28,
    this.backgroundColor,
    this.icon = Icons.person,
    this.iconColor,
    this.iconSize,
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    final Color effectiveBg = backgroundColor ?? Colors.white.withOpacity(0.3);
    final double effectiveIconSize = iconSize ?? radius * 0.6;
    ImageProvider? provider;
    if (imageBytes != null) {
      provider = MemoryImage(imageBytes!);
    } else if (imageUrl != null && imageUrl!.isNotEmpty) {
      provider = NetworkImage(imageUrl!);
    }
    return CircleAvatar(
      radius: radius,
      backgroundImage: provider,
      backgroundColor: effectiveBg,
      child: provider == null
          ? Icon(
              icon,
              size: effectiveIconSize,
              color: iconColor ?? Colors.white,
            )
          : null,
    );
  }
}

/// An Avatar specific to the current logged-in user, always showing their image (from AuthService)
/// or a fallback icon if unavailable.
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
    final double effectiveIconSize = iconSize ?? radius * 0.6;
    final String? imageUrl = AuthService.instance.user?.image;
    ImageProvider? provider;
    if (imageUrl != null && imageUrl.isNotEmpty) {
      provider = NetworkImage(imageUrl);
    }
    return CircleAvatar(
      radius: radius,
      backgroundImage: provider,
      backgroundColor: effectiveBg,
      child: provider == null
          ? Icon(
              icon,
              size: effectiveIconSize,
              color: iconColor ?? Colors.white,
            )
          : null,
    );
  }
}
