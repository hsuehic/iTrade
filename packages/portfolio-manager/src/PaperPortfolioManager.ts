import { Decimal } from 'decimal.js';
import {
  IPortfolioManager,
  Balance,
  Position,
  IDataManager,
  ILogger,
  OrderSide,
} from '@itrade/core';

export interface PaperPortfolioConfig {
  initialBalance: Decimal;
  initialAsset?: string; // Default asset for initial balance (e.g., 'USDT')
  sessionId: number;
  userId: string;
}

/**
 * Paper Portfolio Manager for simulated trading
 * Manages virtual balances and positions for paper trading sessions
 */
export class PaperPortfolioManager implements IPortfolioManager {
  private paperBalances = new Map<string, Balance>();
  private paperPositions = new Map<string, Position>();
  private readonly config: PaperPortfolioConfig;

  constructor(
    config: PaperPortfolioConfig,
    private readonly dataManager: IDataManager,
    private readonly logger: ILogger,
  ) {
    this.config = config;
    this.initializeBalance();
  }

  /**
   * Initialize with starting balance
   */
  private initializeBalance(): void {
    const asset = this.config.initialAsset || 'USDT';
    const balance: Balance = {
      asset,
      free: this.config.initialBalance,
      locked: new Decimal(0),
      total: this.config.initialBalance,
    };

    this.paperBalances.set(asset, balance);
    this.logger.info(
      `📊 [PAPER_PORTFOLIO] Initialized with ${this.config.initialBalance.toString()} ${asset}`,
    );
  }

  /**
   * Get all simulated balances
   */
  async getBalances(): Promise<Balance[]> {
    return Array.from(this.paperBalances.values());
  }

  /**
   * Get balance for specific asset
   */
  async getBalance(asset: string): Promise<Balance | undefined> {
    return this.paperBalances.get(asset);
  }

  /**
   * Get all simulated positions
   */
  async getPositions(): Promise<Position[]> {
    return Array.from(this.paperPositions.values());
  }

  /**
   * Get position for specific symbol
   */
  async getPosition(symbol: string): Promise<Position | undefined> {
    return this.paperPositions.get(symbol);
  }

  /**
   * Update balance after simulated trade
   */
  async updateBalance(
    asset: string,
    freeChange: Decimal,
    lockedChange: Decimal = new Decimal(0),
  ): Promise<void> {
    const existing = this.paperBalances.get(asset);

    if (!existing) {
      // Create new balance entry
      const newBalance: Balance = {
        asset,
        free: freeChange.isNegative() ? new Decimal(0) : freeChange,
        locked: lockedChange.isNegative() ? new Decimal(0) : lockedChange,
        total: freeChange.add(lockedChange),
      };
      this.paperBalances.set(asset, newBalance);
    } else {
      // Update existing balance
      const newFree = existing.free.add(freeChange);
      const newLocked = existing.locked.add(lockedChange);

      // Prevent negative balances
      const updatedBalance: Balance = {
        ...existing,
        free: newFree.isNegative() ? new Decimal(0) : newFree,
        locked: newLocked.isNegative() ? new Decimal(0) : newLocked,
        total: newFree.add(newLocked),
      };

      this.paperBalances.set(asset, updatedBalance);
    }

    // Persist balance update to database
    await this.persistBalanceUpdate(asset);

    this.logger.debug(
      `💰 [PAPER_PORTFOLIO] Updated ${asset} balance: free=${freeChange.toString()}, locked=${lockedChange.toString()}`,
    );
  }

  /**
   * Update position after simulated trade (IPortfolioManager interface)
   */
  async updatePosition(
    symbol: string,
    side: OrderSide,
    size: Decimal,
    price: Decimal,
  ): Promise<void> {
    const quantityChange = side === OrderSide.BUY ? size : size.neg();
    await this.updatePaperPosition(symbol, quantityChange, price);
  }

  /**
   * Update paper position after simulated trade
   */
  async updatePaperPosition(
    symbol: string,
    quantityChange: Decimal,
    avgPrice?: Decimal,
  ): Promise<void> {
    const existing = this.paperPositions.get(symbol);

    if (!existing) {
      // Create new position
      if (!quantityChange.isZero()) {
        const newPosition: Position = {
          symbol,
          side: quantityChange.gt(0) ? 'long' : 'short',
          quantity: quantityChange.abs(),
          avgPrice: avgPrice || new Decimal(0),
          markPrice: avgPrice || new Decimal(0),
          unrealizedPnl: new Decimal(0),
          leverage: new Decimal(1),
          timestamp: new Date(),
        };
        this.paperPositions.set(symbol, newPosition);
      }
    } else {
      // Update existing position
      const newQuantity = existing.quantity.add(quantityChange);

      if (newQuantity.isZero()) {
        // Position closed
        this.paperPositions.delete(symbol);
      } else {
        // Update position
        let newAvgPrice = existing.avgPrice;

        // Calculate new average price if provided and quantity is increasing
        if (avgPrice && quantityChange.gt(0)) {
          const existingValue = existing.quantity.mul(existing.avgPrice);
          const newValue = quantityChange.mul(avgPrice);
          newAvgPrice = existingValue.add(newValue).div(newQuantity);
        }

        const updatedPosition: Position = {
          ...existing,
          side: newQuantity.gt(0) ? 'long' : 'short',
          quantity: newQuantity.abs(),
          avgPrice: newAvgPrice,
          markPrice: newAvgPrice,
          timestamp: new Date(),
        };

        this.paperPositions.set(symbol, updatedPosition);
      }
    }

    // Persist position update to database
    await this.persistPositionUpdate(symbol);

    this.logger.debug(
      `📊 [PAPER_PORTFOLIO] Updated ${symbol} position: quantity=${quantityChange.toString()}, avgPrice=${avgPrice?.toString() || 'N/A'}`,
    );
  }

  /**
   * Check if sufficient balance exists for trade
   */
  async checkSufficientBalance(asset: string, requiredAmount: Decimal): Promise<boolean> {
    const balance = this.paperBalances.get(asset);
    if (!balance) {
      return false;
    }

    return balance.free.gte(requiredAmount);
  }

  /**
   * Lock balance for pending order
   */
  async lockBalance(asset: string, amount: Decimal): Promise<void> {
    await this.updateBalance(asset, amount.neg(), amount);
  }

  /**
   * Unlock balance when order is cancelled
   */
  async unlockBalance(asset: string, amount: Decimal): Promise<void> {
    await this.updateBalance(asset, amount, amount.neg());
  }

  /**
   * Update balance (for compatibility with PaperTradingEngine)
   */
  async updateBalanceForAsset(
    asset: string,
    freeChange: Decimal,
    lockedChange: Decimal = new Decimal(0),
  ): Promise<void> {
    await this.updateBalance(asset, freeChange, lockedChange);
  }

  /**
   * Get total portfolio value in base currency (USDT)
   */
  async getTotalValue(priceMap?: Map<string, Decimal>): Promise<Decimal> {
    let totalValue = new Decimal(0);

    // Add cash balances
    for (const [asset, balance] of this.paperBalances) {
      if (asset === 'USDT') {
        totalValue = totalValue.add(balance.total);
      } else if (priceMap?.has(`${asset}/USDT`)) {
        const price = priceMap.get(`${asset}/USDT`)!;
        totalValue = totalValue.add(balance.total.mul(price));
      }
    }

    // Add position values
    for (const [symbol, position] of this.paperPositions) {
      if (priceMap?.has(symbol)) {
        const price = priceMap.get(symbol)!;
        const positionValue = position.quantity.mul(price);
        totalValue = totalValue.add(positionValue);
      }
    }

    return totalValue;
  }

  /**
   * Reset portfolio to initial state
   */
  async reset(): Promise<void> {
    this.paperBalances.clear();
    this.paperPositions.clear();
    this.initializeBalance();

    this.logger.info(
      `🔄 [PAPER_PORTFOLIO] Reset portfolio for session ${this.config.sessionId}`,
    );
  }

  /**
   * Get portfolio summary
   */
  async getSummary(): Promise<{
    totalValue: Decimal;
    balances: Balance[];
    positions: Position[];
    initialBalance: Decimal;
    pnl: Decimal;
    pnlPercent: Decimal;
  }> {
    const balances = await this.getBalances();
    const positions = await this.getPositions();
    const totalValue = await this.getTotalValue();
    const pnl = totalValue.sub(this.config.initialBalance);
    const pnlPercent = pnl.div(this.config.initialBalance).mul(100);

    return {
      totalValue,
      balances,
      positions,
      initialBalance: this.config.initialBalance,
      pnl,
      pnlPercent,
    };
  }

  // IPortfolioManager required methods
  async getPortfolioValue(): Promise<Decimal> {
    return await this.getTotalValue();
  }

  async closePosition(symbol: string): Promise<void> {
    this.paperPositions.delete(symbol);
    await this.persistPositionUpdate(symbol);
  }

  async syncPositions(_positions: Position[], _exchangeName?: string): Promise<void> {
    // For paper trading, we don't sync with external positions
    // This is a no-op since we manage our own positions
  }

  async getUnrealizedPnl(): Promise<Decimal> {
    let totalUnrealizedPnl = new Decimal(0);
    for (const position of this.paperPositions.values()) {
      totalUnrealizedPnl = totalUnrealizedPnl.add(position.unrealizedPnl);
    }
    return totalUnrealizedPnl;
  }

  async getRealizedPnl(_period?: { start: Date; end: Date }): Promise<Decimal> {
    // TODO: Calculate from trade history
    return new Decimal(0);
  }

  async calculateSharpeRatio(_period: { start: Date; end: Date }): Promise<Decimal> {
    // TODO: Calculate from returns
    return new Decimal(0);
  }

  calculateMaxDrawdown(_period: { start: Date; end: Date }): Decimal {
    // TODO: Calculate from equity curve
    return new Decimal(0);
  }

  async getPerformanceMetrics(_period: { start: Date; end: Date }): Promise<{
    totalReturn: Decimal;
    annualizedReturn: Decimal;
    volatility: Decimal;
    sharpeRatio: Decimal;
    maxDrawdown: Decimal;
  }> {
    // TODO: Calculate from trade history
    return {
      totalReturn: new Decimal(0),
      annualizedReturn: new Decimal(0),
      volatility: new Decimal(0),
      sharpeRatio: new Decimal(0),
      maxDrawdown: new Decimal(0),
    };
  }

  /**
   * Persist balance update to database
   */
  private async persistBalanceUpdate(asset: string): Promise<void> {
    try {
      const balance = this.paperBalances.get(asset);
      if (!balance) return;

      // Save balance snapshot to dry run session
      // TODO: Add saveDryRunBalance method to IDataManager
      // await this.dataManager.saveDryRunBalance?.({
      //   sessionId: this.config.sessionId,
      //   asset,
      //   free: balance.free,
      //   locked: balance.locked,
      //   total: balance.total,
      //   timestamp: new Date(),
      // });
    } catch (error) {
      this.logger.error(`Failed to persist balance update for ${asset}`, error as Error);
    }
  }

  /**
   * Persist position update to database
   */
  private async persistPositionUpdate(symbol: string): Promise<void> {
    try {
      const _position = this.paperPositions.get(symbol);

      // Save position snapshot to dry run session
      // TODO: Add saveDryRunPosition method to IDataManager
      // await this.dataManager.saveDryRunPosition?.({
      //   sessionId: this.config.sessionId,
      //   symbol,
      //   quantity: position?.quantity || new Decimal(0),
      //   avgPrice: position?.avgPrice || new Decimal(0),
      //   unrealizedPnl: position?.unrealizedPnl || new Decimal(0),
      //   timestamp: position?.timestamp || new Date(),
      // });
    } catch (error) {
      this.logger.error(
        `Failed to persist position update for ${symbol}`,
        error as Error,
      );
    }
  }
}
