import { Coin, Quote } from '../base/type';
import type { KlineInterval } from '@itrade/core';

export type SpotSymbols = `${Coin}${Quote}`;
export type FuturesSymbols = `${Coin}${Quote}`;
// Re-export KlineInterval with Binance-specific name for backward compatibility
export type KlineIntervals = KlineInterval;
export type DepthLevels = '' | '5' | '20';

/** ===== Stream Keys ===== */
export type SpotTradeStreams = `spot:${SpotSymbols}@trade`;
export type SpotAggTradeStreams = `spot:${SpotSymbols}@aggTrade`;
export type SpotKlineStreams = `spot:${SpotSymbols}@kline_${KlineIntervals}`;
export type SpotDepthStreams = `spot:${SpotSymbols}@depth${DepthLevels}`;
export type SpotBookTickerStreams = `spot:${SpotSymbols}@bookTicker`;

export type FuturesAggTradeStreams = `futures:${FuturesSymbols}@aggTrade`;
export type FuturesKlineStreams = `futures:${FuturesSymbols}@kline_${KlineIntervals}`;
export type FuturesDepthStreams = `futures:${FuturesSymbols}@depth${DepthLevels}`;
export type FuturesBookTickerStreams = `futures:${FuturesSymbols}@bookTicker`;

export type SpotUserStreams =
  | 'spot:orderUpdate'
  | 'spot:executionReport'
  | 'spot:accountUpdate';
export type FuturesUserStreams =
  | 'futures:orderUpdate'
  | 'futures:executionReport'
  | 'futures:accountUpdate';

/** ===== Raw Messages ===== */
export interface SpotTradeMessage {
  e: 'trade';
  E: number;
  s: string;
  t: number;
  p: string;
  q: string;
  b: number;
  a: number;
  T: number;
  m: boolean;
  M: boolean;
}
export interface SpotAggTradeMessage {
  e: 'aggTrade';
  E: number;
  s: string;
  a: number;
  p: string;
  q: string;
  f: number;
  l: number;
  T: number;
  m: boolean;
  M: boolean;
}
export interface SpotKlineMessage {
  e: 'kline';
  E: number;
  s: string;
  K: any;
} // k 可进一步细化
export interface SpotDepthMessage {
  e: string;
  E: number;
  s: string;
  U: number;
  u: number;
  b: any[];
  a: any[];
}
export interface SpotBookTickerMessage {
  u: number;
  s: string;
  b: string;
  B: string;
  a: string;
  A: string;
}

/** Futures & UserDataStream 可同理定义 ... */
export type FuturesAggTradeMessage = SpotAggTradeMessage;
export type FuturesKlineMessage = SpotKlineMessage;
export type FuturesDepthMessage = SpotDepthMessage;
export type FuturesBookTickerMessage = SpotBookTickerMessage;
export interface SpotExecutionReport {
  e: 'executionReport'; // 事件类型
  E: number; // 事件时间（毫秒）
  s: string; // 交易对（如 'BTCUSDT'）
  c: string; // 客户端订单 ID
  S: 'BUY' | 'SELL'; // 订单方向
  o: 'LIMIT' | 'MARKET' | 'STOP_MARKET' | 'STOP_LIMIT' | 'LIMIT_MAKER'; // 订单类型
  f: 'GTC' | 'IOC' | 'FOK'; // 有效时间类型
  q: string; // 原始订单数量
  p: string; // 原始订单价格
  P: string; // 最小价格变动单位
  F: string; // 过滤器
  g: number; // OCO 组 ID
  C: string; // 父订单 ID
  x: 'NEW' | 'CANCELED' | 'REPLACED' | 'TRADE' | 'EXPIRED'; // 当前订单状态
  r: 'NONE' | 'LIMIT' | 'STOP_MARKET' | 'STOP_LIMIT' | 'LIMIT_MAKER'; // 订单的原始类型
  i: number; // 订单 ID
  l: string; // 最后成交数量
  z: string; // 累计成交数量
  L: string; // 最后成交价格
  n: string; // 最后成交时间
  N: string; // 成交的市场价格
  T: number; // 订单创建时间
  t: number; // 最后成交时间
  I: number; // 交易 ID
  w: boolean; // 是否为挂单
  m: boolean; // 是否为买方市场制造者
  M: boolean; // 是否为挂单
  O: number; // 订单创建时间（毫秒）
  A: string; // 累计成交金额
  B: string; // 累计成交数量
  U: string; // 累计成交金额
  V: string; // 累计成交数量
  W: string; // 累计成交金额
  X: string; // 累计成交数量
  Y: string; // 累计成交金额
  Z: string; // 累计成交数量
}

export interface SpotOrderUpdate {
  e: 'orderUpdate'; // 事件类型
  E: number; // 事件时间（毫秒）
  s: string; // 交易对（如 'BTCUSDT'）
  c: string; // 客户端订单 ID
  S: 'BUY' | 'SELL'; // 订单方向
  o: 'LIMIT' | 'MARKET' | 'STOP_MARKET' | 'STOP_LIMIT' | 'LIMIT_MAKER'; // 订单类型
  f: 'GTC' | 'IOC' | 'FOK'; // 有效时间类型
  q: string; // 原始订单数量
  p: string; // 原始订单价格
  P: string; // 最小价格变动单位
  F: string; // 过滤器
  g: number; // OCO 组 ID
  C: string; // 父订单 ID
  x: 'NEW' | 'CANCELED' | 'REPLACED' | 'TRADE' | 'EXPIRED'; // 当前订单状态
  X:
    | 'NEW'
    | 'PARTIALLY_FILLED'
    | 'FILLED'
    | 'CANCELED'
    | 'PENDING_CANCEL'
    | 'STOPPED'
    | 'REJECTED'
    | 'EXPIRED'; // 订单的最终状态
  r: 'NONE' | 'LIMIT' | 'STOP_MARKET' | 'STOP_LIMIT' | 'LIMIT_MAKER'; // 订单的原始类型
  i: number; // 订单 ID
  l: string; // 最后成交数量
  z: string; // 累计成交数量
  L: string; // 最后成交价格
  n: string; // 最后成交时间
  N: string; // 成交的市场价格
  T: number; // 订单创建时间
  t: number; // 最后成交时间
  I: number; // 交易 ID
  w: boolean; // 是否为挂单
  m: boolean; // 是否为买方市场制造者
  M: boolean; // 是否为挂单
  O: number; // 订单创建时间（毫秒）
  A: string; // 累计成交金额
  B: string; // 累计成交数量
  U: string; // 累计成交金额
  V: string; // 累计成交数量
  W: string; // 累计成交金额
  Y: string; // 累计成交金额
  Z: string; // 累计成交数量
}

export interface SpotAccountUpdate {
  e: 'outboundAccountPosition'; // 事件类型
  E: number; // 事件时间（毫秒）
  u: 'ORDER' | 'TRANSFER' | 'SPOT' | 'MARGIN' | 'FUNDING'; // 更新类型
  B: {
    a: string; // 资产名称
    f: string; // 可用余额
    l: string; // 冻结余额
  }[]; // 资产列表
}

export interface FuturesOrderTradeUpdate {
  e: 'ORDER_TRADE_UPDATE'; // 事件类型
  E: number; // 事件时间（毫秒）
  T: number; // 订单创建时间（毫秒）
  s: string; // 交易对（如 'BTCUSDT'）
  c: string; // 客户端订单 ID
  S: 'BUY' | 'SELL'; // 订单方向
  o: 'LIMIT' | 'MARKET' | 'STOP_MARKET' | 'STOP_LIMIT' | 'LIMIT_MAKER'; // 订单类型
  f: 'GTC' | 'IOC' | 'FOK'; // 有效时间类型
  q: string; // 原始订单数量
  p: string; // 原始订单价格
  P: string; // 最小价格变动单位
  F: string; // 过滤器
  g: number; // OCO 组 ID
  C: string; // 父订单 ID
  x: 'NEW' | 'CANCELED' | 'REPLACED' | 'TRADE' | 'EXPIRED'; // 当前订单状态
  X:
    | 'NEW'
    | 'PARTIALLY_FILLED'
    | 'FILLED'
    | 'CANCELED'
    | 'PENDING_CANCEL'
    | 'STOPPED'
    | 'REJECTED'
    | 'EXPIRED'; // 订单的最终状态
  r: 'NONE' | 'LIMIT' | 'STOP_MARKET' | 'STOP_LIMIT' | 'LIMIT_MAKER'; // 订单的原始类型
  i: number; // 订单 ID
  l: string; // 最后成交数量
  z: string; // 累计成交数量
  L: string; // 最后成交价格
  n: string; // 最后成交时间
  N: string; // 成交的市场价格
  t: number; // 最后成交时间
  I: number; // 交易 ID
  w: boolean; // 是否为挂单
  m: boolean; // 是否为买方市场制造者
  M: boolean; // 是否为挂单
  O: number; // 订单创建时间（毫秒）
  A: string; // 累计成交金额
  B: string; // 累计成交数量
  U: string; // 累计成交金额
  V: string; // 累计成交数量
  W: string; // 累计成交金额
  // X: string; // 累计成交数量
  Y: string; // 累计成交金额
  Z: string; // 累计成交数量
}

export type FuturesExecutionReport = any;
export type FuturesAccountUpdate = any;

/** ===== Stream -> Raw Mapping ===== */
export type StreamRawMapping = {
  // Spot
  [key in SpotTradeStreams]: SpotTradeMessage;
} & { [key in SpotAggTradeStreams]: SpotAggTradeMessage } & {
  [key in SpotKlineStreams]: SpotKlineMessage;
} & { [key in SpotDepthStreams]: SpotDepthMessage } & {
  [key in SpotBookTickerStreams]: SpotBookTickerMessage;
} & { [key in FuturesAggTradeStreams]: FuturesAggTradeMessage } & {
  // Futures
  [key in FuturesKlineStreams]: FuturesKlineMessage;
} & { [key in FuturesDepthStreams]: FuturesDepthMessage } & {
  [key in FuturesBookTickerStreams]: FuturesBookTickerMessage;
} & {
  // User Data
  [key in SpotUserStreams]: SpotExecutionReport | SpotOrderUpdate | SpotAccountUpdate;
} & {
  [key in FuturesUserStreams]:
    | FuturesOrderTradeUpdate
    | FuturesExecutionReport
    | FuturesAccountUpdate;
};
