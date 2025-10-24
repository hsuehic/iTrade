// Utils - Utility functions and helpers (browser-safe)
export { DateUtils } from './DateUtils';
export { MathUtils } from './MathUtils';
export { ValidationUtils } from './ValidationUtils';
export { FormatUtils } from './FormatUtils';
export { ArrayUtils, FixedLengthList } from './ArrayUtils';

// Note: The following use Node.js built-in modules and should only be imported server-side:
// - ConfigUtils (uses 'fs' and 'path')
// - CryptoUtils (uses 'crypto')
// Import them directly if needed: import { ConfigUtils } from '@itrade/utils/ConfigUtils'

// Re-export commonly used utilities
export { sleep, retry, debounce, throttle, deepClone, deepMerge } from './AsyncUtils';

// Exchange utilities
export {
  normalizeSymbol,
  getSymbolVariants,
  detectMarketType,
  isFuturesMarket,
} from './ExchangeUtils';
export type { ExchangeId, MarketType } from './ExchangeUtils';
