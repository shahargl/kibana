/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useState } from 'react';
import type { EuiSelectableOption } from '@elastic/eui';
import { EuiFilterButton, EuiFilterGroup, EuiPopover, EuiSelectable } from '@elastic/eui';

interface SelectFilterOption<T extends string> {
  readonly value: T;
  readonly label: string;
}

interface SelectFilterProps<T extends string> {
  readonly label: string;
  readonly value: T;
  readonly options: ReadonlyArray<SelectFilterOption<T>>;
  readonly onChange: (value: T) => void;
  readonly 'data-test-subj'?: string;
}

/** Single-select dropdown rendered as "Label: Value ▾". */
export const SelectFilter = <T extends string>({
  label,
  value,
  options,
  onChange,
  'data-test-subj': dataTestSubj,
}: SelectFilterProps<T>) => {
  const [isOpen, setIsOpen] = useState(false);
  const selected = options.find((option) => option.value === value);
  const selectableOptions: Array<EuiSelectableOption<{ value: T }>> = options.map((option) => ({
    label: option.label,
    value: option.value,
    checked: option.value === value ? 'on' : undefined,
  }));

  return (
    <EuiFilterGroup compressed>
      <EuiPopover
        isOpen={isOpen}
        closePopover={() => setIsOpen(false)}
        panelPaddingSize="none"
        anchorPosition="downLeft"
        aria-label={label}
        button={
          <EuiFilterButton
            iconType="chevronSingleDown"
            iconSide="right"
            onClick={() => setIsOpen((open) => !open)}
            isSelected={isOpen}
            data-test-subj={dataTestSubj}
          >
            {`${label}: ${selected?.label ?? ''}`}
          </EuiFilterButton>
        }
      >
        <EuiSelectable
          singleSelection="always"
          options={selectableOptions}
          onChange={(_, __, changed) => {
            onChange(changed.value);
            setIsOpen(false);
          }}
          listProps={{ bordered: false }}
          css={{ minWidth: 200 }}
        >
          {(list) => list}
        </EuiSelectable>
      </EuiPopover>
    </EuiFilterGroup>
  );
};
