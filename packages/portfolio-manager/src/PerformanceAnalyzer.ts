import { Decimal } from 'decimal.js';
import { PortfolioSnapshot, PerformanceMetrics, Order } from '@itrade/core';

export interface TradeAnalysis {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: Decimal;
  profitFactor: Decimal;
  averageWin: Decimal;
  averageLoss: Decimal;
  largestWin: Decimal;
  largestLoss: Decimal;
  averageTradeDuration: number; // in hours
}

export interface RiskMetrics {
  maxDrawdown: Decimal;
  maxDrawdownDuration: number; // in days
  volatility: Decimal;
  sharpeRatio: Decimal;
  sortinoRatio: Decimal;
  calmarRatio: Decimal;
  beta: Decimal;
  var95: Decimal; // Value at Risk 95%
  cvar95: Decimal; // Conditional Value at Risk 95%
}

export class PerformanceAnalyzer {
  calculatePerformanceMetrics(
    snapshots: PortfolioSnapshot[],
    riskFreeRate = 0.02, // 2% annual risk-free rate
  ): PerformanceMetrics & RiskMetrics {
    if (snapshots.length < 2) {
      return this.getEmptyMetrics();
    }

    const returns = this.calculateReturns(snapshots);
    const totalReturn = this.calculateTotalReturn(snapshots);
    const annualizedReturn = this.calculateAnnualizedReturn(snapshots);
    const volatility = this.calculateVolatility(returns);
    const maxDrawdown = this.calculateMaxDrawdown(snapshots);
    const sharpeRatio = this.calculateSharpeRatio(returns, riskFreeRate);
    const sortinoRatio = this.calculateSortinoRatio(returns, riskFreeRate);

    return {
      totalReturn,
      annualizedReturn,
      volatility,
      sharpeRatio,
      maxDrawdown,
      winRate: new Decimal(0), // Requires trade data
      profitFactor: new Decimal(0), // Requires trade data
      averageWin: new Decimal(0), // Requires trade data
      averageLoss: new Decimal(0), // Requires trade data

      // Additional risk metrics
      maxDrawdownDuration: this.calculateMaxDrawdownDuration(snapshots),
      sortinoRatio,
      calmarRatio: annualizedReturn.div(
        maxDrawdown.eq(0) ? new Decimal(0.001) : maxDrawdown,
      ),
      beta: new Decimal(1), // Would need benchmark data
      var95: this.calculateVaR(returns, 0.95),
      cvar95: this.calculateCVaR(returns, 0.95),
    };
  }

  calculateTradeAnalysis(trades: Order[]): TradeAnalysis {
    const completedTrades = trades.filter((trade) => trade.status === 'FILLED');

    if (completedTrades.length === 0) {
      return {
        totalTrades: 0,
        winningTrades: 0,
        losingTrades: 0,
        winRate: new Decimal(0),
        profitFactor: new Decimal(0),
        averageWin: new Decimal(0),
        averageLoss: new Decimal(0),
        largestWin: new Decimal(0),
        largestLoss: new Decimal(0),
        averageTradeDuration: 0,
      };
    }

    const winningTrades = completedTrades.filter((trade) =>
      this.calculateTradePnL(trade).gt(0),
    );
    const losingTrades = completedTrades.filter((trade) =>
      this.calculateTradePnL(trade).lt(0),
    );

    const wins = winningTrades.map((trade) => this.calculateTradePnL(trade));
    const losses = losingTrades.map((trade) => this.calculateTradePnL(trade).abs());

    const grossProfit = wins.reduce((sum, win) => sum.add(win), new Decimal(0));
    const grossLoss = losses.reduce((sum, loss) => sum.add(loss), new Decimal(0));

    return {
      totalTrades: completedTrades.length,
      winningTrades: winningTrades.length,
      losingTrades: losingTrades.length,
      winRate: new Decimal(winningTrades.length).div(completedTrades.length),
      profitFactor: grossLoss.eq(0) ? new Decimal(0) : grossProfit.div(grossLoss),
      averageWin: wins.length > 0 ? grossProfit.div(wins.length) : new Decimal(0),
      averageLoss: losses.length > 0 ? grossLoss.div(losses.length) : new Decimal(0),
      largestWin:
        wins.length > 0
          ? wins.reduce((max, win) => (win.gt(max) ? win : max))
          : new Decimal(0),
      largestLoss:
        losses.length > 0
          ? losses.reduce((max, loss) => (loss.gt(max) ? loss : max))
          : new Decimal(0),
      averageTradeDuration: this.calculateAverageTradeDuration(completedTrades),
    };
  }

  private calculateReturns(snapshots: PortfolioSnapshot[]): Decimal[] {
    const returns: Decimal[] = [];

    for (let i = 1; i < snapshots.length; i++) {
      const prevValue = snapshots[i - 1].totalValue;
      const currentValue = snapshots[i].totalValue;

      if (prevValue.gt(0)) {
        const returnPct = currentValue.sub(prevValue).div(prevValue);
        returns.push(returnPct);
      }
    }

    return returns;
  }

  private calculateTotalReturn(snapshots: PortfolioSnapshot[]): Decimal {
    const firstSnapshot = snapshots[0];
    const lastSnapshot = snapshots[snapshots.length - 1];

    if (firstSnapshot.totalValue.eq(0)) {
      return new Decimal(0);
    }

    return lastSnapshot.totalValue
      .sub(firstSnapshot.totalValue)
      .div(firstSnapshot.totalValue)
      .mul(100);
  }

  private calculateAnnualizedReturn(snapshots: PortfolioSnapshot[]): Decimal {
    const firstSnapshot = snapshots[0];
    const lastSnapshot = snapshots[snapshots.length - 1];

    const daysDiff =
      (lastSnapshot.timestamp.getTime() - firstSnapshot.timestamp.getTime()) /
      (1000 * 60 * 60 * 24);
    const years = daysDiff / 365.25;

    if (years <= 0 || firstSnapshot.totalValue.eq(0)) {
      return new Decimal(0);
    }

    const totalReturn = lastSnapshot.totalValue.div(firstSnapshot.totalValue);
    return totalReturn
      .pow(1 / years)
      .sub(1)
      .mul(100);
  }

  private calculateVolatility(returns: Decimal[]): Decimal {
    if (returns.length < 2) return new Decimal(0);

    const mean = returns
      .reduce((sum, r) => sum.add(r), new Decimal(0))
      .div(returns.length);
    const variance = returns
      .reduce((sum, r) => sum.add(r.sub(mean).pow(2)), new Decimal(0))
      .div(returns.length - 1);

    // Annualize volatility (assuming daily returns)
    return variance.sqrt().mul(Math.sqrt(365));
  }

  private calculateMaxDrawdown(snapshots: PortfolioSnapshot[]): Decimal {
    let maxDrawdown = new Decimal(0);
    let peak = snapshots[0].totalValue;

    for (const snapshot of snapshots) {
      if (snapshot.totalValue.gt(peak)) {
        peak = snapshot.totalValue;
      }

      const drawdown = peak.sub(snapshot.totalValue).div(peak);
      if (drawdown.gt(maxDrawdown)) {
        maxDrawdown = drawdown;
      }
    }

    return maxDrawdown.mul(100);
  }

  private calculateMaxDrawdownDuration(snapshots: PortfolioSnapshot[]): number {
    let maxDuration = 0;
    let peak = snapshots[0].totalValue;
    let inDrawdown = false;
    let drawdownStart: Date | null = null;

    for (const snapshot of snapshots) {
      if (snapshot.totalValue.gt(peak)) {
        peak = snapshot.totalValue;
        if (inDrawdown) {
          inDrawdown = false;
          if (drawdownStart) {
            const duration =
              (snapshot.timestamp.getTime() - drawdownStart.getTime()) /
              (1000 * 60 * 60 * 24);
            maxDuration = Math.max(maxDuration, duration);
          }
        }
      } else if (snapshot.totalValue.lt(peak)) {
        if (!inDrawdown) {
          inDrawdown = true;
          drawdownStart = snapshot.timestamp;
        }
      }
    }

    return Math.round(maxDuration);
  }

  private calculateSharpeRatio(returns: Decimal[], riskFreeRate: number): Decimal {
    if (returns.length === 0) return new Decimal(0);

    const avgReturn = returns
      .reduce((sum, r) => sum.add(r), new Decimal(0))
      .div(returns.length);
    const volatility = this.calculateVolatility(returns);

    if (volatility.eq(0)) return new Decimal(0);

    const excessReturn = avgReturn.mul(365).sub(riskFreeRate); // Annualized
    return excessReturn.div(volatility.div(100));
  }

  private calculateSortinoRatio(returns: Decimal[], riskFreeRate: number): Decimal {
    const negativeReturns = returns.filter((r) => r.lt(0));

    if (negativeReturns.length === 0) return new Decimal(0);

    const avgReturn = returns
      .reduce((sum, r) => sum.add(r), new Decimal(0))
      .div(returns.length);
    const downwardDeviation = this.calculateDownwardDeviation(returns);

    if (downwardDeviation.eq(0)) return new Decimal(0);

    const excessReturn = avgReturn.mul(365).sub(riskFreeRate); // Annualized
    return excessReturn.div(downwardDeviation);
  }

  private calculateDownwardDeviation(returns: Decimal[]): Decimal {
    const negativeReturns = returns.filter((r) => r.lt(0));

    if (negativeReturns.length === 0) return new Decimal(0);

    const variance = negativeReturns
      .reduce((sum, r) => sum.add(r.pow(2)), new Decimal(0))
      .div(negativeReturns.length);

    return variance.sqrt().mul(Math.sqrt(365));
  }

  private calculateVaR(returns: Decimal[], confidence: number): Decimal {
    if (returns.length === 0) return new Decimal(0);

    const sortedReturns = returns.sort((a, b) => a.comparedTo(b));
    const index = Math.floor((1 - confidence) * sortedReturns.length);

    return sortedReturns[Math.max(0, index)].abs().mul(100);
  }

  private calculateCVaR(returns: Decimal[], confidence: number): Decimal {
    if (returns.length === 0) return new Decimal(0);

    const sortedReturns = returns.sort((a, b) => a.comparedTo(b));
    const cutoffIndex = Math.floor((1 - confidence) * sortedReturns.length);
    const tailReturns = sortedReturns.slice(0, cutoffIndex + 1);

    if (tailReturns.length === 0) return new Decimal(0);

    const avgTailReturn = tailReturns
      .reduce((sum, r) => sum.add(r), new Decimal(0))
      .div(tailReturns.length);

    return avgTailReturn.abs().mul(100);
  }

  private calculateTradePnL(trade: Order): Decimal {
    // This is a simplified calculation
    // In reality, you'd need entry and exit prices
    console.log(trade);
    return new Decimal(0);
  }

  private calculateAverageTradeDuration(trades: Order[]): number {
    // This would require entry and exit timestamps
    // Placeholder implementation
    console.log(trades);
    return 0;
  }

  private getEmptyMetrics(): PerformanceMetrics & RiskMetrics {
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
      maxDrawdownDuration: 0,
      sortinoRatio: new Decimal(0),
      calmarRatio: new Decimal(0),
      beta: new Decimal(0),
      var95: new Decimal(0),
      cvar95: new Decimal(0),
    };
  }
}
