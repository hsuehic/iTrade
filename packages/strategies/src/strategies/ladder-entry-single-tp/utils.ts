import Decimal from 'decimal.js';

export function parseMaxEntryPrice(raw: unknown): Decimal {
  if (raw === undefined || raw === null || raw === '') return new Decimal(0);

  let parsed: Decimal;
  try {
    parsed = new Decimal(raw as Decimal.Value);
  } catch {
    throw new Error(
      `Invalid maxEntryPrice: ${JSON.stringify(raw)} (must be a number >= 0; 0 or absent = no cap)`,
    );
  }
  if (!parsed.isFinite() || parsed.lt(0)) {
    throw new Error(
      `Invalid maxEntryPrice: ${JSON.stringify(raw)} (must be a finite number >= 0; 0 or absent = no cap)`,
    );
  }
  return parsed;
}
