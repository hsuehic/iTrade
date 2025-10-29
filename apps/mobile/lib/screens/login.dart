import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:flutter_svg/svg.dart';
import 'package:ihsueh_itrade/services/auth_service.dart';
import 'package:local_auth/local_auth.dart';

import '../design/extensions/spacing_extension.dart';
import '../services/preference.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  bool _loading = false;
  String? _error;
  bool _obscurePassword = true;
  bool _isBiometricEnabled = false;
  final TextEditingController _emailController = TextEditingController();
  final TextEditingController _passwordController = TextEditingController();
  final GlobalKey<FormState> _formKey = GlobalKey<FormState>();
  final LocalAuthentication _localAuth = LocalAuthentication();

  @override
  void initState() {
    super.initState();
    _loadBiometricSetting();
  }

  bool _isNotEmpty(String? value) {
    return value != null && value.trim() != '';
  }

  Future<void> _loadBiometricSetting() async {
    final isBiometricEnabled = await Preference.getBiometricEnabled();
    setState(() {
      _isBiometricEnabled = isBiometricEnabled ?? false;
    });
    if (_isBiometricEnabled) {
      final savedEmail = await Preference.getSavedEmail();
      final savedPassword = await Preference.getSavedPassword();
      if (_isNotEmpty(savedEmail) && _isNotEmpty(savedPassword)) {
        _authenticateWithBiometric();
      }
    }
  }

  Future<void> _authenticateWithBiometric() async {
    try {
      bool canCheckBiometrics = await _localAuth.canCheckBiometrics;
      if (!canCheckBiometrics) {
        if (!mounted) return;
        _showSnack('Device does not support biometrics');
        return;
      }

      bool didAuthenticate = await _localAuth.authenticate(
        localizedReason: 'Authenticate to login',
        options: const AuthenticationOptions(biometricOnly: true),
      );

      if (didAuthenticate) {
        final savedEmail = await Preference.getSavedEmail();
        final savedPassword = await Preference.getSavedPassword();
        if (savedEmail != null && savedPassword != null) {
          _emailController.text = savedEmail;
          _passwordController.text = savedPassword;
          _handleCredentialLogin();
        }
      }
    } catch (e) {
      if (!mounted) return;
      _showSnack('Biometric error: $e');
    }
  }

  void _showSnack(String text) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          text,
          style: TextStyle(
            color: Theme.of(context).colorScheme.onPrimary.withAlpha(255),
          ),
        ),
        backgroundColor: Theme.of(context).colorScheme.onSurface.withAlpha(88),
        behavior: SnackBarBehavior.floating, // 改为悬浮样式
        margin: EdgeInsets.symmetric(
          horizontal: 20.w,  // ✅ Width-adapted
          vertical: 80,      // ✅ Fixed vertical
        ),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),  // ✅ Uniform radius
        padding: EdgeInsets.all(16.w),  // ✅ Width-adapted
        elevation: 0,
        duration: Duration(seconds: 2),
      ),
    );
  }

  Future<void> _handleGoogleSignIn() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final User? user = await AuthService.instance.signInWithGoogle();
      if (user != null) {
        if (!mounted) return;
        Navigator.of(context).pushReplacementNamed('/home');
        return;
      } else {
        final String msg = 'Login failed';
        setState(() => _error = msg);
      }
    } catch (e) {
      setState(() {
        _error = 'Login failed: $e';
      });
    } finally {
      if (mounted) {
        setState(() {
          _loading = false;
        });
      }
    }
  }

  Future<void> _handleAppleSignIn() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final User? user = await AuthService.instance.signInWithApple();
      if (user != null) {
        if (!mounted) return;
        Navigator.of(context).pushReplacementNamed('/home');
        return;
      } else {
        final String msg = 'Login failed';
        setState(() => _error = msg);
      }
    } catch (e) {
      setState(() {
        _error = 'Login failed: $e';
      });
    } finally {
      if (mounted) {
        setState(() {
          _loading = false;
        });
      }
    }
  }

  Future<void> _handleCredentialLogin() async {
    if (!_formKey.currentState!.validate()) {
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final User? user = await AuthService.instance.signInWithCredentials(
        _emailController.text.trim(),
        _passwordController.text,
      );
      if (user != null) {
        if (!mounted) return;
        Navigator.of(context).pushReplacementNamed('/home');
        await Preference.setSavedEmail(_emailController.text.trim());
        await Preference.setSavedPassword(_passwordController.text);
        return;
      }
      final String msg = 'Login failed';
      setState(() => _error = msg);
    } catch (e) {
      setState(() {
        _error = 'Login failed: $e';
      });
    } finally {
      if (mounted) {
        setState(() {
          _loading = false;
        });
      }
    }
  }

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    final spacing = Theme.of(context).extension<AppSpacing>()!;
    final isDark = theme.brightness == Brightness.dark;

    return Scaffold(
      backgroundColor: theme.scaffoldBackgroundColor,
      body: SafeArea(
        child: SingleChildScrollView(
          key: const PageStorageKey('login_scroll'),
          keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
          padding: EdgeInsets.all(spacing.md),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              SizedBox(height: spacing.lg),

              // Logo - Use fixed size for better visibility
              Container(
                width: 100,   // ✅ Fixed size
                height: 100,  // ✅ Fixed size
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  gradient: LinearGradient(
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                    colors: [
                      theme.colorScheme.primary,
                      theme.colorScheme.primary.withValues(alpha: 0.7),
                    ],
                  ),
                  boxShadow: [
                    BoxShadow(
                      color: theme.colorScheme.primary.withValues(alpha: 0.3),
                      blurRadius: 15,
                      spreadRadius: 2,
                    ),
                  ],
                ),
                child: Center(
                  child: ClipOval(
                    child: Image.asset(
                      'assets/images/logo-512x512.png',
                      width: 60,   // ✅ Fixed size
                      height: 60,  // ✅ Fixed size
                      fit: BoxFit.cover,
                      cacheWidth: 120,
                      cacheHeight: 120,
                    ),
                  ),
                ),
              ),

              SizedBox(height: spacing.lg),
              Text(
                'Welcome to iTrade',
                style: theme.textTheme.headlineMedium?.copyWith(
                  fontSize: 24.sp,  // ✅ Adaptive font size
                  fontWeight: FontWeight.bold,
                ),
                textAlign: TextAlign.center,
              ),
              SizedBox(height: spacing.sm),
              Text(
                'Please sign in to your account',
                style: theme.textTheme.bodyLarge?.copyWith(
                  fontSize: 16.sp,  // ✅ Adaptive font size
                  color: isDark ? Colors.grey[400] : Colors.grey[600],
                ),
                textAlign: TextAlign.center,
              ),
              if (_error != null) ...[
                SizedBox(height: spacing.sm),
                Container(
                  padding: EdgeInsets.symmetric(
                    horizontal: 16.w,  // ✅ Width-adapted
                    vertical: 12,      // ✅ Fixed vertical
                  ),
                  decoration: BoxDecoration(
                    color: theme.colorScheme.error.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(12),  // ✅ Uniform radius
                    border: Border.all(
                      color: theme.colorScheme.error.withValues(alpha: 0.3),
                    ),
                  ),
                  child: Text(
                    _error!,
                    style: theme.textTheme.bodyMedium?.copyWith(
                      fontSize: 14.sp,  // ✅ Adaptive font size
                      color: theme.colorScheme.error,
                    ),
                    textAlign: TextAlign.center,
                  ),
                ),
              ],
              SizedBox(height: spacing.lg),

              // Login Form Card
              Container(
                padding: EdgeInsets.all(24.w),  // ✅ Width-adapted
                decoration: BoxDecoration(
                  color: isDark
                      ? Colors.grey[900]
                      : Colors.white.withValues(alpha: 0.5),
                  borderRadius: BorderRadius.circular(16),  // ✅ Uniform radius
                  border: Border.all(
                    color: isDark
                        ? Colors.grey[850]!
                        : Colors.grey.withValues(alpha: 0.08),
                  ),
                ),
                child: Form(
                  key: _formKey,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      TextFormField(
                        controller: _emailController,
                        enabled: !_loading,
                        decoration: const InputDecoration(
                          labelText: 'Email',
                          prefixIcon: Icon(Icons.email_outlined),
                        ),
                        keyboardType: TextInputType.emailAddress,
                        validator: (value) {
                          final String v = (value ?? '').trim();
                          if (v.isEmpty) return 'Email is required';
                          if (!v.contains('@')) return 'Enter a valid email';
                          return null;
                        },
                      ),
                      const SizedBox(height: 12),
                      TextFormField(
                        controller: _passwordController,
                        enabled: !_loading,
                        decoration: InputDecoration(
                          labelText: 'Password',
                          prefixIcon: const Icon(Icons.lock_outline),
                          suffixIcon: IconButton(
                            icon: Icon(
                              _obscurePassword
                                  ? Icons.visibility
                                  : Icons.visibility_off,
                            ),
                            onPressed: () {
                              setState(
                                () => _obscurePassword = !_obscurePassword,
                              );
                            },
                          ),
                        ),
                        obscureText: _obscurePassword,
                        validator: (value) {
                          final String v = value ?? '';
                          if (v.isEmpty) return 'Password is required';
                          if (v.length < 6) return 'At least 6 characters';
                          return null;
                        },
                      ),
                      Align(
                        alignment: Alignment.centerRight,
                        child: TextButton(
                          onPressed: _loading
                              ? null
                              : () {
                                  Navigator.of(
                                    context,
                                  ).pushNamed('/forgot-password');
                                },
                          child: const Text('Forgot Password?'),
                        ),
                      ),
                      const SizedBox(height: 8),
                      SizedBox(
                        height: 48,
                        child: FilledButton(
                          onPressed: _loading ? null : _handleCredentialLogin,
                          child: Text(_loading ? 'Signing in...' : 'Sign In'),
                        ),
                      ),

                      const SizedBox(height: 24),

                      // Divider
                      Row(
                        children: [
                          Expanded(
                            child: Divider(
                              color: isDark
                                  ? Colors.grey.withValues(alpha: 0.3)
                                  : Colors.grey.withValues(alpha: 0.3),
                            ),
                          ),
                          Padding(
                            padding: EdgeInsets.symmetric(horizontal: 12.w),  // ✅ Width-adapted
                            child: Text(
                              'or continue with',
                              style: theme.textTheme.bodySmall?.copyWith(
                                fontSize: 12.sp,  // ✅ Adaptive font size
                                color: isDark
                                    ? Colors.grey[500]
                                    : Colors.grey[600],
                              ),
                            ),
                          ),
                          Expanded(
                            child: Divider(
                              color: isDark
                                  ? Colors.grey.withValues(alpha: 0.3)
                                  : Colors.grey.withValues(alpha: 0.3),
                            ),
                          ),
                        ],
                      ),

                      const SizedBox(height: 24),

                      // Social Login Buttons
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.center,
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          SizedBox(width: 12.w),  // ✅ Width-adapted
                          OutlinedButton.icon(
                            onPressed: _loading ? null : _handleAppleSignIn,
                            style: OutlinedButton.styleFrom(
                              padding: EdgeInsets.symmetric(
                                vertical: 12,      // ✅ Fixed vertical
                                horizontal: 12.w,  // ✅ Width-adapted
                              ),
                              side: BorderSide(
                                color: isDark
                                    ? Colors.grey[800]!
                                    : Colors.grey.withValues(alpha: 0.3),
                              ),
                            ),
                            icon: SvgPicture.asset(
                              'assets/icons/apple.svg',
                              width: 18.w,   // ✅ Uniform scaling
                              height: 18.w,  // ✅ Uniform scaling
                            ),
                            label: Text('Apple', style: TextStyle(fontSize: 14.sp)),  // ✅ Adaptive font
                          ),
                          SizedBox(width: 12.w),  // ✅ Width-adapted
                          OutlinedButton.icon(
                            onPressed: _loading ? null : _handleGoogleSignIn,
                            style: OutlinedButton.styleFrom(
                              padding: EdgeInsets.symmetric(
                                vertical: 12,      // ✅ Fixed vertical
                                horizontal: 12.w,  // ✅ Width-adapted
                              ),
                              side: BorderSide(
                                color: isDark
                                    ? Colors.grey[800]!
                                    : Colors.grey.withValues(alpha: 0.3),
                              ),
                            ),
                            icon: SvgPicture.asset(
                              'assets/icons/google.svg',
                              width: 18.w,   // ✅ Uniform scaling
                              height: 18.w,  // ✅ Uniform scaling
                            ),
                            label: Text('Google', style: TextStyle(fontSize: 14.sp)),  // ✅ Adaptive font
                          ),
                          SizedBox(width: 12.w),  // ✅ Width-adapted
                          // Expanded(
                          //   child: OutlinedButton.icon(
                          //     onPressed: () => _showSnack('Coming soon'),
                          //     style: OutlinedButton.styleFrom(
                          //       padding: const EdgeInsets.symmetric(
                          //         vertical: 12,
                          //       ),
                          //       side: BorderSide(
                          //         color: isDark
                          //             ? Colors.grey[800]!
                          //             : Colors.grey.withValues(alpha: 0.3),
                          //       ),
                          //     ),
                          //     icon: SvgPicture.asset(
                          //       'assets/icons/github.svg',
                          //       width: 18,
                          //       height: 18,
                          //     ),
                          //     label: const Text('Github'),
                          //   ),
                          // ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
