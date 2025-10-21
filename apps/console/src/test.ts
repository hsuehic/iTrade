import { config } from 'dotenv';
import { OKXExchange, BinanceWebsocket } from '@itrade/exchange-connectors';

config();

// console.log(process.env);

const main = async () => {
  // const okxExchange = new OKXExchange();
  // await okxExchange.connect({
  //   apiKey: process.env.OKX_API_KEY,
  //   secretKey: process.env.OKX_SECRET_KEY,
  //   passphrase: process.env.OKX_PASSPHRASE,
  // });
  // const ticker = await okxExchange.getTicker('BTC-USDT');
  // console.log(ticker);
  // okxExchange.subscribeToTicker('BTC-USDT-SWAP');
  // okxExchange.on('kline', (...args) => {
  //   console.log(args);
  // });
  // okxExchange.subscribeToKlines('BTC-USDT', '1m');
  // okxExchange.subscribeToKlines('BTC-USDT-SWAP', '1m');
  // okxExchange.on('ticker', (...args) => {
  //   console.log(args);
  // });

  const websocket = new BinanceWebsocket({
    // apiKey: process.env.BINANCE_API_KEY,
    network: 'mainnet',
  });
  await websocket.start();
  // websocket.on('data', (data) => {
  //   console.log(data);
  // });
  websocket.subscribe('futures', 'btcusdt@kline_1m', 'MA 2', ({ data }) => {
    if (data.k?.x) {
      console.log('futures');
      console.log(data);
    }
  });
  websocket.on('futures:btcusdt@kline_1m', (data) => {
    console.log('futures');
    console.log(data);
  });
  websocket.subscribe('spot', 'btcusdt@kline_1m', 'MA 2', ({ data }) => {
    if (data.k?.x) {
      console.log('spot');
      console.log(data);
    }
  });
  websocket.on('spot:btcusdt@kline_1m', (data) => {
    console.log('spot');
    console.log(data);
  });
};

main();
