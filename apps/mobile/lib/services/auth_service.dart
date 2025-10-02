import 'dart:async';
import 'dart:developer' as developer;
import 'dart:io';

import 'package:dio/dio.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'api_client.dart';
import 'config.dart';

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

      developer.log(
        'Google idToken length: \'${_idToken?.length}\'',
        name: 'AuthService',
      );

      // For Auth.js v5, we still need to send the ID token but in the correct format
      // The serverClientId ensures the token is valid for server-side verification
      if (_idToken == null) {
        developer.log(
          'No ID token received from Google Sign-In',
          name: 'AuthService',
        );
        return null;
      }

      // Send ID token to Auth.js callback URL
      // Auth.js v5 with serverClientId should accept ID tokens for mobile apps
      final Map<String, dynamic> callbackData = {'idToken': _idToken};
      developer.log(
        'Sending callback data: $callbackData',
        name: 'AuthService',
      );

      // Use Dio directly to send form-encoded data (not JSON)
      // Send ID token to your server
      final response = await ApiClient.instance.postJson(
        '/api/mobile/sign-in/social',
        data: {'provider': 'google', 'idToken': idToken},
      );

      developer.log(
        'Callback response status: ${response.statusCode}',
        name: 'AuthService',
      );
      developer.log(
        'Callback response data: ${response.data}',
        name: 'AuthService',
      );
      developer.log(
        'Callback response headers: ${response.headers.map}',
        name: 'AuthService',
      );

      final List<String>? setCookies = response.headers.map['set-cookie'];
      if (setCookies != null && setCookies.isNotEmpty) {
        developer.log(
          'Set-Cookie received (${setCookies.length}): ${setCookies.join('; ')}',
          name: 'AuthService',
        );
      } else {
        developer.log(
          'No Set-Cookie header on callback response',
          name: 'AuthService',
        );
      }

      // Check if callback was successful
      if (response.statusCode != 200) {
        developer.log(
          'Callback failed with status ${response.statusCode}: ${response.data}',
          name: 'AuthService',
        );
      }
      // Dump cookies stored for base URL
      try {
        final List<Cookie> cookies = await ApiClient.instance
            .debugLoadCookiesForBaseUrl();
        if (cookies.isEmpty) {
          developer.log(
            'Cookie jar is empty after callback',
            name: 'AuthService',
          );
        } else {
          developer.log(
            'Cookie jar contains: ${cookies.map((Cookie c) => '${c.name}=${c.value};Domain=${c.domain ?? ''};Path=${c.path ?? ''}').join(', ')}',
            name: 'AuthService',
          );
        }
      } catch (e) {
        developer.log('Failed to read cookie jar: $e', name: 'AuthService');
      }
      if (response.statusCode == 200) {
        final res = await getUser();
        return res;
      }

      return null;
    } catch (e, st) {
      developer.log(
        'Google Sign-In failed',
        name: 'AuthService',
        error: e,
        stackTrace: st,
      );
      return null;
    }
  }

  Future<User?> signInWithCredentials(String email, String password) async {
    final Response<dynamic> res = await ApiClient.instance.postJson(
      // Prefer redirect=false to avoid 302; some setups may still return 302
      '/api/mobile/sign-in/email',
      data: {'email': email, 'password': password},
      options: Options(
        followRedirects: false,
        validateStatus: (int? s) => s != null && s < 500,
        contentType: Headers.formUrlEncodedContentType,
        headers: <String, dynamic>{
          'X-Auth-Return-Redirect': '1',
          'Accept': 'application/json',
        },
      ),
    );
    if (res.statusCode == 200) {
      return await getUser();
    }
    return null;
  }

  Future<User?> getUser() async {
    final Response<dynamic> res = await ApiClient.instance.getJson(
      '/api/auth/get-session',
      options: Options(
        followRedirects: false,
        validateStatus: (int? s) => s != null && s < 500,
      ),
    );
    developer.log(
      'Session response status: ${res.statusCode}',
      name: 'AuthService',
    );
    developer.log(
      'Session response headers: ${res.headers.map}',
      name: 'AuthService',
    );
    developer.log('Session response data: ${res.data}', name: 'AuthService');
    developer.log(
      'Session response data type: ${res.data.runtimeType}',
      name: 'AuthService',
    );

    if (res.data == null) {
      developer.log('Session response body is null', name: 'AuthService');
      return null;
    }

    if (res.statusCode != 200) {
      developer.log(
        'Session response failed with status ${res.statusCode}: ${res.data}',
        name: 'AuthService',
      );
      return null;
    }

    // Check if response data has the expected structure
    if (res.data is! Map) {
      developer.log(
        'Session response data is not a Map: ${res.data}',
        name: 'AuthService',
      );
      return null;
    }

    final Map<String, dynamic> responseData = res.data as Map<String, dynamic>;
    if (!responseData.containsKey('user')) {
      developer.log(
        'Session response missing "user" key: ${responseData.keys.toList()}',
        name: 'AuthService',
      );
      return null;
    }

    final dynamic userData = responseData['user'];
    if (userData is! Map) {
      developer.log('User data is not a Map: $userData', name: 'AuthService');
      return null;
    }

    final Map<String, dynamic> userMap = userData as Map<String, dynamic>;
    developer.log(
      'User data keys: ${userMap.keys.toList()}',
      name: 'AuthService',
    );

    try {
      user = User(
        id: userMap['id']?.toString(),
        email: userMap['email']?.toString() ?? '',
        name: userMap['name']?.toString() ?? '',
        image: userMap['image']?.toString(),
      );
      developer.log(
        'Successfully created user: ${user?.email}',
        name: 'AuthService',
      );
      return user;
    } catch (e, st) {
      developer.log(
        'Failed to create User object from response data',
        name: 'AuthService',
        error: e,
        stackTrace: st,
      );
      developer.log('Raw user data: $userMap', name: 'AuthService');
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
    } catch (e, st) {
      developer.log(
        'Google Sign-Out failed',
        name: 'AuthService',
        error: e,
        stackTrace: st,
      );
    }
    _currentAccount = null;
    _idToken = null;
  }
}
