import 'dart:io';

import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

class NotificationService {
  NotificationService._internal();
  static final NotificationService instance = NotificationService._internal();

  final FirebaseMessaging _messaging = FirebaseMessaging.instance;
  final FlutterLocalNotificationsPlugin _local =
      FlutterLocalNotificationsPlugin();

  bool _initialized = false;

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

    // Subscribe to topics with error handling
    // Note: This may fail on iOS simulators as they don't support APNS
    try {
      await _messaging.subscribeToTopic('news');
          } catch (e) {
          }

    try {
      await _messaging.subscribeToTopic('allUsers');
          } catch (e) {
          }

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

  void listenToMessages({void Function(RemoteMessage message)? onTap}) {
    FirebaseMessaging.onMessage.listen((RemoteMessage message) {
      _showLocal(message);
    });

    FirebaseMessaging.onMessageOpenedApp.listen((RemoteMessage message) {
      if (onTap != null) onTap(message);
    });
  }

  Future<void> _showLocal(RemoteMessage message) async {
    final RemoteNotification? notification = message.notification;
    if (notification == null) return;

    const AndroidNotificationDetails androidDetails =
        AndroidNotificationDetails(
          'default_channel',
          'General Notifications',
          importance: Importance.max,
          priority: Priority.high,
          playSound: true,
        );
    const DarwinNotificationDetails iosDetails = DarwinNotificationDetails();
    const NotificationDetails details = NotificationDetails(
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
