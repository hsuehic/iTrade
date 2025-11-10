import 'dart:async';
import 'dart:developer' as developer;
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_analytics/firebase_analytics.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:ihsueh_itrade/screens/portfolio.dart';
import 'package:ihsueh_itrade/screens/qr_scan.dart';
import 'package:ihsueh_itrade/screens/satistics.dart';
import 'package:ihsueh_itrade/services/auth_service.dart';
import 'package:ihsueh_itrade/utils/responsive_layout.dart';
import 'constant/network.dart';
import 'design/themes/theme.dart';

import 'services/api_client.dart';
import 'services/notification.dart';
import 'services/theme_service.dart';
import 'screens/splash.dart';
import 'screens/login.dart';
import 'screens/forgot_password.dart';
import 'screens/strategy.dart';
import 'screens/product.dart';
import 'screens/profile.dart';
import 'widgets/design_bottom_nav.dart';
import 'widgets/app_sidebar.dart';

import 'firebase_options.dart';

Future<void> main() async {
  // Wrap entire initialization in try-catch to prevent white screen
  try {
    WidgetsFlutterBinding.ensureInitialized();
    developer.log('App initializing...', name: 'main');

    // Firebase initialization with timeout
    bool firebaseReady = false;
    try {
      await Firebase.initializeApp(
        options: DefaultFirebaseOptions.currentPlatform,
      ).timeout(
        const Duration(seconds: 10),
        onTimeout: () {
          developer.log('Firebase init timeout', name: 'main');
          throw TimeoutException('Firebase initialization timed out');
        },
      );
      firebaseReady = true;
      developer.log('Firebase initialized', name: 'main');
    } catch (e) {
      // If config files are missing, keep app running and log a hint.
      // Add GoogleService-Info.plist (iOS) and google-services.json (Android), or configure via FlutterFire.
      developer.log('Firebase initialization failed', name: 'main', error: e);
    }

    // Firebase messaging setup (non-blocking)
    if (firebaseReady) {
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
        NotificationService.instance.listenToMessages();
        final token = await NotificationService.instance.getDeviceToken();
        developer.log('FCM token: $token', name: 'main');
      } catch (e) {
        developer.log('Notification setup failed', name: 'main', error: e);
      }
    }

    // API Client initialization with timeout
    try {
      await ApiClient.instance
          .init(
            baseUrl: NetworkParameter.host,
            // Allow handshake during development if the cert is self-signed/misconfigured
            insecureAllowBadCertForHosts: const <String>[
              NetworkParameter.origin,
            ],
          )
          .timeout(
            const Duration(seconds: 10),
            onTimeout: () {
              developer.log('ApiClient init timeout', name: 'main');
              throw TimeoutException('API Client initialization timed out');
            },
          );
      developer.log('ApiClient initialized', name: 'main');
    } catch (e) {
      developer.log('ApiClient init failed', name: 'main', error: e);
      // Continue app launch even if API init fails
    }

    // Initialize theme service (should be fast)
    try {
      await ThemeService.instance.init().timeout(const Duration(seconds: 3));
      developer.log('ThemeService initialized', name: 'main');
    } catch (e) {
      developer.log('ThemeService init failed', name: 'main', error: e);
      // Continue with default theme
    }

    developer.log('App initialization complete', name: 'main');
    runApp(const MyApp());
  } catch (e, stackTrace) {
    // Last resort error handler - log and try to show error screen
    developer.log(
      'Critical error during app initialization',
      name: 'main',
      error: e,
      stackTrace: stackTrace,
    );
    // Still try to run app with error screen
    runApp(
      MaterialApp(
        home: Scaffold(
          backgroundColor: Colors.white,
          body: Center(
            child: Padding(
              padding: const EdgeInsets.all(24.0),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Icon(Icons.error_outline, color: Colors.red, size: 64),
                  const SizedBox(height: 24),
                  const Text(
                    'Failed to start iTrade',
                    style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(height: 16),
                  Text(
                    'Error: ${e.toString()}',
                    textAlign: TextAlign.center,
                    style: const TextStyle(fontSize: 14, color: Colors.grey),
                  ),
                  const SizedBox(height: 24),
                  ElevatedButton(
                    onPressed: () {
                      // Try to restart
                      SystemChannels.platform.invokeMethod(
                        'SystemNavigator.pop',
                      );
                    },
                    child: const Text('Restart App'),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class MyApp extends StatefulWidget {
  const MyApp({super.key});

  // This widget is the root of your application.
  @override
  State<MyApp> createState() => _MyAppState();
}

class _MyAppState extends State<MyApp> with WidgetsBindingObserver {
  // Track if we're resuming from background (to avoid showing splash again)
  static bool _hasInitialized = false;
  // 获取 Firebase Analytics 实例
  static FirebaseAnalytics analytics = FirebaseAnalytics.instance;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    super.didChangeAppLifecycleState(state);
    if (state == AppLifecycleState.resumed) {
      // Mark as initialized when app resumes (e.g., from browser)
      _hasInitialized = true;
    }
  }

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<ThemeMode>(
      valueListenable: ThemeService.instance.themeMode,
      builder: (context, themeMode, child) {
        // Initialize ScreenUtil with responsive design sizes
        // - Phone: 375x10000 (iPhone SE/8 as standard, height disabled)
        // - Tablet: 768x10000 (iPad as standard, height disabled)
        // - Desktop: 1440x10000 (Desktop standard, height disabled)
        // Height is set to large value to effectively disable height scaling
        return ScreenUtilInit(
          designSize: _getDesignSize(context),
          // Minimum text adapt size (prevents text from being too small)
          minTextAdapt: true,
          // Split screen mode support
          splitScreenMode: true,
          builder: (context, child) {
            return MaterialApp(
              title: 'iTrade',
              navigatorObservers: [
                FirebaseAnalyticsObserver(
                  analytics: analytics,
                ), // 自动追踪 screen_view
              ],

              theme: AppTheme.brand,
              darkTheme: AppTheme.dark,
              themeMode: themeMode,
              // Only show splash on first cold start, not when resuming from background
              home: _hasInitialized ? const AuthGate() : const SplashScreen(),
              routes: {
                '/login': (_) => const LoginScreen(),
                '/forgot-password': (_) => const ForgotPasswordScreen(),
                '/home': (_) => const MyHomePage(title: 'iTrade'),
                '/scan-qr': (_) => const QrScanScreen(),
                '/profile': (_) => const ProfileScreen(),
              },
              onGenerateRoute: (settings) {
                // Handle deep links and external navigation
                developer.log(
                  'onGenerateRoute: ${settings.name}',
                  name: 'MyApp',
                );
                return null; // Use default route handling
              },
            );
          },
        );
      },
    );
  }

  /// Get responsive design size based on device width
  Size _getDesignSize(BuildContext context) {
    // For initial build, use MediaQuery directly
    final width = MediaQuery.of(context).size.width;

    // Determine design size based on device width
    if (width < ResponsiveLayout.phoneBreakpoint) {
      // Phone: 375x10000 (iPhone SE/8 standard)
      return const Size(375, 10000);
    } else if (width < ResponsiveLayout.tabletBreakpoint) {
      // Tablet: 768x10000 (iPad standard)
      return const Size(768, 10000);
    } else {
      // Desktop: 1440x10000 (Desktop standard)
      return const Size(1440, 10000);
    }
  }
}

class AuthGate extends StatefulWidget {
  const AuthGate({super.key});

  @override
  State<AuthGate> createState() => _AuthGateState();
}

class _AuthGateState extends State<AuthGate> {
  bool _loading = true;
  bool _hasSession = false;

  @override
  void initState() {
    super.initState();
    _checkSession();
  }

  Future<void> _checkSession() async {
    try {
      final User? user = await AuthService.instance.getUser();
      final bool ok = user != null;
      if (!mounted) return;
      setState(() {
        _hasSession = ok;
        _loading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _hasSession = false;
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    return _hasSession
        ? const MyHomePage(title: 'iTrade')
        : const LoginScreen();
  }
}

class MyHomePage extends StatefulWidget {
  const MyHomePage({super.key, required this.title});

  // This widget is the home page of your application. It is stateful, meaning
  // that it has a State object (defined below) that contains fields that affect
  // how it looks.

  // This class is the configuration for the state. It holds the values (in this
  // case the title) provided by the parent (in this case the App widget) and
  // used by the build method of the State. Fields in a Widget subclass are
  // always marked "final".

  final String title;

  @override
  State<MyHomePage> createState() => _MyHomePageState();
}

class _MyHomePageState extends State<MyHomePage> {
  int _pageIndex = 0;
  late final List<Widget> _pages;
  late final List<_NavItem> _navItems;
  StreamSubscription? _linkSubscription;

  @override
  void initState() {
    super.initState();
    // Initialize pages once to maintain their state
    _pages = [
      const PortfolioScreen(),
      const StrategyScreen(),
      const ProductScreen(),
      const StatisticsScreen(),
      const ProfileScreen(),
    ];

    // Navigation items for both bottom bar and rail
    _navItems = [
      _NavItem(icon: Icons.pie_chart, label: 'Portfolio'),
      _NavItem(icon: Icons.calculate, label: 'Strategy'),
      _NavItem(icon: Icons.widgets, label: 'Product'),
      _NavItem(icon: Icons.analytics, label: 'Statistics'),
      _NavItem(icon: Icons.manage_accounts, label: 'Profile'),
    ];
    
    // Debug: Print device info after first frame
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) {
        ResponsiveLayout.printDeviceInfo(context);
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    // Use different layouts for phone vs tablet
    final screenWidth = MediaQuery.of(context).size.width;
    final screenHeight = MediaQuery.of(context).size.height;
    final isTablet = ResponsiveLayout.isTablet(context);
    
    // iPad detection: Use sidebar if screen is large enough OR if it's clearly iPad dimensions
    // iPad Pro 13": 1024x1366 (portrait), 1366x1024 (landscape)
    // iPad Pro 11": 834x1194 (portrait), 1194x834 (landscape)
    final isLargeScreen = screenWidth >= 600 || 
                          (screenWidth > 800 && screenHeight > 1000) ||
                          (screenWidth > 1000 && screenHeight > 800);
    
    final shouldUseSidebar = isTablet || isLargeScreen;
    
    // Debug: Print device info to understand layout detection
    developer.log(
      'Screen: ${screenWidth.toStringAsFixed(0)}x${screenHeight.toStringAsFixed(0)}, '
      'isTablet: $isTablet, isLargeScreen: $isLargeScreen, '
      'shouldUseSidebar: $shouldUseSidebar',
      name: 'MyHomePage',
    );

    if (shouldUseSidebar) {
      // Tablet layout: Modern sidebar navigation
      return Scaffold(
        resizeToAvoidBottomInset: false,
        appBar: null,
        body: Row(
          children: [
            // Modern Sidebar
            AppSidebar(
              selectedIndex: _pageIndex,
              onDestinationSelected: (index) {
                setState(() => _pageIndex = index);
              },
              destinations: _navItems
                  .map((item) => SidebarDestination(
                        icon: item.icon,
                        selectedIcon: item.icon,
                        label: item.label,
                      ))
                  .toList(),
              footer: _buildSidebarFooter(context),
            ),
            // Content area
            Expanded(
              child: IndexedStack(index: _pageIndex, children: _pages),
            ),
          ],
        ),
      );
    } else {
      // Phone layout: Bottom navigation bar
      return Scaffold(
        resizeToAvoidBottomInset: false,
        appBar: null,
        body: IndexedStack(index: _pageIndex, children: _pages),
        bottomNavigationBar: DesignBottomNavBar(
          currentIndex: _pageIndex,
          onTap: (index) => setState(() => _pageIndex = index),
          items: _navItems
              .map((item) => NavItemSpec(icon: item.icon, label: item.label))
              .toList(),
        ),
      );
    }
  }

  /// Build footer for sidebar with theme toggle
  Widget _buildSidebarFooter(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
      child: Tooltip(
        message: isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode',
        child: Material(
          color: Colors.transparent,
          child: InkWell(
            onTap: () {
              ThemeService.instance.toggleTheme();
            },
            borderRadius: BorderRadius.circular(12),
            child: Container(
              height: 48,
              decoration: BoxDecoration(
                color: theme.colorScheme.surfaceContainerHighest.withValues(alpha: 0.5),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Center(
                child: Icon(
                  isDark ? Icons.light_mode : Icons.dark_mode,
                  size: 24,
                  color: theme.colorScheme.onSurface.withValues(alpha: 0.7),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  @override
  void dispose() {
    _linkSubscription?.cancel();
    super.dispose();
  }
}

/// Navigation item data class
class _NavItem {
  final IconData icon;
  final String label;

  const _NavItem({required this.icon, required this.label});
}
