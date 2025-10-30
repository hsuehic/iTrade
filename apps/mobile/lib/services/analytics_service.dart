// lib/services/analytics_service.dart
import 'package:firebase_analytics/firebase_analytics.dart';

class AnalyticsService {
  static final FirebaseAnalytics _analytics = FirebaseAnalytics.instance;

  /// 记录屏幕浏览（可选：用于自定义页面追踪）
  static Future<void> logScreenView(String screenName) async {
    await _analytics.logEvent(
      name: 'screen_view',
      parameters: {'screen_name': screenName},
    );
  }

  /// 记录按钮点击等事件
  static Future<void> logButtonClick(String label) async {
    await _analytics.logEvent(
      name: 'button_click',
      parameters: {'label': label},
    );
  }

  /// 通用自定义事件
  static Future<void> logEvent(
    String name, [
    Map<String, Object>? params,
  ]) async {
    await _analytics.logEvent(name: name, parameters: params);
  }
}
