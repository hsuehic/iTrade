import { EventEmitter } from 'events';

import {
  IPortfolioManager,
  PortfolioSnapshot,
  PerformanceMetrics,
  Position,
  Balance,
  OrderSide,
  Order,
} from '@itrade/core';
import { Decimal } from 'decimal.js';

export class PortfolioManager
  extends EventEmitter
  implements IPortfolioManager
{
  private positions: Map<string, Position> = new Map();
  private balances: Map<string, Balance> = new Map();
  private totalValue: Decimal = new Decimal(0);
  private initialValue: Decimal = new Decimal(0);
  private snapshots: PortfolioSnapshot[] = [];
  private maxSnapshotHistory = 10000;

  constructor(initialBalance?: Decimal) {
    super();
    if (initialBalance) {
      this.initialValue = initialBalance;
      this.totalValue = initialBalance;
      this.setBalance('USDT', initialBalance, new Decimal(0));
    }
  }
  getPortfolioValue(): Promise<Decimal> {
    throw new Error('Method not implemented.');
  }
  getPositions(): Promise<Position[]> {
    throw new Error('Method not implemented.');
  }
  getBalances(): Promise<Balance[]> {
    throw new Error('Method not implemented.');
  }
  closePosition(symbol: string): Promise<void> {
    console.log(symbol);
    throw new Error('Method not implemented.');
  }
  getUnrealizedPnl(): Promise<Decimal> {
    throw new Error('Method not implemented.');
  }
  getRealizedPnl(
    period?: { start: Date; end: Date } | undefined
  ): Promise<Decimal> {
    console.log(period);
    throw new Error('Method not implemented.');
  }
  calculateSharpeRatio(period: { start: Date; end: Date }): Promise<Decimal> {
    console.log(period);
    throw new Error('Method not implemented.');
  }
  getPerformanceMetrics(period: { start: Date; end: Date }): Promise<{
    totalReturn: Decimal;
    annualizedReturn: Decimal;
    volatility: Decimal;
    sharpeRatio: Decimal;
    maxDrawdown: Decimal;
  }> {
    console.log(period);
    throw new Error('Method not implemented.');
  }

  // Position Management
  async updatePosition(
    symbol: string,
    side: OrderSide,
    size: Decimal,
    price: Decimal
  ): Promise<void> {
    const position = this.positions.get(symbol);
    if (position) {
      const newQuantity = position.quantity.add(size);
      const totalCost = position.quantity
        .mul(position.avgPrice)
        .add(size.mul(price));
      const newAvgPrice = totalCost.div(newQuantity);
      position.quantity = newQuantity;
      position.avgPrice = newAvgPrice;
    } else {
      this.positions.set(symbol, {
        symbol,
        side: side === OrderSide.BUY ? 'long' : 'short',
        quantity: size,
        avgPrice: price,
        markPrice: price,
        unrealizedPnl: new Decimal(0),
        leverage: new Decimal(1),
        timestamp: new Date(),
      });
    }

    this.emit('positionUpdated', symbol, this.positions.get(symbol));
  }

  calculateUnrealizedPnl(
    symbol: string,
    quantity: Decimal,
    avgPrice: Decimal
  ): Decimal {
    // This would typically use current market prices
    // For now, return zero as a placeholder
    console.log(symbol, quantity, avgPrice);
    return new Decimal(0);
  }

  getPosition(symbol: string): Position | undefined {
    return this.positions.get(symbol);
  }

  getAllPositions(): Position[] {
    return Array.from(this.positions.values());
  }

  // Balance Management
  setBalance(asset: string, free: Decimal, locked: Decimal): void {
    const balance: Balance = {
      asset,
      free,
      locked,
      total: free.add(locked),
    };

    this.balances.set(asset, balance);
    this.emit('balanceUpdated', asset, balance);
  }

  getBalance(asset: string): Balance | undefined {
    return this.balances.get(asset);
  }

  getAllBalances(): Balance[] {
    return Array.from(this.balances.values());
  }

  // Portfolio Analytics
  async updateTotalValue(): Promise<void> {
    let totalValue = new Decimal(0);

    // Add all cash balances (assuming USDT as base currency)
    const usdtBalance = this.getBalance('USDT');
    if (usdtBalance) {
      totalValue = totalValue.add(usdtBalance.total);
    }

    // Add position values (would need current market prices)
    for (const position of this.positions.values()) {
      // Placeholder: use avgPrice as current price
      const positionValue = position.quantity.mul(position.avgPrice);
      totalValue = totalValue.add(positionValue);
    }

    this.totalValue = totalValue;
    this.emit('totalValueUpdated', totalValue);
  }

  getTotalValue(): Decimal {
    return this.totalValue;
  }

  getEquity(): Decimal {
    return this.totalValue;
  }

  calculateReturnPct(): Decimal {
    if (this.initialValue.eq(0)) {
      return new Decimal(0);
    }
    return this.totalValue
      .sub(this.initialValue)
      .div(this.initialValue)
      .mul(100);
  }

  // Snapshot Management
  takeSnapshot(): PortfolioSnapshot {
    const snapshot: PortfolioSnapshot = {
      timestamp: new Date(),
      totalValue: this.totalValue,
      positions: Array.from(this.positions.values()),
      balances: Array.from(this.balances.values()),
    } as PortfolioSnapshot;

    this.snapshots.push(snapshot);

    // Maintain max history
    if (this.snapshots.length > this.maxSnapshotHistory) {
      this.snapshots.shift();
    }

    this.emit('snapshotTaken', snapshot);
    return snapshot;
  }

  getSnapshots(limit?: number): PortfolioSnapshot[] {
    if (limit) {
      return this.snapshots.slice(-limit);
    }
    return [...this.snapshots];
  }

  getLatestSnapshot(): PortfolioSnapshot | undefined {
    return this.snapshots[this.snapshots.length - 1];
  }

  // Performance Analytics
  calculatePerformanceMetrics(): PerformanceMetrics {
    if (this.snapshots.length < 2) {
      return {
        totalReturn: new Decimal(0),
        annualizedReturn: new Decimal(0),
        volatility: new Decimal(0),
        sharpeRatio: new Decimal(0),
        maxDrawdown: new Decimal(0),
        winRate: new Decimal(0),
        profitFactor: new Decimal(0),
        averageWin: new Decimal(0),
        averageLoss: new Decimal(0),
      };
    }

    const returns = this.calculateReturns();
    const totalReturn = this.calculateReturnPct();
    const volatility = this.calculateVolatility(returns);
    const maxDrawdown = this.calculateMaxDrawdown();

    return {
      totalReturn,
      annualizedReturn: this.annualizeReturn(totalReturn),
      volatility,
      sharpeRatio: volatility.eq(0)
        ? new Decimal(0)
        : totalReturn.div(volatility),
      maxDrawdown,
      winRate: new Decimal(0), // Would need trade data
      profitFactor: new Decimal(0), // Would need trade data
      averageWin: new Decimal(0), // Would need trade data
      averageLoss: new Decimal(0), // Would need trade data
    };
  }

  private calculateReturns(): Decimal[] {
    const returns: Decimal[] = [];

    for (let i = 1; i < this.snapshots.length; i++) {
      const prevValue = this.snapshots[i - 1].totalValue;
      const currentValue = this.snapshots[i].totalValue;

      if (prevValue.gt(0)) {
        const returnPct = currentValue.sub(prevValue).div(prevValue);
        returns.push(returnPct);
      }
    }

    return returns;
  }

  private calculateVolatility(returns: Decimal[]): Decimal {
    if (returns.length < 2) return new Decimal(0);

    const mean = returns
      .reduce((sum, r) => sum.add(r), new Decimal(0))
      .div(returns.length);
    const variance = returns
      .reduce((sum, r) => sum.add(r.sub(mean).pow(2)), new Decimal(0))
      .div(returns.length - 1);

    return variance.sqrt();
  }

  calculateMaxDrawdown(): Decimal {
    let maxDrawdown = new Decimal(0);
    let peak = this.initialValue;

    for (const snapshot of this.snapshots) {
      if (snapshot.totalValue.gt(peak)) {
        peak = snapshot.totalValue;
      }

      const drawdown = peak.sub(snapshot.totalValue).div(peak);
      if (drawdown.gt(maxDrawdown)) {
        maxDrawdown = drawdown;
      }
    }

    return maxDrawdown;
  }

  private annualizeReturn(totalReturn: Decimal): Decimal {
    if (this.snapshots.length < 2) return new Decimal(0);

    const firstSnapshot = this.snapshots[0];
    const lastSnapshot = this.snapshots[this.snapshots.length - 1];
    const daysDiff =
      (lastSnapshot.timestamp.getTime() - firstSnapshot.timestamp.getTime()) /
      (1000 * 60 * 60 * 24);
    const years = daysDiff / 365.25;

    if (years <= 0) return new Decimal(0);

    return totalReturn.div(years);
  }

  // Risk Metrics
  getExposure(): Map<string, Decimal> {
    const exposure = new Map<string, Decimal>();

    for (const position of this.positions.values()) {
      const value = position.quantity.mul(position.avgPrice);
      exposure.set(position.symbol, value);
    }

    return exposure;
  }

  getConcentrationRisk(): Decimal {
    if (this.totalValue.eq(0)) return new Decimal(0);

    const exposures = Array.from(this.getExposure().values());
    const maxExposure = exposures.reduce(
      (max, exp) => (exp.gt(max) ? exp : max),
      new Decimal(0)
    );

    return maxExposure.div(this.totalValue);
  }

  // Order Processing
  async processOrderFill(order: Order): Promise<void> {
    // Update position based on filled order
    await this.updatePosition(
      order.symbol,
      order.side,
      order.executedQuantity!,
      order.price!
    );

    // Update balances (simplified logic)
    if (order.side === OrderSide.BUY) {
      const cost = order.executedQuantity!.mul(order.price!);
      this.updateBalanceAfterTrade('USDT', cost!.neg(), new Decimal(0));
    } else {
      const proceeds = order.executedQuantity?.mul(order.price!);
      this.updateBalanceAfterTrade('USDT', proceeds!, new Decimal(0));
    }
  }

  private updateBalanceAfterTrade(
    asset: string,
    amount: Decimal,
    lockedChange: Decimal
  ): void {
    const currentBalance = this.getBalance(asset);
    if (currentBalance) {
      const newFree = currentBalance.free.add(amount);
      const newLocked = currentBalance.locked.add(lockedChange);
      this.setBalance(asset, newFree, newLocked);
    }
  }

  reset(): void {
    this.positions.clear();
    this.balances.clear();
    this.snapshots = [];
    this.totalValue = this.initialValue;

    if (this.initialValue.gt(0)) {
      this.setBalance('USDT', this.initialValue, new Decimal(0));
    }

    this.emit('reset');
  }
}
