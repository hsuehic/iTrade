/// Utility class for getting cryptocurrency icons
class CryptoIcons {
  /// Get icon URL for a cryptocurrency symbol
  /// Uses OKX CDN for crypto icons
  static String getIconUrl(String symbol) {
    // Extract base currency from symbol
    String baseCurrency = _extractBaseCurrency(symbol);
    baseCurrency = baseCurrency.toUpperCase();

    // OKX CDN URL format
    return 'https://static.coinall.ltd/cdn/oksupport/asset/currency/icon/$baseCurrency.png';
  }

  /// Extract base currency from trading pair symbol
  /// Examples:
  /// - BTC/USDT -> BTC
  /// - BTCUSDT -> BTC
  /// - ETH/USD -> ETH
  static String _extractBaseCurrency(String symbol) {
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

