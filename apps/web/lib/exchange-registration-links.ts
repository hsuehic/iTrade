import { SupportedExchange } from '@itrade/data-manager/constants';

export interface ExchangeRegistrationLink {
  web: string;
}

/** Official exchange registration pages. */
export const EXCHANGE_REGISTRATION_LINKS: Record<
  SupportedExchange,
  ExchangeRegistrationLink
> = {
  [SupportedExchange.BINANCE]: {
    web: 'https://www.binance.com/en/register',
  },
  [SupportedExchange.OKX]: {
    web: 'https://www.okx.com/account/register',
  },
  [SupportedExchange.COINBASE]: {
    web: 'https://www.coinbase.com/signup',
  },
};

/** KYC / 2FA setup help links per exchange. */
export const EXCHANGE_KYC_GUIDE_LINKS: Record<SupportedExchange, string> = {
  [SupportedExchange.BINANCE]:
    'https://www.binance.com/en/support/faq/how-to-complete-identity-verification-360027353311',
  [SupportedExchange.OKX]:
    'https://www.okx.com/help/i-can-t-complete-identity-verification-verification-levels-explained',
  [SupportedExchange.COINBASE]:
    'https://help.coinbase.com/en/coinbase/privacy-and-security/verify-my-id',
};

/** Required API key permissions per exchange for iTrade. */
export const EXCHANGE_API_PERMISSIONS: Record<
  SupportedExchange,
  { required: string[]; forbidden: string[] }
> = {
  [SupportedExchange.BINANCE]: {
    required: ['Enable Reading', 'Enable Spot Trading', 'Enable Futures'],
    forbidden: ['Enable Withdrawals'],
  },
  [SupportedExchange.OKX]: {
    required: ['Read', 'Trade'],
    forbidden: ['Withdraw'],
  },
  [SupportedExchange.COINBASE]: {
    required: ['wallet:accounts:read', 'wallet:balances:read', 'wallet:trades:write'],
    forbidden: ['wallet:withdrawals:write'],
  },
};

export function getExchangeRegistrationLink(
  exchange: string,
): ExchangeRegistrationLink | null {
  if (!(exchange in EXCHANGE_REGISTRATION_LINKS)) {
    return null;
  }
  return EXCHANGE_REGISTRATION_LINKS[exchange as SupportedExchange];
}
