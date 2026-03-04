/// Utility class for getting cryptocurrency icons
class CryptoIcons {
  /// Get icon URL for a cryptocurrency symbol.
  /// Use a reliable, exchange-agnostic CDN to avoid broken exchange assets.
  static String getIconUrl(String symbol, {String? exchangeId}) {
    final baseCurrency = _extractBaseCurrency(symbol).toLowerCase();
    return _getDefaultIconUrl(baseCurrency);
  }

  static String _getDefaultIconUrl(String baseCurrency) {
    return 'https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/32/color/$baseCurrency.png';
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
