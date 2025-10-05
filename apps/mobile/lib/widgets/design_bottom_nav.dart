import 'package:flutter/material.dart';
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
  final Color backgroundColor;
  final Color activeColor;
  final Color inactiveColor;
  final double height;
  final double iconSize;
  final double labelSize;
  final FontWeight labelWeight;

  const DesignBottomNavBar({
    super.key,
    required this.currentIndex,
    required this.onTap,
    required this.items,
    this.backgroundColor = Colors.white,
    this.activeColor = const Color(0xFF1B5E20),
    this.inactiveColor = const Color(0xFF666666),
    this.height = 64,
    this.iconSize = 24,
    this.labelSize = 12,
    this.labelWeight = FontWeight.w600,
  }) : assert(items.length >= 2);

  @override
  Widget build(BuildContext context) {
    final double bottomInset = MediaQuery.of(context).padding.bottom;
    return Container(
      decoration: BoxDecoration(
        color: backgroundColor,
        border: Border(
          top: BorderSide(
            color: Colors.black.withValues(alpha: 0.08),
            width: 1,
          ),
        ),
        boxShadow: const [
          BoxShadow(
            color: Color(0x14000000),
            blurRadius: 10,
            offset: Offset(0, -2),
          ),
        ],
      ),
      padding: EdgeInsets.only(bottom: bottomInset > 0 ? bottomInset : 8),
      height: height + (bottomInset > 0 ? bottomInset : 8),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceEvenly,
        children: [
          for (int i = 0; i < items.length; i++)
            _NavItem(
              spec: items[i],
              selected: i == currentIndex,
              onTap: () => onTap(i),
              activeColor: activeColor,
              inactiveColor: inactiveColor,
              iconSize: iconSize,
              labelSize: labelSize,
              labelWeight: labelWeight,
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
  final Color activeColor;
  final Color inactiveColor;
  final double iconSize;
  final double labelSize;
  final FontWeight labelWeight;

  const _NavItem({
    required this.spec,
    required this.selected,
    required this.onTap,
    required this.activeColor,
    required this.inactiveColor,
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
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              selected && spec.activeIcon != null ? spec.activeIcon : spec.icon,
              size: iconSize,
              color: color,
            ),
            const SizedBox(height: 4),
            Text(
              spec.label,
              style: TextStyle(
                color: color,
                fontSize: labelSize,
                fontWeight: labelWeight,
                letterSpacing: 0.1,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
