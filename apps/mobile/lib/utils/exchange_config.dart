import 'package:flutter/material.dart';

/// Supported exchanges configuration
class ExchangeConfig {
  final String id;
  final String name;
  final String description;
  final String symbolFormat;
  final String symbolExample;
  final Color color;
  final IconData icon;
  final String? logoUrl; // Logo path from web server

  const ExchangeConfig({
    required this.id,
    required this.name,
    required this.description,
    required this.symbolFormat,
    required this.symbolExample,
    required this.color,
    required this.icon,
    this.logoUrl,
  });

  /// Get full logo URL (from web server)
  /// In production, replace with actual web server URL from environment config
  String? getLogoUrl() {
    if (logoUrl == null) return null;
    // TODO: Replace with actual web server URL from environment config
    const webServerUrl = 'http://localhost:3000';
    return '$webServerUrl$logoUrl';
  }
}

/// List of supported exchanges
class SupportedExchanges {
  static const List<ExchangeConfig> all = [
    ExchangeConfig(
      id: 'binance',
      name: 'Binance',
      description: 'Most popular',
      symbolFormat: 'BTC/USDT (Spot), BTC/USDT:USDT (Futures)',
      symbolExample: 'BTC/USDT',
      color: Color(0xFFF3BA2F), // Binance yellow
      icon: Icons.currency_bitcoin,
      logoUrl: '/logos/binance.png', // Square PNG logo from web server
    ),
    ExchangeConfig(
      id: 'coinbase',
      name: 'Coinbase',
      description: 'US-based',
      symbolFormat: 'BTC/USDC (Spot), BTC/USDC:USDC (Perp)',
      symbolExample: 'BTC/USDC',
      color: Color(0xFF0052FF), // Coinbase blue
      icon: Icons.account_balance,
      logoUrl: '/logos/coinbase.png', // Square PNG logo from web server
    ),
    ExchangeConfig(
      id: 'okx',
      name: 'OKX',
      description: 'Global',
      symbolFormat: 'BTC/USDT (Spot), BTC/USDT:USDT (Swap)',
      symbolExample: 'BTC/USDT',
      color: Color(0xFF000000), // OKX black
      icon: Icons.swap_horiz,
      logoUrl: '/logos/okx.png', // Square PNG logo from web server
    ),
  ];

  /// Get exchange configuration by ID
  static ExchangeConfig? getById(String id) {
    try {
      return all.firstWhere((e) => e.id == id.toLowerCase());
    } catch (e) {
      return null;
    }
  }

  /// Get exchange name (with fallback)
  static String getName(String? exchangeId) {
    if (exchangeId == null || exchangeId.isEmpty) return 'Unknown';
    final config = getById(exchangeId);
    return config?.name ?? exchangeId.toUpperCase();
  }

  /// Get exchange color (with fallback)
  static Color getColor(String? exchangeId) {
    if (exchangeId == null || exchangeId.isEmpty) return Colors.grey;
    final config = getById(exchangeId);
    return config?.color ?? Colors.grey;
  }

  /// Get exchange icon (with fallback)
  static IconData getIcon(String? exchangeId) {
    if (exchangeId == null || exchangeId.isEmpty) return Icons.money;
    final config = getById(exchangeId);
    return config?.icon ?? Icons.money;
  }

  /// Get symbol format hint
  static String getSymbolFormatHint(String? exchangeId) {
    if (exchangeId == null || exchangeId.isEmpty) {
      return 'e.g., BTC/USDT, ETH/USD';
    }
    final config = getById(exchangeId);
    return config?.symbolFormat ?? 'e.g., BTC/USDT, ETH/USD';
  }

  /// Get default symbol for exchange
  static String getDefaultSymbol(String? exchangeId) {
    if (exchangeId == null || exchangeId.isEmpty) return 'BTC/USDT';
    final config = getById(exchangeId);
    return config?.symbolExample ?? 'BTC/USDT';
  }

  /// Normalize symbol to exchange-specific format
  /// This mirrors the backend normalizeSymbol logic
  static String normalizeSymbol(String symbol, String? exchangeId) {
    if (exchangeId == null || exchangeId.isEmpty) return symbol;

    final upperSymbol = symbol.toUpperCase();
    final exchange = exchangeId.toLowerCase();

    switch (exchange) {
      case 'binance':
        // Binance: BTCUSDT for both spot and perpetual
        if (upperSymbol.contains(':')) {
          final pair = upperSymbol.split(':')[0];
          return pair.replaceAll('/', '').replaceAll('-', '');
        }
        if (upperSymbol.contains('_PERP') || upperSymbol.contains('_SWAP')) {
          return upperSymbol.replaceAll('/', '').replaceAll('-', '');
        }
        return upperSymbol.replaceAll('/', '').replaceAll('-', '');

      case 'okx':
        // OKX: BTC-USDT (spot), BTC-USDT-SWAP (perpetual)
        if (upperSymbol.contains(':')) {
          final pair = upperSymbol.split(':')[0];
          final base = pair.replaceAll('/', '-');
          return '$base-SWAP';
        }
        if (upperSymbol.contains('-SWAP') || upperSymbol.contains('-FUTURES')) {
          return upperSymbol.replaceAll('/', '-');
        }
        return upperSymbol.replaceAll('/', '-');

      case 'coinbase':
        // Coinbase: BTC-USD (spot), BTC-PERP-INTX (perpetual)
        if (upperSymbol.contains(':')) {
          final pair = upperSymbol.split(':')[0];
          final base = pair.split('/')[0];
          return '$base-PERP-INTX';
        }
        if (upperSymbol.contains('-PERP-INTX') ||
            upperSymbol.contains('-PERP')) {
          return upperSymbol;
        }
        return upperSymbol.replaceAll('/', '-');

      default:
        return symbol;
    }
  }
}

/// Exchange chip/badge widget
class ExchangeChip extends StatelessWidget {
  final String? exchangeId;
  final bool showIcon;
  final double fontSize;

  const ExchangeChip({
    super.key,
    required this.exchangeId,
    this.showIcon = true,
    this.fontSize = 11,
  });

  @override
  Widget build(BuildContext context) {
    final name = SupportedExchanges.getName(exchangeId);
    final color = SupportedExchanges.getColor(exchangeId);
    final icon = SupportedExchanges.getIcon(exchangeId);
    final config = SupportedExchanges.getById(exchangeId ?? '');
    final logoUrl = config?.getLogoUrl();

    return Container(
      padding: EdgeInsets.symmetric(horizontal: showIcon ? 6 : 8, vertical: 4),
      decoration: BoxDecoration(
        color: color.withOpacity(0.1),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withOpacity(0.3), width: 1),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (showIcon) ...[
            // Try to show logo, fallback to icon
            if (logoUrl != null)
              ClipRRect(
                borderRadius: BorderRadius.circular(2),
                child: Image.network(
                  logoUrl,
                  width: fontSize + 2,
                  height: fontSize + 2,
                  fit: BoxFit.cover,
                  errorBuilder: (context, error, stackTrace) {
                    // Fallback to icon if image fails to load
                    return Icon(icon, size: fontSize + 2, color: color);
                  },
                ),
              )
            else
              Icon(icon, size: fontSize + 2, color: color),
            const SizedBox(width: 4),
          ],
          Text(
            name,
            style: TextStyle(
              fontSize: fontSize,
              color: color,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}
