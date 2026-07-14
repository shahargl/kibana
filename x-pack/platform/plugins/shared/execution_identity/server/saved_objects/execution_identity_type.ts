/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';
import type { SavedObjectsType } from '@kbn/core/server';
import type { EncryptedSavedObjectTypeRegistration } from '@kbn/encrypted-saved-objects-plugin/server';
import { EXECUTION_IDENTITY_SAVED_OBJECT_TYPE } from '../../common/types';

const executionIdentitySchema = schema.object({
  name: schema.string(),
  description: schema.string(),
  projectAssignments: schema.string(),
  apiKeyId: schema.string(),
  apiKey: schema.string(),
  createdBy: schema.string(),
  createdAt: schema.string(),
});

export const executionIdentitySavedObjectType: SavedObjectsType = {
  name: EXECUTION_IDENTITY_SAVED_OBJECT_TYPE,
  hidden: true,
  namespaceType: 'single',
  mappings: {
    dynamic: false,
    properties: {
      name: { type: 'keyword' },
      description: { type: 'text' },
      projectAssignments: { type: 'text', index: false },
      apiKeyId: { type: 'keyword' },
      createdBy: { type: 'keyword' },
      createdAt: { type: 'date' },
    },
  },
  management: {
    importableAndExportable: false,
    displayName: 'Execution identity',
  },
  modelVersions: {
    '1': {
      changes: [],
      schemas: {
        forwardCompatibility: executionIdentitySchema.extends({}, { unknowns: 'ignore' }),
        create: executionIdentitySchema,
      },
    },
  },
};

export const executionIdentityEncryptionParams: EncryptedSavedObjectTypeRegistration = {
  type: EXECUTION_IDENTITY_SAVED_OBJECT_TYPE,
  attributesToEncrypt: new Set(['apiKey']),
  attributesToIncludeInAAD: new Set(['name', 'apiKeyId']),
};
