import { config } from 'dotenv';
import { OKXExchange } from '@itrade/exchange-connectors';

config();

console.log(process.env);

const main = async () => {
  const okxExchange = new OKXExchange();
  await okxExchange.connect({
    apiKey: process.env.OKX_API_KEY,
    secretKey: process.env.OKX_SECRET_KEY,
    passphrase: process.env.OKX_PASSPHRASE,
  });
  const ticker = await okxExchange.getTicker('BTC-USDT');
  console.log(ticker);

  // okxExchange.subscribeToTicker('BTC-USDT-SWAP');
  okxExchange.subscribeToKlines('BTC-USDT', '1m');
  okxExchange.subscribeToKlines('BTC-USDT-SWAP', '1m');
  // okxExchange.on('ticker', (...args) => {
  //   console.log(args);
  // });
  okxExchange.on('kline', (...args) => {
    console.log(args);
  });
};

main();
