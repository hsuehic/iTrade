import { Decimal } from 'decimal.js';
import {
  BacktestConfig,
  BacktestResult,
  IBacktestEngine,
  IStrategy,
  IDataManager,
  BacktestTrade,
  OrderSide,
  Kline,
  StrategyResult,
  isHoldResult,
  KlineInterval,
} from '@itrade/core';

export class BacktestEngine implements IBacktestEngine {
  private trades: BacktestTrade[] = [];
  private equity: Array<{ timestamp: Date; value: Decimal }> = [];
  private currentBalance: Decimal = new Decimal(0);
  private positions: Map<
    string,
    { quantity: Decimal; avgPrice: Decimal; side: OrderSide }
  > = new Map();

  public async runBacktest(
    strategy: IStrategy,
    config: BacktestConfig,
    dataManager: IDataManager,
  ): Promise<BacktestResult> {
    // Initialize backtest state
    this.trades = [];
    this.equity = [];
    this.currentBalance = config.initialBalance;
    this.positions.clear();

    // Record initial equity
    this.equity.push({
      timestamp: config.startDate,
      value: this.currentBalance,
    });

    // Process each symbol
    for (const symbol of config.symbols) {
      await this.backtestSymbol(symbol, strategy, config, dataManager);
    }

    // Calculate final metrics
    return this.calculateMetrics(this.trades, config.initialBalance);
  }

  private async backtestSymbol(
    symbol: string,
    strategy: IStrategy,
    config: BacktestConfig,
    dataManager: IDataManager,
  ): Promise<void> {
    const { exchange } = strategy.config;
    // Get historical data
    const klines = await dataManager.getKlines(
      symbol,
      config.timeframe,
      config.startDate,
      config.endDate,
    );

    // Process each kline
    for (const kline of klines) {
      // Analyze with strategy
      const result = await strategy.analyze({
        klines: [kline],
        exchangeName: Array.isArray(exchange) ? exchange[0] : exchange,
        symbol,
      });

      // Execute trades based on strategy signals
      if (result.action !== 'hold' && result.quantity) {
        await this.executeTrade(symbol, result, kline, config);
      }

      // Update equity curve
      const portfolioValue = this.calculatePortfolioValue(klines);
      this.equity.push({
        timestamp: kline.closeTime,
        value: portfolioValue,
      });
    }
  }

  private async executeTrade(
    symbol: string,
    signal: StrategyResult,
    kline: Kline,
    config: BacktestConfig,
  ): Promise<void> {
    if (isHoldResult(signal)) return;
    if (!signal.quantity) return;

    const price = signal.price || kline.close;
    const slippageAdjustedPrice = this.applySlippage(
      price,
      signal.action,
      config.slippage,
    );
    const commission = slippageAdjustedPrice.mul(signal.quantity).mul(config.commission);

    const currentPosition = this.positions.get(symbol);

    if (signal.action === 'buy') {
      const cost = slippageAdjustedPrice.mul(signal.quantity).add(commission);

      if (this.currentBalance.gte(cost)) {
        this.currentBalance = this.currentBalance.sub(cost);

        if (currentPosition) {
          // Add to existing position
          const totalQuantity = currentPosition.quantity.add(signal.quantity);
          const totalValue = currentPosition.quantity
            .mul(currentPosition.avgPrice)
            .add(slippageAdjustedPrice.mul(signal.quantity));
          const avgPrice = totalValue.div(totalQuantity);

          this.positions.set(symbol, {
            quantity: totalQuantity,
            avgPrice,
            side: OrderSide.BUY,
          });
        } else {
          // New position
          this.positions.set(symbol, {
            quantity: signal.quantity,
            avgPrice: slippageAdjustedPrice,
            side: OrderSide.BUY,
          });
        }
      }
    } else if (
      signal.action === 'sell' &&
      currentPosition &&
      currentPosition.quantity.gte(signal.quantity)
    ) {
      // Sell position
      const proceeds = slippageAdjustedPrice.mul(signal.quantity).sub(commission);
      this.currentBalance = this.currentBalance.add(proceeds);

      // Calculate PnL
      const pnl = slippageAdjustedPrice
        .sub(currentPosition.avgPrice)
        .mul(signal.quantity)
        .sub(commission);

      // Record trade
      this.trades.push({
        symbol,
        side: OrderSide.SELL,
        entryPrice: currentPosition.avgPrice,
        exitPrice: slippageAdjustedPrice,
        quantity: signal.quantity,
        entryTime: new Date(), // This should be tracked from position opening
        exitTime: kline.closeTime,
        pnl,
        commission,
        duration: 0, // Calculate based on entry/exit time
      });

      // Update position
      const remainingQuantity = currentPosition.quantity.sub(signal.quantity);
      if (remainingQuantity.isZero()) {
        this.positions.delete(symbol);
      } else {
        this.positions.set(symbol, {
          ...currentPosition,
          quantity: remainingQuantity,
        });
      }
    }
  }

  private applySlippage(
    price: Decimal,
    action: 'buy' | 'sell',
    slippage?: Decimal,
  ): Decimal {
    if (!slippage || slippage.isZero()) {
      return price;
    }

    const slippageMultiplier =
      action === 'buy'
        ? new Decimal(1).add(slippage) // Pay more when buying
        : new Decimal(1).sub(slippage); // Receive less when selling

    return price.mul(slippageMultiplier);
  }

  private calculatePortfolioValue(klines: Kline[]): Decimal {
    const latestPrice = klines[klines.length - 1]?.close || new Decimal(0);
    let totalValue = this.currentBalance;

    for (const [_symbol, position] of this.positions) {
      // In a real implementation, you'd get the latest price for each symbol
      const positionValue = latestPrice.mul(position.quantity);
      totalValue = totalValue.add(positionValue);
    }

    return totalValue;
  }

  public calculateMetrics(trades: any[], initialBalance: Decimal): BacktestResult {
    if (trades.length === 0) {
      return {
        totalReturn: new Decimal(0),
        annualizedReturn: new Decimal(0),
        sharpeRatio: new Decimal(0),
        maxDrawdown: new Decimal(0),
        winRate: new Decimal(0),
        profitFactor: new Decimal(0),
        totalTrades: 0,
        avgTradeDuration: 0,
        equity: this.equity,
        trades: [],
      };
    }

    // Calculate returns
    const finalBalance = this.equity[this.equity.length - 1]?.value || initialBalance;
    const totalReturn = finalBalance.sub(initialBalance).div(initialBalance);

    // Calculate win rate
    const winningTrades = trades.filter((trade) => trade.pnl.gt(0));
    const winRate = new Decimal(winningTrades.length).div(trades.length);

    // Calculate profit factor
    const grossProfit = trades
      .filter((trade) => trade.pnl.gt(0))
      .reduce((sum, trade) => sum.add(trade.pnl), new Decimal(0));

    const grossLoss = trades
      .filter((trade) => trade.pnl.lt(0))
      .reduce((sum, trade) => sum.add(trade.pnl.abs()), new Decimal(0));

    const profitFactor = grossLoss.isZero() ? new Decimal(0) : grossProfit.div(grossLoss);

    // Calculate max drawdown
    let maxDrawdown = new Decimal(0);
    let peak = initialBalance;

    for (const point of this.equity) {
      if (point.value.gt(peak)) {
        peak = point.value;
      }
      const drawdown = peak.sub(point.value).div(peak);
      if (drawdown.gt(maxDrawdown)) {
        maxDrawdown = drawdown;
      }
    }

    // Calculate average trade duration
    const avgTradeDuration =
      trades.reduce((sum, trade) => sum + trade.duration, 0) / trades.length;

    // Calculate annualized return (simplified)
    const years = this.calculateTimeSpanInYears();
    const annualizedReturn = years > 0 ? totalReturn.div(years) : new Decimal(0);

    // Calculate Sharpe ratio (simplified - would need risk-free rate and volatility)
    const returns = this.calculateDailyReturns();
    const avgReturn = returns
      .reduce((sum, r) => sum.add(r), new Decimal(0))
      .div(returns.length);
    const volatility = this.calculateVolatility(returns, avgReturn);
    const sharpeRatio = volatility.isZero() ? new Decimal(0) : avgReturn.div(volatility);

    return {
      totalReturn,
      annualizedReturn,
      sharpeRatio,
      maxDrawdown,
      winRate,
      profitFactor,
      totalTrades: trades.length,
      avgTradeDuration,
      equity: this.equity,
      trades,
    };
  }

  private calculateTimeSpanInYears(): number {
    if (this.equity.length < 2) return 0;

    const start = this.equity[0].timestamp.getTime();
    const end = this.equity[this.equity.length - 1].timestamp.getTime();
    const diffMs = end - start;
    const diffYears = diffMs / (1000 * 60 * 60 * 24 * 365.25);

    return diffYears;
  }

  private calculateDailyReturns(): Decimal[] {
    const returns: Decimal[] = [];

    for (let i = 1; i < this.equity.length; i++) {
      const prevValue = this.equity[i - 1].value;
      const currentValue = this.equity[i].value;

      if (!prevValue.isZero()) {
        const dailyReturn = currentValue.sub(prevValue).div(prevValue);
        returns.push(dailyReturn);
      }
    }

    return returns;
  }

  private calculateVolatility(returns: Decimal[], avgReturn: Decimal): Decimal {
    if (returns.length < 2) return new Decimal(0);

    const squaredDeviations = returns.map((r) => r.sub(avgReturn).pow(2));
    const variance = squaredDeviations
      .reduce((sum, deviation) => sum.add(deviation), new Decimal(0))
      .div(returns.length - 1);

    return variance.sqrt();
  }

  public generateReport(result: BacktestResult): string {
    const report = `
=== BACKTEST RESULTS ===

Performance Metrics:
- Total Return: ${result.totalReturn.mul(100).toFixed(2)}%
- Annualized Return: ${result.annualizedReturn.mul(100).toFixed(2)}%
- Sharpe Ratio: ${result.sharpeRatio.toFixed(3)}
- Maximum Drawdown: ${result.maxDrawdown.mul(100).toFixed(2)}%

Trading Statistics:
- Total Trades: ${result.totalTrades}
- Win Rate: ${result.winRate.mul(100).toFixed(2)}%
- Profit Factor: ${result.profitFactor.toFixed(3)}
- Average Trade Duration: ${result.avgTradeDuration.toFixed(1)} periods

Trade Summary:
${result.trades
  .slice(0, 10)
  .map(
    (trade) =>
      `${trade.side} ${trade.quantity} ${trade.symbol} @ ${trade.exitPrice} | PnL: ${trade.pnl.toFixed(2)}`,
  )
  .join('\n')}
${result.trades.length > 10 ? `\n... and ${result.trades.length - 10} more trades` : ''}
    `.trim();

    return report;
  }

  public async *simulateMarketData(
    symbol: string,
    startTime: Date,
    endTime: Date,
    timeframe: string,
  ): AsyncGenerator<Kline> {
    // This is a placeholder implementation
    // In a real implementation, this would yield historical data in chronological order
    const duration = endTime.getTime() - startTime.getTime();
    const intervals = Math.floor(duration / (60 * 1000)); // Assuming 1-minute intervals

    for (let i = 0; i < intervals; i++) {
      const timestamp = new Date(startTime.getTime() + i * 60 * 1000);

      // Generate synthetic data for demonstration
      const basePrice = new Decimal(100);
      const randomFactor = new Decimal(Math.random() * 0.02 - 0.01); // ±1% random change
      const price = basePrice.mul(new Decimal(1).add(randomFactor));

      yield {
        symbol,
        interval: timeframe as unknown as KlineInterval,
        openTime: timestamp,
        closeTime: new Date(timestamp.getTime() + 60 * 1000),
        open: price,
        high: price.mul(1.001),
        low: price.mul(0.999),
        close: price,
        volume: new Decimal(1000),
        quoteVolume: price.mul(1000),
        trades: 10,
      };
    }
  }
}
