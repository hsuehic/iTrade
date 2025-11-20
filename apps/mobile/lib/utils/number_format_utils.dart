/// Number formatting utilities for consistent display across the app.
///
/// This file contains functions for formatting numbers with suffixes (K, M, B)
/// and other number formatting utilities used throughout the mobile app.

/// Format volume with appropriate suffix (K, M, B)
///
/// Examples:
/// - 1234 -> "1.23K"
/// - 1234567 -> "1.23M"
/// - 1234567890 -> "1.23B"
/// - 999 -> "999.00"
String formatVolume(double volume) {
  if (volume >= 1000000000) {
    // Billions
    return '${(volume / 1000000000).toStringAsFixed(2)}B';
  } else if (volume >= 1000000) {
    // Millions
    return '${(volume / 1000000).toStringAsFixed(2)}M';
  } else if (volume >= 1000) {
    // Thousands
    return '${(volume / 1000).toStringAsFixed(2)}K';
  } else {
    // Less than 1000
    return volume.toStringAsFixed(2);
  }
}

/// Format price with appropriate decimal places based on magnitude
///
/// Examples:
/// - 0.00012345 -> "0.0001"
/// - 1.234567 -> "1.23"
/// - 123.456789 -> "123.46"
String formatPrice(double price) {
  if (price < 0.01) {
    return price.toStringAsFixed(4);
  } else if (price < 1) {
    return price.toStringAsFixed(3);
  } else {
    return price.toStringAsFixed(2);
  }
}

/// Format percentage with sign prefix
///
/// Examples:
/// - 1.234 -> "+1.23%"
/// - -2.567 -> "-2.57%"
/// - 0.0 -> "+0.00%"
String formatPercentage(double percentage) {
  final sign = percentage >= 0 ? '+' : '';
  return '$sign${percentage.toStringAsFixed(2)}%';
}

/// Format large numbers for display (similar to formatVolume but more flexible)
///
/// Examples:
/// - 1234 -> "1.23K"
/// - 1234567 -> "1.23M"
/// - 1234567890 -> "1.23B"
/// - 999 -> "999"
String formatLargeNumber(double number) {
  if (number >= 1000000000) {
    return '${(number / 1000000000).toStringAsFixed(2)}B';
  } else if (number >= 1000000) {
    return '${(number / 1000000).toStringAsFixed(2)}M';
  } else if (number >= 1000) {
    return '${(number / 1000).toStringAsFixed(2)}K';
  } else {
    return number.toStringAsFixed(0);
  }
}

/// Format currency amount with dollar sign
///
/// Examples:
/// - 1234.56 -> "$1,234.56"
/// - 0.0 -> "$0.00"
String formatCurrency(double amount) {
  return '\$${amount.toStringAsFixed(2)}';
}

/// Format quantity/size with appropriate precision
///
/// Examples:
/// - 1234567 -> "1.23M"
/// - 1234 -> "1.23K"
/// - 123.456 -> "123.46"
/// - 0.000123 -> "0.0001"
String formatQuantity(double quantity) {
  if (quantity >= 1000000) {
    return '${(quantity / 1000000).toStringAsFixed(2)}M';
  } else if (quantity >= 1000) {
    return '${(quantity / 1000).toStringAsFixed(2)}K';
  } else if (quantity < 0.01) {
    return quantity.toStringAsFixed(4);
  } else {
    return quantity.toStringAsFixed(2);
  }
}
