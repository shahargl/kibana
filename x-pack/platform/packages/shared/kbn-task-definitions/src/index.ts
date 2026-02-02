/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export {
  TASK_METADATA_REGISTRY,
  getTaskTypesForPlugin,
  getOwnerPlugin,
  getAllTaskOwnerPlugins,
  isKnownTaskType,
} from './task_metadata_registry';
export type { TaskMetadata } from './task_metadata_registry';

export {
  ESSENTIAL_PLUGINS_FOR_BACKGROUND_TASKS,
  SKIP_FOR_BACKGROUND_TASKS,
  isEssentialForBackgroundTasks,
  canSkipForBackgroundTasks,
} from './essential_plugins';
