import { Decimal } from 'decimal.js';

export class FormatUtils {
  // Number Formatting
  static formatDecimal(value: Decimal | string | number, decimals: number = 2): string {
    try {
      const decimal = new Decimal(value);
      return decimal.toFixed(decimals);
    } catch {
      return '0.' + '0'.repeat(decimals);
    }
  }

  static formatPrice(price: Decimal | string | number, decimals: number = 2): string {
    try {
      const decimal = new Decimal(price);
      return decimal.toFixed(decimals);
    } catch {
      return '0.00';
    }
  }

  static formatCurrency(
    amount: Decimal | string | number,
    currency: string = 'USD',
    decimals: number = 2,
  ): string {
    try {
      const decimal = new Decimal(amount);
      const formatted = decimal.toFixed(decimals);

      if (currency === 'USD') {
        return `$${formatted}`;
      } else {
        return `${formatted} ${currency}`;
      }
    } catch {
      return `0.${'0'.repeat(decimals)} ${currency}`;
    }
  }

  static formatPercentage(
    value: Decimal | string | number,
    decimals: number = 2,
  ): string {
    try {
      const decimal = new Decimal(value);
      return `${decimal.toFixed(decimals)}%`;
    } catch {
      return `0.${'0'.repeat(decimals)}%`;
    }
  }

  static formatQuantity(
    quantity: Decimal | string | number,
    decimals: number = 8,
  ): string {
    try {
      const decimal = new Decimal(quantity);

      // Remove trailing zeros
      let formatted = decimal.toFixed(decimals);
      if (formatted.includes('.')) {
        formatted = formatted.replace(/\.?0+$/, '');
      }

      return formatted;
    } catch {
      return '0';
    }
  }

  // Large Number Formatting
  static formatLargeNumber(
    value: Decimal | string | number,
    decimals: number = 2,
  ): string {
    try {
      const decimal = new Decimal(value);
      const absValue = decimal.abs();

      if (absValue.gte(1000000000)) {
        return `${decimal.div(1000000000).toFixed(decimals)}B`;
      } else if (absValue.gte(1000000)) {
        return `${decimal.div(1000000).toFixed(decimals)}M`;
      } else if (absValue.gte(1000)) {
        return `${decimal.div(1000).toFixed(decimals)}K`;
      } else {
        return decimal.toFixed(decimals);
      }
    } catch {
      return '0';
    }
  }

  static formatCompactNumber(value: Decimal | string | number): string {
    try {
      const decimal = new Decimal(value);
      const absValue = decimal.abs();

      if (absValue.gte(1000000000000)) {
        return `${decimal.div(1000000000000).toFixed(1)}T`;
      } else if (absValue.gte(1000000000)) {
        return `${decimal.div(1000000000).toFixed(1)}B`;
      } else if (absValue.gte(1000000)) {
        return `${decimal.div(1000000).toFixed(1)}M`;
      } else if (absValue.gte(1000)) {
        return `${decimal.div(1000).toFixed(1)}K`;
      } else {
        return decimal.toFixed(0);
      }
    } catch {
      return '0';
    }
  }

  // Scientific Notation
  static formatScientific(
    value: Decimal | string | number,
    decimals: number = 2,
  ): string {
    try {
      const decimal = new Decimal(value);
      return decimal.toExponential(decimals);
    } catch {
      return '0.00e+0';
    }
  }

  // String Formatting
  static padLeft(str: string, length: number, char: string = ' '): string {
    return str.padStart(length, char);
  }

  static padRight(str: string, length: number, char: string = ' '): string {
    return str.padEnd(length, char);
  }

  static truncate(str: string, maxLength: number, suffix: string = '...'): string {
    if (str.length <= maxLength) return str;
    return str.slice(0, maxLength - suffix.length) + suffix;
  }

  static capitalize(str: string): string {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
  }

  static camelCase(str: string): string {
    return str
      .replace(/(?:^\w|[A-Z]|\b\w)/g, (word, index) => {
        return index === 0 ? word.toLowerCase() : word.toUpperCase();
      })
      .replace(/\s+/g, '');
  }

  static kebabCase(str: string): string {
    return str
      .replace(/([a-z])([A-Z])/g, '$1-$2')
      .replace(/\s+/g, '-')
      .toLowerCase();
  }

  static snakeCase(str: string): string {
    return str
      .replace(/([a-z])([A-Z])/g, '$1_$2')
      .replace(/\s+/g, '_')
      .toLowerCase();
  }

  // Date Formatting (basic - DateUtils has more comprehensive date formatting)
  static formatTimestamp(
    timestamp: number | Date,
    format: 'short' | 'medium' | 'long' = 'medium',
  ): string {
    const date = timestamp instanceof Date ? timestamp : new Date(timestamp);

    switch (format) {
      case 'short':
        return date.toLocaleDateString();
      case 'long':
        return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
      case 'medium':
      default:
        return (
          date.toLocaleDateString() +
          ' ' +
          date.toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          })
        );
    }
  }

  // Trading-Specific Formatting
  static formatSymbol(symbol: string): string {
    if (!symbol) return '';

    // Convert BTCUSDT -> BTC/USDT
    const normalized = symbol.toUpperCase();
    const commonQuotes = ['USDT', 'USDC', 'USD', 'BTC', 'ETH', 'BNB'];

    for (const quote of commonQuotes) {
      if (normalized.endsWith(quote)) {
        const base = normalized.slice(0, -quote.length);
        return `${base}/${quote}`;
      }
    }

    return normalized;
  }

  static formatOrderSide(side: string): string {
    return side.toUpperCase() === 'BUY' ? '🟢 BUY' : '🔴 SELL';
  }

  static formatOrderType(type: string): string {
    switch (type.toUpperCase()) {
      case 'MARKET':
        return 'Market';
      case 'LIMIT':
        return 'Limit';
      case 'STOP_LOSS':
        return 'Stop Loss';
      case 'STOP_LOSS_LIMIT':
        return 'Stop Loss Limit';
      case 'TAKE_PROFIT':
        return 'Take Profit';
      case 'TAKE_PROFIT_LIMIT':
        return 'Take Profit Limit';
      default:
        return type;
    }
  }

  static formatOrderStatus(status: string): string {
    switch (status.toUpperCase()) {
      case 'NEW':
        return '🟡 New';
      case 'PARTIALLY_FILLED':
        return '🟠 Partial';
      case 'FILLED':
        return '🟢 Filled';
      case 'CANCELED':
        return '🔴 Canceled';
      case 'REJECTED':
        return '❌ Rejected';
      case 'EXPIRED':
        return '⏰ Expired';
      default:
        return status;
    }
  }

  // Table Formatting
  static formatTableRow(values: (string | number | Decimal)[], widths: number[]): string {
    return values
      .map((value, index) => {
        const str = typeof value === 'string' ? value : String(value);
        return this.padRight(str, widths[index] || 10);
      })
      .join(' | ');
  }

  static formatTableHeader(headers: string[], widths: number[]): string {
    const headerRow = this.formatTableRow(headers, widths);
    const separator = widths.map((width) => '-'.repeat(width)).join('-|-');

    return `${headerRow}\n${separator}`;
  }

  // JSON Formatting
  static formatJSON(obj: any, indent: number = 2): string {
    try {
      return JSON.stringify(obj, this.decimalReplacer, indent);
    } catch {
      return '{}';
    }
  }

  static formatCompactJSON(obj: any): string {
    try {
      return JSON.stringify(obj, this.decimalReplacer);
    } catch {
      return '{}';
    }
  }

  private static decimalReplacer(_key: string, value: any): any {
    if (value instanceof Decimal) {
      return value.toString();
    }
    return value;
  }

  // Crypto Address Formatting
  static formatAddress(
    address: string,
    startLength: number = 6,
    endLength: number = 4,
  ): string {
    if (!address || address.length <= startLength + endLength) {
      return address;
    }

    return `${address.slice(0, startLength)}...${address.slice(-endLength)}`;
  }

  // Transaction Hash Formatting
  static formatTxHash(hash: string): string {
    return this.formatAddress(hash, 8, 8);
  }

  // Progress Bar
  static formatProgressBar(current: number, total: number, width: number = 20): string {
    const progress = Math.min(current / total, 1);
    const filled = Math.floor(progress * width);
    const empty = width - filled;

    return `[${'█'.repeat(filled)}${' '.repeat(empty)}] ${(progress * 100).toFixed(1)}%`;
  }

  // File Size Formatting
  static formatFileSize(bytes: number): string {
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    if (bytes === 0) return '0 Bytes';

    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
  }

  // Duration Formatting
  static formatDuration(milliseconds: number): string {
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  }

  // Utility Methods
  static removeTrailingZeros(numStr: string): string {
    if (!numStr.includes('.')) return numStr;
    return numStr.replace(/\.?0+$/, '');
  }

  static addThousandsSeparator(numStr: string, separator: string = ','): string {
    const parts = numStr.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, separator);
    return parts.join('.');
  }
}
