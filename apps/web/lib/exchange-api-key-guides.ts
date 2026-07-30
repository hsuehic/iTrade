import { SupportedExchange } from '@itrade/data-manager/constants';

export interface ExchangeApiKeyGuideLinks {
  web: string;
  mobile: string;
}

/** Official exchange links for creating API keys on web and mobile. */
export const EXCHANGE_API_KEY_GUIDES: Record<
  SupportedExchange,
  ExchangeApiKeyGuideLinks
> = {
  [SupportedExchange.BINANCE]: {
    web: 'https://www.binance.com/en/my/settings/api-management',
    mobile: 'https://www.binance.com/en/support/faq/detail/360002502072',
  },
  [SupportedExchange.OKX]: {
    web: 'https://www.okx.com/account/my-api',
    mobile: 'https://www.okx.com/help/api-faq',
  },
  [SupportedExchange.COINBASE]: {
    web: 'https://portal.cdp.coinbase.com/',
    mobile:
      'https://docs.cdp.coinbase.com/coinbase-app/authentication-authorization/api-key-authentication',
  },
};

export function getExchangeApiKeyGuides(
  exchange: string,
): ExchangeApiKeyGuideLinks | null {
  if (!(exchange in EXCHANGE_API_KEY_GUIDES)) {
    return null;
  }
  return EXCHANGE_API_KEY_GUIDES[exchange as SupportedExchange];
}
