import 'dart:async';

import 'package:google_sign_in/google_sign_in.dart';
import 'package:flutter/foundation.dart'
    show defaultTargetPlatform, TargetPlatform;
import 'config.dart';

/// Simple auth service to handle Google Sign-In and expose idToken.
class AuthService {
  AuthService._internal();
  static final AuthService instance = AuthService._internal();

  final GoogleSignIn _google = GoogleSignIn.instance;
  bool _initialized = false;

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
  Future<String?> signInWithGoogle() async {
    _idToken = null;
    try {
      await ensureInitialized();
      final GoogleSignInAccount account = await _google.authenticate();
      _currentAccount = account;
      final GoogleSignInAuthentication auth = account.authentication;
      _idToken = auth.idToken;
      return _idToken;
    } catch (e) {
      // ignore: avoid_print
      print('Google Sign-In failed: $e');
      return null;
    }
  }

  Future<void> signOut() async {
    try {
      await _google.signOut();
    } catch (_) {}
    _currentAccount = null;
    _idToken = null;
  }
}
