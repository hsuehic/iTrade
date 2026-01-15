import 'dart:io';

import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:flutter/foundation.dart';

import 'api_client.dart';
import 'preference.dart';

class NotificationService {
  NotificationService._internal();
  static final NotificationService instance = NotificationService._internal();

  final FirebaseMessaging _messaging = FirebaseMessaging.instance;
  final FlutterLocalNotificationsPlugin _local =
      FlutterLocalNotificationsPlugin();

  bool _initialized = false;
  static const List<String> supportedCategories = <String>[
    'general',
    'marketing',
    'trading',
    'security',
    'system',
  ];

  static String topicForCategory(String category) {
    return 'push_$category';
  }

  Future<void> initialize() async {
    if (_initialized) return;

    const AndroidInitializationSettings androidInit =
        AndroidInitializationSettings('@mipmap/ic_launcher');
    const DarwinInitializationSettings iosInit = DarwinInitializationSettings(
      requestSoundPermission: false,
      requestBadgePermission: false,
      requestAlertPermission: false,
    );
    const InitializationSettings initSettings = InitializationSettings(
      android: androidInit,
      iOS: iosInit,
    );
    await _local.initialize(initSettings);

    // Subscribe to baseline topics with error handling
    // Note: This may fail on iOS simulators as they don't support APNS
    try {
      await _messaging.subscribeToTopic('news');
    } catch (_) {}

    try {
      await _messaging.subscribeToTopic('allUsers');
    } catch (_) {}

    if (Platform.isIOS || Platform.isMacOS) {
      try {
        await _messaging.setForegroundNotificationPresentationOptions(
          alert: true,
          badge: true,
          sound: true,
        );
      } catch (e) {
              }
    }

    // Sync refreshed FCM token to server (best-effort, only if changed)
    FirebaseMessaging.instance.onTokenRefresh.listen((token) async {
      try {
        final enabled = await Preference.getNotificationsEnabled();
        if (enabled == false) return;
        await syncDeviceTokenToServer(tokenOverride: token);
      } catch (_) {}
    });

    // Apply per-category topic subscriptions from local preferences
    try {
      await applyCategorySubscriptions();
    } catch (_) {}

    _initialized = true;
  }

  Future<NotificationSettings> requestPermissions() async {
    final NotificationSettings settings = await _messaging.requestPermission(
      alert: true,
      announcement: false,
      badge: true,
      carPlay: false,
      criticalAlert: false,
      provisional: false,
      sound: true,
    );
    return settings;
  }

  Future<String?> getDeviceToken() async {
    try {
      return await _messaging.getToken();
    } catch (e) {
            return null;
    }
  }

  Future<void> syncDeviceTokenToServer({String? tokenOverride}) async {
    // ApiClient may not be initialized early in app boot
    if (!ApiClient.instance.isInitialized) return;

    final enabled = await Preference.getNotificationsEnabled();
    if (enabled == false) return;

    final token = tokenOverride ?? (await getDeviceToken());
    if (token == null || token.isEmpty) return;

    final platform = Platform.isIOS
        ? 'ios'
        : Platform.isAndroid
        ? 'android'
        : 'web';
    final provider = 'fcm';
    final appId = 'com.ihsueh.itrade';
    final environment =
        Platform.isIOS ? (kReleaseMode ? 'production' : 'sandbox') : null;

    final deviceId = await Preference.getOrCreatePushDeviceId();

    final lastKey = Preference.pushLastReportedTokenKey(platform, provider);
    final lastReported = await Preference.getValue<String>(lastKey);
    if (lastReported != null && lastReported == token) return;

    try {
      final res = await ApiClient.instance.postJson<dynamic>(
        '/api/push/register',
        data: {
          'deviceId': deviceId,
          'platform': platform,
          'provider': provider,
          'pushToken': token,
          'appId': appId,
          'environment': environment,
        },
      );

      if (res.statusCode == 200) {
        await Preference.setValue<String>(lastKey, token);
      }
    } catch (_) {
      // Best-effort: don't break app startup if registration fails
    }
  }

  Future<void> setCategoryEnabled(String category, bool enabled) async {
    await Preference.setPushCategoryEnabled(category, enabled);
    final notificationsEnabled = await Preference.getNotificationsEnabled();
    if (notificationsEnabled == false) return;

    final topic = topicForCategory(category);
    try {
      if (enabled) {
        await _messaging.subscribeToTopic(topic);
      } else {
        await _messaging.unsubscribeFromTopic(topic);
      }
    } catch (_) {}
  }

  Future<void> applyCategorySubscriptions() async {
    final notificationsEnabled = await Preference.getNotificationsEnabled();
    if (notificationsEnabled == false) return;

    for (final category in supportedCategories) {
      final enabled = await Preference.getPushCategoryEnabled(category);
      final topic = topicForCategory(category);
      try {
        if (enabled) {
          await _messaging.subscribeToTopic(topic);
        } else {
          await _messaging.unsubscribeFromTopic(topic);
        }
      } catch (_) {}
    }
  }

  void listenToMessages({void Function(RemoteMessage message)? onTap}) {
    FirebaseMessaging.onMessage.listen((RemoteMessage message) {
      _showLocal(message);
    });

    FirebaseMessaging.onMessageOpenedApp.listen((RemoteMessage message) {
      if (onTap != null) onTap(message);
    });
  }

  Future<void> _showLocal(RemoteMessage message) async {
    RemoteNotification? notification = message.notification;

    // Fallback for data-only messages (e.g., Android data pushes)
    if (notification == null) {
      final data = message.data;
      // Try APS-style alert first
      final apsAlert = (data['aps'] is Map) ? (data['aps'] as Map)['alert'] : null;
      String? title;
      String? body;
      if (apsAlert is Map) {
        title = apsAlert['title']?.toString();
        body = apsAlert['body']?.toString();
      }
      title ??= data['title']?.toString();
      body ??= data['body']?.toString();

      if (title != null || body != null) {
        notification = RemoteNotification(
          title: title,
          body: body,
        );
      }
    }

    if (notification == null) return;

    // Extract badge from APNS-style payload or fallback data fields
    int? badgeCount;
    try {
      final dynamic apsRaw = message.data['aps'];
      if (apsRaw is Map) {
        final dynamic badgeRaw = apsRaw['badge'];
        badgeCount = int.tryParse(badgeRaw?.toString() ?? '');
      }
    } catch (_) {}
    badgeCount ??= int.tryParse(message.data['badge']?.toString() ?? '');
    badgeCount ??= int.tryParse(message.data['unreadCount']?.toString() ?? '');

    const AndroidNotificationDetails androidDetails =
        AndroidNotificationDetails(
          'default_channel',
          'General Notifications',
          importance: Importance.max,
          priority: Priority.high,
          playSound: true,
        );
    final DarwinNotificationDetails iosDetails = DarwinNotificationDetails(
      badgeNumber: badgeCount,
    );
    final NotificationDetails details = NotificationDetails(
      android: androidDetails,
      iOS: iosDetails,
    );

    await _local.show(
      notification.hashCode,
      notification.title,
      notification.body,
      details,
      payload: message.data.toString(),
    );
  }
}

@pragma('vm:entry-point')
Future<void> firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  // Background handler; Firebase.initializeApp is automatically handled by FlutterFire if configured
  }
