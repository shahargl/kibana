/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import chalk from 'chalk';
import { getPackages } from '@kbn/repo-packages';
import type { CliArgs } from '@kbn/config';
import { Env, RawConfigService } from '@kbn/config';
import { CriticalError } from '@kbn/core-base-server-internal';
import { Root } from './root';
import { MIGRATION_EXCEPTION_CODE } from './constants';

interface BootstrapArgs {
  configs: string[];
  cliArgs: CliArgs;
  applyConfigOverrides: (config: Record<string, any>) => Record<string, any>;
}

// ============== MEMORY TRACKING ==============
interface MemorySnapshot {
  rss: number;
  heapUsed: number;
  heapTotal: number;
  external: number;
}

function getMemoryMB(): MemorySnapshot {
  const mem = process.memoryUsage();
  return {
    rss: mem.rss / 1024 / 1024,
    heapUsed: mem.heapUsed / 1024 / 1024,
    heapTotal: mem.heapTotal / 1024 / 1024,
    external: mem.external / 1024 / 1024,
  };
}

function logMemoryPhase(phase: string, before: MemorySnapshot, after: MemorySnapshot) {
  const delta = {
    rss: after.rss - before.rss,
    heapUsed: after.heapUsed - before.heapUsed,
  };
  // eslint-disable-next-line no-console
  console.log(
    `[MEMORY_PHASE] ${phase}: heapUsed=${after.heapUsed.toFixed(1)}MB (+${delta.heapUsed.toFixed(1)}MB), rss=${after.rss.toFixed(1)}MB (+${delta.rss.toFixed(1)}MB)`
  );
}
// ============================================

/**
 *
 * @internal
 * @param param0 - options
 */
export async function bootstrap({ configs, cliArgs, applyConfigOverrides }: BootstrapArgs) {
  if (cliArgs.optimize) {
    // --optimize is deprecated and does nothing now, avoid starting up and just shutdown
    return;
  }

  // PHASE 0: Node.js baseline (before any Kibana code)
  const memPhase0 = getMemoryMB();
  // eslint-disable-next-line no-console
  console.log(
    `[MEMORY_PHASE] 0_NODE_BASELINE: heapUsed=${memPhase0.heapUsed.toFixed(1)}MB, rss=${memPhase0.rss.toFixed(1)}MB`
  );

  // `bootstrap` is exported from the `src/core/server/index` module,
  // meaning that any test importing, implicitly or explicitly, anything concrete
  // from `core/server` will load `dev-utils`. As some tests are mocking the `fs` package,
  // and as `REPO_ROOT` is initialized on the fly when importing `dev-utils` and requires
  // the `fs` package, it causes failures. This is why we use a dynamic `require` here.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { REPO_ROOT } = require('@kbn/repo-info');

  // PHASE 1: After loading core imports
  const memPhase1 = getMemoryMB();
  logMemoryPhase('1_CORE_IMPORTS', memPhase0, memPhase1);

  const env = Env.createDefault(REPO_ROOT, {
    configs,
    cliArgs,
    repoPackages: getPackages(REPO_ROOT),
  });

  const rawConfigService = new RawConfigService(env.configs, applyConfigOverrides);
  rawConfigService.loadConfig();

  const root = new Root(rawConfigService, env, onRootShutdown);
  const cliLogger = root.logger.get('cli');
  const rootLogger = root.logger.get('root');

  // PHASE 2: After Root construction (all core services instantiated)
  const memPhase2 = getMemoryMB();
  logMemoryPhase('2_ROOT_CONSTRUCTED', memPhase1, memPhase2);

  rootLogger.info('Kibana is starting');

  cliLogger.debug('Kibana configurations evaluated in this order: ' + env.configs.join(', '));

  process.on('SIGHUP', () => reloadConfiguration());

  // This is only used by the LogRotator service
  // in order to be able to reload the log configuration
  // under the cluster mode
  process.on('message', (msg: any) => {
    if (!msg || msg.reloadConfiguration !== true) {
      return;
    }

    reloadConfiguration();
  });

  function reloadConfiguration(reason = 'SIGHUP signal received') {
    cliLogger.info(`Reloading Kibana configuration (reason: ${reason}).`, { tags: ['config'] });

    try {
      rawConfigService.reloadConfig();
    } catch (err) {
      return shutdown(err);
    }

    cliLogger.info(`Reloaded Kibana configuration (reason: ${reason}).`, { tags: ['config'] });
  }

  process.on('SIGINT', () => {
    rootLogger.info('SIGINT received - initiating shutdown');
    shutdown();
  });
  process.on('SIGTERM', () => {
    rootLogger.info('SIGTERM received - initiating shutdown');
    shutdown();
  });

  function shutdown(reason?: Error) {
    rawConfigService.stop();
    return root.shutdown(reason);
  }

  try {
    // PHASE 3: Preboot (plugin discovery)
    const memBeforePreboot = getMemoryMB();
    // eslint-disable-next-line no-console
    console.log(`[MEMORY_DETAIL] Before preboot: heap=${memBeforePreboot.heapUsed.toFixed(1)}MB`);
    const prebootContract = await root.preboot();
    const memAfterPreboot = getMemoryMB();
    logMemoryPhase('3_PREBOOT_COMPLETE', memBeforePreboot, memAfterPreboot);
    // eslint-disable-next-line no-console
    console.log(`[MEMORY_DETAIL] Preboot includes: plugin discovery, http setup, rendering setup, i18n setup`);

    let isSetupOnHold = false;

    if (prebootContract) {
      const { preboot } = prebootContract;
      // If setup is on hold then preboot server is supposed to serve user requests and we can let
      // dev parent process know that we are ready for dev mode.
      isSetupOnHold = preboot.isSetupOnHold();
      if (process.send && isSetupOnHold) {
        process.send(['SERVER_LISTENING']);
      }

      if (isSetupOnHold) {
        rootLogger.info('Holding setup until preboot stage is completed.');
        const { shouldReloadConfig } = await preboot.waitUntilCanSetup();
        if (shouldReloadConfig) {
          await reloadConfiguration('configuration might have changed during preboot stage');
        }
      }
    }

    // PHASE 4: Setup (plugin setup)
    const memBeforeSetup = getMemoryMB();
    await root.setup();
    const memAfterSetup = getMemoryMB();
    logMemoryPhase('4_SETUP_COMPLETE', memBeforeSetup, memAfterSetup);

    // PHASE 5: Start (plugin start)
    const memBeforeStart = getMemoryMB();
    await root.start();
    const memAfterStart = getMemoryMB();
    logMemoryPhase('5_START_COMPLETE', memBeforeStart, memAfterStart);

    // FINAL SUMMARY
    // eslint-disable-next-line no-console
    console.log(`\n[MEMORY_SUMMARY] ========================================`);
    // eslint-disable-next-line no-console
    console.log(`[MEMORY_SUMMARY] Phase 0 - Node.js Baseline:    ${memPhase0.heapUsed.toFixed(1)} MB heap`);
    // eslint-disable-next-line no-console
    console.log(`[MEMORY_SUMMARY] Phase 1 - Core Imports:        ${memPhase1.heapUsed.toFixed(1)} MB heap (+${(memPhase1.heapUsed - memPhase0.heapUsed).toFixed(1)} MB)`);
    // eslint-disable-next-line no-console
    console.log(`[MEMORY_SUMMARY] Phase 2 - Root Constructed:    ${memPhase2.heapUsed.toFixed(1)} MB heap (+${(memPhase2.heapUsed - memPhase1.heapUsed).toFixed(1)} MB)`);
    // eslint-disable-next-line no-console
    console.log(`[MEMORY_SUMMARY] Phase 3 - Preboot Complete:    ${memAfterPreboot.heapUsed.toFixed(1)} MB heap (+${(memAfterPreboot.heapUsed - memPhase2.heapUsed).toFixed(1)} MB)`);
    // eslint-disable-next-line no-console
    console.log(`[MEMORY_SUMMARY] Phase 4 - Setup Complete:      ${memAfterSetup.heapUsed.toFixed(1)} MB heap (+${(memAfterSetup.heapUsed - memAfterPreboot.heapUsed).toFixed(1)} MB)`);
    // eslint-disable-next-line no-console
    console.log(`[MEMORY_SUMMARY] Phase 5 - Start Complete:      ${memAfterStart.heapUsed.toFixed(1)} MB heap (+${(memAfterStart.heapUsed - memAfterSetup.heapUsed).toFixed(1)} MB)`);
    // eslint-disable-next-line no-console
    console.log(`[MEMORY_SUMMARY] ========================================`);
    // eslint-disable-next-line no-console
    console.log(`[MEMORY_SUMMARY] TOTAL from baseline: ${memAfterStart.heapUsed.toFixed(1)} MB heap, ${memAfterStart.rss.toFixed(1)} MB RSS`);
    // eslint-disable-next-line no-console
    console.log(`[MEMORY_SUMMARY] ========================================\n`);

    // Notify parent process if we haven't done that yet during preboot stage.
    if (process.send && !isSetupOnHold) {
      process.send(['SERVER_LISTENING']);
    }
  } catch (err) {
    await shutdown(err);
  }
}

function onRootShutdown(error?: any) {
  if (error !== undefined) {
    if (error.code !== MIGRATION_EXCEPTION_CODE) {
      // There is a chance that logger wasn't configured properly and error that
      // that forced root to shut down could go unnoticed. To prevent this we always
      // mirror such fatal errors in standard output with `console.error`.
      // eslint-disable-next-line no-console
      console.error(`\n${chalk.white.bgRed(' FATAL ')} ${error}\n`);
    }

    process.exit(error instanceof CriticalError ? error.processExitCode : 1);
  }

  process.exit(0);
}
