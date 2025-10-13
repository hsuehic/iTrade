import axios, { AxiosInstance } from 'axios';

import { generateToken } from './generateToken';
import { BASE_URL } from './constants';
import 'dotenv/config';

export class CoinbaseAdvancedClient {
  private apiKey: string;
  private apiSecret: string;
  private http: AxiosInstance;

  constructor(apiKey: string, apiSecret: string) {
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;

    this.http = axios.create({
      baseURL: BASE_URL,
    });
  }

  /**
   * Fetch perpetual candles for a given product
   * @param productId e.g. 'BTC-PERP-INTX'
   * @param granularity e.g. 'ONE_MINUTE', 'ONE_HOUR'
   */
  public async getPerpCandles(
    productId: string,
    granularity: string = 'ONE_MINUTE'
  ) {
    const method = 'GET';
    const requestPath = `/api/v3/brokerage/products/${productId}/candles`;

    // Generate a fresh JWT for this request
    const token = generateToken(
      method,
      requestPath,
      this.apiKey,
      this.apiSecret
    );

    const headers = {
      Authorization: `Bearer ${token}`,
    };

    const resp = await this.http.get(
      `https://api.coinbase.com${requestPath}?granularity=${granularity}`,
      { headers }
    );
    return resp.data;
  }
}

// -------------------------
// Example usage

(async () => {
  const client = new CoinbaseAdvancedClient(
    process.env.COINBASE_API_KEY!,
    process.env.COINBASE_SECRET_KEY!
  );

  try {
    const candles = await client.getPerpCandles('BTC-PERP-INTX', 'ONE_MINUTE');
    console.log('Candles:', candles);
  } catch (err: any) {
    console.error('Error fetching candles:', err.response?.data || err.message);
  }
})();
