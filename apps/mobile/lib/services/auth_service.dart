import 'dart:async';
import 'dart:io';

import 'dart:convert';
import 'dart:math';

import 'package:dio/dio.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'package:crypto/crypto.dart';
import 'package:sign_in_with_apple/sign_in_with_apple.dart';

import 'api_client.dart';
import 'config.dart';
import 'notification.dart';

class OperationResult {
  final bool success;
  final String? message;

  OperationResult({required this.success, this.message});
}

class User {
  final String? id;
  final String email;
  final String name;
  final String? image;

  User({
    required this.id,
    required this.email,
    required this.name,
    required this.image,
  });
}

/// Simple auth service to handle Google Sign-In and expose idToken.
class AuthService {
  AuthService._internal();
  static final AuthService instance = AuthService._internal();

  final GoogleSignIn _google = GoogleSignIn.instance;
  bool _initialized = false;
  User? user;

  GoogleSignInAccount? _currentAccount;
  String? _idToken;

  GoogleSignInAccount? get currentAccount => _currentAccount;
  String? get idToken => _idToken;

  String _generateNonce([int length = 32]) {
    const charset =
        '0123456789ABCDEFGHIJKLMNOPQRSTUVXYZabcdefghijklmnopqrstuvwxyz-._';
    final random = Random.secure();
    return List.generate(
      length,
      (_) => charset[random.nextInt(charset.length)],
    ).join();
  }

  String _sha256ofString(String input) {
    final bytes = utf8.encode(input);
    final digest = sha256.convert(bytes);
    return digest.toString();
  }

  Future<User?> signInWithApple() async {
    final rawNonce = _generateNonce();
    final nonceHash = _sha256ofString(rawNonce);

    final credential = await SignInWithApple.getAppleIDCredential(
      scopes: [
        AppleIDAuthorizationScopes.email,
        AppleIDAuthorizationScopes.fullName,
      ],
      nonce: nonceHash,
      // Android需要webAuthenticationOptions来处理浏览器OAuth回调
      // iOS使用原生API，不需要此参数（会被自动忽略）
      webAuthenticationOptions: Platform.isAndroid
          ? WebAuthenticationOptions(
              clientId: 'com.ihsueh.itrade.web',
              redirectUri: Uri.parse(
                'https://itrade.ihsueh.com/callbacks/sign_in_with_apple',
              ),
            )
          : null,
    );

    // final dio = Dio(
    //   BaseOptions(
    //     baseUrl: 'https://itrade.ihsueh.com/api', // your Next.js backend
    //     validateStatus: (status) => status! < 500,
    //   ),
    // );
    // // Use Dio directly to send form-encoded data (not JSON)
    // // Send ID token to your server
    // // Send identityToken to your Better Auth backend
    // final response = await dio.post(
    //   '/auth/signin/apple',
    //   data: {
    //     'idToken': credential.identityToken,
    //     'authorizationCode': credential.authorizationCode,
    //     'rawNonce': rawNonce,
    //   },
    // );

    // Send identityToken to your Better Auth backend
    final response = await ApiClient.instance.postJson(
      '/api/mobile/sign-in/social',
      data: {
        'provider': 'apple',
        'idToken': credential.identityToken,
        'authorizationCode': credential.authorizationCode,
        'rawNonce': rawNonce,
      },
    );

    if (response.statusCode == 200) {
      final res = await getUser();
      // Best-effort: avoid blocking login on push registration.
      unawaited(
        NotificationService.instance.syncDeviceTokenToServer(force: true),
      );
      return res;
    } else {
      return null;
    }
  }

  Future<void> ensureInitialized() async {
    if (_initialized) return;

    await _google.initialize(
      clientId: Platform.isIOS
          ? kGoogleIosClientId
          : Platform.isAndroid
          ? kGoogleAndroidClientId
          : kGoogleWebClientId,
      serverClientId: kGoogleWebClientId,
    );
    _initialized = true;
  }

  /// Initiates Google Sign-In and returns the Google idToken string.
  Future<User?> signInWithGoogle() async {
    _idToken = null;
    try {
      await ensureInitialized();
      final account = await _google.authenticate(
        scopeHint: ['email', 'profile'],
      );
      _currentAccount = account;
      final GoogleSignInAuthentication auth = account.authentication;
      _idToken = auth.idToken;

      // For Auth.js v5, we still need to send the ID token but in the correct format
      // The serverClientId ensures the token is valid for server-side verification
      if (_idToken == null) {
        return null;
      }

      // Send ID token to Auth.js callback URL
      // Auth.js v5 with serverClientId should accept ID tokens for mobile apps
      final Map<String, dynamic> callbackData = {'idToken': _idToken};

      // Use Dio directly to send form-encoded data (not JSON)
      // Send ID token to your server
      final response = await ApiClient.instance.postJson(
        '/api/mobile/sign-in/social',
        data: {'provider': 'google', 'idToken': idToken},
      );

      final List<String>? setCookies = response.headers.map['set-cookie'];
      // Cookies are set automatically by Dio

      // Check if callback was successful
      if (response.statusCode != 200) {
        return null;
      } else {
        final res = await getUser();
        // Best-effort: avoid blocking login on push registration.
        unawaited(
          NotificationService.instance.syncDeviceTokenToServer(force: true),
        );
        return res;
      }

      return null;
    } catch (e, st) {
      return null;
    }
  }

  Future<OperationResult?> deleteAccount() async {
    try {
      final result = await ApiClient.instance.delete<dynamic>(
        '/api/mobile/delete-account',
      );
      if (result.data == null) {
        return null;
      }
      if (result.data is! Map) {
        return null;
      }
      final Map<String, dynamic> data = result.data;
      return OperationResult(
        success: data['success'] as bool,
        message: data['message']?.toString(),
      );
    } catch (error) {
      return null;
    }
  }

  Future<User?> signInWithCredentials(String email, String password) async {
    final csrfRes = await ApiClient.instance.getJson(
      '/api/mobile/sign-in/csrf',
    );
    final csrfToken = csrfRes.data['csrfToken'];

    final Response<dynamic> res = await ApiClient.instance.postJson(
      // Prefer redirect=false to avoid 302; some setups may still return 302
      '/api/mobile/sign-in/email',
      data: {'email': email, 'password': password},
      options: Options(
        followRedirects: false,
        validateStatus: (int? s) => s != null && s < 500,
        contentType: Headers.jsonContentType,
        headers: <String, dynamic>{
          'X-Auth-Return-Redirect': '1',
          'Accept': 'application/json',
          'X-CSRF-Token': csrfToken,
        },
      ),
    );
    if (res.statusCode == 200) {
      final user = await getUser();
      // Best-effort: avoid blocking login on push registration.
      unawaited(
        NotificationService.instance.syncDeviceTokenToServer(force: true),
      );
      return user;
    }
    return null;
  }

  Future<User?> getUser() async {
    try {
      final Response<dynamic> res = await ApiClient.instance.getJson(
        '/api/auth/get-session',
        options: Options(
          followRedirects: false,
          validateStatus: (int? s) => s != null && s < 500,
        ),
      );

      if (res.data == null) {
        return null;
      }

      if (res.statusCode != 200) {
        return null;
      }

      // Check if response data has the expected structure
      if (res.data is! Map) {
        return null;
      }

      final Map<String, dynamic> responseData =
          res.data as Map<String, dynamic>;
      if (!responseData.containsKey('user')) {
        return null;
      }

      final dynamic userData = responseData['user'];
      if (userData is! Map) {
        return null;
      }

      final Map<String, dynamic> userMap = userData as Map<String, dynamic>;

      user = User(
        id: userMap['id']?.toString(),
        email: userMap['email']?.toString() ?? '',
        name: userMap['name']?.toString() ?? '',
        image: userMap['image']?.toString(),
      );
      return user;
    } catch (e, st) {
      return null;
    }
  }

  Future<void> signOut() async {
    try {
      await _google.signOut();
      await ApiClient.instance.postJson(
        '/api/auth/sign-out',
        options: Options(
          followRedirects: false,
          validateStatus: (int? s) => s != null && s < 500,
        ),
      );
      ApiClient.instance.clearCookies();
    } catch (e, st) {}
    _currentAccount = null;
    _idToken = null;
    user = null;
  }
}
