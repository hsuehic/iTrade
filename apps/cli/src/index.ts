#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';

import { BacktestCommand } from './commands/BacktestCommand';

const program = new Command();

program
  .name('crypto-trading')
  .description('Cryptocurrency trading strategy tools')
  .version('0.1.0');

// Add commands
program.addCommand(new BacktestCommand().getCommand());

// Global error handling
process.on('unhandledRejection', (error) => {
  console.error(chalk.red('Unhandled promise rejection:'), error);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error(chalk.red('Uncaught exception:'), error);
  process.exit(1);
});

// Parse command line arguments
program.parse();
