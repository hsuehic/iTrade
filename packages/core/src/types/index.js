// Re-export subscription types
export * from './subscription';
// Order Types
export var OrderType;
(function (OrderType) {
    OrderType["MARKET"] = "MARKET";
    OrderType["LIMIT"] = "LIMIT";
    OrderType["STOP_LOSS"] = "STOP_LOSS";
    OrderType["STOP_LOSS_LIMIT"] = "STOP_LOSS_LIMIT";
    OrderType["TAKE_PROFIT"] = "TAKE_PROFIT";
    OrderType["TAKE_PROFIT_LIMIT"] = "TAKE_PROFIT_LIMIT";
})(OrderType || (OrderType = {}));
export var OrderSide;
(function (OrderSide) {
    OrderSide["BUY"] = "BUY";
    OrderSide["SELL"] = "SELL";
})(OrderSide || (OrderSide = {}));
export var OrderStatus;
(function (OrderStatus) {
    OrderStatus["NEW"] = "NEW";
    OrderStatus["PARTIALLY_FILLED"] = "PARTIALLY_FILLED";
    OrderStatus["FILLED"] = "FILLED";
    OrderStatus["CANCELED"] = "CANCELED";
    OrderStatus["REJECTED"] = "REJECTED";
    OrderStatus["EXPIRED"] = "EXPIRED";
})(OrderStatus || (OrderStatus = {}));
export var TimeInForce;
(function (TimeInForce) {
    TimeInForce["GTC"] = "GTC";
    TimeInForce["IOC"] = "IOC";
    TimeInForce["FOK"] = "FOK";
})(TimeInForce || (TimeInForce = {}));
// Logger Types
export var LogLevel;
(function (LogLevel) {
    LogLevel["DEBUG"] = "debug";
    LogLevel["INFO"] = "info";
    LogLevel["WARN"] = "warn";
    LogLevel["ERROR"] = "error";
})(LogLevel || (LogLevel = {}));
//# sourceMappingURL=index.js.map