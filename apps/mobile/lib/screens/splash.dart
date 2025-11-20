import 'package:flutter/material.dart';
import 'dart:async';
import 'package:flutter_screenutil/flutter_screenutil.dart';
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
      
      // Start loading user session in parallel with animation
      final userFuture = _checkUserSession();

      // Check session status quickly first
      bool isLoggedIn = false;
      try {
        isLoggedIn = await userFuture.timeout(
          const Duration(seconds: 2),
          onTimeout: () {
                        return false;
          },
        );
      } catch (e) {
                isLoggedIn = false;
      }

      
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
              } catch (e) {
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
            final user = await AuthService.instance.getUser().timeout(
        const Duration(seconds: 5),
        onTimeout: () {
                    return null;
        },
      );
      final isLoggedIn = user != null;
            return isLoggedIn;
    } catch (e, stackTrace) {
      // If session check fails, treat as logged out
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
                    // Logo - Use fixed size for better visibility
                    Container(
                      width: 140,   // ✅ Fixed size
                      height: 140,  // ✅ Fixed size
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
                            blurRadius: 20,  // Fixed value
                            spreadRadius: 5,  // Fixed value
                          ),
                        ],
                      ),
                      child: Center(
                        child: ClipOval(
                          child: Image.asset(
                            'assets/images/logo-512x512.png',
                            width: 85,   // ✅ Fixed size
                            height: 85,  // ✅ Fixed size
                            fit: BoxFit.cover,
                            cacheWidth:
                                170, // 2x resolution for high-DPI screens
                            cacheHeight: 170,
                            errorBuilder: (context, error, stackTrace) {
                                                            // Fallback to icon if image fails to load
                              return Icon(
                                Icons.account_balance,
                                size: 60,  // ✅ Fixed size
                                color: Colors.white,
                              );
                            },
                          ),
                        ),
                      ),
                    ),

                    const SizedBox(height: 32),  // ✅ Fixed vertical spacing

                    // Title - Use .sp for font size
                    Text(
                      'iTrade',
                      style: theme.textTheme.headlineLarge?.copyWith(
                        fontSize: 32.sp,  // ✅ Adaptive font size
                        fontWeight: FontWeight.bold,
                        letterSpacing: 1.2,
                        color: isDark ? Colors.white : Colors.black87,
                      ),
                    ),

                    const SizedBox(height: 8),  // ✅ Fixed vertical spacing

                    // Subtitle
                    Text(
                      'Intelligent & Strategic',
                      style: theme.textTheme.bodyLarge?.copyWith(
                        fontSize: 16.sp,  // ✅ Adaptive font size
                        color: isDark ? Colors.grey[400] : Colors.grey[600],
                        letterSpacing: 0.5,
                      ),
                    ),

                    const SizedBox(height: 48),  // ✅ Fixed vertical spacing
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
