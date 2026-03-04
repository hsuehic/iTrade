/// Utility class for getting cryptocurrency icons
class CryptoIcons {
  /// Get icon URL for a cryptocurrency symbol
  /// Defaults to CoinCap icons, with optional exchange-specific overrides.
  static String getIconUrl(String symbol, {String? exchangeId}) {
    final baseCurrency = _extractBaseCurrency(symbol).toLowerCase();
    final exchange = exchangeId?.toLowerCase();
    if (exchange == 'okx') {
      return _getOkxIconUrl(baseCurrency);
    }
    if (exchange == 'binance') {
      return _getBinanceIconUrl(baseCurrency);
    }
    return 'https://assets.coincap.io/assets/icons/$baseCurrency@2x.png';
  }

  static String _getOkxIconUrl(String baseCurrency) {
    return 'https://static.okx.com/cdn/assets/imgs/2210/$baseCurrency.png';
  }

  static String _getBinanceIconUrl(String baseCurrency) {
    return 'https://www.binance.com/static/images/coins/64x64/$baseCurrency.png';
  }

  /// Extract base currency from trading pair symbol
  /// Examples:
  /// - BTC/USDT -> BTC
  /// - BTCUSDT -> BTC
  /// - ETH/USD -> ETH
  static String _extractBaseCurrency(String symbol) {
    final normalized = symbol.replaceAll(':', '-');
    if (normalized.contains('-')) {
      return normalized.split('-').first;
    }
    // Handle slash-separated symbols
    if (symbol.contains('/')) {
      return symbol.split('/')[0];
    }

    // Handle symbols without separator (e.g., BTCUSDT -> BTC)
    const quoteCurrencies = [
      'USDT',
      'USDC',
      'USD',
      'BTC',
      'ETH',
      'BNB',
      'BUSD',
      'DAI',
      'TUSD',
    ];

    for (final quote in quoteCurrencies) {
      if (symbol.endsWith(quote) && symbol.length > quote.length) {
        return symbol.substring(0, symbol.length - quote.length);
      }
    }

    return symbol;
  }
}
