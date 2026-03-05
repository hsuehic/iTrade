// lib/services/analytics_service.dart
import 'package:firebase_analytics/firebase_analytics.dart';
import 'package:firebase_core/firebase_core.dart' as firebase_core;

class AnalyticsService {
  static final FirebaseAnalytics _analytics = FirebaseAnalytics.instance;

  /// 记录屏幕浏览（可选：用于自定义页面追踪）
  static Future<void> logScreenView(String screenName) async {
    if (firebase_core.Firebase.apps.isEmpty) return;
    try {
      await _analytics.logEvent(
        name: 'screen_view',
        parameters: {'screen_name': screenName},
      );
    } catch (_) {
      // Best-effort only; analytics should never block app flow.
    }
  }

  /// 记录按钮点击等事件
  static Future<void> logButtonClick(String label) async {
    if (firebase_core.Firebase.apps.isEmpty) return;
    try {
      await _analytics.logEvent(
        name: 'button_click',
        parameters: {'label': label},
      );
    } catch (_) {
      // Best-effort only; analytics should never block app flow.
    }
  }

  /// 通用自定义事件
  static Future<void> logEvent(
    String name, [
    Map<String, Object>? params,
  ]) async {
    if (firebase_core.Firebase.apps.isEmpty) return;
    try {
      await _analytics.logEvent(name: name, parameters: params);
    } catch (_) {
      // Best-effort only; analytics should never block app flow.
    }
  }
}
