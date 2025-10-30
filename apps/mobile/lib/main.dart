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
        // Initialize ScreenUtil - ONLY adapts width, NOT height
        // This ensures consistent horizontal layout while allowing natural vertical flow
        return ScreenUtilInit(
          // Design width: 375px (iPhone SE/8 as standard)
          // Design height: Set very large to effectively disable height scaling
          designSize: const Size(375, 10000),
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
  }

  @override
  Widget build(BuildContext context) {
    // This method is rerun every time setState is called, for instance as done
    // by the _incrementCounter method above.
    //
    // The Flutter framework has been optimized to make rerunning build methods
    // fast, so that you can just rebuild anything that needs updating rather
    // than having to individually change instances of widgets.
    return Scaffold(
      resizeToAvoidBottomInset: false,
      appBar: null,
      body: IndexedStack(index: _pageIndex, children: _pages),
      bottomNavigationBar: DesignBottomNavBar(
        currentIndex: _pageIndex,
        onTap: (index) => setState(() => _pageIndex = index),
        items: const [
          NavItemSpec(icon: Icons.pie_chart, label: 'Portfolio'),
          NavItemSpec(icon: Icons.calculate, label: 'Strategy'),
          NavItemSpec(icon: Icons.widgets, label: 'Product'),
          NavItemSpec(icon: Icons.analytics, label: 'Statistics'),
          NavItemSpec(icon: Icons.manage_accounts, label: 'Profile'),
        ],
      ),
    );
  }

  @override
  void dispose() {
    _linkSubscription?.cancel();
    super.dispose();
  }
}
