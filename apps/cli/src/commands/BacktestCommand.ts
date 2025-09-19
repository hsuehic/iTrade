import { Command } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import { Decimal } from 'decimal.js';

import { MovingAverageStrategy } from '@crypto-trading/strategies';
import { BacktestEngine } from '@crypto-trading/backtesting';

interface BacktestOptions {
  strategy?: string;
  symbol?: string;
  startDate?: string;
  endDate?: string;
  initialBalance?: number;
  interactive?: boolean;
}

export class BacktestCommand {
  public getCommand(): Command {
    const command = new Command('backtest');
    
    command
      .description('Run backtests on trading strategies')
      .option('-s, --strategy <strategy>', 'Strategy to backtest (e.g., "moving-average")')
      .option('--symbol <symbol>', 'Symbol to backtest (e.g., "BTCUSDT")')
      .option('--start-date <date>', 'Start date for backtest (YYYY-MM-DD)')
      .option('--end-date <date>', 'End date for backtest (YYYY-MM-DD)')
      .option('--initial-balance <amount>', 'Initial balance for backtest', parseFloat)
      .option('-i, --interactive', 'Run in interactive mode')
      .action((options: BacktestOptions) => this.execute(options));

    return command;
  }

  private async execute(options: BacktestOptions): Promise<void> {
    console.log(chalk.blue('🚀 Crypto Trading Backtest Tool'));
    console.log('=====================================\n');

    try {
      const config = options.interactive 
        ? await this.getInteractiveConfig()
        : await this.getConfigFromOptions(options);

      await this.runBacktest(config);
    } catch (error) {
      console.error(chalk.red('❌ Backtest failed:'), error);
      process.exit(1);
    }
  }

  private async getInteractiveConfig(): Promise<any> {
    console.log(chalk.yellow('📋 Interactive Backtest Configuration\n'));

    const answers = await inquirer.prompt([
      {
        type: 'list',
        name: 'strategy',
        message: 'Select a strategy:',
        choices: [
          { name: 'Moving Average Crossover', value: 'moving-average' },
          // Add more strategies here as they're implemented
        ],
      },
      {
        type: 'input',
        name: 'symbol',
        message: 'Enter the symbol to backtest (e.g., BTCUSDT):',
        default: 'BTCUSDT',
        validate: (input: string) => input.length > 0 || 'Symbol is required',
      },
      {
        type: 'input',
        name: 'startDate',
        message: 'Enter start date (YYYY-MM-DD):',
        default: '2024-01-01',
        validate: (input: string) => this.validateDate(input) || 'Invalid date format',
      },
      {
        type: 'input',
        name: 'endDate',
        message: 'Enter end date (YYYY-MM-DD):',
        default: '2024-12-31',
        validate: (input: string) => this.validateDate(input) || 'Invalid date format',
      },
      {
        type: 'number',
        name: 'initialBalance',
        message: 'Enter initial balance:',
        default: 10000,
        validate: (input: number) => input > 0 || 'Balance must be positive',
      },
    ]);

    if (answers.strategy === 'moving-average') {
      const strategyParams = await inquirer.prompt([
        {
          type: 'number',
          name: 'fastPeriod',
          message: 'Fast MA period:',
          default: 10,
          validate: (input: number) => input > 0 || 'Period must be positive',
        },
        {
          type: 'number',
          name: 'slowPeriod',
          message: 'Slow MA period:',
          default: 20,
          validate: (input: number) => input > 0 || 'Period must be positive',
        },
        {
          type: 'number',
          name: 'threshold',
          message: 'Crossover threshold (0.001 = 0.1%):',
          default: 0.001,
          validate: (input: number) => input >= 0 || 'Threshold must be non-negative',
        },
      ]);

      answers.strategyParams = strategyParams;
    }

    return answers;
  }

  private async getConfigFromOptions(options: BacktestOptions): Promise<any> {
    return {
      strategy: options.strategy || 'moving-average',
      symbol: options.symbol || 'BTCUSDT',
      startDate: options.startDate || '2024-01-01',
      endDate: options.endDate || '2024-12-31',
      initialBalance: options.initialBalance || 10000,
      strategyParams: {
        fastPeriod: 10,
        slowPeriod: 20,
        threshold: 0.001,
      },
    };
  }

  private async runBacktest(config: any): Promise<void> {
    console.log(chalk.blue('\n📊 Running Backtest...'));
    console.log(`Strategy: ${config.strategy}`);
    console.log(`Symbol: ${config.symbol}`);
    console.log(`Period: ${config.startDate} to ${config.endDate}`);
    console.log(`Initial Balance: $${config.initialBalance}\n`);

    // Create strategy instance
    let strategy;
    switch (config.strategy) {
      case 'moving-average':
        strategy = new MovingAverageStrategy({
          fastPeriod: config.strategyParams?.fastPeriod || 10,
          slowPeriod: config.strategyParams?.slowPeriod || 20,
          threshold: config.strategyParams?.threshold || 0.001,
          baseQuantity: config.initialBalance * 0.1, // Risk 10% per trade
        });
        break;
      default:
        throw new Error(`Unknown strategy: ${config.strategy}`);
    }

    // Create mock data manager (in real implementation, this would load actual data)
    const dataManager = this.createMockDataManager();

    // Create backtest configuration
    const backtestConfig = {
      startDate: new Date(config.startDate),
      endDate: new Date(config.endDate),
      initialBalance: new Decimal(config.initialBalance),
      commission: new Decimal(0.001), // 0.1% commission
      slippage: new Decimal(0.0005), // 0.05% slippage
      symbols: [config.symbol],
      timeframe: '1h',
    };

    // Run backtest
    const backtestEngine = new BacktestEngine();
    const result = await backtestEngine.runBacktest(strategy, backtestConfig, dataManager);

    // Display results
    this.displayResults(result);
  }

  private createMockDataManager(): any {
    // This is a mock implementation
    // In a real application, this would connect to a database or data provider
    return {
      async getKlines(symbol: string, interval: string, startTime: Date, endTime: Date) {
        // Generate mock data for demonstration
        const klines = [];
        const duration = endTime.getTime() - startTime.getTime();
        const intervals = Math.floor(duration / (60 * 60 * 1000)); // 1-hour intervals
        
        let price = new Decimal(50000); // Starting BTC price
        
        for (let i = 0; i < Math.min(intervals, 1000); i++) { // Limit to 1000 data points
          const timestamp = new Date(startTime.getTime() + i * 60 * 60 * 1000);
          
          // Generate realistic price movement
          const change = (Math.random() - 0.5) * 0.02; // ±1% random change
          price = price.mul(new Decimal(1 + change));
          
          const high = price.mul(new Decimal(1 + Math.random() * 0.005));
          const low = price.mul(new Decimal(1 - Math.random() * 0.005));
          
          klines.push({
            symbol,
            interval,
            openTime: timestamp,
            closeTime: new Date(timestamp.getTime() + 60 * 60 * 1000),
            open: price,
            high,
            low,
            close: price,
            volume: new Decimal(Math.random() * 100),
            quoteVolume: new Decimal(0),
            trades: Math.floor(Math.random() * 100),
          });
        }
        
        return klines;
      },
    };
  }

  private displayResults(result: any): void {
    console.log(chalk.green('\n✅ Backtest Complete!\n'));
    
    const totalReturnPercent = result.totalReturn.mul(100);
    const color = result.totalReturn.isPositive() ? chalk.green : chalk.red;
    
    console.log('📈 PERFORMANCE SUMMARY');
    console.log('=====================');
    console.log(`Total Return: ${color(totalReturnPercent.toFixed(2))}%`);
    console.log(`Annualized Return: ${result.annualizedReturn.mul(100).toFixed(2)}%`);
    console.log(`Sharpe Ratio: ${result.sharpeRatio.toFixed(3)}`);
    console.log(`Max Drawdown: ${chalk.red(result.maxDrawdown.mul(100).toFixed(2))}%`);
    
    console.log('\n📊 TRADING STATISTICS');
    console.log('=====================');
    console.log(`Total Trades: ${result.totalTrades}`);
    console.log(`Win Rate: ${result.winRate.mul(100).toFixed(2)}%`);
    console.log(`Profit Factor: ${result.profitFactor.toFixed(3)}`);
    
    if (result.trades.length > 0) {
      console.log('\n🔄 RECENT TRADES');
      console.log('================');
      const recentTrades = result.trades.slice(-5);
      
      recentTrades.forEach((trade: any, index: number) => {
        const pnlColor = trade.pnl.isPositive() ? chalk.green : chalk.red;
        console.log(`${index + 1}. ${trade.side} ${trade.quantity} ${trade.symbol} @ ${trade.exitPrice} | PnL: ${pnlColor(trade.pnl.toFixed(2))}`);
      });
    }
    
    console.log(chalk.blue('\n🎉 Backtest analysis complete!'));
  }

  private validateDate(dateString: string): boolean {
    const regex = /^\d{4}-\d{2}-\d{2}$/;
    if (!regex.test(dateString)) return false;
    
    const date = new Date(dateString);
    return date instanceof Date && !isNaN(date.getTime());
  }
}
