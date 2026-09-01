// End-to-end widget test for the strategy creation wizard.
//
// Boots `StrategyCreateScreen` against a fake HTTP backend installed as a
// Dio `HttpClientAdapter`, so the full stack is exercised:
//   Dio + cookie jar  →  StrategyService  →  StrategyConfigInfo models
//     →  dynamic parameter form  →  wizard steps  →  POST /api/strategies.
//
// The fake backend mirrors the payload shape of the live
// `/api/strategies/config` endpoint (see test/strategy_config_test.dart).

import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:ihsueh_itrade/screens/strategy_create.dart';
import 'package:ihsueh_itrade/services/api_client.dart';

// ─────────────────────────────────────────────────────────────────────────────
// Fake backend
// ─────────────────────────────────────────────────────────────────────────────

class _RecordedRequest {
  final String method;
  final String path;
  final Map<String, dynamic>? body;

  const _RecordedRequest(this.method, this.path, this.body);
}

class _FakeApiAdapter implements HttpClientAdapter {
  final requests = <_RecordedRequest>[];

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    requests.add(
      _RecordedRequest(options.method, options.uri.path, _decodeBody(options)),
    );

    final method = options.method.toUpperCase();
    final path = options.uri.path;

    if (method == 'GET' && path == '/api/strategies/config') {
      return _jsonResponse(200, _strategiesConfigJson);
    }
    if (method == 'GET' && path == '/api/trading-pairs') {
      return _jsonResponse(200, _tradingPairsJson);
    }
    if (method == 'GET' && path == '/api/strategies/check-name') {
      return _jsonResponse(200, '{"available": true}');
    }
    if (method == 'POST' && path == '/api/strategies') {
      return _jsonResponse(201, _createdStrategyJson);
    }
    return _jsonResponse(404, '{"error": "not found"}');
  }

  /// Dio's transformer has already run by the time the adapter is reached,
  /// so `options.data` is usually the JSON-encoded string.
  static Map<String, dynamic>? _decodeBody(RequestOptions options) {
    final data = options.data;
    if (data is Map) return Map<String, dynamic>.from(data);
    if (data is String && data.isNotEmpty) {
      try {
        final decoded = jsonDecode(data);
        if (decoded is Map) return Map<String, dynamic>.from(decoded);
      } catch (_) {}
    }
    return null;
  }

  static ResponseBody _jsonResponse(int status, String body) {
    return ResponseBody.fromString(
      body,
      status,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

// ─────────────────────────────────────────────────────────────────────────────
// Fake API payloads
// ─────────────────────────────────────────────────────────────────────────────

const _strategiesConfigJson = '''
{
  "strategies": [
    {
      "type": "MovingAverageStrategy",
      "name": "Moving Average Crossover",
      "description": "Trades MA crossovers with manual SL protection.",
      "icon": "\\ud83d\\udcc8",
      "defaultParameters": {
        "maType": "sma",
        "fastPeriod": 20,
        "slowPeriod": 60,
        "cooldownMinutes": 15,
        "protectiveSL": true,
        "takeProfitPct": 1.5,
        "signalSide": "buy",
        "aggressive": false,
        "subscription": {}
      },
      "parameterDefinitions": [
        {"name": "maType", "type": "enum", "description": "Moving average type", "defaultValue": "sma", "required": true, "validation": {"options": ["sma", "ema"]}, "group": "Moving Averages", "order": 0},
        {"name": "fastPeriod", "type": "number", "description": "Fast MA period", "defaultValue": 20, "min": 2, "max": 200, "required": true, "group": "Moving Averages", "order": 1},
        {"name": "slowPeriod", "type": "number", "description": "Slow MA period", "defaultValue": 60, "min": 10, "max": 500, "required": true, "group": "Moving Averages", "order": 2},
        {"name": "cooldownMinutes", "type": "number", "description": "Cooldown between trades", "defaultValue": 15, "min": 0, "max": 1440, "step": 5, "group": "Risk Management", "order": 3},
        {"name": "protectiveSL", "type": "boolean", "description": "Place protective stop-loss", "defaultValue": true, "group": "Risk Management", "order": 4},
        {"name": "takeProfitPct", "type": "range", "description": "Take profit percent", "defaultValue": 1.5, "min": 0.5, "max": 10, "step": 0.5, "unit": "%", "group": "Risk Management", "order": 5},
        {"name": "signalSide", "type": "string", "description": "Which cross direction to trade", "defaultValue": "buy", "validation": {"options": ["buy", "sell"]}, "group": "Filters", "order": 6},
        {"name": "aggressive", "type": "boolean", "description": "Aggressive entries", "defaultValue": false, "showIf": {"field": "signalSide", "equals": "buy"}, "group": "Filters", "order": 7},
        {"name": "subscription", "type": "object", "description": "Realtime subscription config", "group": "Filters", "order": 8}
      ],
      "subscriptionRequirements": {
        "klines": {"required": true, "allowMultipleIntervals": false, "fixedIntervals": ["15m"], "description": "Needs 15m kline updates"},
        "ticker": {"required": false, "editable": true}
      },
      "initialDataRequirements": {
        "klines": {"required": true, "defaultConfig": {"15m": 200}},
        "fetchPositions": {"required": true, "editable": false},
        "fetchOpenOrders": {"required": true, "editable": false}
      },
      "documentation": {
        "overview": "Buys when the fast MA crosses above the slow MA and exits on take-profit or cooldown.",
        "riskFactors": ["Whipsaw risk in ranging markets", "No stop-loss when protective SL is disabled"]
      }
    },
    {
      "type": "SingleLadderLifoTPStrategy",
      "name": "Ladder Entry Single TP",
      "description": "Ladder entries with a single take-profit.",
      "icon": "\\ud83e\\ude9c",
      "defaultParameters": {"steps": 8, "tpPct": 1.2},
      "parameterDefinitions": [
        {"name": "steps", "type": "number", "description": "Ladder steps", "defaultValue": 8, "min": 1, "max": 50, "required": true, "group": "Ladder", "order": 0},
        {"name": "tpPct", "type": "range", "description": "Take profit percent", "defaultValue": 1.2, "min": 0.5, "max": 10, "step": 0.1, "unit": "%", "group": "Ladder", "order": 1}
      ],
      "subscriptionRequirements": {},
      "initialDataRequirements": {}
    }
  ]
}
''';

const _tradingPairsJson = '''
[
  {"symbol": "BTC/USDT", "exchange": "binance", "type": "spot", "price": 50000.5, "change24h": 2.34},
  {"symbol": "ETH/USDT", "exchange": "binance", "type": "spot", "price": 3001.2, "change24h": -1.2},
  {"symbol": "ETH/USDT:USDT", "exchange": "binance", "type": "perpetual", "price": 3002.7, "change24h": -1.1}
]
''';

const _createdStrategyJson = '''
{"strategy": {"id": 42, "name": "E2E MA Strategy", "type": "MovingAverageStrategy", "status": "active", "exchange": "binance", "symbol": "BTCUSDT", "createdAt": "2025-01-01T00:00:00.000Z", "updatedAt": "2025-01-01T00:00:00.000Z"}}
''';

// ─────────────────────────────────────────────────────────────────────────────
// Test
// ─────────────────────────────────────────────────────────────────────────────

void main() {
  final adapter = _FakeApiAdapter();

  setUpAll(() async {
    // The path_provider channel is unavailable in tests, so `init` falls back
    // to an in-memory cookie jar — exactly what we want here.
    await ApiClient.instance.init(baseUrl: 'http://test.local');
    ApiClient.instance.dio.httpClientAdapter = adapter;
  });

  Widget wrapApp(GlobalKey<NavigatorState> navKey) {
    return ScreenUtilInit(
      designSize: const Size(375, 10000),
      minTextAdapt: true,
      builder: (context, child) => MaterialApp(
        navigatorKey: navKey,
        theme: ThemeData(
          colorScheme: ColorScheme.fromSeed(seedColor: Colors.blue),
        ),
        home: const Scaffold(body: Center(child: Text('ROOT'))),
      ),
    );
  }

  /// Pump the app, then push the wizard on top of the placeholder route so
  /// tests can observe the post-submit `Navigator.pop()`.
  Future<void> pumpWizard(
    WidgetTester tester,
    GlobalKey<NavigatorState> navKey,
  ) async {
    await tester.pumpWidget(wrapApp(navKey));
    await tester.pumpAndSettle();
    navKey.currentState!.push(
      MaterialPageRoute<void>(builder: (_) => const StrategyCreateScreen()),
    );
    await tester.pumpAndSettle();
  }

  /// Finder matching the editable input whose current text equals [text].
  ///
  /// Number fields also render their default value as the input hint, so
  /// `find.text` matches twice (hint + editable). Matching on the
  /// [EditableText] controller picks the actual value.
  Finder editableWith(String text) => find.byWidgetPredicate(
    (w) => w is EditableText && w.controller.text == text,
  );

  /// Fill step 0 (name / exchange / symbol) — required before moving on.
  Future<void> fillStep0(WidgetTester tester) async {
    await tester.enterText(
      find.widgetWithText(TextField, 'Strategy name'),
      'E2E MA Strategy',
    );
    // Flush the name-availability debounce timer.
    await tester.pump(const Duration(milliseconds: 600));
    await tester.pumpAndSettle();

    // The exchange field renders the hint both as label and hint text.
    await tester.tap(find.text('Select exchange').first);
    await tester.pumpAndSettle();
    await tester.tap(
      find.descendant(of: find.byType(Dialog), matching: find.text('Binance')),
    );
    await tester.pumpAndSettle(); // trading pairs load

    await tester.tap(find.text('BTC/USDT (Spot), BTC/USDT:USDT (Futures)'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('BTCUSDT'));
    await tester.pumpAndSettle();
  }

  testWidgets(
    'MA strategy: dynamic form renders from config and submits the right payload',
    (tester) async {
      final navKey = GlobalKey<NavigatorState>();
      adapter.requests.clear();

      await pumpWizard(tester, navKey);

      // ── Step 0: first type auto-selected, description rendered ──────────
      expect(find.text('Moving Average Crossover'), findsOneWidget);
      expect(
        find.text('Trades MA crossovers with manual SL protection.'),
        findsOneWidget,
      );

      await fillStep0(tester);

      await tester.tap(find.text('Next'));
      await tester.pumpAndSettle();

      // ── Step 1: dynamic form built from parameterDefinitions ────────────
      expect(find.text('Strategy Parameters'), findsOneWidget);
      expect(find.text('Strategy Overview'), findsOneWidget);
      expect(find.text('Risk Factors'), findsOneWidget);

      expect(find.text('Moving Averages'), findsOneWidget);
      expect(find.text('Ma Type'), findsOneWidget);
      expect(find.text('Sma'), findsOneWidget); // humanized enum value
      expect(find.text('Fast Period'), findsOneWidget);
      expect(editableWith('20'), findsOneWidget);
      expect(find.text('Slow Period'), findsOneWidget);
      expect(editableWith('60'), findsOneWidget);

      expect(find.text('Risk Management'), findsOneWidget);
      expect(find.text('Cooldown Minutes'), findsOneWidget);
      expect(editableWith('15'), findsOneWidget);
      expect(find.text('Protective S L'), findsOneWidget); // same split as web
      expect(find.text('Take Profit Pct'), findsOneWidget);
      expect(find.text('1.5'), findsOneWidget); // slider value

      expect(find.text('Filters'), findsOneWidget);
      expect(find.text('Signal Side'), findsOneWidget);
      expect(find.text('Buy'), findsOneWidget);
      // showIf: aggressive visible because signalSide == 'buy'
      expect(find.text('Aggressive'), findsOneWidget);
      // 'subscription' is never rendered in the form
      expect(find.text('Subscription'), findsNothing);

      // ── showIf re-evaluation: sell hides the aggressive field ───────────
      await tester.ensureVisible(find.text('Buy'));
      await tester.tap(find.text('Buy')); // signal side dropdown
      await tester.pumpAndSettle();
      await tester.tap(find.text('Sell')); // menu item (unique: field='Buy')
      await tester.pumpAndSettle();
      expect(find.text('Aggressive'), findsNothing);

      // …and switching back re-shows it.
      await tester.tap(find.text('Sell')); // field now shows 'Sell'
      await tester.pumpAndSettle();
      await tester.tap(find.text('Buy')); // menu item (unique: field='Sell')
      await tester.pumpAndSettle();
      expect(find.text('Aggressive'), findsOneWidget);

      // ── number blur clamping: 999 → max 200 ─────────────────────────────
      await tester.enterText(editableWith('20'), '999');
      final slowEditable = editableWith('60');
      await tester.ensureVisible(slowEditable);
      await tester.pumpAndSettle();
      await tester.tap(slowEditable); // blur fastPeriod → clamp
      await tester.pumpAndSettle();
      expect(editableWith('200'), findsOneWidget);
      expect(editableWith('999'), findsNothing);

      // ── JSON mode stays in sync with the form ───────────────────────────
      await tester.ensureVisible(find.text('JSON'));
      await tester.tap(find.text('JSON'));
      await tester.pumpAndSettle();
      expect(find.textContaining('"fastPeriod": 200'), findsOneWidget);
      expect(find.textContaining('"maType": "sma"'), findsOneWidget);

      await tester.tap(find.text('Form'));
      await tester.pumpAndSettle();
      expect(find.text('Ma Type'), findsOneWidget);

      await tester.tap(find.text('Next'));
      await tester.pumpAndSettle();

      // ── Step 2: initial data driven by requirements ─────────────────────
      expect(find.text('Initial Data Config'), findsOneWidget);
      expect(
        find.textContaining('specific initial data requirements'),
        findsOneWidget,
      );
      expect(find.text('Historical Kline Data'), findsOneWidget);
      expect(find.text('15 min'), findsOneWidget); // from defaultConfig
      expect(editableWith('200'), findsOneWidget); // bars prefilled
      expect(find.textContaining('Position Info'), findsOneWidget);
      expect(find.textContaining('Open Orders'), findsOneWidget);
      // Sections the strategy does not declare are hidden.
      expect(find.text('Account Balance'), findsNothing);
      expect(find.text('Account Details'), findsNothing);
      expect(find.text('Market Data Snapshot'), findsNothing);

      // Required + non-editable fields: switches on and locked.
      final lockedOnSwitches = find.byWidgetPredicate(
        (w) => w is Switch && w.value && w.onChanged == null,
      );
      expect(lockedOnSwitches, findsNWidgets(2)); // positions + open orders

      await tester.tap(find.text('Next'));
      await tester.pumpAndSettle();

      // ── Step 3: subscriptions driven by requirements ────────────────────
      expect(find.text('Real-time Subscriptions'), findsOneWidget);
      expect(find.textContaining('Kline Data'), findsOneWidget);
      expect(
        find.text('Fixed Intervals (required by strategy)'),
        findsOneWidget,
      );
      expect(find.text('15 min'), findsOneWidget); // fixed interval chip
      expect(find.textContaining('Ticker Data'), findsOneWidget);
      // Data types the strategy does not declare are hidden.
      expect(find.text('Order Book'), findsNothing);
      expect(find.text('Trades'), findsNothing);

      // Klines required → switch forced on and locked.
      final lockedKlineSwitch = find.byWidgetPredicate(
        (w) => w is Switch && w.value && w.onChanged == null,
      );
      expect(lockedKlineSwitch, findsOneWidget);
      // Ticker optional → switch off but enabled.
      final tickerSwitch = find.byWidgetPredicate(
        (w) => w is Switch && !w.value && w.onChanged != null,
      );
      expect(tickerSwitch, findsOneWidget);

      // ── Submit ───────────────────────────────────────────────────────────
      await tester.ensureVisible(find.text('Create Strategy'));
      await tester.tap(find.text('Create Strategy'));
      await tester.pumpAndSettle();
      // Flush the success snackbar so no timers stay pending.
      await tester.pump(const Duration(seconds: 5));
      await tester.pumpAndSettle();

      expect(find.text('ROOT'), findsOneWidget); // Navigator.pop() happened
      expect(find.text('Strategy created'), findsNothing); // snackbar gone

      // ── POST /api/strategies payload ────────────────────────────────────
      final post = adapter.requests.lastWhere(
        (r) => r.method == 'POST' && r.path == '/api/strategies',
      );
      expect(post.body, isNotNull);
      expect(post.body!['name'], 'E2E MA Strategy');
      expect(post.body!['type'], 'MovingAverageStrategy');
      expect(post.body!['exchange'], 'binance');
      expect(post.body!['symbol'], 'BTCUSDT');

      final params = post.body!['parameters'] as Map<String, dynamic>;
      expect(params['maType'], 'sma');
      expect(params['fastPeriod'], 200); // clamped from 999
      expect(params['slowPeriod'], 60);
      expect(params['cooldownMinutes'], 15);
      expect(params['takeProfitPct'], 1.5);
      expect(params['signalSide'], 'buy'); // toggled to sell and back

      final initialData =
          post.body!['initialDataConfig'] as Map<String, dynamic>;
      expect(initialData['klines'], {'15m': 200});
      expect(initialData['fetchPositions'], isTrue);
      expect(initialData['fetchOpenOrders'], isTrue);
      expect(initialData['fetchBalance'], isNull);

      final subscription = post.body!['subscription'] as Map<String, dynamic>;
      expect(subscription['klines'], {
        'enabled': true,
        'intervals': ['15m'],
      });
      expect(subscription['ticker'], isNull);
      expect(subscription['method'], 'websocket');
    },
  );

  testWidgets(
    'switching strategy type reloads defaults and hides requirement sections',
    (tester) async {
      adapter.requests.clear();

      await pumpWizard(tester, GlobalKey<NavigatorState>());

      expect(find.text('Moving Average Crossover'), findsOneWidget);

      await fillStep0(tester);

      // Open the type picker and switch to the ladder strategy.
      await tester.tap(find.text('Moving Average Crossover'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Ladder Entry Single TP'));
      await tester.pumpAndSettle();

      // Type changed: new name + description.
      expect(find.text('Ladder Entry Single TP'), findsOneWidget);
      expect(
        find.text('Ladder entries with a single take-profit.'),
        findsOneWidget,
      );

      // Step 1: ladder parameters replace the MA form.
      await tester.tap(find.text('Next'));
      await tester.pumpAndSettle();
      expect(find.text('Steps'), findsOneWidget);
      expect(editableWith('8'), findsOneWidget); // steps default
      expect(find.text('Ma Type'), findsNothing);

      // Step 2: `initialDataRequirements: {}` → all sections hidden.
      await tester.tap(find.text('Next'));
      await tester.pumpAndSettle();
      expect(find.text('Historical Kline Data'), findsNothing);
      expect(find.text('Account Data'), findsNothing);
      expect(find.text('Market Data Snapshot'), findsNothing);

      // Step 3: `subscriptionRequirements: {}` → no data types, only method.
      await tester.tap(find.text('Next'));
      await tester.pumpAndSettle();
      expect(find.text('Kline Data'), findsNothing);
      expect(find.text('Ticker Data'), findsNothing);
      expect(find.text('Data Method'), findsOneWidget);
    },
  );
}
