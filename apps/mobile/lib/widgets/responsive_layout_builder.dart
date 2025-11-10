import 'package:flutter/material.dart';
import '../utils/responsive_layout.dart';

/// Responsive Layout Builder Widget
///
/// Builds different layouts based on device type (phone, tablet, desktop).
///
/// Usage:
/// ```dart
/// ResponsiveLayoutBuilder(
///   phone: (context) => PhoneLayout(),
///   tablet: (context) => TabletLayout(),
///   desktop: (context) => DesktopLayout(), // Optional
/// )
/// ```
class ResponsiveLayoutBuilder extends StatelessWidget {
  /// Phone layout builder (required)
  final WidgetBuilder phone;

  /// Tablet layout builder (optional, defaults to phone)
  final WidgetBuilder? tablet;

  /// Desktop layout builder (optional, defaults to tablet or phone)
  final WidgetBuilder? desktop;

  const ResponsiveLayoutBuilder({
    super.key,
    required this.phone,
    this.tablet,
    this.desktop,
  });

  @override
  Widget build(BuildContext context) {
    final deviceType = ResponsiveLayout.getDeviceType(context);

    switch (deviceType) {
      case DeviceType.phone:
        return phone(context);
      case DeviceType.tablet:
        return (tablet ?? phone)(context);
      case DeviceType.desktop:
        return (desktop ?? tablet ?? phone)(context);
    }
  }
}

/// Responsive Grid View
///
/// Creates a grid with responsive column count based on device type.
///
/// Usage:
/// ```dart
/// ResponsiveGridView(
///   phoneColumns: 2,
///   tabletColumns: 3,
///   desktopColumns: 4,
///   itemCount: items.length,
///   itemBuilder: (context, index) => ItemCard(items[index]),
/// )
/// ```
class ResponsiveGridView extends StatelessWidget {
  /// Number of columns for phone (default: 1)
  final int phoneColumns;

  /// Number of columns for tablet (default: 2)
  final int tabletColumns;

  /// Number of columns for desktop (default: 3)
  final int desktopColumns;

  /// Item count
  final int itemCount;

  /// Item builder
  final IndexedWidgetBuilder itemBuilder;

  /// Main axis spacing (vertical spacing between items)
  final double mainAxisSpacing;

  /// Cross axis spacing (horizontal spacing between items)
  final double crossAxisSpacing;

  /// Child aspect ratio (width / height)
  final double childAspectRatio;

  /// Physics
  final ScrollPhysics? physics;

  /// Shrink wrap
  final bool shrinkWrap;

  /// Padding
  final EdgeInsetsGeometry? padding;

  const ResponsiveGridView({
    super.key,
    this.phoneColumns = 1,
    this.tabletColumns = 2,
    this.desktopColumns = 3,
    required this.itemCount,
    required this.itemBuilder,
    this.mainAxisSpacing = 16,
    this.crossAxisSpacing = 16,
    this.childAspectRatio = 1,
    this.physics,
    this.shrinkWrap = false,
    this.padding,
  });

  @override
  Widget build(BuildContext context) {
    final columns = ResponsiveLayout.value(
      context: context,
      phone: phoneColumns,
      tablet: tabletColumns,
      desktop: desktopColumns,
    );

    return GridView.builder(
      padding: padding,
      physics: physics,
      shrinkWrap: shrinkWrap,
      gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: columns,
        mainAxisSpacing: mainAxisSpacing,
        crossAxisSpacing: crossAxisSpacing,
        childAspectRatio: childAspectRatio,
      ),
      itemCount: itemCount,
      itemBuilder: itemBuilder,
    );
  }
}

/// Responsive Wrap
///
/// Creates a wrap layout with responsive spacing based on device type.
///
/// Usage:
/// ```dart
/// ResponsiveWrap(
///   children: [
///     Chip(label: Text('Tag 1')),
///     Chip(label: Text('Tag 2')),
///   ],
/// )
/// ```
class ResponsiveWrap extends StatelessWidget {
  /// Children widgets
  final List<Widget> children;

  /// Spacing between items (horizontal)
  final double? phoneSpacing;
  final double? tabletSpacing;
  final double? desktopSpacing;

  /// Run spacing (vertical)
  final double? phoneRunSpacing;
  final double? tabletRunSpacing;
  final double? desktopRunSpacing;

  /// Alignment
  final WrapAlignment alignment;

  /// Cross alignment
  final WrapCrossAlignment crossAxisAlignment;

  /// Run alignment
  final WrapAlignment runAlignment;

  const ResponsiveWrap({
    super.key,
    required this.children,
    this.phoneSpacing,
    this.tabletSpacing,
    this.desktopSpacing,
    this.phoneRunSpacing,
    this.tabletRunSpacing,
    this.desktopRunSpacing,
    this.alignment = WrapAlignment.start,
    this.crossAxisAlignment = WrapCrossAlignment.start,
    this.runAlignment = WrapAlignment.start,
  });

  @override
  Widget build(BuildContext context) {
    final spacing = ResponsiveLayout.value(
      context: context,
      phone: phoneSpacing ?? 8,
      tablet: tabletSpacing ?? 12,
      desktop: desktopSpacing ?? 16,
    );

    final runSpacing = ResponsiveLayout.value(
      context: context,
      phone: phoneRunSpacing ?? 8,
      tablet: tabletRunSpacing ?? 12,
      desktop: desktopRunSpacing ?? 16,
    );

    return Wrap(
      spacing: spacing,
      runSpacing: runSpacing,
      alignment: alignment,
      crossAxisAlignment: crossAxisAlignment,
      runAlignment: runAlignment,
      children: children,
    );
  }
}

/// Responsive Row/Column
///
/// Automatically switches between Row and Column based on device type.
/// Useful for layouts that should be horizontal on tablets but vertical on phones.
///
/// Usage:
/// ```dart
/// ResponsiveRowColumn(
///   useRow: context.isTablet,
///   children: [
///     Widget1(),
///     Widget2(),
///   ],
/// )
/// ```
class ResponsiveRowColumn extends StatelessWidget {
  /// Whether to use Row (true) or Column (false)
  final bool useRow;

  /// Children widgets
  final List<Widget> children;

  /// Main axis alignment
  final MainAxisAlignment mainAxisAlignment;

  /// Cross axis alignment
  final CrossAxisAlignment crossAxisAlignment;

  /// Main axis size
  final MainAxisSize mainAxisSize;

  const ResponsiveRowColumn({
    super.key,
    required this.useRow,
    required this.children,
    this.mainAxisAlignment = MainAxisAlignment.start,
    this.crossAxisAlignment = CrossAxisAlignment.start,
    this.mainAxisSize = MainAxisSize.max,
  });

  @override
  Widget build(BuildContext context) {
    if (useRow) {
      return Row(
        mainAxisAlignment: mainAxisAlignment,
        crossAxisAlignment: crossAxisAlignment,
        mainAxisSize: mainAxisSize,
        children: children,
      );
    } else {
      return Column(
        mainAxisAlignment: mainAxisAlignment,
        crossAxisAlignment: crossAxisAlignment,
        mainAxisSize: mainAxisSize,
        children: children,
      );
    }
  }
}

/// Responsive Container with Max Width
///
/// Constrains content width on large screens while allowing full width on small screens.
/// Useful for preventing content from being too wide on tablets/desktops.
///
/// Usage:
/// ```dart
/// ResponsiveContainer(
///   child: MyContent(),
/// )
/// ```
class ResponsiveContainer extends StatelessWidget {
  /// Child widget
  final Widget child;

  /// Maximum width for phone (default: no constraint)
  final double? phoneMaxWidth;

  /// Maximum width for tablet (default: 800)
  final double? tabletMaxWidth;

  /// Maximum width for desktop (default: 1200)
  final double? desktopMaxWidth;

  /// Padding
  final EdgeInsetsGeometry? padding;

  /// Alignment
  final AlignmentGeometry alignment;

  const ResponsiveContainer({
    super.key,
    required this.child,
    this.phoneMaxWidth,
    this.tabletMaxWidth = 800,
    this.desktopMaxWidth = 1200,
    this.padding,
    this.alignment = Alignment.center,
  });

  @override
  Widget build(BuildContext context) {
    final maxWidth = ResponsiveLayout.value(
      context: context,
      phone: phoneMaxWidth ?? double.infinity,
      tablet: tabletMaxWidth ?? 800,
      desktop: desktopMaxWidth ?? 1200,
    );

    return Align(
      alignment: alignment,
      child: ConstrainedBox(
        constraints: BoxConstraints(maxWidth: maxWidth),
        child: Padding(
          padding: padding ?? ResponsiveLayout.getResponsivePadding(context),
          child: child,
        ),
      ),
    );
  }
}

/// Responsive Padding
///
/// Provides responsive padding based on device type.
///
/// Usage:
/// ```dart
/// ResponsivePadding(
///   child: MyWidget(),
/// )
/// ```
class ResponsivePadding extends StatelessWidget {
  /// Child widget
  final Widget child;

  /// Phone padding
  final EdgeInsetsGeometry? phone;

  /// Tablet padding
  final EdgeInsetsGeometry? tablet;

  /// Desktop padding
  final EdgeInsetsGeometry? desktop;

  const ResponsivePadding({
    super.key,
    required this.child,
    this.phone,
    this.tablet,
    this.desktop,
  });

  @override
  Widget build(BuildContext context) {
    final padding = ResponsiveLayout.value(
      context: context,
      phone: phone ?? const EdgeInsets.all(16),
      tablet: tablet ?? const EdgeInsets.all(24),
      desktop: desktop ?? const EdgeInsets.all(32),
    );

    return Padding(
      padding: padding,
      child: child,
    );
  }
}

/// Responsive Gap (SizedBox with responsive spacing)
///
/// Usage:
/// ```dart
/// ResponsiveGap(phone: 16, tablet: 24, desktop: 32)
/// ```
class ResponsiveGap extends StatelessWidget {
  /// Phone gap size
  final double phone;

  /// Tablet gap size
  final double? tablet;

  /// Desktop gap size
  final double? desktop;

  /// Whether gap is horizontal (width) or vertical (height)
  final bool isHorizontal;

  const ResponsiveGap({
    super.key,
    required this.phone,
    this.tablet,
    this.desktop,
    this.isHorizontal = false,
  });

  /// Create horizontal gap
  const ResponsiveGap.horizontal({
    super.key,
    required this.phone,
    this.tablet,
    this.desktop,
  }) : isHorizontal = true;

  /// Create vertical gap
  const ResponsiveGap.vertical({
    super.key,
    required this.phone,
    this.tablet,
    this.desktop,
  }) : isHorizontal = false;

  @override
  Widget build(BuildContext context) {
    final gap = ResponsiveLayout.value(
      context: context,
      phone: phone,
      tablet: tablet,
      desktop: desktop,
    );

    return SizedBox(
      width: isHorizontal ? gap : null,
      height: isHorizontal ? null : gap,
    );
  }
}

/// Responsive Two Column Layout
///
/// Creates a two-column layout on tablets/desktop, single column on phones.
/// Commonly used for forms, detail pages, etc.
///
/// Usage:
/// ```dart
/// ResponsiveTwoColumn(
///   left: LeftPanel(),
///   right: RightPanel(),
/// )
/// ```
class ResponsiveTwoColumn extends StatelessWidget {
  /// Left/top widget
  final Widget left;

  /// Right/bottom widget
  final Widget right;

  /// Spacing between columns
  final double spacing;

  /// Left column flex (default: 1)
  final int leftFlex;

  /// Right column flex (default: 1)
  final int rightFlex;

  /// Cross axis alignment
  final CrossAxisAlignment crossAxisAlignment;

  const ResponsiveTwoColumn({
    super.key,
    required this.left,
    required this.right,
    this.spacing = 16,
    this.leftFlex = 1,
    this.rightFlex = 1,
    this.crossAxisAlignment = CrossAxisAlignment.start,
  });

  @override
  Widget build(BuildContext context) {
    if (context.isPhone) {
      // Stack vertically on phones
      return Column(
        crossAxisAlignment: crossAxisAlignment,
        children: [
          left,
          SizedBox(height: spacing),
          right,
        ],
      );
    } else {
      // Side by side on tablets/desktop
      return Row(
        crossAxisAlignment: crossAxisAlignment,
        children: [
          Expanded(flex: leftFlex, child: left),
          SizedBox(width: spacing),
          Expanded(flex: rightFlex, child: right),
        ],
      );
    }
  }
}

/// Responsive Sidebar Layout
///
/// Creates a layout with sidebar on tablets/desktop, drawer on phones.
///
/// Usage:
/// ```dart
/// ResponsiveSidebarLayout(
///   sidebar: NavigationRail(...),
///   content: MainContent(),
/// )
/// ```
class ResponsiveSidebarLayout extends StatelessWidget {
  /// Sidebar widget (shown on tablet/desktop)
  final Widget sidebar;

  /// Main content widget
  final Widget content;

  /// Sidebar width (default: 250)
  final double sidebarWidth;

  const ResponsiveSidebarLayout({
    super.key,
    required this.sidebar,
    required this.content,
    this.sidebarWidth = 250,
  });

  @override
  Widget build(BuildContext context) {
    if (context.isPhone) {
      // Full screen content on phones (sidebar should be in drawer)
      return content;
    } else {
      // Side-by-side on tablets/desktop
      return Row(
        children: [
          SizedBox(
            width: sidebarWidth,
            child: sidebar,
          ),
          Expanded(child: content),
        ],
      );
    }
  }
}

