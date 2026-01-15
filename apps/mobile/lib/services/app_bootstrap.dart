import 'dart:async';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';

import '../constant/network.dart';
import '../firebase_options.dart';
import 'api_client.dart';
import 'notification.dart';
import 'preference.dart';
import 'theme_service.dart';

class AppBootstrap {
  AppBootstrap._internal();

  static final AppBootstrap instance = AppBootstrap._internal();

  Future<void>? _bootstrapFuture;
  final Completer<void> _apiClientReady = Completer<void>();
  void Function(RemoteMessage message)? _notificationTapHandler;

  final ValueNotifier<bool> firebaseReady = ValueNotifier<bool>(false);
  bool _firebaseReady = false;

  Future<void> start() {
    _bootstrapFuture ??= _run();
    return _bootstrapFuture!;
  }

  Future<void> ensureApiClientReady({
    Duration timeout = const Duration(seconds: 5),
  }) async {
    start();
    try {
      await _apiClientReady.future.timeout(timeout);
    } catch (_) {}
  }

  void setNotificationTapHandler(void Function(RemoteMessage message)? handler) {
    _notificationTapHandler = handler;
  }

  Future<void> _run() async {
    await _initFirebaseAndNotifications();
    await _initApiClient();
    await _syncPushToken();
    await _initTheme();
  }

  Future<void> _initFirebaseAndNotifications() async {
    if (_firebaseReady) return;
    try {
      await Firebase.initializeApp(
        options: DefaultFirebaseOptions.currentPlatform,
      ).timeout(
        const Duration(seconds: 10),
        onTimeout: () {
          throw TimeoutException('Firebase initialization timed out');
        },
      );
      _firebaseReady = true;
      firebaseReady.value = true;
    } catch (_) {
      return;
    }

    try {
      FirebaseMessaging.onBackgroundMessage(
        firebaseMessagingBackgroundHandler,
      );
      await NotificationService.instance.initialize().timeout(
        const Duration(seconds: 5),
      );
      await NotificationService.instance.requestPermissions().timeout(
        const Duration(seconds: 5),
      );
      NotificationService.instance.listenToMessages(
        onTap: _notificationTapHandler,
      );
      await NotificationService.instance.getDeviceToken();
      await NotificationService.instance.ensureTopicSubscriptions();
    } catch (_) {
      // Best-effort only.
    }
  }

  Future<void> _initApiClient() async {
    try {
      final String? savedBaseUrl = await Preference.getApiBaseUrl();
      final String resolvedBaseUrl = NetworkParameter.resolveBaseUrl(
        savedBaseUrl,
      );
      final String resolvedOrigin = Uri.parse(resolvedBaseUrl).host;
      debugPrint('iTrade API_BASE_URL => $resolvedBaseUrl');
      await ApiClient.instance
          .init(
            baseUrl: resolvedBaseUrl,
            // Allow handshake during development if the cert is self-signed/misconfigured
            insecureAllowBadCertForHosts: <String>[resolvedOrigin],
          )
          .timeout(
            const Duration(seconds: 10),
            onTimeout: () {
              throw TimeoutException('API Client initialization timed out');
            },
          );
    } catch (_) {
      // Continue app boot even if API init fails.
    } finally {
      if (!_apiClientReady.isCompleted) {
        _apiClientReady.complete();
      }
    }
  }

  Future<void> _syncPushToken() async {
    if (!_firebaseReady) return;
    try {
      await NotificationService.instance.syncDeviceTokenToServer().timeout(
        const Duration(seconds: 5),
      );
    } catch (_) {
      // Best-effort only.
    }
  }

  Future<void> _initTheme() async {
    try {
      await ThemeService.instance.init().timeout(const Duration(seconds: 3));
    } catch (_) {
      // Continue with default theme.
    }
  }
}
