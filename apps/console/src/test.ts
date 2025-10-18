import { config } from 'dotenv';
import { OKXExchange } from '@itrade/exchange-connectors';

config();

console.log(process.env);

const main = async () => {
  const okxExchange = new OKXExchange();
  await okxExchange.connect({
    apiKey: process.env.OKX_API_KEY,
    secretKey: process.env.OKX_API_SECRET,
    passphrase: process.env.OKX_API_PASSPHRASE,
  });
  const ticker = await okxExchange.getTicker('BTC-USDT');
  console.log(ticker);
};

main();
