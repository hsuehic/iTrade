// Number formatting utilities for consistent display across the app.
//
// This file contains functions for formatting numbers with suffixes (K, M, B)
// and other number formatting utilities used throughout the mobile app.

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

/// Format price with EXACT value (no K suffix) - for ticker cards and markline
///
/// If precision is provided (from API), use it directly.
/// Otherwise, automatically determines appropriate precision based on value magnitude.
/// Always shows full precision (keeps trailing zeros for consistency).
String formatPriceExact(double price, {int? precision}) {
  if (price == 0) return '0';
  
  // For very small numbers, use scientific notation
  if (price.abs() < 0.0001) {
    return price.toStringAsExponential(2);
  }
  
  // Use provided precision if available, otherwise calculate from magnitude
  final int decimals;
  if (precision != null) {
    decimals = precision;
  } else {
    // Determine appropriate decimal places based on magnitude
    final absPrice = price.abs();
    if (absPrice >= 1000) {
      decimals = 1; // e.g., "91886.7"
    } else if (absPrice >= 100) {
      decimals = 2; // e.g., "123.45"
    } else if (absPrice >= 10) {
      decimals = 3; // e.g., "12.345"
    } else if (absPrice >= 1) {
      decimals = 4; // e.g., "2.1345"
    } else if (absPrice >= 0.01) {
      decimals = 4; // e.g., "0.6783"
    } else {
      decimals = 6; // e.g., "0.006783"
    }
  }
  
  // Format with calculated decimals - keep all digits for consistency
  return price.toStringAsFixed(decimals);
}

/// Format price for Y-AXIS LABELS ONLY with aggregated values
///
/// Uses K suffix for very large numbers to keep y-axis clean:
/// - Very large prices (>= 10,000): Uses K suffix (e.g., "91.9K")
/// - Large prices (>= 1,000): 1 decimal (e.g., "3029.0")
/// - Regular prices (>= 1): 2 decimals (e.g., "123.45")
/// - Small prices (0.01 - 1): 4 decimals (e.g., "0.6800")
/// - Very small (0.0001 - 0.01): 6 decimals (e.g., "0.006800")
/// - Extremely small (< 0.0001): Scientific notation (e.g., "6.8e-5")
String formatPrice(double price) {
  // Very large numbers (>= 10000) - use K suffix for y-axis
  if (price >= 10000) {
    return '${(price / 1000).toStringAsFixed(1)}K';
  }
  
  // Large numbers (>= 1000) - show 1 decimal
  if (price >= 1000) {
    return price.toStringAsFixed(1);
  }
  
  // Medium numbers (1 - 1,000)
  if (price >= 1) {
    return price.toStringAsFixed(2);
  }
  
  // Small numbers (0.01 - 1) - cryptocurrencies
  if (price >= 0.01) {
    return price.toStringAsFixed(4);
  }
  
  // Very small numbers (0.0001 - 0.01)
  if (price >= 0.0001) {
    return price.toStringAsFixed(6);
  }
  
  // Extremely small numbers - scientific notation
  return price.toStringAsExponential(2);
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
