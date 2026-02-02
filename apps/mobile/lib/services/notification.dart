import 'dart:convert';
import 'dart:io';

import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:flutter_app_badger/flutter_app_badger.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'auth_service.dart';
import 'package:flutter/foundation.dart';
import 'package:package_info_plus/package_info_plus.dart';

import 'api_client.dart';
import 'preference.dart';

class NotificationService {
  NotificationService._internal();
  static final NotificationService instance = NotificationService._internal();

  final FirebaseMessaging _messaging = FirebaseMessaging.instance;
  final FlutterLocalNotificationsPlugin _local =
      FlutterLocalNotificationsPlugin();

  bool _initialized = false;
  String? _cachedAppVersion;
  bool _listening = false;
  void Function(RemoteMessage message)? _onTap;
  RemoteMessage? _pendingTapMessage;
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
    await _local.initialize(
      initSettings,
      onDidReceiveNotificationResponse: (NotificationResponse response) {
        final payload = response.payload;
        if (payload == null || payload.isEmpty) return;
        try {
          final data = jsonDecode(payload);
          if (data is Map) {
            final message = RemoteMessage.fromMap(<String, dynamic>{
              'data': data.cast<String, dynamic>(),
            });
            _handleTap(message);
          }
        } catch (_) {
          if (kDebugMode) {
            debugPrint('Failed to decode local notification payload');
          }
        }
      },
    );

    if (Platform.isIOS || Platform.isMacOS) {
      try {
        await _messaging.setForegroundNotificationPresentationOptions(
          alert: true,
          badge: true,
          sound: true,
        );
      } catch (_) {
        if (kDebugMode) {
          debugPrint('Failed to set foreground notification options');
        }
      }
    }

    // Sync refreshed FCM token to server (best-effort, only if changed)
    FirebaseMessaging.instance.onTokenRefresh.listen((token) async {
      try {
        final enabled = await Preference.getNotificationsEnabled();
        if (enabled == false) return;
        await syncDeviceTokenToServer(tokenOverride: token);
        await ensureTopicSubscriptions();
      } catch (_) {}
    });

    // Best-effort: attempt topic subscriptions if token is already available.
    try {
      await ensureTopicSubscriptions();
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

  Future<void> syncDeviceTokenToServer({
    String? tokenOverride,
    bool force = false,
  }) async {
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
    final environment = Platform.isIOS
        ? (kReleaseMode ? 'production' : 'sandbox')
        : null;
    final appVersion = await _getAppVersion();

    final deviceId = await Preference.getOrCreatePushDeviceId();
    final currentUserId = AuthService.instance.user?.id ?? 'anon';

    final lastKey = Preference.pushLastReportedTokenKey(platform, provider);
    final lastReported = await Preference.getValue<String>(lastKey);
    final signature = '$token::$currentUserId';
    if (!force && lastReported != null && lastReported == signature) return;

    try {
      final res = await ApiClient.instance.postJson<dynamic>(
        '/api/push/register',
        data: {
          'deviceId': deviceId,
          'platform': platform,
          'provider': provider,
          'pushToken': token,
          'appId': appId,
          'appVersion': appVersion,
          'environment': environment,
        },
      );

      if (res.statusCode == 200) {
        await Preference.setValue<String>(lastKey, signature);
      }
    } catch (_) {
      // Best-effort: don't break app startup if registration fails
    }
  }

  Future<String?> _getAppVersion() async {
    if (_cachedAppVersion != null) return _cachedAppVersion;
    try {
      final info = await PackageInfo.fromPlatform();
      final version = info.version.trim();
      final build = info.buildNumber.trim();
      if (version.isEmpty) return null;
      _cachedAppVersion = build.isEmpty ? version : '$version+$build';
      return _cachedAppVersion;
    } catch (_) {
      return null;
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

  Future<void> ensureTopicSubscriptions() async {
    final notificationsEnabled = await Preference.getNotificationsEnabled();
    if (notificationsEnabled == false) return;

    final token = await getDeviceToken();
    if (token == null || token.isEmpty) return;

    // Baseline topics (best-effort).
    try {
      await _messaging.subscribeToTopic('news');
    } catch (_) {}

    try {
      await _messaging.subscribeToTopic('allUsers');
    } catch (_) {}

    // Per-category topic subscriptions.
    await applyCategorySubscriptions();
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
    setOnTapHandler(onTap);

    if (_listening) return;
    _listening = true;

    FirebaseMessaging.onMessage.listen((RemoteMessage message) {
      _storeHistoryMessage(message);
      _showLocal(message);
    });

    FirebaseMessaging.onMessageOpenedApp.listen((RemoteMessage message) {
      _handleTap(message);
    });

    FirebaseMessaging.instance.getInitialMessage().then((message) {
      if (message != null) _handleTap(message);
    });
  }

  Future<void> _showLocal(RemoteMessage message) async {
    // iOS already shows the notification payload when foreground presentation
    // is enabled. Avoid triggering a second local notification for the same
    // message to prevent duplicates.
    if (Platform.isIOS && message.notification != null) {
      return;
    }

    RemoteNotification? notification = message.notification;

    // Fallback for data-only messages (e.g., Android data pushes)
    if (notification == null) {
      final data = message.data;
      // Try APS-style alert first
      final apsAlert = (data['aps'] is Map)
          ? (data['aps'] as Map)['alert']
          : null;
      String? title;
      String? body;
      if (apsAlert is Map) {
        title = apsAlert['title']?.toString();
        body = apsAlert['body']?.toString();
      }
      title ??= data['title']?.toString();
      body ??= data['body']?.toString();

      if (title != null || body != null) {
        notification = RemoteNotification(title: title, body: body);
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
    final resolvedUnreadCount = await _resolveUnreadCount(badgeCount);
    await updateBadgeCount(resolvedUnreadCount);

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
      payload: jsonEncode(message.data),
    );
  }

  void setOnTapHandler(void Function(RemoteMessage message)? onTap) {
    _onTap = onTap;
    if (_onTap != null && _pendingTapMessage != null) {
      final message = _pendingTapMessage;
      _pendingTapMessage = null;
      _onTap?.call(message!);
    }
  }

  void _handleTap(RemoteMessage message) {
    _storeHistoryMessage(message);
    if (_onTap != null) {
      _onTap?.call(message);
    } else {
      _pendingTapMessage = message;
    }
  }

  Future<void> _storeHistoryMessage(RemoteMessage message) async {
    await Preference.addPushHistoryMessage(_buildHistoryMessage(message));
  }

  Future<int> _resolveUnreadCount(int? incomingCount) async {
    if (incomingCount != null && incomingCount >= 0) {
      await Preference.setPushUnreadCount(incomingCount);
      return incomingCount;
    }
    final current = await Preference.getPushUnreadCount();
    final next = current + 1;
    await Preference.setPushUnreadCount(next);
    return next;
  }

  Future<void> updateBadgeCount(int count) async {
    final normalized = count < 0 ? 0 : count;
    await Preference.setPushUnreadCount(normalized);

    try {
      final supported = await FlutterAppBadger.isAppBadgeSupported();
      if (!supported) return;
      if (normalized <= 0) {
        await FlutterAppBadger.removeBadge();
      } else {
        await FlutterAppBadger.updateBadgeCount(normalized);
      }
    } catch (_) {
      // Best-effort only.
    }
  }
}

@pragma('vm:entry-point')
Future<void> firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  // Background handler; Firebase.initializeApp is automatically handled by FlutterFire if configured
  try {
    await Preference.addPushHistoryMessage(_buildHistoryMessage(message));
  } catch (_) {}
}

Map<String, dynamic> _buildHistoryMessage(RemoteMessage message) {
  final data = Map<String, dynamic>.from(message.data);
  final event = data['event']?.toString() ?? '';
  final category =
      data['category']?.toString() ??
      (event.startsWith('order') ? 'trading' : 'general');
  final title =
      message.notification?.title ??
      data['title']?.toString() ??
      'Notification';
  final body = message.notification?.body ?? data['body']?.toString() ?? '';
  final timestamp =
      _parseTimestamp(data['updateTime']?.toString()) ?? DateTime.now();
  final id =
      message.messageId ??
      data['orderId']?.toString() ??
      '${timestamp.millisecondsSinceEpoch}-${data['event'] ?? 'push'}';

  return <String, dynamic>{
    'id': id,
    'createdAt': timestamp.toIso8601String(),
    'category': category,
    'notification': <String, dynamic>{'title': title, 'body': body},
    'data': data,
  };
}

DateTime? _parseTimestamp(String? raw) {
  if (raw == null || raw.isEmpty) return null;
  final parsed = DateTime.tryParse(raw);
  if (parsed != null) return parsed;
  final numeric = int.tryParse(raw);
  if (numeric == null) return null;
  final millis = numeric > 1000000000000 ? numeric : numeric * 1000;
  return DateTime.fromMillisecondsSinceEpoch(millis);
}
