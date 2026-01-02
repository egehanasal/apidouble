#!/usr/bin/env node

import { Command } from 'commander';
import { ApiDouble } from '../core/server.js';
import { LowDBStorage } from '../storage/lowdb.adapter.js';
import { loadConfig, validateConfig, findConfigFile } from '../config/index.js';

const program = new Command();

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
};

function log(message: string, color: keyof typeof colors = 'reset'): void {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logInfo(label: string, value: string): void {
  console.log(`  ${colors.dim}${label}:${colors.reset} ${colors.cyan}${value}${colors.reset}`);
}

program
  .name('apidouble')
  .description('Developer Productivity Tool for API Mocking & Traffic Interception')
  .version('1.0.0');

// ============================================================================
// START COMMAND
// ============================================================================
program
  .command('start')
  .description('Start the ApiDouble server')
  .option('-p, --port <port>', 'Server port')
  .option('-m, --mode <mode>', 'Server mode (proxy|mock|intercept)')
  .option('-t, --target <url>', 'Target API URL (required for proxy/intercept mode)')
  .option('-s, --storage <path>', 'Storage file path')
  .option('-c, --config <path>', 'Config file path')
  .option('--no-cors', 'Disable CORS')
  .option('--matching <strategy>', 'Matching strategy (exact|smart|fuzzy)')
  .action(async (options) => {
    try {
      // Load config from file + CLI options
      const config = await loadConfig({
        port: options.port,
        mode: options.mode,
        target: options.target,
        storage: options.storage,
        config: options.config,
        cors: options.cors,
        matching: options.matching,
      });

      // Validate config
      const validation = validateConfig(config);
      if (!validation.valid) {
        for (const error of validation.errors) {
          log(`Error: ${error}`, 'red');
        }
        process.exit(1);
      }

      // Check if config file was used
      const configFile = options.config ?? await findConfigFile();

      console.log('');
      log('  ApiDouble', 'bright');
      console.log('');

      const server = new ApiDouble(config, {
        onRequest: (req) => {
          const timestamp = new Date().toLocaleTimeString();
          console.log(
            `  ${colors.dim}${timestamp}${colors.reset} ${colors.magenta}${req.method}${colors.reset} ${req.path}`
          );
        },
      });

      await server.start();

      console.log(`  ${colors.green}Server started${colors.reset}`);
      console.log('');
      if (configFile) {
        logInfo('Config', configFile);
      }
      logInfo('Mode', config.mode);
      logInfo('Port', String(config.port));
      if (config.target) {
        logInfo('Target', config.target);
      }
      logInfo('Storage', config.storage.path);
      logInfo('Matching', config.matching?.strategy ?? 'smart');
      logInfo('CORS', config.cors?.enabled ? 'enabled' : 'disabled');
      console.log('');
      log(`  Listening on http://localhost:${config.port}`, 'green');
      console.log('');
      logInfo('Health', `http://localhost:${config.port}/__health`);
      logInfo('Status', `http://localhost:${config.port}/__status`);
      logInfo('Mocks', `http://localhost:${config.port}/__mocks`);
      console.log('');
      log('  Press Ctrl+C to stop', 'dim');
      console.log('');

      // Handle graceful shutdown
      const shutdown = async () => {
        console.log('');
        log('  Shutting down...', 'yellow');
        await server.stop();
        log('  Server stopped', 'green');
        process.exit(0);
      };

      process.on('SIGINT', shutdown);
      process.on('SIGTERM', shutdown);
    } catch (error) {
      log(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`, 'red');
      process.exit(1);
    }
  });

// ============================================================================
// LIST COMMAND
// ============================================================================
program
  .command('list')
  .description('List recorded mocks')
  .option('-s, --storage <path>', 'Storage file path', './mocks/db.json')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    const storage = new LowDBStorage(options.storage);

    try {
      await storage.init();
      const entries = await storage.list();

      if (options.json) {
        console.log(JSON.stringify(entries, null, 2));
        return;
      }

      console.log('');
      log('  Recorded Mocks', 'bright');
      console.log('');

      if (entries.length === 0) {
        log('  No mocks recorded yet.', 'dim');
        console.log('');
        log('  Start the server in proxy mode to record API responses:', 'dim');
        log('  apidouble start --mode proxy --target https://api.example.com', 'cyan');
        console.log('');
        return;
      }

      logInfo('Storage', options.storage);
      logInfo('Count', String(entries.length));
      console.log('');

      // Table header
      console.log(
        `  ${colors.dim}${'ID'.padEnd(25)} ${'METHOD'.padEnd(8)} ${'PATH'.padEnd(35)} ${'STATUS'.padEnd(8)} CREATED${colors.reset}`
      );
      console.log(`  ${colors.dim}${'-'.repeat(95)}${colors.reset}`);

      // Table rows
      for (const entry of entries) {
        const id = entry.id.substring(0, 23) + (entry.id.length > 23 ? '..' : '');
        const method = entry.request.method.padEnd(8);
        const path = entry.request.path.length > 33
          ? entry.request.path.substring(0, 32) + '..'
          : entry.request.path.padEnd(35);
        const status = String(entry.response.status).padEnd(8);
        const created = new Date(entry.createdAt).toLocaleString();

        const statusColor = entry.response.status >= 400 ? colors.red : colors.green;

        console.log(
          `  ${colors.dim}${id.padEnd(25)}${colors.reset} ${colors.magenta}${method}${colors.reset} ${path} ${statusColor}${status}${colors.reset} ${colors.dim}${created}${colors.reset}`
        );
      }

      console.log('');
    } catch (error) {
      log(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`, 'red');
      process.exit(1);
    }
  });

// ============================================================================
// CLEAR COMMAND
// ============================================================================
program
  .command('clear')
  .description('Clear all recorded mocks')
  .option('-s, --storage <path>', 'Storage file path', './mocks/db.json')
  .option('-y, --yes', 'Skip confirmation')
  .action(async (options) => {
    const storage = new LowDBStorage(options.storage);

    try {
      await storage.init();
      const count = await storage.count();

      if (count === 0) {
        log('No mocks to clear.', 'yellow');
        return;
      }

      if (!options.yes) {
        log(`This will delete ${count} recorded mock(s).`, 'yellow');
        log('Use --yes flag to confirm: apidouble clear --yes', 'dim');
        return;
      }

      await storage.clear();
      log(`Cleared ${count} mock(s) from ${options.storage}`, 'green');
    } catch (error) {
      log(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`, 'red');
      process.exit(1);
    }
  });

// ============================================================================
// DELETE COMMAND
// ============================================================================
program
  .command('delete <id>')
  .description('Delete a specific mock by ID')
  .option('-s, --storage <path>', 'Storage file path', './mocks/db.json')
  .action(async (id, options) => {
    const storage = new LowDBStorage(options.storage);

    try {
      await storage.init();
      const deleted = await storage.delete(id);

      if (deleted) {
        log(`Deleted mock: ${id}`, 'green');
      } else {
        log(`Mock not found: ${id}`, 'red');
        process.exit(1);
      }
    } catch (error) {
      log(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`, 'red');
      process.exit(1);
    }
  });

// ============================================================================
// EXPORT COMMAND
// ============================================================================
program
  .command('export')
  .description('Export mocks to JSON file')
  .option('-s, --storage <path>', 'Storage file path', './mocks/db.json')
  .option('-o, --output <path>', 'Output file path', './mocks-export.json')
  .action(async (options) => {
    const { writeFile } = await import('node:fs/promises');
    const storage = new LowDBStorage(options.storage);

    try {
      await storage.init();
      const entries = await storage.list();

      await writeFile(options.output, JSON.stringify(entries, null, 2));
      log(`Exported ${entries.length} mock(s) to ${options.output}`, 'green');
    } catch (error) {
      log(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`, 'red');
      process.exit(1);
    }
  });

// ============================================================================
// IMPORT COMMAND
// ============================================================================
program
  .command('import <file>')
  .description('Import mocks from JSON file')
  .option('-s, --storage <path>', 'Storage file path', './mocks/db.json')
  .option('--merge', 'Merge with existing mocks (default: replace)')
  .action(async (file, options) => {
    const { readFile } = await import('node:fs/promises');
    const storage = new LowDBStorage(options.storage);

    try {
      await storage.init();

      const content = await readFile(file, 'utf-8');
      const entries = JSON.parse(content);

      if (!Array.isArray(entries)) {
        log('Error: Invalid import file format. Expected array of entries.', 'red');
        process.exit(1);
      }

      if (!options.merge) {
        await storage.clear();
      }

      let imported = 0;
      for (const entry of entries) {
        if (entry.request && entry.response) {
          await storage.save(entry.request, entry.response);
          imported++;
        }
      }

      log(`Imported ${imported} mock(s) from ${file}`, 'green');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        log(`Error: File not found: ${file}`, 'red');
      } else {
        log(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`, 'red');
      }
      process.exit(1);
    }
  });

program.parse();
