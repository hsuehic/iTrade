import 'dart:async';
import 'dart:developer' as developer;
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:ihsueh_itrade/screens/portfolio.dart';
import 'package:ihsueh_itrade/screens/qr_scan.dart';
import 'package:ihsueh_itrade/screens/satistics.dart';
import 'package:ihsueh_itrade/services/auth_service.dart';
import 'package:uni_links/uni_links.dart';
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

Future<void> main() async {
  // Wrap entire initialization in try-catch to prevent white screen
  try {
    WidgetsFlutterBinding.ensureInitialized();
    developer.log('App initializing...', name: 'main');

    // Firebase initialization with timeout
    bool firebaseReady = false;
    try {
      await Firebase.initializeApp().timeout(
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

class _MyAppState extends State<MyApp> {
  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<ThemeMode>(
      valueListenable: ThemeService.instance.themeMode,
      builder: (context, themeMode, child) {
        return MaterialApp(
          title: 'iTrade',
          theme: AppTheme.brand,
          darkTheme: AppTheme.dark,
          themeMode: themeMode,
          home: const SplashScreen(),
          routes: {
            '/login': (_) => const LoginScreen(),
            '/forgot-password': (_) => const ForgotPasswordScreen(),
            '/home': (_) => const MyHomePage(title: 'iTrade'),
            '/scan-qr': (_) => const QrScanScreen(),
            '/profile': (_) => const ProfileScreen(),
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
    _initDeepLinks();
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

  Future<void> _initDeepLinks() async {
    try {
      final Uri? initial = await getInitialUri();
      if (initial != null) {
        _handleIncomingUri(initial);
      }
    } on PlatformException catch (e, st) {
      developer.log(
        'Failed to get initial uri',
        name: 'DeepLinks',
        error: e,
        stackTrace: st,
      );
    } on FormatException catch (e, st) {
      developer.log(
        'Malformed initial uri',
        name: 'DeepLinks',
        error: e,
        stackTrace: st,
      );
    }

    _linkSubscription = uriLinkStream.listen(
      (Uri? uri) {
        if (uri != null) {
          _handleIncomingUri(uri);
        }
      },
      onError: (Object err, StackTrace st) {
        developer.log(
          'uriLinkStream error',
          name: 'DeepLinks',
          error: err,
          stackTrace: st,
        );
      },
    );
  }

  void _handleIncomingUri(Uri uri) {
    if (!mounted) return;
    final String scheme = uri.scheme.toLowerCase();
    final String path = uri.path.isEmpty ? '/' : uri.path;

    // For custom scheme without path, interpret host as path segment, e.g. imining://profile
    final bool isCustomScheme = scheme == 'imining';
    final String effectivePath =
        (isCustomScheme &&
            uri.host.isNotEmpty &&
            (uri.path.isEmpty || uri.path == '/'))
        ? '/${uri.host}'
        : path;

    if (effectivePath == '/scan-qr') {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        Navigator.of(context).pushNamed('/scan-qr');
      });
      return;
    }

    const Map<String, int> routeToIndex = {
      '/': 0,
      '/portfolio': 0,
      '/strategy': 1,
      '/product': 2,
      '/statistics': 3,
      '/profile': 4,
    };

    final int? targetIndex = routeToIndex[effectivePath];
    if (targetIndex != null) {
      setState(() => _pageIndex = targetIndex.clamp(0, _pages.length - 1));
    }
  }
}
