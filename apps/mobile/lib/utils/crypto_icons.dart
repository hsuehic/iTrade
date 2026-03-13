import 'package:ihsueh_itrade/constant/network.dart';

/// Utility class for getting cryptocurrency icons.
/// Icons are served from the iTrade web server (itrade.ihsueh.com)
/// and stored locally at /public/crypto-icons/{symbol}@2x.png
/// This avoids rate-limiting issues with Binance/OKX external CDNs.
class CryptoIcons {
  /// Get icon URL for a cryptocurrency symbol.
  /// Returns a URL pointing to the local web server's icon assets.
  static String getIconUrl(String symbol, {String? exchangeId}) {
    final baseCurrency = _extractBaseCurrency(symbol).toLowerCase();
    return '${NetworkParameter.host}/crypto-icons/$baseCurrency@2x.png';
  }

  /// Extract base currency from trading pair symbol
  /// Examples:
  /// - BTC/USDT -> BTC
  /// - BTCUSDT -> BTC
  /// - ETH/USD -> ETH
  /// - BTC-USDT-SWAP -> BTC
  static String _extractBaseCurrency(String symbol) {
    // Handle colon-separated perpetuals: BTC/USDT:USDT -> BTC/USDT -> BTC
    final withoutPerp = symbol.contains(':') ? symbol.split(':').first : symbol;

    // Handle slash-separated symbols: BTC/USDT -> BTC
    if (withoutPerp.contains('/')) {
      return withoutPerp.split('/')[0];
    }

    // Handle dash-separated symbols: BTC-USDT, BTC-USDT-SWAP -> BTC
    if (withoutPerp.contains('-')) {
      return withoutPerp.split('-')[0];
    }

    // Handle concatenated symbols (e.g., BTCUSDT -> BTC)
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
