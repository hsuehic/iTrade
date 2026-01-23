/// Summary of portfolio assets
class AssetsSummary {
  final int totalAssets;
  final int uniqueAssets;
  final double totalValue;
  final List<String> exchanges;

  AssetsSummary({
    required this.totalAssets,
    required this.uniqueAssets,
    required this.totalValue,
    required this.exchanges,
  });

  factory AssetsSummary.fromJson(Map<String, dynamic> json) {
    return AssetsSummary(
      totalAssets: json['totalAssets'] ?? 0,
      uniqueAssets: json['uniqueAssets'] ?? 0,
      totalValue: (json['totalValue'] ?? 0).toDouble(),
      exchanges: List<String>.from(json['exchanges'] ?? []),
    );
  }

  factory AssetsSummary.empty() {
    return AssetsSummary(
      totalAssets: 0,
      uniqueAssets: 0,
      totalValue: 0,
      exchanges: [],
    );
  }
}

/// Individual asset data
class PortfolioAsset {
  final String asset;
  final String exchange;
  final double free;
  final double locked;
  final double total;
  final double percentage;
  final double? estimatedValue;

  PortfolioAsset({
    required this.asset,
    required this.exchange,
    required this.free,
    required this.locked,
    required this.total,
    required this.percentage,
    this.estimatedValue,
  });

  factory PortfolioAsset.fromJson(Map<String, dynamic> json) {
    return PortfolioAsset(
      asset: json['asset'] ?? '',
      exchange: json['exchange'] ?? '',
      free: (json['free'] ?? 0).toDouble(),
      locked: (json['locked'] ?? 0).toDouble(),
      total: (json['total'] ?? 0).toDouble(),
      percentage: (json['percentage'] ?? 0).toDouble(),
      estimatedValue: json['estimatedValue']?.toDouble(),
    );
  }

  /// Get icon URL for the asset
  String get iconUrl =>
      'https://www.okx.com/cdn/oksupport/asset/currency/icon/${asset.toLowerCase()}.png?x-oss-process=image/format,webp/ignore-error,1';

  /// Check if this is a stablecoin
  bool get isStablecoin =>
      ['USDT', 'USDC', 'BUSD', 'DAI', 'TUSD', 'USDP'].contains(asset.toUpperCase());
}

/// Aggregated asset (combined across exchanges)
class AggregatedAsset {
  final String asset;
  final double free;
  final double locked;
  final double total;
  final double percentage;

  AggregatedAsset({
    required this.asset,
    required this.free,
    required this.locked,
    required this.total,
    required this.percentage,
  });

  factory AggregatedAsset.fromJson(Map<String, dynamic> json) {
    return AggregatedAsset(
      asset: json['asset'] ?? '',
      free: (json['free'] ?? 0).toDouble(),
      locked: (json['locked'] ?? 0).toDouble(),
      total: (json['total'] ?? 0).toDouble(),
      percentage: (json['percentage'] ?? 0).toDouble(),
    );
  }

  String get iconUrl =>
      'https://www.okx.com/cdn/oksupport/asset/currency/icon/${asset.toLowerCase()}.png?x-oss-process=image/format,webp/ignore-error,1';
}

/// Complete portfolio data
class PortfolioData {
  final AssetsSummary summary;
  final List<PortfolioAsset> assets;
  final Map<String, List<PortfolioAsset>> assetsByExchange;
  final List<AggregatedAsset> aggregatedAssets;
  final DateTime timestamp;

  PortfolioData({
    required this.summary,
    required this.assets,
    required this.assetsByExchange,
    required this.aggregatedAssets,
    required this.timestamp,
  });

  factory PortfolioData.fromJson(Map<String, dynamic> json) {
    final assetsByExchange = <String, List<PortfolioAsset>>{};
    if (json['assetsByExchange'] != null) {
      (json['assetsByExchange'] as Map<String, dynamic>).forEach((key, value) {
        assetsByExchange[key] = (value as List)
            .map((e) => PortfolioAsset.fromJson(e))
            .toList();
      });
    }

    return PortfolioData(
      summary: AssetsSummary.fromJson(json['summary'] ?? {}),
      assets: (json['assets'] as List? ?? [])
          .map((e) => PortfolioAsset.fromJson(e))
          .toList(),
      assetsByExchange: assetsByExchange,
      aggregatedAssets: (json['aggregatedAssets'] as List? ?? [])
          .map((e) => AggregatedAsset.fromJson(e))
          .toList(),
      timestamp: DateTime.tryParse(json['timestamp'] ?? '') ?? DateTime.now(),
    );
  }

  factory PortfolioData.empty() {
    return PortfolioData(
      summary: AssetsSummary.empty(),
      assets: [],
      assetsByExchange: {},
      aggregatedAssets: [],
      timestamp: DateTime.now(),
    );
  }
}

/// Position data
class Position {
  final String id;
  final String symbol;
  final String exchange;
  final String side; // 'long' or 'short'
  final double quantity;
  final double avgPrice;
  final double markPrice;
  final double unrealizedPnl;
  final double leverage;
  final double marketValue;
  final double pnlPercentage;
  final DateTime? timestamp;
  final DateTime? createdAt;
  final DateTime? updatedAt;

  Position({
    required this.id,
    required this.symbol,
    required this.exchange,
    required this.side,
    required this.quantity,
    required this.avgPrice,
    required this.markPrice,
    required this.unrealizedPnl,
    required this.leverage,
    required this.marketValue,
    required this.pnlPercentage,
    this.timestamp,
    this.createdAt,
    this.updatedAt,
  });

  factory Position.fromJson(Map<String, dynamic> json) {
    return Position(
      id: json['id']?.toString() ?? '',
      symbol: json['symbol'] ?? '',
      exchange: json['exchange'] ?? '',
      side: json['side'] ?? 'long',
      quantity: double.tryParse(json['quantity']?.toString() ?? '0') ?? 0,
      avgPrice: double.tryParse(json['avgPrice']?.toString() ?? '0') ?? 0,
      markPrice: double.tryParse(json['markPrice']?.toString() ?? '0') ?? 0,
      unrealizedPnl: double.tryParse(json['unrealizedPnl']?.toString() ?? '0') ?? 0,
      leverage: double.tryParse(json['leverage']?.toString() ?? '1') ?? 1,
      marketValue: double.tryParse(json['marketValue']?.toString() ?? '0') ?? 0,
      pnlPercentage: double.tryParse(json['pnlPercentage']?.toString() ?? '0') ?? 0,
      timestamp: json['timestamp'] != null ? DateTime.tryParse(json['timestamp']) : null,
      createdAt: json['createdAt'] != null ? DateTime.tryParse(json['createdAt']) : null,
      updatedAt: json['updatedAt'] != null ? DateTime.tryParse(json['updatedAt']) : null,
    );
  }

  bool get isLong => side.toLowerCase() == 'long';
  bool get isProfitable => unrealizedPnl > 0;

  /// Check if symbol is perpetual (has :SETTLEMENT part)
  bool get isPerpetual => symbol.contains(':');

  /// Get base currency from normalized symbol
  /// e.g., 'APT/USDC:USDC' → 'APT', 'BTC/USDT' → 'BTC', 'BTCUSDT' → 'BTC'
  String get baseCurrency {
    final upperSymbol = symbol.toUpperCase();

    // Handle normalized format: BASE/QUOTE:SETTLEMENT (perpetual)
    if (upperSymbol.contains(':')) {
      final pair = upperSymbol.split(':')[0];
      if (pair.contains('/')) {
        return pair.split('/')[0];
      }
      return pair;
    }

    // Handle normalized format: BASE/QUOTE (spot)
    if (upperSymbol.contains('/')) {
      return upperSymbol.split('/')[0];
    }

    // Handle legacy format: BTCUSDT, ETHUSDC, etc.
    final stablecoins = ['USDT', 'USDC', 'BUSD', 'USD'];
    for (final stable in stablecoins) {
      if (upperSymbol.endsWith(stable)) {
        return upperSymbol.substring(0, upperSymbol.length - stable.length);
      }
    }

    return symbol;
  }

  /// Get display symbol in exchange-specific format (unnormalized)
  /// e.g., 'APT/USDC:USDC' + 'coinbase' → 'APT-USDC-PERP'
  /// e.g., 'WLD/USDT:USDT' + 'okx' → 'WLD-USDT-SWAP'
  /// e.g., 'BTC/USDT:USDT' + 'binance' → 'BTCUSDT'
  String get displaySymbol {
    final upperSymbol = symbol.toUpperCase();
    final exchangeLower = exchange.toLowerCase();

    switch (exchangeLower) {
      case 'binance':
        // Binance: BTCUSDT for both spot and perpetual
        if (isPerpetual) {
          final pair = upperSymbol.split(':')[0];
          return pair.replaceAll('/', '').replaceAll('-', '');
        }
        return upperSymbol.replaceAll('/', '').replaceAll('-', '');

      case 'okx':
        // OKX: BTC-USDT (spot), BTC-USDT-SWAP (perpetual)
        if (isPerpetual) {
          final pair = upperSymbol.split(':')[0];
          return '${pair.replaceAll('/', '-')}-SWAP';
        }
        return upperSymbol.replaceAll('/', '-');

      case 'coinbase':
        // Coinbase: BTC-USDC (spot), BTC-USDC-PERP (perpetual)
        if (isPerpetual) {
          final pair = upperSymbol.split(':')[0];
          return '${pair.replaceAll('/', '-')}-PERP';
        }
        return upperSymbol.replaceAll('/', '-');

      default:
        return symbol;
    }
  }

  String get iconUrl =>
      'https://www.okx.com/cdn/oksupport/asset/currency/icon/${baseCurrency.toLowerCase()}.png?x-oss-process=image/format,webp/ignore-error,1';
}

/// Positions summary
class PositionsSummary {
  final int totalPositions;
  final List<String> exchanges;
  final List<String> symbols;
  final double totalUnrealizedPnl;

  PositionsSummary({
    required this.totalPositions,
    required this.exchanges,
    required this.symbols,
    required this.totalUnrealizedPnl,
  });

  factory PositionsSummary.fromJson(Map<String, dynamic> json) {
    return PositionsSummary(
      totalPositions: json['totalPositions'] ?? 0,
      exchanges: List<String>.from(json['exchanges'] ?? []),
      symbols: List<String>.from(json['symbols'] ?? []),
      totalUnrealizedPnl:
          double.tryParse(json['totalUnrealizedPnl']?.toString() ?? '0') ?? 0,
    );
  }

  factory PositionsSummary.empty() {
    return PositionsSummary(
      totalPositions: 0,
      exchanges: [],
      symbols: [],
      totalUnrealizedPnl: 0,
    );
  }
}

/// Positions data response
class PositionsData {
  final List<Position> positions;
  final PositionsSummary summary;

  PositionsData({
    required this.positions,
    required this.summary,
  });

  factory PositionsData.fromJson(Map<String, dynamic> json) {
    return PositionsData(
      positions: (json['positions'] as List? ?? [])
          .map((e) => Position.fromJson(e))
          .toList(),
      summary: PositionsSummary.fromJson(json['summary'] ?? {}),
    );
  }

  factory PositionsData.empty() {
    return PositionsData(
      positions: [],
      summary: PositionsSummary.empty(),
    );
  }
}

/// PnL data
class PnLData {
  final double totalPnl;
  final double realizedPnl;
  final double unrealizedPnl;
  final int totalOrders;
  final int filledOrders;
  final int? strategyId;
  final String? strategyName;

  PnLData({
    required this.totalPnl,
    required this.realizedPnl,
    required this.unrealizedPnl,
    required this.totalOrders,
    required this.filledOrders,
    this.strategyId,
    this.strategyName,
  });

  factory PnLData.fromJson(Map<String, dynamic> json) {
    return PnLData(
      totalPnl: (json['pnl'] ?? json['totalPnl'] ?? 0).toDouble(),
      realizedPnl: (json['realizedPnl'] ?? 0).toDouble(),
      unrealizedPnl: (json['unrealizedPnl'] ?? 0).toDouble(),
      totalOrders: json['totalOrders'] ?? 0,
      filledOrders: json['filledOrders'] ?? 0,
      strategyId: json['strategyId'],
      strategyName: json['strategyName'],
    );
  }

  factory PnLData.empty() {
    return PnLData(
      totalPnl: 0,
      realizedPnl: 0,
      unrealizedPnl: 0,
      totalOrders: 0,
      filledOrders: 0,
    );
  }

  bool get isProfitable => totalPnl > 0;
  double get winRate => totalOrders > 0 ? (filledOrders / totalOrders) * 100 : 0;
}

/// Complete portfolio overview
class PortfolioOverview {
  final PortfolioData portfolio;
  final PositionsData positions;
  final PnLData pnl;
  final DateTime lastUpdated;

  PortfolioOverview({
    required this.portfolio,
    required this.positions,
    required this.pnl,
    required this.lastUpdated,
  });

  factory PortfolioOverview.empty() {
    return PortfolioOverview(
      portfolio: PortfolioData.empty(),
      positions: PositionsData.empty(),
      pnl: PnLData.empty(),
      lastUpdated: DateTime.now(),
    );
  }
}
