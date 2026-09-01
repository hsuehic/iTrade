/// Strategy type configuration returned by `/api/strategies/config`.
///
/// Mirrors `StrategyRegistryConfig` (incl. `ParameterDefinition`,
/// `SubscriptionRequirements`, `InitialDataRequirements` and `documentation`)
/// from `@itrade/strategies` so mobile can render the same dynamic
/// parameter configuration UI as the web app.
library;

// ─────────────────────────────────────────────────────────────────────────────
// Parameter definition — describes how a parameter renders in the UI
// ─────────────────────────────────────────────────────────────────────────────

class ParameterShowIf {
  final String field;
  final Object equals;

  const ParameterShowIf({required this.field, required this.equals});

  factory ParameterShowIf.fromJson(Map<String, dynamic> json) {
    return ParameterShowIf(
      field: json['field'] as String? ?? '',
      equals: json['equals'] as Object? ?? '',
    );
  }

  /// Whether this condition is satisfied by the current [values].
  bool matches(Map<String, dynamic> values) {
    return values[field] == equals;
  }
}

class ParameterDefinition {
  final String name;

  /// 'number' | 'string' | 'boolean' | 'object' | 'enum' | 'range'
  final String type;
  final String description;
  final Object? defaultValue;
  final bool required;
  final double? min;
  final double? max;
  final double? step;
  final List<String> validationOptions;
  final String? validationPattern;
  final String? unit;
  final String? group;
  final int? order;
  final ParameterShowIf? showIf;

  const ParameterDefinition({
    required this.name,
    required this.type,
    required this.description,
    this.defaultValue,
    this.required = false,
    this.min,
    this.max,
    this.step,
    this.validationOptions = const [],
    this.validationPattern,
    this.unit,
    this.group,
    this.order,
    this.showIf,
  });

  bool get isNumber => type == 'number';
  bool get isRange => type == 'range';
  bool get isBoolean => type == 'boolean';
  bool get isEnum => type == 'enum';
  bool get isObject => type == 'object';
  bool get isString => type == 'string';

  /// Options for string/enum dropdown fields.
  List<String> get dropdownOptions {
    if (isEnum) return validationOptions;
    if (isString && validationOptions.isNotEmpty) return validationOptions;
    return const [];
  }

  /// Human-readable label: "basePrice" → "Base Price".
  String get label {
    final words = name
        .split(RegExp(r'(?=[A-Z])'))
        .where((w) => w.isNotEmpty)
        .map((w) => w[0].toUpperCase() + w.substring(1))
        .toList();
    return words.isEmpty ? name : words.join(' ');
  }

  factory ParameterDefinition.fromJson(Map<String, dynamic> json) {
    final validation = json['validation'];
    final showIf = json['showIf'];

    return ParameterDefinition(
      name: json['name'] as String? ?? '',
      type: json['type'] as String? ?? 'string',
      description: json['description'] as String? ?? '',
      defaultValue: json['defaultValue'],
      required: json['required'] as bool? ?? false,
      min: (json['min'] as num?)?.toDouble(),
      max: (json['max'] as num?)?.toDouble(),
      step: (json['step'] as num?)?.toDouble(),
      validationOptions: validation is Map && validation['options'] is List
          ? (validation['options'] as List)
                .map((e) => e.toString())
                .toList(growable: false)
          : const [],
      validationPattern: validation is Map
          ? validation['pattern'] as String?
          : null,
      unit: json['unit'] as String?,
      group: json['group'] as String?,
      order: (json['order'] as num?)?.toInt(),
      showIf: showIf is Map
          ? ParameterShowIf.fromJson(Map<String, dynamic>.from(showIf))
          : null,
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Subscription requirements
// ─────────────────────────────────────────────────────────────────────────────

class KlinesSubscriptionRequirement {
  final bool required;
  final bool allowMultipleIntervals;
  final List<String> defaultIntervals;
  final List<String> fixedIntervals;
  final bool intervalsEditable;
  final String? description;

  const KlinesSubscriptionRequirement({
    required this.required,
    this.allowMultipleIntervals = true,
    this.defaultIntervals = const [],
    this.fixedIntervals = const [],
    this.intervalsEditable = true,
    this.description,
  });

  factory KlinesSubscriptionRequirement.fromJson(Map<String, dynamic> json) {
    return KlinesSubscriptionRequirement(
      required: json['required'] as bool? ?? false,
      allowMultipleIntervals: json['allowMultipleIntervals'] as bool? ?? true,
      defaultIntervals:
          (json['defaultIntervals'] as List?)
              ?.map((e) => e.toString())
              .toList(growable: false) ??
          const [],
      fixedIntervals:
          (json['fixedIntervals'] as List?)
              ?.map((e) => e.toString())
              .toList(growable: false) ??
          const [],
      intervalsEditable: json['intervalsEditable'] as bool? ?? true,
      description: json['description'] as String?,
    );
  }
}

class TickerSubscriptionRequirement {
  final bool required;
  final bool editable;
  final String? description;

  const TickerSubscriptionRequirement({
    required this.required,
    this.editable = true,
    this.description,
  });

  factory TickerSubscriptionRequirement.fromJson(Map<String, dynamic> json) {
    return TickerSubscriptionRequirement(
      required: json['required'] as bool? ?? false,
      editable: json['editable'] as bool? ?? true,
      description: json['description'] as String?,
    );
  }
}

class OrderBookSubscriptionRequirement {
  final bool required;
  final bool editable;
  final int? defaultDepth;
  final bool depthEditable;
  final String? description;

  const OrderBookSubscriptionRequirement({
    required this.required,
    this.editable = true,
    this.defaultDepth,
    this.depthEditable = true,
    this.description,
  });

  factory OrderBookSubscriptionRequirement.fromJson(Map<String, dynamic> json) {
    return OrderBookSubscriptionRequirement(
      required: json['required'] as bool? ?? false,
      editable: json['editable'] as bool? ?? true,
      defaultDepth: (json['defaultDepth'] as num?)?.toInt(),
      depthEditable: json['depthEditable'] as bool? ?? true,
      description: json['description'] as String?,
    );
  }
}

class TradesSubscriptionRequirement {
  final bool required;
  final bool editable;
  final int? defaultLimit;
  final String? description;

  const TradesSubscriptionRequirement({
    required this.required,
    this.editable = true,
    this.defaultLimit,
    this.description,
  });

  factory TradesSubscriptionRequirement.fromJson(Map<String, dynamic> json) {
    return TradesSubscriptionRequirement(
      required: json['required'] as bool? ?? false,
      editable: json['editable'] as bool? ?? true,
      defaultLimit: (json['defaultLimit'] as num?)?.toInt(),
      description: json['description'] as String?,
    );
  }
}

class SubscriptionRequirements {
  final KlinesSubscriptionRequirement? klines;
  final TickerSubscriptionRequirement? ticker;
  final OrderBookSubscriptionRequirement? orderbook;
  final TradesSubscriptionRequirement? trades;

  /// True when every sub-requirement is null (e.g. `subscriptionRequirements: {}`).
  bool get isEffectivelyEmpty =>
      klines == null && ticker == null && orderbook == null && trades == null;

  const SubscriptionRequirements({
    this.klines,
    this.ticker,
    this.orderbook,
    this.trades,
  });

  factory SubscriptionRequirements.fromJson(Map<String, dynamic> json) {
    final klines = json['klines'];
    final ticker = json['ticker'];
    final orderbook = json['orderbook'];
    final trades = json['trades'];

    return SubscriptionRequirements(
      klines: klines is Map
          ? KlinesSubscriptionRequirement.fromJson(
              Map<String, dynamic>.from(klines),
            )
          : null,
      ticker: ticker is Map
          ? TickerSubscriptionRequirement.fromJson(
              Map<String, dynamic>.from(ticker),
            )
          : null,
      orderbook: orderbook is Map
          ? OrderBookSubscriptionRequirement.fromJson(
              Map<String, dynamic>.from(orderbook),
            )
          : null,
      trades: trades is Map
          ? TradesSubscriptionRequirement.fromJson(
              Map<String, dynamic>.from(trades),
            )
          : null,
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Initial data requirements
// ─────────────────────────────────────────────────────────────────────────────

class FieldRequirement {
  final bool required;
  final bool editable;
  final String? description;

  const FieldRequirement({
    required this.required,
    this.editable = true,
    this.description,
  });

  factory FieldRequirement.fromJson(Map<String, dynamic> json) {
    return FieldRequirement(
      required: json['required'] as bool? ?? false,
      editable: json['editable'] as bool? ?? true,
      description: json['description'] as String?,
    );
  }
}

class OrderBookInitialDataRequirement extends FieldRequirement {
  final int? defaultDepth;
  final bool depthEditable;

  const OrderBookInitialDataRequirement({
    required super.required,
    super.editable = true,
    super.description,
    this.defaultDepth,
    this.depthEditable = true,
  });

  factory OrderBookInitialDataRequirement.fromJson(Map<String, dynamic> json) {
    return OrderBookInitialDataRequirement(
      required: json['required'] as bool? ?? false,
      editable: json['editable'] as bool? ?? true,
      description: json['description'] as String?,
      defaultDepth: (json['defaultDepth'] as num?)?.toInt(),
      depthEditable: json['depthEditable'] as bool? ?? true,
    );
  }
}

class KlinesInitialDataRequirement {
  final bool required;
  final Map<String, int> defaultConfig;
  final String? description;
  final bool allowMultipleIntervals;
  final bool intervalsEditable;
  final bool limitsEditable;

  const KlinesInitialDataRequirement({
    required this.required,
    this.defaultConfig = const {},
    this.description,
    this.allowMultipleIntervals = true,
    this.intervalsEditable = true,
    this.limitsEditable = true,
  });

  factory KlinesInitialDataRequirement.fromJson(Map<String, dynamic> json) {
    final defaultConfig = json['defaultConfig'];
    return KlinesInitialDataRequirement(
      required: json['required'] as bool? ?? false,
      defaultConfig: defaultConfig is Map
          ? defaultConfig.map(
              (k, v) => MapEntry(k.toString(), (v as num?)?.toInt() ?? 20),
            )
          : const {},
      description: json['description'] as String?,
      allowMultipleIntervals: json['allowMultipleIntervals'] as bool? ?? true,
      intervalsEditable: json['intervalsEditable'] as bool? ?? true,
      limitsEditable: json['limitsEditable'] as bool? ?? true,
    );
  }
}

class InitialDataRequirements {
  final KlinesInitialDataRequirement? klines;
  final FieldRequirement? fetchPositions;
  final FieldRequirement? fetchOpenOrders;
  final FieldRequirement? fetchOrderHistory;
  final FieldRequirement? fetchBalance;
  final FieldRequirement? fetchAccountInfo;
  final FieldRequirement? fetchTicker;
  final OrderBookInitialDataRequirement? fetchOrderBook;

  /// True when every sub-requirement is null (e.g. `initialDataRequirements: {}`).
  bool get isEffectivelyEmpty =>
      klines == null &&
      fetchPositions == null &&
      fetchOpenOrders == null &&
      fetchOrderHistory == null &&
      fetchBalance == null &&
      fetchAccountInfo == null &&
      fetchTicker == null &&
      fetchOrderBook == null;

  const InitialDataRequirements({
    this.klines,
    this.fetchPositions,
    this.fetchOpenOrders,
    this.fetchOrderHistory,
    this.fetchBalance,
    this.fetchAccountInfo,
    this.fetchTicker,
    this.fetchOrderBook,
  });

  factory InitialDataRequirements.fromJson(Map<String, dynamic> json) {
    final klines = json['klines'];
    final ob = json['fetchOrderBook'];

    FieldRequirement? parseField(String key) {
      final v = json[key];
      return v is Map
          ? FieldRequirement.fromJson(Map<String, dynamic>.from(v))
          : null;
    }

    return InitialDataRequirements(
      klines: klines is Map
          ? KlinesInitialDataRequirement.fromJson(
              Map<String, dynamic>.from(klines),
            )
          : null,
      fetchPositions: parseField('fetchPositions'),
      fetchOpenOrders: parseField('fetchOpenOrders'),
      fetchOrderHistory: parseField('fetchOrderHistory'),
      fetchBalance: parseField('fetchBalance'),
      fetchAccountInfo: parseField('fetchAccountInfo'),
      fetchTicker: parseField('fetchTicker'),
      fetchOrderBook: ob is Map
          ? OrderBookInitialDataRequirement.fromJson(
              Map<String, dynamic>.from(ob),
            )
          : null,
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Documentation
// ─────────────────────────────────────────────────────────────────────────────

class StrategyDocumentation {
  final String? overview;
  final String? parameters;
  final String? signals;
  final List<String> riskFactors;

  const StrategyDocumentation({
    this.overview,
    this.parameters,
    this.signals,
    this.riskFactors = const [],
  });

  factory StrategyDocumentation.fromJson(Map<String, dynamic> json) {
    return StrategyDocumentation(
      overview: json['overview'] as String?,
      parameters: json['parameters'] as String?,
      signals: json['signals'] as String?,
      riskFactors:
          (json['riskFactors'] as List?)
              ?.map((e) => e.toString())
              .toList(growable: false) ??
          const [],
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Top-level strategy config info
// ─────────────────────────────────────────────────────────────────────────────

class StrategyConfigInfo {
  final String type;
  final String name;
  final String description;
  final String? category;
  final String? icon;
  final Map<String, dynamic> defaultParameters;
  final List<ParameterDefinition> parameterDefinitions;
  final SubscriptionRequirements? subscriptionRequirements;
  final InitialDataRequirements? initialDataRequirements;
  final StrategyDocumentation? documentation;

  const StrategyConfigInfo({
    required this.type,
    required this.name,
    required this.description,
    this.category,
    this.icon,
    this.defaultParameters = const {},
    this.parameterDefinitions = const [],
    this.subscriptionRequirements,
    this.initialDataRequirements,
    this.documentation,
  });

  factory StrategyConfigInfo.fromJson(Map<String, dynamic> json) {
    final defaultParameters = json['defaultParameters'];
    final parameterDefinitions = json['parameterDefinitions'];
    final subscriptionRequirements = json['subscriptionRequirements'];
    final initialDataRequirements = json['initialDataRequirements'];
    final documentation = json['documentation'];

    return StrategyConfigInfo(
      type: json['type'] as String? ?? '',
      name: json['name'] as String? ?? json['type'] as String? ?? '',
      description: json['description'] as String? ?? '',
      category: json['category'] as String?,
      icon: json['icon'] as String?,
      defaultParameters: defaultParameters is Map
          ? Map<String, dynamic>.from(defaultParameters)
          : const {},
      parameterDefinitions: parameterDefinitions is List
          ? parameterDefinitions
                .whereType<Map>()
                .map(
                  (e) => ParameterDefinition.fromJson(
                    Map<String, dynamic>.from(e),
                  ),
                )
                .toList(growable: false)
          : const [],
      subscriptionRequirements: subscriptionRequirements is Map
          ? SubscriptionRequirements.fromJson(
              Map<String, dynamic>.from(subscriptionRequirements),
            )
          : null,
      initialDataRequirements: initialDataRequirements is Map
          ? InitialDataRequirements.fromJson(
              Map<String, dynamic>.from(initialDataRequirements),
            )
          : null,
      documentation: documentation is Map
          ? StrategyDocumentation.fromJson(
              Map<String, dynamic>.from(documentation),
            )
          : null,
    );
  }
}
