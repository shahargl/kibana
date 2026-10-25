/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useMemo, useState } from 'react';
import { i18n } from '@kbn/i18n';
import { useQuery } from '@kbn/react-query';
import { connectorTypeHasInboundEvents } from '@kbn/connector-specs';
import type { EuiStepsHorizontalProps } from '@elastic/eui';
import {
  EuiButton,
  EuiButtonEmpty,
  EuiCallOut,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFlyout,
  EuiFlyoutBody,
  EuiFlyoutFooter,
  EuiFlyoutHeader,
  EuiLoadingSpinner,
  EuiSpacer,
  EuiStepsHorizontal,
  EuiText,
  EuiTitle,
  useGeneratedHtmlId,
} from '@elastic/eui';
import { useKibana } from '../../../../../common/lib/kibana';
import type { ActionConnector } from '../../../../../types';
import { ConnectorForm } from '../../../action_connector_form/connector_form';
import { useConnectorCreateForm } from '../../../action_connector_form/use_connector_create_form';
import { useRotateInboundIngress } from '../../../../hooks/use_rotate_inbound_ingress';
import { isInboundIngressConnector } from '../../../../lib/inbound_ingress';
import { isConnectorTypeTestable } from '../../../../lib/is_connector_type_testable';
import type { CatalogEntry, Direction } from '../../types';
import { ConnectorIcon } from '../../components/connector_icon';
import { ChooseCapabilitiesStep } from './choose_capabilities_step';
import type { CurrentUserSummary, InboundDraft } from './configure_access_step';
import { ConfigureAccessStep } from './configure_access_step';
import { ReviewStep } from './review_step';
import {
  BACK,
  CANCEL,
  CONTINUE,
  CONTINUE_TO_INBOUND,
  DONE,
  SAVE,
  SAVE_AND_TEST,
  STEP_CHOOSE,
  STEP_CONFIGURE,
  STEP_REVIEW,
} from './wizard_translations';

type Step = 1 | 2 | 3;
type HorizontalStep = EuiStepsHorizontalProps['steps'][number];

interface ConnectFlyoutProps {
  readonly entry: CatalogEntry;
  readonly onClose: () => void;
  /** Called after save; `openTest` asks the detail page to open the test tab. */
  readonly onConnected: (connectorId: string, openTest: boolean) => void;
}

const getStepStatus = (step: Step, current: Step): HorizontalStep['status'] => {
  if (step < current) return 'complete';
  if (step === current) return 'current';
  return 'incomplete';
};

const useCurrentUser = (): CurrentUserSummary | undefined => {
  const { security } = useKibana().services;
  const { data } = useQuery({
    queryKey: ['connectorsRedesign', 'currentUser'],
    queryFn: () => security.authc.getCurrentUser(),
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  });
  if (!data) return undefined;
  return { name: data.full_name || data.username, email: data.email || undefined };
};

export const ConnectFlyout = ({ entry, onClose, onConnected }: ConnectFlyoutProps) => {
  const { actionTypeRegistry } = useKibana().services;
  const titleId = useGeneratedHtmlId({ prefix: 'connectFlyoutTitle' });
  const available = useMemo<Direction[]>(
    () => [
      ...(entry.outbound ? (['outbound'] as const) : []),
      ...(entry.inbound ? (['inbound'] as const) : []),
    ],
    [entry]
  );

  const [step, setStep] = useState<Step>(1);
  const [hasVisitedConfigure, setHasVisitedConfigure] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<Direction>>(new Set(available));
  const [activeTab, setActiveTab] = useState<Direction>(available[0] ?? 'outbound');
  const [inboundDraft, setInboundDraft] = useState<InboundDraft>({
    signingKey: '',
    allowedSources: [],
  });
  const [connectionName, setConnectionName] = useState<string>();
  const [createdInbound, setCreatedInbound] = useState<ActionConnector>();

  const currentUser = useCurrentUser();
  const hasRealInbound = connectorTypeHasInboundEvents(entry.id);
  const isTestable = isConnectorTypeTestable(entry.actionType) && selected.has('outbound');
  const formDirection: Direction =
    entry.outbound && selected.has('outbound') ? 'outbound' : 'inbound';

  const {
    actionTypeModel,
    isLoadingActionTypeModel,
    actionTypeModelError,
    showLoadingSpinner,
    formState,
    setFormState,
    defaultConnector,
    isSaving,
    showFormErrors,
    setShowFormErrors,
    preSubmitValidationErrorMessage,
    createConnectorError,
    validateAndCreateConnector,
  } = useConnectorCreateForm({ actionTypeRegistry, actionTypeId: entry.id });
  const { isLoading: isRotating, rotateIngress } = useRotateInboundIngress();

  const toggle = useCallback((direction: Direction) => {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(direction)) next.delete(direction);
      else next.add(direction);
      return next;
    });
  }, []);

  const goToConfigure = () => {
    setActiveTab(formDirection);
    setHasVisitedConfigure(true);
    setStep(2);
  };

  const goToReview = async () => {
    const { isValid, data } = await formState.submit();
    if (!isValid) {
      setShowFormErrors(true);
      setActiveTab(formDirection);
      return;
    }
    setShowFormErrors(false);
    setConnectionName(data.name);
    setStep(3);
  };

  const save = async (openTest: boolean) => {
    const connector = await validateAndCreateConnector();
    if (!connector) {
      setShowFormErrors(true);
      setStep(2);
      return;
    }
    if (isInboundIngressConnector(connector)) {
      try {
        const { ingestToken } = await rotateIngress(connector.id);
        setCreatedInbound({ ...connector, secrets: { ingestToken } } as ActionConnector);
        return;
      } catch {
        // The rotate hook already shows a danger toast; the connector itself was saved.
      }
    }
    onConnected(connector.id, openTest);
  };

  const needsInboundTab =
    step === 2 && activeTab === 'outbound' && selected.has('inbound') && selected.has('outbound');

  const header = {
    1: {
      title: i18n.translate('xpack.triggersActionsUI.connectorsRedesign.wizard.connectTitle', {
        defaultMessage: 'Connect {vendor}',
        values: { vendor: entry.vendorName },
      }),
      description: i18n.translate(
        'xpack.triggersActionsUI.connectorsRedesign.wizard.connectDescription',
        {
          defaultMessage:
            'Configure one or both connection paths. You can always add the other later.',
        }
      ),
    },
    2: {
      title: i18n.translate('xpack.triggersActionsUI.connectorsRedesign.wizard.configureTitle', {
        defaultMessage: 'Configure {vendor} access',
        values: { vendor: entry.vendorName },
      }),
      description: i18n.translate(
        'xpack.triggersActionsUI.connectorsRedesign.wizard.configureDescription',
        {
          defaultMessage: 'Connect Elastic to {vendor} to send actions and receive events.',
          values: { vendor: entry.vendorName },
        }
      ),
    },
    3: {
      title: i18n.translate('xpack.triggersActionsUI.connectorsRedesign.wizard.reviewTitle', {
        defaultMessage: 'Test & save {vendor}',
        values: { vendor: entry.vendorName },
      }),
      description: i18n.translate(
        'xpack.triggersActionsUI.connectorsRedesign.wizard.reviewDescription',
        { defaultMessage: 'Verify the configuration and enable the connection.' }
      ),
    },
  }[step];

  const steps: HorizontalStep[] = [
    { title: STEP_CHOOSE, status: getStepStatus(1, step), onClick: () => setStep(1) },
    {
      title: STEP_CONFIGURE,
      status: getStepStatus(2, step),
      disabled: !hasVisitedConfigure,
      onClick: () => setStep(2),
    },
    { title: STEP_REVIEW, status: getStepStatus(3, step), disabled: step < 3, onClick: () => {} },
  ];

  const connectorForm =
    showLoadingSpinner || isLoadingActionTypeModel ? (
      <EuiFlexGroup justifyContent="center">
        <EuiLoadingSpinner size="l" />
      </EuiFlexGroup>
    ) : actionTypeModelError ? (
      <EuiCallOut
        announceOnMount
        size="s"
        color="danger"
        iconType="error"
        title={i18n.translate('xpack.triggersActionsUI.connectorsRedesign.wizard.specError', {
          defaultMessage: 'Failed to load connector configuration',
        })}
      />
    ) : (
      actionTypeModel && (
        <>
          <ConnectorForm
            actionTypeModel={actionTypeModel}
            connector={defaultConnector}
            isEdit={false}
            onChange={setFormState}
          />
          {!!preSubmitValidationErrorMessage && <p>{preSubmitValidationErrorMessage}</p>}
        </>
      )
    );

  const isBusy = isSaving || isRotating;

  return (
    <EuiFlyout
      onClose={createdInbound ? () => onConnected(createdInbound.id, false) : onClose}
      size={step === 1 ? 560 : 760}
      type={step === 1 ? 'push' : 'overlay'}
      pushMinBreakpoint="l"
      aria-labelledby={titleId}
      data-test-subj="create-connector-flyout"
    >
      <EuiFlyoutHeader hasBorder>
        <EuiFlexGroup gutterSize="m" alignItems="center" responsive={false}>
          <EuiFlexItem grow={false}>
            <ConnectorIcon icon={entry.icon} size="xl" tile="l" />
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiTitle size="m">
              <h2 id={titleId}>{header.title}</h2>
            </EuiTitle>
            <EuiText size="s" color="subdued">
              {header.description}
            </EuiText>
          </EuiFlexItem>
        </EuiFlexGroup>
        <EuiSpacer size="l" />
        <EuiStepsHorizontal size="s" steps={steps} />
      </EuiFlyoutHeader>
      <EuiFlyoutBody>
        {step === 1 && (
          <ChooseCapabilitiesStep entry={entry} selected={selected} onToggle={toggle} />
        )}
        {showFormErrors && step === 2 && (
          <>
            <EuiCallOut
              announceOnMount
              size="s"
              color="danger"
              iconType="warning"
              data-test-subj="connector-form-header-error-label"
              title={i18n.translate(
                'xpack.triggersActionsUI.connectorsRedesign.wizard.formErrors',
                {
                  defaultMessage: 'There are errors in the form',
                }
              )}
            />
            <EuiSpacer size="m" />
          </>
        )}
        {hasVisitedConfigure && (
          <div hidden={step !== 2}>
            <ConfigureAccessStep
              entry={entry}
              selected={selected}
              activeTab={activeTab}
              onTabChange={setActiveTab}
              connectorForm={connectorForm}
              formDirection={formDirection}
              hasRealInbound={hasRealInbound}
              isPerUser={false}
              inboundDraft={inboundDraft}
              onInboundDraftChange={setInboundDraft}
              currentUser={currentUser}
            />
          </div>
        )}
        {step === 3 && (
          <ReviewStep
            entry={entry}
            selected={selected}
            connectionName={connectionName}
            hasRealInbound={hasRealInbound}
            inboundDraft={inboundDraft}
            isTestable={isTestable}
            createError={createConnectorError ?? undefined}
            createdInboundConnector={createdInbound}
          />
        )}
      </EuiFlyoutBody>
      <EuiFlyoutFooter>
        <EuiFlexGroup justifyContent="spaceBetween" alignItems="center" responsive={false}>
          <EuiFlexItem grow={false}>
            {!createdInbound && (
              <EuiButtonEmpty onClick={onClose} data-test-subj="create-connector-flyout-cancel-btn">
                {CANCEL}
              </EuiButtonEmpty>
            )}
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiFlexGroup gutterSize="s" responsive={false}>
              {step > 1 && !createdInbound && (
                <EuiFlexItem grow={false}>
                  <EuiButton
                    color="text"
                    onClick={() => setStep((step - 1) as Step)}
                    isDisabled={isBusy}
                    data-test-subj="create-connector-flyout-back-btn"
                  >
                    {BACK}
                  </EuiButton>
                </EuiFlexItem>
              )}
              {step === 1 && (
                <EuiFlexItem grow={false}>
                  <EuiButton
                    fill
                    isDisabled={selected.size === 0}
                    onClick={goToConfigure}
                    data-test-subj="connectContinueButton"
                  >
                    {CONTINUE}
                  </EuiButton>
                </EuiFlexItem>
              )}
              {step === 2 && (
                <EuiFlexItem grow={false}>
                  <EuiButton
                    fill
                    iconType="sortRight"
                    iconSide="right"
                    onClick={needsInboundTab ? () => setActiveTab('inbound') : goToReview}
                    data-test-subj="connectContinueButton"
                  >
                    {needsInboundTab ? CONTINUE_TO_INBOUND : CONTINUE}
                  </EuiButton>
                </EuiFlexItem>
              )}
              {step === 3 && !createdInbound && isTestable && (
                <EuiFlexItem grow={false}>
                  <EuiButton
                    onClick={() => save(true)}
                    isLoading={isBusy}
                    data-test-subj="create-connector-flyout-save-test-btn"
                  >
                    {SAVE_AND_TEST}
                  </EuiButton>
                </EuiFlexItem>
              )}
              {step === 3 && !createdInbound && (
                <EuiFlexItem grow={false}>
                  <EuiButton
                    fill
                    onClick={() => save(false)}
                    isLoading={isBusy}
                    data-test-subj="create-connector-flyout-save-btn"
                  >
                    {SAVE}
                  </EuiButton>
                </EuiFlexItem>
              )}
              {createdInbound && (
                <EuiFlexItem grow={false}>
                  <EuiButton
                    fill
                    onClick={() => onConnected(createdInbound.id, false)}
                    data-test-subj="connectDoneButton"
                  >
                    {DONE}
                  </EuiButton>
                </EuiFlexItem>
              )}
            </EuiFlexGroup>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiFlyoutFooter>
    </EuiFlyout>
  );
};
