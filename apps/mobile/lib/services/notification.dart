import 'dart:convert';
import 'dart:async';
import 'dart:io';

import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:flutter_app_badger/flutter_app_badger.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'auth_service.dart';
import 'package:flutter/foundation.dart';
import 'package:package_info_plus/package_info_plus.dart';

import '../firebase_options.dart';
import 'api_client.dart';
import 'preference.dart';

class NotificationService with WidgetsBindingObserver {
  NotificationService._internal();
  static final NotificationService instance = NotificationService._internal();

  final FirebaseMessaging _messaging = FirebaseMessaging.instance;
  final FlutterLocalNotificationsPlugin _local =
      FlutterLocalNotificationsPlugin();
  final ValueNotifier<int> _unreadCountNotifier = ValueNotifier<int>(0);
  final ValueNotifier<int> _historyVersionNotifier = ValueNotifier<int>(0);

  bool _initialized = false;
  String? _cachedAppVersion;
  bool _listening = false;
  bool _lifecycleObserving = false;
  String _lastHistorySnapshot = '';
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

  ValueNotifier<int> get unreadCountNotifier => _unreadCountNotifier;
  ValueNotifier<int> get historyVersionNotifier => _historyVersionNotifier;

  void _log(String message) {
    final text = '[Push] $message';
    // Use print() in addition to debugPrint() so the message always appears
    // in the Cursor/IDE debug console regardless of log-level filtering.
    if (kDebugMode) {
      // ignore: avoid_print
      print(text);
    }
    debugPrint(text);
    unawaited(Preference.appendPushDebugLog(text));
  }

  Future<void> initialize() async {
    if (_initialized) return;
    _log('initialize start');
    _unreadCountNotifier.value = await Preference.getPushUnreadCount();

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
      settings: initSettings,
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
        // Disable system alert banner in foreground so we can show a local
        // notification instead. This ensures onDidReceiveNotificationResponse
        // fires when the user taps the notification (system banners shown via
        // alert:true do NOT trigger onMessageOpenedApp while the app is in the
        // foreground, leaving taps unhandled).
        await _messaging.setForegroundNotificationPresentationOptions(
          alert: false,
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

    await syncPushStateFromStorage(forceRefresh: true);

    // Register lifecycle observer to refresh push state when the app comes
    // back from the background.  The background-isolate handler may have
    // written new history to SharedPreferences while we were suspended.
    if (!_lifecycleObserving) {
      _lifecycleObserving = true;
      WidgetsBinding.instance.addObserver(this);
    }

    _initialized = true;
    _log('initialize done unread=${_unreadCountNotifier.value}');
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
    _log('listenToMessages attached');

    FirebaseMessaging.onMessage.listen((RemoteMessage message) async {
      _log(
        'onMessage id=${message.messageId ?? '-'} hasNotification=${message.notification != null} dataKeys=${message.data.keys.join(',')}',
      );
      await _storeHistoryMessage(message);
      await _showLocal(message);
    });

    FirebaseMessaging.onMessageOpenedApp.listen((RemoteMessage message) async {
      _log('onMessageOpenedApp id=${message.messageId ?? '-'}');
      await _handleTap(message);
    });

    FirebaseMessaging.instance.getInitialMessage().then((message) async {
      if (message != null) {
        _log('getInitialMessage id=${message.messageId ?? '-'}');
        await _handleTap(message);
      }
    });
  }

  Future<void> _showLocal(RemoteMessage message) async {
    // We always show a local notification on all platforms (including iOS) so
    // that onDidReceiveNotificationResponse fires when the user taps it. The
    // system foreground banner is disabled via
    // setForegroundNotificationPresentationOptions(alert: false).
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

    const AndroidNotificationDetails androidDetails =
        AndroidNotificationDetails(
          'default_channel',
          'General Notifications',
          importance: Importance.max,
          priority: Priority.high,
          playSound: true,
        );
    final DarwinNotificationDetails iosDetails = DarwinNotificationDetails();
    final NotificationDetails details = NotificationDetails(
      android: androidDetails,
      iOS: iosDetails,
    );

    try {
      // Include notification title/body in the payload so they survive the
      // round-trip through onDidReceiveNotificationResponse → _handleTap.
      final payloadData = Map<String, dynamic>.from(message.data);
      if (notification.title != null) {
        payloadData['title'] ??= notification.title;
      }
      if (notification.body != null) {
        payloadData['body'] ??= notification.body;
      }

      await _local.show(
        id: notification.hashCode,
        title: notification.title,
        body: notification.body,
        notificationDetails: details,
        payload: jsonEncode(payloadData),
      );
      _log('local notification shown id=${message.messageId ?? '-'}');
    } catch (e) {
      _log('local notification show failed: $e');
    }
  }

  void setOnTapHandler(void Function(RemoteMessage message)? onTap) {
    _onTap = onTap;
    if (_onTap != null && _pendingTapMessage != null) {
      final message = _pendingTapMessage;
      _pendingTapMessage = null;
      _onTap?.call(message!);
    }
  }

  Future<void> _handleTap(RemoteMessage message) async {
    _log('handleTap id=${message.messageId ?? '-'}');
    await _storeHistoryMessage(message);
    if (_onTap != null) {
      _onTap?.call(message);
    } else {
      _pendingTapMessage = message;
    }
  }

  Future<void> _storeHistoryMessage(RemoteMessage message) async {
    final built = _buildHistoryMessage(message);
    _log(
      'storeHistory id=${built['id']} category=${built['category']} createdAt=${built['createdAt']}',
    );
    await Preference.addPushHistoryMessage(built);
    // Use forceRefresh so the just-written history is re-read and unread count
    // (and therefore the badge) is recalculated accurately.
    await syncPushStateFromStorage(forceRefresh: true);
  }

  Future<void> updateBadgeCount(int count) async {
    final normalized = count < 0 ? 0 : count;
    _log('updateBadgeCount called count=$count normalized=$normalized');
    await Preference.setPushUnreadCount(normalized);
    _unreadCountNotifier.value = normalized;

    try {
      final supported = await FlutterAppBadger.isAppBadgeSupported();
      _log('updateBadgeCount supported=$supported');
      if (!supported) return;
      if (normalized <= 0) {
        _log('updateBadgeCount removing badge');
        await FlutterAppBadger.removeBadge();
      } else {
        _log('updateBadgeCount setting badge to $normalized');
        await FlutterAppBadger.updateBadgeCount(normalized);
      }
    } catch (e) {
      _log('updateBadgeCount error: $e');
    }
  }

  Future<void> syncPushStateFromStorage({bool forceRefresh = false}) async {
    final unread = await Preference.recalculatePushUnreadCount(
      forceRefresh: forceRefresh,
    );
    await updateBadgeCount(unread);

    final history = await Preference.getPushHistoryMessages(
      forceRefresh: forceRefresh,
    );
    final topId = history.isNotEmpty
        ? history.first['id']?.toString() ?? ''
        : '';
    final topCreatedAt = history.isNotEmpty
        ? history.first['createdAt']?.toString() ?? ''
        : '';
    final snapshot = '${history.length}:$topId:$topCreatedAt';
    _log('sync unread=$unread history=${history.length} topId=$topId');
    if (snapshot != _lastHistorySnapshot) {
      _lastHistorySnapshot = snapshot;
      _historyVersionNotifier.value = _historyVersionNotifier.value + 1;
      _log('historyVersion => ${_historyVersionNotifier.value}');
    }
  }

  Future<void> dumpStoredDebugLogs({int maxLines = 40}) async {
    final logs = await Preference.getPushDebugLogs();
    if (logs.isEmpty) {
      _log('[Stored] no logs');
      return;
    }
    final start = logs.length > maxLines ? logs.length - maxLines : 0;
    _log('[Stored] showing ${logs.length - start}/${logs.length}');
    for (var i = start; i < logs.length; i++) {
      _log('[Stored] ${logs[i]}');
    }
  }

  // ---------------------------------------------------------------------------
  // Lifecycle observer – refresh after returning from background
  // ---------------------------------------------------------------------------

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _log('app resumed – refreshing push state from disk');
      unawaited(_refreshOnResume());
    }
  }

  /// Reload SharedPreferences from disk (to pick up writes made by the
  /// background-isolate handler) and re-sync push history + badge count.
  Future<void> _refreshOnResume() async {
    try {
      await Preference.reloadFromDisk();
      // Dump stored logs so we can see background-handler activity.
      await dumpStoredDebugLogs(maxLines: 10);
      await syncPushStateFromStorage(forceRefresh: true);
    } catch (e) {
      _log('refreshOnResume error: $e');
    }
  }
}

@pragma('vm:entry-point')
Future<void> firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  // Ensure Firebase is initialized in background isolate.
  try {
    await Firebase.initializeApp(
      options: DefaultFirebaseOptions.currentPlatform,
    );
  } catch (e) {
    // Firebase may already be initialized – that is fine.
    if (kDebugMode) {
      // ignore: avoid_print
      print('[Push] background handler Firebase.initializeApp error (may be ok): $e');
    }
  }

  try {
    final logPrefix =
        '[Push] background handler id=${message.messageId ?? '-'} '
        'dataKeys=${message.data.keys.join(',')}';
    if (kDebugMode) {
      // ignore: avoid_print
      print(logPrefix);
    }
    await Preference.appendPushDebugLog(logPrefix);
    await Preference.addPushHistoryMessage(_buildHistoryMessage(message));
    await Preference.recalculatePushUnreadCount(forceRefresh: true);
    if (kDebugMode) {
      // ignore: avoid_print
      print('[Push] background handler completed successfully');
    }
    await Preference.appendPushDebugLog(
      '[Push] background handler completed successfully',
    );
  } catch (e, st) {
    if (kDebugMode) {
      // ignore: avoid_print
      print('[Push] background handler ERROR: $e\n$st');
    }
    try {
      await Preference.appendPushDebugLog('[Push] background handler ERROR: $e');
    } catch (_) {}
  }
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
  final status = data['status']?.toString() ?? '';
  final orderId = data['orderId']?.toString() ?? '';
  final symbol = data['symbol']?.toString() ?? '';
  final id = message.messageId?.trim().isNotEmpty == true
      ? message.messageId!
      : '${timestamp.microsecondsSinceEpoch}-$event-$orderId-$status-$symbol';

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
