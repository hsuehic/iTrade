import 'package:flutter/material.dart';
import 'dart:async';
import 'dart:developer' as developer;
import '../services/auth_service.dart';
import '../main.dart' show MyHomePage;
import './login.dart';

class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _fadeAnimation;
  late Animation<double> _scaleAnimation;

  @override
  void initState() {
    super.initState();

    // Initialize animations
    _controller = AnimationController(
      duration: const Duration(milliseconds: 1200),
      vsync: this,
    );

    _fadeAnimation = Tween<double>(begin: 0.0, end: 1.0).animate(
      CurvedAnimation(
        parent: _controller,
        curve: const Interval(0.0, 0.6, curve: Curves.easeIn),
      ),
    );

    _scaleAnimation = Tween<double>(begin: 0.5, end: 1.0).animate(
      CurvedAnimation(
        parent: _controller,
        curve: const Interval(0.0, 0.6, curve: Curves.easeOutBack),
      ),
    );

    // Start animation
    _controller.forward();

    // Navigate after delay
    _navigateToNextScreen();
  }

  Future<void> _navigateToNextScreen() async {
    try {
      developer.log('Starting navigation check', name: 'SplashScreen');

      // Start loading user session in parallel with animation
      final userFuture = _checkUserSession();

      // Check session status quickly first
      bool isLoggedIn = false;
      try {
        isLoggedIn = await userFuture.timeout(
          const Duration(seconds: 2),
          onTimeout: () {
            developer.log(
              'User session check timed out, treating as logged out',
              name: 'SplashScreen',
            );
            return false;
          },
        );
      } catch (e) {
        developer.log(
          'Error checking user session',
          name: 'SplashScreen',
          error: e,
        );
        isLoggedIn = false;
      }

      developer.log('Login status: $isLoggedIn', name: 'SplashScreen');

      // If already logged in (resuming from browser), skip animation delay
      // Otherwise, show full splash animation for better UX
      if (!isLoggedIn) {
        // Wait for minimum animation time for first-time visitors
        await Future.delayed(const Duration(milliseconds: 1500));
      } else {
        // Quick transition for returning users
        await Future.delayed(const Duration(milliseconds: 300));
      }

      // Check if widget is still mounted before using context
      if (!mounted) {
        developer.log(
          'Widget unmounted, skipping navigation',
          name: 'SplashScreen',
        );
        return;
      }

      // Navigate to appropriate screen with no transition animation
      try {
        await Navigator.of(context).pushReplacement(
          PageRouteBuilder(
            pageBuilder: (context, animation, secondaryAnimation) {
              return isLoggedIn
                  ? const MyHomePage(title: 'iTrade')
                  : const LoginScreen();
            },
            transitionDuration: Duration.zero, // No transition animation
            reverseTransitionDuration: Duration.zero,
            settings: RouteSettings(name: isLoggedIn ? '/home' : '/login'),
          ),
        );
        developer.log('Navigation complete', name: 'SplashScreen');
      } catch (e) {
        developer.log('Navigation failed', name: 'SplashScreen', error: e);
        // Fallback: try login route with no animation
        if (mounted) {
          Navigator.of(context).pushReplacement(
            PageRouteBuilder(
              pageBuilder: (context, animation, secondaryAnimation) {
                return const LoginScreen();
              },
              transitionDuration: Duration.zero,
              reverseTransitionDuration: Duration.zero,
              settings: const RouteSettings(name: '/login'),
            ),
          );
        }
      }
    } catch (e, stackTrace) {
      developer.log(
        'Critical error in navigation',
        name: 'SplashScreen',
        error: e,
        stackTrace: stackTrace,
      );
      // Last resort: try to navigate to login
      if (mounted) {
        try {
          Navigator.of(context).pushReplacementNamed('/login');
        } catch (_) {
          // If even this fails, we're in trouble but at least we tried
        }
      }
    }
  }

  /// Check user session by calling AuthService.getUser()
  /// This replaces the AuthGate logic for better UX
  Future<bool> _checkUserSession() async {
    try {
      developer.log('Checking user session', name: 'SplashScreen');
      final user = await AuthService.instance.getUser().timeout(
        const Duration(seconds: 5),
        onTimeout: () {
          developer.log(
            'AuthService.getUser() timed out',
            name: 'SplashScreen',
          );
          return null;
        },
      );
      final isLoggedIn = user != null;
      developer.log(
        'User session check result: $isLoggedIn',
        name: 'SplashScreen',
      );
      return isLoggedIn;
    } catch (e, stackTrace) {
      // If session check fails, treat as logged out
      developer.log(
        'Session check failed, treating as logged out',
        name: 'SplashScreen',
        error: e,
        stackTrace: stackTrace,
      );
      return false;
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    return Scaffold(
      backgroundColor: isDark
          ? const Color(0xFF121212)
          : theme.colorScheme.surface,
      body: Center(
        child: AnimatedBuilder(
          animation: _controller,
          builder: (context, child) {
            return FadeTransition(
              opacity: _fadeAnimation,
              child: ScaleTransition(
                scale: _scaleAnimation,
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    // Logo
                    Container(
                      width: 120,
                      height: 120,
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
                            color: theme.colorScheme.primary.withValues(
                              alpha: 0.3,
                            ),
                            blurRadius: 20,
                            spreadRadius: 5,
                          ),
                        ],
                      ),
                      child: Center(
                        child: ClipOval(
                          child: Image.asset(
                            'assets/images/logo-512x512.png',
                            width: 70,
                            height: 70,
                            fit: BoxFit.cover,
                            cacheWidth:
                                140, // 2x resolution for high-DPI screens
                            cacheHeight: 140,
                            errorBuilder: (context, error, stackTrace) {
                              developer.log(
                                'Failed to load logo image',
                                name: 'SplashScreen',
                                error: error,
                              );
                              // Fallback to icon if image fails to load
                              return const Icon(
                                Icons.account_balance,
                                size: 50,
                                color: Colors.white,
                              );
                            },
                          ),
                        ),
                      ),
                    ),

                    const SizedBox(height: 32),

                    // Title
                    Text(
                      'iTrade',
                      style: theme.textTheme.headlineLarge?.copyWith(
                        fontWeight: FontWeight.bold,
                        letterSpacing: 1.2,
                        color: isDark ? Colors.white : Colors.black87,
                      ),
                    ),

                    const SizedBox(height: 8),

                    // Subtitle
                    Text(
                      'Intelligent & Strategic',
                      style: theme.textTheme.bodyLarge?.copyWith(
                        color: isDark ? Colors.grey[400] : Colors.grey[600],
                        letterSpacing: 0.5,
                      ),
                    ),

                    const SizedBox(height: 48),
                  ],
                ),
              ),
            );
          },
        ),
      ),
    );
  }
}
