/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import v8 from 'v8';
import { WORKFLOW_ROUTE_OPTIONS } from './route_constants';
import { WORKFLOW_READ_SECURITY } from './route_security';
import type { RouteDependencies } from './types';

/**
 * Debug endpoint to get current memory statistics.
 * Only available when WORKFLOW_MEMORY_PROFILE=1 environment variable is set.
 *
 * GET /api/workflows/_debug/memory
 *
 * Returns:
 * - heapUsedMB: Current heap usage in MB
 * - heapTotalMB: Total heap size in MB
 * - heapLimitMB: Maximum heap size limit in MB
 * - externalMB: External memory usage in MB
 * - usagePercent: Percentage of heap limit being used
 */
export function registerGetDebugMemoryRoute({ router, logger }: RouteDependencies) {
  // Only register this route if memory profiling is enabled
  if (process.env.WORKFLOW_MEMORY_PROFILE !== '1') {
    return;
  }

  logger.info('Registering debug memory endpoint (WORKFLOW_MEMORY_PROFILE=1)');

  router.get(
    {
      path: '/api/workflows/_debug/memory',
      options: WORKFLOW_ROUTE_OPTIONS,
      security: WORKFLOW_READ_SECURITY,
      validate: false,
    },
    async (_context, _request, response) => {
      const stats = v8.getHeapStatistics();
      const memUsage = process.memoryUsage();

      const heapUsedMB = stats.used_heap_size / 1024 / 1024;
      const heapLimitMB = stats.heap_size_limit / 1024 / 1024;

      return response.ok({
        body: {
          heapUsedMB: heapUsedMB.toFixed(2),
          heapTotalMB: (stats.total_heap_size / 1024 / 1024).toFixed(2),
          heapLimitMB: heapLimitMB.toFixed(2),
          externalMB: (stats.external_memory / 1024 / 1024).toFixed(2),
          usagePercent: ((heapUsedMB / heapLimitMB) * 100).toFixed(1),
          rss: {
            totalMB: (memUsage.rss / 1024 / 1024).toFixed(2),
            heapTotalMB: (memUsage.heapTotal / 1024 / 1024).toFixed(2),
            heapUsedMB: (memUsage.heapUsed / 1024 / 1024).toFixed(2),
            externalMB: (memUsage.external / 1024 / 1024).toFixed(2),
            arrayBuffersMB: (memUsage.arrayBuffers / 1024 / 1024).toFixed(2),
          },
          v8Details: {
            totalPhysicalSizeMB: (stats.total_physical_size / 1024 / 1024).toFixed(2),
            totalAvailableSizeMB: (stats.total_available_size / 1024 / 1024).toFixed(2),
            mallocedMemoryMB: (stats.malloced_memory / 1024 / 1024).toFixed(2),
            peakMallocedMemoryMB: (stats.peak_malloced_memory / 1024 / 1024).toFixed(2),
            numberOfNativeContexts: stats.number_of_native_contexts,
            numberOfDetachedContexts: stats.number_of_detached_contexts,
          },
        },
      });
    }
  );
}

