/// Admin view of a supported trading pair, as returned by
/// `GET /api/admin/trading-pairs` (SymbolEntity in the data manager).
class TradingPair {
  final int id;
  final String symbol;
  final String baseAsset;
  final String quoteAsset;
  final String exchange;
  final String type; // 'spot' | 'perpetual'
  final String? name;
  final bool isActive;
  final int baseAssetPrecision;
  final int quoteAssetPrecision;

  const TradingPair({
    required this.id,
    required this.symbol,
    required this.baseAsset,
    required this.quoteAsset,
    required this.exchange,
    required this.type,
    this.name,
    required this.isActive,
    required this.baseAssetPrecision,
    required this.quoteAssetPrecision,
  });

  factory TradingPair.fromJson(Map<String, dynamic> json) {
    return TradingPair(
      id: json['id'] is int ? json['id'] as int : int.parse('${json['id']}'),
      symbol: json['symbol']?.toString() ?? '',
      baseAsset: json['baseAsset']?.toString() ?? '',
      quoteAsset: json['quoteAsset']?.toString() ?? '',
      exchange: json['exchange']?.toString() ?? '',
      type: json['type']?.toString() ?? 'spot',
      name: json['name']?.toString(),
      isActive: json['isActive'] == true,
      baseAssetPrecision: json['baseAssetPrecision'] is int
          ? json['baseAssetPrecision'] as int
          : int.tryParse('${json['baseAssetPrecision']}') ?? 8,
      quoteAssetPrecision: json['quoteAssetPrecision'] is int
          ? json['quoteAssetPrecision'] as int
          : int.tryParse('${json['quoteAssetPrecision']}') ?? 8,
    );
  }

  TradingPair copyWith({bool? isActive}) {
    return TradingPair(
      id: id,
      symbol: symbol,
      baseAsset: baseAsset,
      quoteAsset: quoteAsset,
      exchange: exchange,
      type: type,
      name: name,
      isActive: isActive ?? this.isActive,
      baseAssetPrecision: baseAssetPrecision,
      quoteAssetPrecision: quoteAssetPrecision,
    );
  }
}
