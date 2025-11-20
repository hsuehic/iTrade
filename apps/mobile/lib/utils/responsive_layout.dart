import 'package:flutter/material.dart';

/// Responsive Layout Utility
///
/// Provides device type detection and responsive breakpoints for building
/// adaptive layouts that work across phones, tablets, and desktop screens.
///
/// Device Categories:
/// - **Phone**: < 600dp (e.g., iPhone, Android phones)
/// - **Tablet**: 600-1200dp (e.g., iPad, Android tablets)
/// - **Desktop**: > 1200dp (e.g., Web, large screens)
///
/// Usage:
/// ```dart
/// if (ResponsiveLayout.isTablet(context)) {
///   return TabletLayout();
/// } else {
///   return PhoneLayout();
/// }
/// ```
class ResponsiveLayout {
  // Private constructor to prevent instantiation
  ResponsiveLayout._();

  /// Breakpoint definitions (in logical pixels / dp)
  static const double phoneBreakpoint = 600;
  static const double tabletBreakpoint = 1200;

  /// Small tablet breakpoint (iPad Mini size)
  static const double smallTabletBreakpoint = 768;

  /// Large tablet breakpoint (iPad Pro size)
  static const double largeTabletBreakpoint = 1024;

  /// Design sizes for different device types
  static const Size phoneDesignSize = Size(375, 812); // iPhone standard
  static const Size tabletDesignSize = Size(768, 1024); // iPad standard
  static const Size desktopDesignSize = Size(1440, 1024); // Desktop standard

  /// Get current device type based on screen width
  static DeviceType getDeviceType(BuildContext context) {
    final width = MediaQuery.of(context).size.width;
    if (width < phoneBreakpoint) {
      return DeviceType.phone;
    } else if (width < tabletBreakpoint) {
      return DeviceType.tablet;
    } else {
      return DeviceType.desktop;
    }
  }

  /// Check if current device is a phone
  static bool isPhone(BuildContext context) {
    return getDeviceType(context) == DeviceType.phone;
  }

  /// Check if current device is a tablet
  static bool isTablet(BuildContext context) {
    return getDeviceType(context) == DeviceType.tablet;
  }

  /// Check if current device is a small tablet (iPad Mini size)
  static bool isSmallTablet(BuildContext context) {
    final width = MediaQuery.of(context).size.width;
    return width >= phoneBreakpoint && width < largeTabletBreakpoint;
  }

  /// Check if current device is a large tablet (iPad Pro size)
  static bool isLargeTablet(BuildContext context) {
    final width = MediaQuery.of(context).size.width;
    return width >= largeTabletBreakpoint && width < tabletBreakpoint;
  }

  /// Check if current device is desktop
  static bool isDesktop(BuildContext context) {
    return getDeviceType(context) == DeviceType.desktop;
  }

  /// Check if device is tablet or larger
  static bool isTabletOrLarger(BuildContext context) {
    return !isPhone(context);
  }

  /// Check if device is desktop or larger
  static bool isDesktopOrLarger(BuildContext context) {
    return isDesktop(context);
  }

  /// Get appropriate design size for current device
  static Size getDesignSize(BuildContext context) {
    switch (getDeviceType(context)) {
      case DeviceType.phone:
        return phoneDesignSize;
      case DeviceType.tablet:
        return tabletDesignSize;
      case DeviceType.desktop:
        return desktopDesignSize;
    }
  }

  /// Get responsive value based on device type
  ///
  /// Example:
  /// ```dart
  /// final columns = ResponsiveLayout.value(
  ///   context: context,
  ///   phone: 1,
  ///   tablet: 2,
  ///   desktop: 3,
  /// );
  /// ```
  static T value<T>({
    required BuildContext context,
    required T phone,
    T? tablet,
    T? desktop,
  }) {
    final deviceType = getDeviceType(context);
    switch (deviceType) {
      case DeviceType.phone:
        return phone;
      case DeviceType.tablet:
        return tablet ?? phone;
      case DeviceType.desktop:
        return desktop ?? tablet ?? phone;
    }
  }

  /// Get screen width
  static double getScreenWidth(BuildContext context) {
    return MediaQuery.of(context).size.width;
  }

  /// Get screen height
  static double getScreenHeight(BuildContext context) {
    return MediaQuery.of(context).size.height;
  }

  /// Get orientation
  static Orientation getOrientation(BuildContext context) {
    return MediaQuery.of(context).orientation;
  }

  /// Check if device is in landscape mode
  static bool isLandscape(BuildContext context) {
    return getOrientation(context) == Orientation.landscape;
  }

  /// Check if device is in portrait mode
  static bool isPortrait(BuildContext context) {
    return getOrientation(context) == Orientation.portrait;
  }

  /// Get content width constraint (max width for content)
  ///
  /// This is useful for preventing content from being too wide on large screens
  static double getContentMaxWidth(BuildContext context) {
    return value(
      context: context,
      phone: double.infinity,
      tablet: 800,
      desktop: 1200,
    );
  }

  /// Get grid column count based on device type
  static int getGridColumns(BuildContext context, {int? phone, int? tablet, int? desktop}) {
    return value(
      context: context,
      phone: phone ?? 1,
      tablet: tablet ?? 2,
      desktop: desktop ?? 3,
    );
  }

  /// Get responsive padding based on device type
  static EdgeInsets getResponsivePadding(BuildContext context) {
    return EdgeInsets.symmetric(
      horizontal: value(
        context: context,
        phone: 16,
        tablet: 24,
        desktop: 32,
      ),
      vertical: value(
        context: context,
        phone: 12,
        tablet: 16,
        desktop: 20,
      ),
    );
  }

  /// Print device info for debugging
  static void printDeviceInfo(BuildContext context) {
    final deviceType = getDeviceType(context);
    final size = MediaQuery.of(context).size;
    final orientation = getOrientation(context);
    final pixelRatio = MediaQuery.of(context).devicePixelRatio;

                              }
}

/// Device type enumeration
enum DeviceType {
  phone,
  tablet,
  desktop;

  /// Get display name
  String get displayName {
    switch (this) {
      case DeviceType.phone:
        return 'Phone';
      case DeviceType.tablet:
        return 'Tablet';
      case DeviceType.desktop:
        return 'Desktop';
    }
  }
}

/// Extension for easy access to responsive utilities
extension ResponsiveExtension on BuildContext {
  /// Get device type
  DeviceType get deviceType => ResponsiveLayout.getDeviceType(this);

  /// Check if phone
  bool get isPhone => ResponsiveLayout.isPhone(this);

  /// Check if tablet
  bool get isTablet => ResponsiveLayout.isTablet(this);

  /// Check if desktop
  bool get isDesktop => ResponsiveLayout.isDesktop(this);

  /// Check if tablet or larger
  bool get isTabletOrLarger => ResponsiveLayout.isTabletOrLarger(this);

  /// Check if landscape
  bool get isLandscape => ResponsiveLayout.isLandscape(this);

  /// Check if portrait
  bool get isPortrait => ResponsiveLayout.isPortrait(this);

  /// Get responsive value
  T responsiveValue<T>({
    required T phone,
    T? tablet,
    T? desktop,
  }) {
    return ResponsiveLayout.value(
      context: this,
      phone: phone,
      tablet: tablet,
      desktop: desktop,
    );
  }
}

