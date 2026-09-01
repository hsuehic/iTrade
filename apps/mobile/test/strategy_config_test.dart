// Parses the real `/api/strategies/config` payload shape into the
// `strategy_config.dart` models used by the mobile strategy creation wizard.

import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';

import 'package:ihsueh_itrade/models/strategy_config.dart';

/// Snapshot of the live API response (MovingAverageStrategy + a strategy with
/// `subscriptionRequirements: {}`-style minimal config).
const _apiPayload = '''
{
  "strategies": [
    {
      "type": "MovingAverageStrategy",
      "name": "Moving Average Crossover",
      "description": "Trades MA crossovers with manual SL protection.",
      "category": "trend",
      "icon": "📈",
      "defaultParameters": {"maType": "sma", "fastPeriod": 20, "slowPeriod": 60},
      "parameterDefinitions": [
        {
          "name": "maType",
          "type": "enum",
          "description": "Moving average type. SMA or EMA.",
          "defaultValue": "sma",
          "required": true,
          "validation": {"options": ["sma", "ema"]},
          "group": "Moving Averages",
          "order": 0
        },
        {
          "name": "fastPeriod",
          "type": "number",
          "description": "Fast MA period.",
          "defaultValue": 20,
          "required": true,
          "min": 2,
          "max": 200,
          "group": "Moving Averages",
          "order": 1
        },
        {
          "name": "cooldownMinutes",
          "type": "number",
          "description": "Cooldown after a trade.",
          "defaultValue": 15,
          "min": 0,
          "max": 1440,
          "step": 5,
          "group": "Risk Management",
          "order": 2
        },
        {
          "name": "protectiveSL",
          "type": "boolean",
          "description": "Enable manual stop-loss triggers.",
          "defaultValue": true,
          "group": "Risk Management",
          "order": 3
        },
        {
          "name": "takeProfitPct",
          "type": "range",
          "description": "Take profit percent.",
          "defaultValue": 1.5,
          "min": 0.5,
          "max": 10,
          "step": 0.5,
          "unit": "%",
          "group": "Risk Management",
          "order": 4
        },
        {
          "name": "tickerFilter",
          "type": "object",
          "description": "Optional ticker filter object.",
          "group": "Filters",
          "order": 5
        },
        {
          "name": "signalSide",
          "type": "string",
          "description": "Which side to trade.",
          "defaultValue": "buy",
          "validation": {"options": ["buy", "sell"]},
          "group": "Filters",
          "order": 6
        },
        {
          "name": "aggressive",
          "type": "boolean",
          "description": "Only visible when signalSide is buy.",
          "showIf": {"field": "signalSide", "equals": "buy"},
          "group": "Filters",
          "order": 7
        },
        {
          "name": "subscription",
          "type": "object",
          "description": "Subscription overrides (hidden from the form).",
          "group": "Filters",
          "order": 8
        }
      ],
      "subscriptionRequirements": {
        "klines": {
          "required": true,
          "allowMultipleIntervals": false,
          "description": "Real-time klines for trend detection."
        },
        "ticker": {
          "required": false,
          "description": "Tickers for real-time manual SL triggers."
        }
      },
      "initialDataRequirements": {
        "klines": {
          "required": true,
          "defaultConfig": {"15m": 200},
          "description": "Pre-loads historical klines."
        },
        "fetchPositions": {
          "required": true,
          "editable": false,
          "description": "Sync current position."
        },
        "fetchOpenOrders": {
          "required": true,
          "editable": false,
          "description": "Sync existing orders."
        }
      },
      "documentation": {
        "overview": "Trades MA crossovers.",
        "riskFactors": ["Whipsaw in ranging markets"]
      }
    },
    {
      "type": "SingleLadderLifoTPStrategy",
      "name": "Ladder Entry Single TP",
      "description": "Ladder entries with a single take-profit.",
      "category": "grid",
      "icon": "🪜",
      "defaultParameters": {"steps": 8},
      "parameterDefinitions": [
        {"name": "steps", "type": "number", "defaultValue": 8, "min": 1, "required": true}
      ],
      "subscriptionRequirements": {},
      "initialDataRequirements": {},
      "documentation": null
    }
  ]
}
''';

void main() {
  final data = jsonDecode(_apiPayload) as Map<String, dynamic>;
  final strategies = (data['strategies'] as List)
      .whereType<Map<String, dynamic>>()
      .map(StrategyConfigInfo.fromJson)
      .toList();

  test('parses strategy list with parameter definitions', () {
    expect(strategies, hasLength(2));
    expect(strategies.map((s) => s.type).toList(), [
      'MovingAverageStrategy',
      'SingleLadderLifoTPStrategy',
    ]);
    expect(strategies.first.icon, '📈');
    expect(strategies.first.defaultParameters['maType'], 'sma');
  });

  test('parses parameter definitions of every type', () {
    final defs = {
      for (final d in strategies.first.parameterDefinitions) d.name: d,
    };

    final maType = defs['maType']!;
    expect(maType.type, 'enum');
    expect(maType.required, isTrue);
    expect(maType.dropdownOptions, ['sma', 'ema']);
    expect(maType.group, 'Moving Averages');
    expect(maType.order, 0);
    expect(maType.label, 'Ma Type');

    final fast = defs['fastPeriod']!;
    expect(fast.isNumber, isTrue);
    expect(fast.min, 2);
    expect(fast.max, 200);
    expect(fast.defaultValue, 20);

    final cooldown = defs['cooldownMinutes']!;
    expect(cooldown.step, 5);

    final tp = defs['takeProfitPct']!;
    expect(tp.isRange, isTrue);
    expect(tp.step, 0.5);
    expect(tp.unit, '%');

    expect(defs['protectiveSL']!.isBoolean, isTrue);
    expect(defs['protectiveSL']!.defaultValue, isTrue);

    expect(defs['tickerFilter']!.isObject, isTrue);
    expect(defs['signalSide']!.dropdownOptions, ['buy', 'sell']);

    // showIf conditional visibility
    final aggressive = defs['aggressive']!;
    expect(aggressive.showIf!.matches({'signalSide': 'buy'}), isTrue);
    expect(aggressive.showIf!.matches({'signalSide': 'sell'}), isFalse);
  });

  test('parses subscription requirements', () {
    final req = strategies.first.subscriptionRequirements!;
    expect(req.klines!.required, isTrue);
    expect(req.klines!.allowMultipleIntervals, isFalse);
    expect(req.klines!.description, contains('klines'));
    expect(req.ticker!.required, isFalse);
    expect(req.orderbook, isNull);

    // Empty requirements object → all sub-requirements null.
    final empty = strategies.last.subscriptionRequirements!;
    expect(empty.isEffectivelyEmpty, isTrue);
  });

  test('parses initial data requirements', () {
    final req = strategies.first.initialDataRequirements!;
    expect(req.klines!.required, isTrue);
    expect(req.klines!.defaultConfig, {'15m': 200});
    expect(req.fetchPositions!.required, isTrue);
    expect(req.fetchPositions!.editable, isFalse);
    expect(req.fetchOpenOrders!.required, isTrue);

    final empty = strategies.last.initialDataRequirements!;
    expect(empty.isEffectivelyEmpty, isTrue);
  });

  test('parses documentation', () {
    final doc = strategies.first.documentation!;
    expect(doc.overview, contains('crossovers'));
    expect(doc.riskFactors, hasLength(1));
    expect(strategies.last.documentation, isNull);
  });
}
