import 'dart:async';
import 'dart:developer' as developer;
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:ihsueh_itrade/screens/echart.dart';
import 'package:ihsueh_itrade/screens/qr_scan.dart';
import 'package:uni_links/uni_links.dart';

import 'services/api_client.dart';
import 'services/notification.dart';
import 'screens/dashboard.dart';
import 'screens/login.dart';
import 'screens/forgot_password.dart';
import 'screens/strategy.dart';
import 'screens/product.dart';
import 'screens/profile.dart';
import 'widgets/design_bottom_nav.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  bool firebaseReady = false;
  try {
    await Firebase.initializeApp();
    firebaseReady = true;
  } catch (e) {
    // If config files are missing, keep app running and log a hint.
    // Add GoogleService-Info.plist (iOS) and google-services.json (Android), or configure via FlutterFire.
    developer.log('Firebase initialization failed', name: 'main', error: e);
  }

  if (firebaseReady) {
    FirebaseMessaging.onBackgroundMessage(firebaseMessagingBackgroundHandler);
    await NotificationService.instance.initialize();
    await NotificationService.instance.requestPermissions();
    NotificationService.instance.listenToMessages();
  }
  await ApiClient.instance.init(
    baseUrl: 'https://trader.ihsueh.com',
    // Allow handshake during development if the cert is self-signed/misconfigured
    insecureAllowBadCertForHosts: const <String>['trader.ihsueh.com'],
  );
  runApp(const MyApp());
}

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  // This widget is the root of your application.
  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'iTrade',
      theme: ThemeData(
        // This is the theme of your application.
        //
        // TRY THIS: Try running your application with "flutter run". You'll see
        // the application has a purple toolbar. Then, without quitting the app,
        // try changing the seedColor in the colorScheme below to Colors.green
        // and then invoke "hot reload" (save your changes or press the "hot
        // reload" button in a Flutter-supported IDE, or press "r" if you used
        // the command line to start the app).
        //
        // Notice that the counter didn't reset back to zero; the application
        // state is not lost during the reload. To reset the state, use hot
        // restart instead.
        //
        // This works for code too, not just values: Most code changes can be
        // tested with just a hot reload.
        colorScheme: ColorScheme.fromSeed(seedColor: Colors.deepPurple),
      ),
      home: const AuthGate(),
      routes: {
        '/login': (_) => const LoginScreen(),
        '/forgot-password': (_) => const ForgotPasswordScreen(),
        '/home': (_) => const MyHomePage(title: 'iTrade'),
        '/scan-qr': (_) => const QrScanScreen(),
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
      final bool ok = await ApiClient.instance.hasSession();
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
  final List<Widget> _pages = [
    const DashboardScreen(),
    const StrategyScreen(),
    const ProductScreen(),
    const EchartScreen(),
    const ProfileScreen(),
  ];
  StreamSubscription? _linkSubscription;

  @override
  void initState() {
    super.initState();
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
      body: SafeArea(top: true, bottom: false, child: _pages[_pageIndex]),
      bottomNavigationBar: DesignBottomNavBar(
        currentIndex: _pageIndex,
        onTap: (index) => setState(() => _pageIndex = index),
        items: const [
          NavItemSpec(icon: Icons.dashboard, label: 'Dashboard'),
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
      '/dashboard': 0,
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
