# Firebase Messaging iOS Simulator Fix

## Issue

When running the iTrade mobile app on iOS simulators, you may encounter this error:

```
[ERROR:flutter/runtime/dart_vm_initializer.cc(40)] Unhandled Exception: 
[firebase_messaging/apns-token-not-set] APNS token has not been received on the device yet. 
Please ensure the APNS token is available before calling `getAPNSToken()`.
```

## Root Cause

iOS simulators **do not support Apple Push Notification Service (APNS)**. This means:

- ❌ APNS tokens cannot be obtained
- ❌ Push notifications cannot be received
- ❌ Topic subscriptions fail (they require APNS tokens)
- ❌ `getToken()` calls fail

This is a **limitation of iOS simulators**, not a bug in your code.

## Solution

The issue has been fixed by adding proper error handling in the `NotificationService` class:

### Changes Made

**File**: `lib/services/notification.dart`

#### 1. Topic Subscriptions with Error Handling

```dart
// Before (would crash on simulator)
_messaging.subscribeToTopic('news');
_messaging.subscribeToTopic('allUsers');

// After (gracefully handles simulator limitation)
try {
  await _messaging.subscribeToTopic('news');
  developer.log('Subscribed to topic: news', name: 'NotificationService');
} catch (e) {
  developer.log(
    'Failed to subscribe to topic: news (this is expected on iOS simulator)',
    name: 'NotificationService',
    error: e,
  );
}
```

#### 2. Device Token with Error Handling

```dart
// Before (would crash on simulator)
Future<String?> getDeviceToken() async {
  return _messaging.getToken();
}

// After (returns null on simulator)
Future<String?> getDeviceToken() async {
  try {
    return await _messaging.getToken();
  } catch (e) {
    developer.log(
      'Failed to get device token (this is expected on iOS simulator)',
      name: 'NotificationService',
      error: e,
    );
    return null;
  }
}
```

#### 3. Notification Presentation Options with Error Handling

```dart
if (Platform.isIOS || Platform.isMacOS) {
  try {
    await _messaging.setForegroundNotificationPresentationOptions(
      alert: true,
      badge: true,
      sound: true,
    );
  } catch (e) {
    developer.log(
      'Failed to set notification presentation options',
      name: 'NotificationService',
      error: e,
    );
  }
}
```

## Testing

### On iOS Simulator (Development)

The app now runs **without crashes** on iOS simulators:

```bash
cd apps/mobile

# Run on simulator
flutter run -d "iPad Pro (12.9-inch) (6th generation)"

# Expected output (no errors):
# ✓ App starts successfully
# ✓ No unhandled exceptions
# ✓ Logs show graceful handling:
#   "Failed to subscribe to topic: news (this is expected on iOS simulator)"
```

### On Real iOS Device (Production)

Push notifications work **normally** on real devices:

```bash
# Run on connected iPhone/iPad
flutter run -d "iPhone"

# Expected output:
# ✓ APNS token received
# ✓ Topics subscribed successfully
# ✓ Push notifications work
# ✓ Device token obtained
```

## Verification

After the fix, you should see these logs instead of errors:

```
[log] NotificationService: Subscribed to topic: news
[log] NotificationService: Subscribed to topic: allUsers
[log] NotificationService: FCM token: <token>
```

Or on simulator:

```
[log] NotificationService: Failed to subscribe to topic: news 
      (this is expected on iOS simulator)
[log] NotificationService: Failed to subscribe to topic: allUsers 
      (this is expected on iOS simulator)
[log] NotificationService: Failed to get device token 
      (this is expected on iOS simulator)
```

## Best Practices

### When Developing with Firebase Messaging

1. ✅ **Always wrap Firebase messaging calls in try-catch**
2. ✅ **Handle simulator limitations gracefully**
3. ✅ **Log errors with context** (e.g., "this is expected on simulator")
4. ✅ **Test on real devices** for push notification features
5. ✅ **Use developer.log** instead of print for production code

### Error Handling Pattern

```dart
// ✅ Good: Graceful error handling
try {
  await _messaging.someOperation();
  developer.log('Operation succeeded', name: 'Service');
} catch (e) {
  developer.log(
    'Operation failed (explain why this might be expected)',
    name: 'Service',
    error: e,
  );
}

// ❌ Bad: No error handling
await _messaging.someOperation(); // Crashes on simulator
```

## Related Documentation

- [Firebase Messaging - Flutter](https://firebase.google.com/docs/cloud-messaging/flutter/client)
- [Apple Push Notification Service](https://developer.apple.com/documentation/usernotifications)
- [iOS Simulator Limitations](https://developer.apple.com/documentation/xcode/running-your-app-in-simulator-or-on-a-device)

## Summary

✅ **Fixed**: iOS simulator no longer crashes due to Firebase messaging errors  
✅ **Tested**: App builds and runs successfully on simulator  
✅ **Production**: Push notifications continue to work on real devices  
✅ **Logging**: Clear logs indicate expected behavior on simulator  

The app now handles iOS simulator limitations gracefully while maintaining full push notification functionality on real devices! 🎉

---

Author: xiaoweihsueh@gmail.com  
Date: November 10, 2025

