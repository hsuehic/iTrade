import 'dart:async';
import 'dart:developer' as developer;

import 'package:dio/dio.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'package:flutter/foundation.dart'
    show defaultTargetPlatform, TargetPlatform;
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
      clientId: defaultTargetPlatform == TargetPlatform.iOS
          ? kGoogleIosClientId
          : null,
    );
    _initialized = true;
  }

  /// Initiates Google Sign-In and returns the Google idToken string.
  Future<User?> signInWithGoogle() async {
    _idToken = null;
    try {
      await ensureInitialized();
      final GoogleSignInAccount account = await _google.authenticate();
      _currentAccount = account;
      final GoogleSignInAuthentication auth = account.authentication;
      _idToken = auth.idToken;

      // Send idToken to backend callback URL to create session
      // The server should set a session cookie in response
      await ApiClient.instance.postJson(
        '/api/auth/callback/google',
        data: {'idToken': idToken},
        options: Options(
          followRedirects: false,
          validateStatus: (int? s) => s != null && s < 500,
        ),
      );
      if (_idToken != null) {
        return await getUser();
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
    // Auth.js (NextAuth) Credentials flow: 1) fetch CSRF 2) submit form
    final Response<dynamic> csrf = await ApiClient.instance.getJson(
      '/api/auth/csrf',
      options: Options(
        followRedirects: false,
        validateStatus: (int? s) => s != null && s < 500,
      ),
    );
    final String? csrfToken = (csrf.data is Map)
        ? (csrf.data['csrfToken'] as String?)
        : null;
    if (csrfToken == null) {
      return null;
    }

    final Response<dynamic> res = await ApiClient.instance.postJson(
      // Prefer redirect=false to avoid 302; some setups may still return 302
      '/api/auth/callback/credentials?redirect=false',
      data: {
        'csrfToken': csrfToken,
        'email': email,
        'password': password,
        'callbackUrl': '/',
      },
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
      '/api/auth/session',
      options: Options(
        followRedirects: false,
        validateStatus: (int? s) => s != null && s < 500,
      ),
    );
    if (res.statusCode == 200 && res.data != null) {
      user = User(
        id: res.data['user']['id'],
        email: res.data['user']['email'],
        name: res.data['user']['name'],
        image: res.data['user']['image'],
      );
      return user;
    }
    return null;
  }

  Future<void> signOut() async {
    try {
      await _google.signOut();
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
