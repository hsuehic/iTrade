import { EventEmitter } from 'events';

import { Decimal } from 'decimal.js';
import { v4 as uuidv4 } from 'uuid';
import { Position, OrderSide, Order } from '@itrade/core';

export interface PositionSummary {
  symbol: string;
  totalQuantity: Decimal;
  totalValue: Decimal;
  avgPrice: Decimal;
  unrealizedPnl: Decimal;
  realizedPnl: Decimal;
  percentOfPortfolio: Decimal;
  side: OrderSide;
}

export interface PositionUpdate {
  symbol: string;
  quantity: Decimal;
  price: Decimal;
  side: OrderSide;
  timestamp: Date;
  orderId: string;
}

export class PositionTracker extends EventEmitter {
  private positions: Map<string, Position> = new Map();
  private marketPrices: Map<string, Decimal> = new Map();
  private totalPortfolioValue: Decimal = new Decimal(0);
  private positionHistory: Map<string, PositionUpdate[]> = new Map();

  constructor() {
    super();
  }

  // Position Management
  updatePosition(
    symbol: string,
    quantity: Decimal,
    price: Decimal,
    side: OrderSide,
    orderId?: string,
  ): void {
    const update: PositionUpdate = {
      symbol,
      quantity,
      price,
      side,
      timestamp: new Date(),
      orderId: orderId || uuidv4(),
    };

    // Add to history
    if (!this.positionHistory.has(symbol)) {
      this.positionHistory.set(symbol, []);
    }
    this.positionHistory.get(symbol)!.push(update);

    const existingPosition = this.positions.get(symbol);

    if (existingPosition) {
      this.updateExistingPosition(existingPosition, quantity, price, side);
    } else if (side === OrderSide.BUY) {
      this.createNewPosition(symbol, quantity, price, side);
    }

    this.emit('positionUpdated', symbol, this.positions.get(symbol));
  }

  private updateExistingPosition(
    position: Position,
    quantity: Decimal,
    price: Decimal,
    side: OrderSide,
  ): void {
    if (side === OrderSide.BUY) {
      // Increase position
      const totalQuantity = position.quantity.add(quantity);
      const totalCost = position.quantity.mul(position.avgPrice).add(quantity.mul(price));
      const newAvgPrice = totalCost.div(totalQuantity);

      position.quantity = totalQuantity;
      position.avgPrice = newAvgPrice;
    } else if (side === OrderSide.SELL) {
      // Decrease position
      const remainingQuantity = position.quantity.sub(quantity);

      if (remainingQuantity.lte(0)) {
        // Position closed
        this.positions.delete(position.symbol);
        this.emit('positionClosed', position.symbol);
      } else {
        // Position reduced
        position.quantity = remainingQuantity;
      }

      // Calculate realized PnL
      const realizedPnl = price.sub(position.avgPrice).mul(quantity);
      this.emit('realizedPnl', position.symbol, realizedPnl);
    }

    // Update unrealized PnL
    if (this.positions.has(position.symbol)) {
      this.updateUnrealizedPnl(position);
    }
  }

  private createNewPosition(
    symbol: string,
    quantity: Decimal,
    price: Decimal,
    side: OrderSide,
  ): void {
    const newPosition: Position = {
      symbol,
      quantity,
      avgPrice: price,
      side: side === OrderSide.BUY ? 'long' : 'short',
      markPrice: price,
      unrealizedPnl: new Decimal(0),
      leverage: new Decimal(1),
      timestamp: new Date(),
    };

    this.positions.set(symbol, newPosition);
    this.emit('positionOpened', symbol, newPosition);
  }

  // Market Price Updates

  /**
   * Syncs the internal state with a snapshot of positions from the exchange.
   * This handles creating new positions, updating existing ones, and REMOVING closed positions.
   */
  syncPositions(snapshotPositions: Position[]): void {
    const snapshotSymbols = new Set<string>();

    for (const snapshotPos of snapshotPositions) {
      snapshotSymbols.add(snapshotPos.symbol);
      const existingPos = this.positions.get(snapshotPos.symbol);

      if (existingPos) {
        // Update existing position with snapshot data
        this.positions.set(snapshotPos.symbol, snapshotPos);
        this.emit('positionUpdated', snapshotPos.symbol, snapshotPos);
      } else {
        // Create new position from snapshot
        this.positions.set(snapshotPos.symbol, snapshotPos);
        this.emit('positionOpened', snapshotPos.symbol, snapshotPos);
      }

      // Update market price if available in snapshot
      if (snapshotPos.markPrice) {
        this.marketPrices.set(snapshotPos.symbol, snapshotPos.markPrice);
      }
    }

    // Identify and remove positions that are missing from the snapshot
    for (const symbol of this.positions.keys()) {
      if (!snapshotSymbols.has(symbol)) {
        this.positions.delete(symbol);
        this.emit('positionClosed', symbol);
      }
    }
  }
  updateMarketPrice(symbol: string, price: Decimal): void {
    this.marketPrices.set(symbol, price);

    const position = this.positions.get(symbol);
    if (position) {
      this.updateUnrealizedPnl(position);
      this.emit('priceUpdated', symbol, price);
    }
  }

  private updateUnrealizedPnl(position: Position): void {
    const marketPrice = this.marketPrices.get(position.symbol);
    if (marketPrice) {
      const unrealizedPnl = marketPrice.sub(position.avgPrice).mul(position.quantity);
      position.unrealizedPnl = unrealizedPnl;
      this.emit('unrealizedPnlUpdated', position.symbol, unrealizedPnl);
    }
  }

  // Position Queries
  getPosition(symbol: string): Position | undefined {
    return this.positions.get(symbol);
  }

  getAllPositions(): Position[] {
    return Array.from(this.positions.values());
  }

  getPositionSummaries(): PositionSummary[] {
    const summaries: PositionSummary[] = [];

    for (const position of this.positions.values()) {
      const marketPrice = this.marketPrices.get(position.symbol) || position.avgPrice;
      const totalValue = position.quantity.mul(marketPrice);
      const percentOfPortfolio = this.totalPortfolioValue.gt(0)
        ? totalValue.div(this.totalPortfolioValue).mul(100)
        : new Decimal(0);

      summaries.push({
        symbol: position.symbol,
        totalQuantity: position.quantity,
        totalValue,
        avgPrice: position.avgPrice,
        unrealizedPnl: position.unrealizedPnl || new Decimal(0),
        realizedPnl: new Decimal(0), // Would need to track this separately
        percentOfPortfolio,
        side: position.side as unknown as OrderSide,
      });
    }

    return summaries.sort((a, b) => b.totalValue.comparedTo(a.totalValue));
  }

  // Portfolio Metrics
  setTotalPortfolioValue(value: Decimal): void {
    this.totalPortfolioValue = value;
  }

  getTotalUnrealizedPnl(): Decimal {
    return Array.from(this.positions.values()).reduce(
      (total, position) => total.add(position.unrealizedPnl || new Decimal(0)),
      new Decimal(0),
    );
  }

  getTotalPositionValue(): Decimal {
    let totalValue = new Decimal(0);

    for (const position of this.positions.values()) {
      const marketPrice = this.marketPrices.get(position.symbol) || position.avgPrice;
      const positionValue = position.quantity.mul(marketPrice);
      totalValue = totalValue.add(positionValue);
    }

    return totalValue;
  }

  getExposureBreakdown(): Map<string, Decimal> {
    const exposures = new Map<string, Decimal>();
    const totalValue = this.getTotalPositionValue();

    for (const position of this.positions.values()) {
      const marketPrice = this.marketPrices.get(position.symbol) || position.avgPrice;
      const positionValue = position.quantity.mul(marketPrice);
      const exposure = totalValue.gt(0)
        ? positionValue.div(totalValue).mul(100)
        : new Decimal(0);
      exposures.set(position.symbol, exposure);
    }

    return exposures;
  }

  // Risk Metrics
  getConcentrationRisk(): Decimal {
    const exposures = Array.from(this.getExposureBreakdown().values());
    return exposures.length > 0
      ? exposures.reduce((max, exp) => (exp.gt(max) ? exp : max), new Decimal(0))
      : new Decimal(0);
  }

  getPositionCount(): number {
    return this.positions.size;
  }

  getLargestPosition(): PositionSummary | undefined {
    const summaries = this.getPositionSummaries();
    return summaries.length > 0 ? summaries[0] : undefined;
  }

  // Historical Data
  getPositionHistory(symbol: string): PositionUpdate[] {
    return this.positionHistory.get(symbol) || [];
  }

  getAllPositionHistory(): Map<string, PositionUpdate[]> {
    return new Map(this.positionHistory);
  }

  // Order Processing
  processOrderFill(order: Order): void {
    if (
      order.status === 'FILLED' &&
      order.executedQuantity &&
      order.executedQuantity.gt(0)
    ) {
      this.updatePosition(
        order.symbol,
        order.executedQuantity,
        order.price!,
        order.side,
        order.id,
      );
    }
  }

  // Utility Methods
  hasPosition(symbol: string): boolean {
    return this.positions.has(symbol);
  }

  isLong(symbol: string): boolean {
    const position = this.positions.get(symbol);
    return position ? position.side === 'long' : false;
  }

  isShort(symbol: string): boolean {
    const position = this.positions.get(symbol);
    return position ? position.side === 'short' : false;
  }

  getNetExposure(): Decimal {
    let netExposure = new Decimal(0);

    for (const position of this.positions.values()) {
      const marketPrice = this.marketPrices.get(position.symbol) || position.avgPrice;
      const positionValue = position.quantity.mul(marketPrice);

      if (position.side === 'long') {
        netExposure = netExposure.add(positionValue);
      } else {
        netExposure = netExposure.sub(positionValue);
      }
    }

    return netExposure;
  }

  clearPositions(): void {
    this.positions.clear();
    this.marketPrices.clear();
    this.positionHistory.clear();
    this.emit('positionsCleared');
  }
}
