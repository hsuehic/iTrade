import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'copy_text.dart';

/// Modern sidebar navigation widget for tablet/iPad layout
///
/// Features:
/// - Expandable/collapsible design
/// - Smooth animations
/// - Professional visual design
/// - Theme toggle integration
/// - App branding
class AppSidebar extends StatefulWidget {
  final int selectedIndex;
  final ValueChanged<int> onDestinationSelected;
  final List<SidebarDestination> destinations;
  final Widget? header;
  final Widget? footer;
  final bool initiallyExpanded;

  const AppSidebar({
    super.key,
    required this.selectedIndex,
    required this.onDestinationSelected,
    required this.destinations,
    this.header,
    this.footer,
    this.initiallyExpanded = true,
  });

  @override
  State<AppSidebar> createState() => _AppSidebarState();
}

class _AppSidebarState extends State<AppSidebar> {
  late bool _isExpanded;

  // Sidebar dimensions
  static const double _expandedWidth = 240.0;
  static const double _collapsedWidth = 72.0;

  @override
  void initState() {
    super.initState();
    _isExpanded = widget.initiallyExpanded;
  }

  void _toggleExpanded() {
    setState(() {
      _isExpanded = !_isExpanded;
    });
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    return AnimatedContainer(
      duration: const Duration(milliseconds: 200),
      curve: Curves.easeInOut,
      width: _isExpanded ? _expandedWidth : _collapsedWidth,
      decoration: BoxDecoration(
        color: isDark
            ? theme.colorScheme.surface
            : theme.colorScheme.surfaceContainerHighest.withValues(alpha: 0.6),
        border: Border(
          right: BorderSide(
            color: theme.dividerColor.withValues(alpha: 0.2),
            width: 1,
          ),
        ),
      ),
      child: SafeArea(
        child: Column(
          children: [
            // Header section with app branding
            if (widget.header != null)
              widget.header!
            else
              _buildDefaultHeader(theme),

            // Toggle button
            _buildToggleButton(theme),

            const SizedBox(height: 8),

            // Navigation items
            Expanded(
              child: ListView.builder(
                padding: EdgeInsets.symmetric(horizontal: _isExpanded ? 8 : 4),
                itemCount: widget.destinations.length,
                itemBuilder: (context, index) {
                  return _buildNavigationItem(
                    theme,
                    widget.destinations[index],
                    index,
                  );
                },
              ),
            ),

            // Footer section
            if (widget.footer != null) widget.footer!,

            const SizedBox(height: 16),
          ],
        ),
      ),
    );
  }

  Widget _buildDefaultHeader(ThemeData theme) {
    return Container(
      padding: EdgeInsets.symmetric(
        vertical: 24.w,
        horizontal: _isExpanded ? 16 : 0,
      ),
      child: Column(
        children: [
          // App icon/logo
          Container(
            width: 48,
            height: 48,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(12),
              boxShadow: [
                BoxShadow(
                  color: theme.colorScheme.primary.withValues(alpha: 0.2),
                  blurRadius: 8,
                  offset: const Offset(0, 2),
                ),
              ],
            ),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(12),
              child: Image.asset(
                'assets/images/logo-512x512.png',
                width: 48,
                height: 48,
                fit: BoxFit.cover,
              ),
            ),
          ),

          // App name (only when expanded)
          if (_isExpanded) ...[
            SizedBox(height: 12.w),
            CopyText('screen.login.itrade', fallback: "iTrade", style: theme.textTheme.titleLarge?.copyWith(
                fontWeight: FontWeight.bold,
                letterSpacing: 0.5,
              ),
            ),
            SizedBox(height: 4.w),
            CopyText('widget.app_sidebar.trading_platform', fallback: "Trading platform", style: theme.textTheme.bodySmall?.copyWith(
                color: theme.colorScheme.onSurface.withValues(alpha: 0.6),
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildToggleButton(ThemeData theme) {
    return Padding(
      padding: EdgeInsets.symmetric(horizontal: _isExpanded ? 16 : 12),
      child: InkWell(
        onTap: _toggleExpanded,
        borderRadius: BorderRadius.circular(12),
        child: LayoutBuilder(
          builder: (context, constraints) {
            final availableWidth = constraints.maxWidth;
            final shouldShowLabel = availableWidth > 100;

            return Container(
              height: 40,
              decoration: BoxDecoration(
                color: theme.colorScheme.surfaceContainerHighest.withValues(
                  alpha: 0.5,
                ),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Row(
                mainAxisAlignment: shouldShowLabel
                    ? MainAxisAlignment.spaceBetween
                    : MainAxisAlignment.center,
                children: [
                  if (shouldShowLabel) ...[
                    Padding(
                      padding: const EdgeInsets.only(left: 12),
                      child: CopyText('widget.app_sidebar.menu', fallback: "Menu", style: theme.textTheme.bodyMedium?.copyWith(
                          fontWeight: FontWeight.w500,
                        ),
                        overflow: TextOverflow.clip,
                        maxLines: 1,
                      ),
                    ),
                  ],
                  Padding(
                    padding: EdgeInsets.only(right: shouldShowLabel ? 8 : 0),
                    child: AnimatedRotation(
                      turns: _isExpanded ? 0 : 0.5,
                      duration: const Duration(milliseconds: 200),
                      child: Icon(
                        Icons.chevron_left,
                        size: 20,
                        color: theme.colorScheme.onSurface.withValues(
                          alpha: 0.7,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            );
          },
        ),
      ),
    );
  }

  Widget _buildNavigationItem(
    ThemeData theme,
    SidebarDestination destination,
    int index,
  ) {
    final isSelected = index == widget.selectedIndex;

    return Padding(
      padding: EdgeInsets.symmetric(
        vertical: 2,
        horizontal: _isExpanded ? 0 : 4,
      ),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: () => widget.onDestinationSelected(index),
          borderRadius: BorderRadius.circular(12),
          child: LayoutBuilder(
            builder: (context, constraints) {
              // Use available width to determine rendering
              final availableWidth = constraints.maxWidth;
              final shouldShowExpanded = availableWidth > 120;

              return AnimatedContainer(
                duration: const Duration(milliseconds: 200),
                height: 56,
                padding: EdgeInsets.symmetric(
                  horizontal: shouldShowExpanded ? 16 : 0,
                ),
                decoration: BoxDecoration(
                  color: isSelected
                      ? theme.colorScheme.primaryContainer.withValues(
                          alpha: 0.8,
                        )
                      : Colors.transparent,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: shouldShowExpanded
                    ? Row(
                        children: [
                          // Icon
                          Icon(
                            isSelected
                                ? destination.selectedIcon
                                : destination.icon,
                            color: isSelected
                                ? theme.colorScheme.onPrimaryContainer
                                : theme.colorScheme.onSurface.withValues(
                                    alpha: 0.7,
                                  ),
                            size: 24,
                          ),
                          const SizedBox(width: 12),
                          // Label (only when expanded)
                          Expanded(
                            child: Text(
                              destination.label,
                              style: theme.textTheme.bodyLarge?.copyWith(
                                color: isSelected
                                    ? theme.colorScheme.onPrimaryContainer
                                    : theme.colorScheme.onSurface,
                                fontWeight: isSelected
                                    ? FontWeight.w600
                                    : FontWeight.normal,
                              ),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                          // Badge (optional)
                          if (destination.badge != null) ...[
                            const SizedBox(width: 8),
                            destination.badge!,
                          ],
                        ],
                      )
                    : Center(
                        child: Icon(
                          isSelected
                              ? destination.selectedIcon
                              : destination.icon,
                          color: isSelected
                              ? theme.colorScheme.onPrimaryContainer
                              : theme.colorScheme.onSurface.withValues(
                                  alpha: 0.7,
                                ),
                          size: 24,
                        ),
                      ),
              );
            },
          ),
        ),
      ),
    );
  }
}

/// Sidebar destination data class
class SidebarDestination {
  final IconData icon;
  final IconData? selectedIcon;
  final String label;
  final Widget? badge;

  const SidebarDestination({
    required this.icon,
    this.selectedIcon,
    required this.label,
    this.badge,
  });
}
