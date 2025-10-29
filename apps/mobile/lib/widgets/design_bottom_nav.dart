import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import '../design/extensions/spacing_extension.dart';

class NavItemSpec {
  final IconData icon;
  final IconData? activeIcon;
  final String label;
  const NavItemSpec({required this.icon, this.activeIcon, required this.label});
}

class DesignBottomNavBar extends StatelessWidget {
  final int currentIndex;
  final ValueChanged<int> onTap;
  final List<NavItemSpec> items;
  final Color? backgroundColor;
  final Color? activeColor;
  final Color? inactiveColor;
  final double height;
  final double iconSize;
  final double labelSize;
  final FontWeight labelWeight;

  const DesignBottomNavBar({
    super.key,
    required this.currentIndex,
    required this.onTap,
    required this.items,
    this.backgroundColor,
    this.activeColor,
    this.inactiveColor,
    this.height = 64,
    this.iconSize = 28,  // Increased from 24 for better visibility
    this.labelSize = 12,
    this.labelWeight = FontWeight.w600,
  }) : assert(items.length >= 2);

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final double bottomInset = MediaQuery.of(context).padding.bottom;

    // Auto-adapt background color based on theme
    final bgColor =
        backgroundColor ?? (isDark ? Colors.grey[900] : Colors.white);

    return Container(
      decoration: BoxDecoration(
        color: bgColor,
        border: Border(
          top: BorderSide(
            color: isDark
                ? Colors.white.withValues(alpha: 0.1)
                : Colors.black.withValues(alpha: 0.08),
            width: 1,
          ),
        ),
        boxShadow: isDark
            ? []
            : const [
                BoxShadow(
                  color: Color(0x14000000),
                  blurRadius: 10,
                  offset: Offset(0, -1),
                ),
              ],
      ),
      padding: EdgeInsets.only(bottom: bottomInset > 0 ? bottomInset : 8),
      height: height + (bottomInset > 0 ? bottomInset : 8),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceEvenly,
        children: [
          for (int i = 0; i < items.length; i++)
            Expanded(
              child: _NavItem(
                spec: items[i],
                selected: i == currentIndex,
                onTap: () => onTap(i),
                iconSize: iconSize,
                labelSize: labelSize,
                labelWeight: labelWeight,
              ),
            ),
        ],
      ),
    );
  }
}

class _NavItem extends StatelessWidget {
  final NavItemSpec spec;
  final bool selected;
  final VoidCallback onTap;
  final double iconSize;
  final double labelSize;
  final FontWeight labelWeight;

  const _NavItem({
    required this.spec,
    required this.selected,
    required this.onTap,
    required this.iconSize,
    required this.labelSize,
    required this.labelWeight,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final spacing = theme.extension<AppSpacing>();

    final Color color = selected
        ? theme.colorScheme.primary
        : theme.colorScheme.onSurface;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(spacing!.md),
      child: Padding(
        padding: EdgeInsets.symmetric(horizontal: 12.w, vertical: 6),  // ✅ Width-adapted
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              selected && spec.activeIcon != null ? spec.activeIcon : spec.icon,
              size: iconSize,  // ✅ Fixed size for consistent icon display
              color: color,
            ),
            const SizedBox(height: 4),
            Text(
              spec.label,
              style: TextStyle(
                color: color,
                fontSize: labelSize.sp,  // ✅ Adaptive font
                fontWeight: labelWeight,
                letterSpacing: 0.1,
              ),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              softWrap: false,
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }
}
