/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';
import type { Direction } from '../../types';

export const getDirectionTitle = (direction: Direction, vendor: string): string =>
  direction === 'outbound'
    ? i18n.translate('xpack.triggersActionsUI.connectorsRedesign.wizard.outboundTitle', {
        defaultMessage: 'Outbound actions · Elastic → {vendor}',
        values: { vendor },
      })
    : i18n.translate('xpack.triggersActionsUI.connectorsRedesign.wizard.inboundTitle', {
        defaultMessage: 'Inbound events · {vendor} → Elastic',
        values: { vendor },
      });

export const STEP_CHOOSE = i18n.translate(
  'xpack.triggersActionsUI.connectorsRedesign.wizard.stepChoose',
  { defaultMessage: 'Choose capabilities' }
);

export const STEP_CONFIGURE = i18n.translate(
  'xpack.triggersActionsUI.connectorsRedesign.wizard.stepConfigure',
  { defaultMessage: 'Configure access' }
);

export const STEP_REVIEW = i18n.translate(
  'xpack.triggersActionsUI.connectorsRedesign.wizard.stepReview',
  { defaultMessage: 'Test & save' }
);

export const TAB_OUTBOUND = i18n.translate(
  'xpack.triggersActionsUI.connectorsRedesign.wizard.tabOutbound',
  { defaultMessage: 'Outbound actions' }
);

export const TAB_INBOUND = i18n.translate(
  'xpack.triggersActionsUI.connectorsRedesign.wizard.tabInbound',
  { defaultMessage: 'Inbound events' }
);

export const CANCEL = i18n.translate('xpack.triggersActionsUI.connectorsRedesign.wizard.cancel', {
  defaultMessage: 'Cancel',
});

export const BACK = i18n.translate('xpack.triggersActionsUI.connectorsRedesign.wizard.back', {
  defaultMessage: 'Back',
});

export const CONTINUE = i18n.translate(
  'xpack.triggersActionsUI.connectorsRedesign.wizard.continue',
  { defaultMessage: 'Continue' }
);

export const CONTINUE_TO_INBOUND = i18n.translate(
  'xpack.triggersActionsUI.connectorsRedesign.wizard.continueToInbound',
  { defaultMessage: 'Continue to inbound setup' }
);

export const SAVE = i18n.translate('xpack.triggersActionsUI.connectorsRedesign.wizard.save', {
  defaultMessage: 'Save connection',
});

export const SAVE_AND_TEST = i18n.translate(
  'xpack.triggersActionsUI.connectorsRedesign.wizard.saveAndTest',
  { defaultMessage: 'Save & test' }
);

export const DONE = i18n.translate('xpack.triggersActionsUI.connectorsRedesign.wizard.done', {
  defaultMessage: 'Done',
});

export const ALLOWED_SOURCES = i18n.translate(
  'xpack.triggersActionsUI.connectorsRedesign.wizard.allowedSources',
  { defaultMessage: 'Allowed sources (ACL)' }
);

export const ALLOWED_SOURCES_HELP = i18n.translate(
  'xpack.triggersActionsUI.connectorsRedesign.wizard.allowedSourcesHelp',
  { defaultMessage: 'Restrict which IPs or ranges can send events.' }
);

export const ADD_SOURCE = i18n.translate(
  'xpack.triggersActionsUI.connectorsRedesign.wizard.addSource',
  { defaultMessage: 'Add source...' }
);

export const PREVIEW_BADGE = i18n.translate(
  'xpack.triggersActionsUI.connectorsRedesign.wizard.previewBadge',
  { defaultMessage: 'Preview' }
);

export const PREVIEW_NOT_SAVED = i18n.translate(
  'xpack.triggersActionsUI.connectorsRedesign.wizard.previewNotSaved',
  {
    defaultMessage:
      'Inbound delivery for this connector is a design preview. These settings are not saved yet.',
  }
);
