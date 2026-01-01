#!/usr/bin/env node

import { Command } from 'commander';

const program = new Command();

program
  .name('apidouble')
  .description('Developer Productivity Tool for API Mocking & Traffic Interception')
  .version('1.0.0');

program
  .command('start')
  .description('Start the ApiDouble server')
  .option('-p, --port <port>', 'Server port', '3001')
  .option('-m, --mode <mode>', 'Server mode (proxy|mock|intercept)', 'proxy')
  .option('-t, --target <url>', 'Target API URL')
  .option('-c, --config <path>', 'Config file path')
  .action((options) => {
    console.log('Starting ApiDouble with options:', options);
    // TODO: Implement start command
  });

program
  .command('list')
  .description('List recorded mocks')
  .action(() => {
    console.log('Listing recorded mocks...');
    // TODO: Implement list command
  });

program
  .command('clear')
  .description('Clear all recorded mocks')
  .action(() => {
    console.log('Clearing recorded mocks...');
    // TODO: Implement clear command
  });

program.parse();
