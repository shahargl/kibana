/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { Redirect } from 'react-router-dom';
import { Route, Routes } from '@kbn/shared-ux-router';
import { HealthContextProvider } from '../../context/health_context';
import { HealthCheck } from '../../components/health_check';
import { ROUTE_CATALOG, ROUTE_CONNECTED, ROUTE_DETAILS } from './constants';
import { ConnectorsPage } from './pages/connectors_page';
import { ConnectorDetailsPage } from './pages/connector_details/connector_details_page';

/** Stack Management > Connectors, redesigned. Enabled by the `connectorsUxRedesign` flag. */
export const ConnectorsRedesignApp = () => (
  <HealthContextProvider>
    <HealthCheck waitForCheck={true}>
      <Routes>
        <Route exact path={ROUTE_DETAILS} component={ConnectorDetailsPage} />
        <Route exact path={[ROUTE_CONNECTED, ROUTE_CATALOG]} component={ConnectorsPage} />
        <Redirect to={ROUTE_CONNECTED} />
      </Routes>
    </HealthCheck>
  </HealthContextProvider>
);
