import 'dart:developer' as developer;

import 'package:flutter_screenutil/flutter_screenutil.dart';

/// Screen Adaptation Utility Class
///
/// **IMPORTANT: Only adapts WIDTH, NOT height**
///
/// Design Standard: 375px width (iPhone SE/8 as baseline)
/// Height uses FIXED values (not scaled) to accommodate different aspect ratios
///
/// Why only width?
/// - Device widths are relatively consistent (320-428px)
/// - Device heights vary greatly (568px to 900px+, different aspect ratios)
/// - Scaling height causes issues on tall/short screens
/// - Fixed height values work better with scrollable content
///
/// Usage Examples:
/// ```dart
/// // ✅ Width adaptation (use .w)
/// Container(width: 100.w)
///
/// // ✅ Font size adaptation (use .sp, based on width)
/// Text('Hello', style: TextStyle(fontSize: 16.sp))
///
/// // ✅ Radius adaptation (use .r for uniform scaling)
/// BorderRadius.circular(8.r)
///
/// // ✅ Horizontal spacing (use .w)
/// EdgeInsets.symmetric(horizontal: 16.w)
///
/// // ✅ Vertical spacing (use FIXED values)
/// EdgeInsets.symmetric(vertical: 12)  // No .h
/// SizedBox(height: 20)  // No .h
///
/// // ❌ DON'T use .h (it won't scale anyway)
/// Container(height: 50.h)  // Just use: height: 50
/// ```
class ScreenAdapter {
  // Private constructor to prevent instantiation
  ScreenAdapter._();

  /// Design width (px) - Used for adaptation
  static const double designWidth = 390;

  /// Design height (px) - NOT used for adaptation (set to large value to disable)
  /// Height should use FIXED values instead of .h
  static const double designHeight = 10000;

  /// Get screen width
  static double get screenWidth => 1.sw;

  /// Get screen height
  static double get screenHeight => 1.sh;

  /// Get status bar height
  static double get statusBarHeight => ScreenUtil().statusBarHeight;

  /// Get bottom safe area height
  static double get bottomBarHeight => ScreenUtil().bottomBarHeight;

  /// Get text scale factor
  static double get textScaleFactor => ScreenUtil().textScaleFactor;

  /// Get device pixel ratio
  static double get pixelRatio => ScreenUtil().pixelRatio ?? 1.0;

  /// Set width (relative to design width 375)
  /// Example: setWidth(100) returns adapted width
  static double setWidth(num width) => width.w;

  /// Set height (relative to design height 800)
  /// Example: setHeight(100) returns adapted height
  static double setHeight(num height) => height.h;

  /// Set font size (relative to design width 375)
  /// Example: setFontSize(16) returns adapted font size
  static double setFontSize(num fontSize) => fontSize.sp;

  /// Set radius (adapts to screen size)
  /// Example: setRadius(8) returns adapted radius
  static double setRadius(num radius) => radius.r;

  /// Minimum dimension (adapts to smallest side)
  /// Example: setMin(100) returns adapted minimum dimension
  static double setMin(num size) => size.r;

  /// Print screen info for debugging
  static void printScreenInfo() {
    developer.log('=== Screen Info ===', name: 'ScreenAdapter');
    developer.log('Screen Width: ${screenWidth}px', name: 'ScreenAdapter');
    developer.log('Screen Height: ${screenHeight}px', name: 'ScreenAdapter');
    developer.log(
      'Status Bar Height: ${statusBarHeight}px',
      name: 'ScreenAdapter',
    );
    developer.log(
      'Bottom Bar Height: ${bottomBarHeight}px',
      name: 'ScreenAdapter',
    );
    developer.log('Device Pixel Ratio: $pixelRatio', name: 'ScreenAdapter');
    developer.log('Text Scale Factor: $textScaleFactor', name: 'ScreenAdapter');
    developer.log(
      'Design Size: ${designWidth}x$designHeight',
      name: 'ScreenAdapter',
    );
    developer.log('==================', name: 'ScreenAdapter');
  }
}

/// Extension methods for convenient screen adaptation
extension ScreenAdaptExtension on num {
  /// Convert to adapted width
  /// Example: 100.aw -> adapted width
  double get aw => ScreenAdapter.setWidth(this);

  /// Convert to adapted height
  /// Example: 100.ah -> adapted height
  double get ah => ScreenAdapter.setHeight(this);

  /// Convert to adapted font size
  /// Example: 16.af -> adapted font size
  double get af => ScreenAdapter.setFontSize(this);

  /// Convert to adapted radius
  /// Example: 8.ar -> adapted radius
  double get ar => ScreenAdapter.setRadius(this);
}
