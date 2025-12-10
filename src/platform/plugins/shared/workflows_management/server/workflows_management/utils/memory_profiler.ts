/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import v8 from 'v8';

export interface MemoryProfileResult {
  heapUsedDeltaMB: string;
  heapUsedAfterMB: string;
  heapLimitMB: string;
  durationMs: string;
}

/**
 * Profiles memory usage of a synchronous function.
 * Logs the heap delta, current heap usage, heap limit, and duration.
 *
 * @param label - A label to identify this profiling run in logs
 * @param fn - The synchronous function to profile
 * @returns The result of the function
 */
export function profileMemory<T>(label: string, fn: () => T): T {
  const before = v8.getHeapStatistics();
  const startTime = performance.now();

  const result = fn();

  const after = v8.getHeapStatistics();
  const duration = performance.now() - startTime;

  const stats: MemoryProfileResult = {
    heapUsedDeltaMB: `${((after.used_heap_size - before.used_heap_size) / 1024 / 1024).toFixed(2)} MB`,
    heapUsedAfterMB: `${(after.used_heap_size / 1024 / 1024).toFixed(2)} MB`,
    heapLimitMB: `${(after.heap_size_limit / 1024 / 1024).toFixed(2)} MB`,
    durationMs: `${duration.toFixed(2)}ms`,
  };

  // eslint-disable-next-line no-console
  console.log(`[Memory Profile] ${label}:`, stats);

  return result;
}

/**
 * Profiles memory usage of an asynchronous function.
 * Logs the heap delta, current heap usage, heap limit, and duration.
 * Also shows retained size after GC (if --expose-gc flag is set).
 *
 * @param label - A label to identify this profiling run in logs
 * @param fn - The async function to profile
 * @returns A promise resolving to the result of the function
 */
export async function profileMemoryAsync<T>(label: string, fn: () => Promise<T>): Promise<T> {
  // Force GC before measurement if available
  if (global.gc) {
    global.gc();
  }

  const before = v8.getHeapStatistics();
  const startTime = performance.now();

  const result = await fn();

  const after = v8.getHeapStatistics();
  const duration = performance.now() - startTime;

  // Force GC after to see retained size
  let afterGC = after;
  if (global.gc) {
    global.gc();
    afterGC = v8.getHeapStatistics();
  }

  const stats = {
    heapUsedDeltaMB: `${((after.used_heap_size - before.used_heap_size) / 1024 / 1024).toFixed(2)} MB`,
    heapUsedAfterMB: `${(after.used_heap_size / 1024 / 1024).toFixed(2)} MB`,
    retainedAfterGC: global.gc
      ? `${((afterGC.used_heap_size - before.used_heap_size) / 1024 / 1024).toFixed(2)} MB`
      : 'N/A (run with --expose-gc)',
    heapLimitMB: `${(after.heap_size_limit / 1024 / 1024).toFixed(2)} MB`,
    durationMs: `${duration.toFixed(2)}ms`,
  };

  // eslint-disable-next-line no-console
  console.log(`[Memory Profile] ${label}:`, stats);

  return result;
}

/**
 * Get current memory statistics without running a function.
 * Useful for taking snapshots at specific points.
 */
export function getMemoryStats(): {
  heapUsedMB: string;
  heapTotalMB: string;
  heapLimitMB: string;
  externalMB: string;
} {
  const stats = v8.getHeapStatistics();
  return {
    heapUsedMB: (stats.used_heap_size / 1024 / 1024).toFixed(2),
    heapTotalMB: (stats.total_heap_size / 1024 / 1024).toFixed(2),
    heapLimitMB: (stats.heap_size_limit / 1024 / 1024).toFixed(2),
    externalMB: (stats.external_memory / 1024 / 1024).toFixed(2),
  };
}

