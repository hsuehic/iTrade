class MarketTicker {
  final String symbol;
  final double? last;
  final double? open24h;
  final double? changePercent;
  final double? volume24h;
  final String? exchange;
  final String? iconUrl;

  const MarketTicker({
    required this.symbol,
    this.last,
    this.open24h,
    this.changePercent,
    this.volume24h,
    this.exchange,
    this.iconUrl,
  });

  MarketTicker copyWith({
    String? symbol,
    double? last,
    double? open24h,
    double? changePercent,
    double? volume24h,
    String? exchange,
    String? iconUrl,
  }) {
    return MarketTicker(
      symbol: symbol ?? this.symbol,
      last: last ?? this.last,
      open24h: open24h ?? this.open24h,
      changePercent: changePercent ?? this.changePercent,
      volume24h: volume24h ?? this.volume24h,
      exchange: exchange ?? this.exchange,
      iconUrl: iconUrl ?? this.iconUrl,
    );
  }
}
