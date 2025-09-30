/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { buildKibanaRequestFromAction } from '@kbn/workflows';
import type { WorkflowContextManager } from '../workflow_context_manager/workflow_context_manager';
import type { WorkflowExecutionRuntimeManager } from '../workflow_context_manager/workflow_execution_runtime_manager';
import type { IWorkflowEventLogger } from '../workflow_event_logger/workflow_event_logger';
import type { RunStepResult, BaseStep } from './node_implementation';
import { BaseAtomicNodeImplementation } from './node_implementation';

// Extend BaseStep for kibana-specific properties
export interface KibanaActionStep extends BaseStep {
  type: string; // e.g., 'kibana.createCaseDefaultSpace'
  with?: Record<string, any>;
}

export class KibanaActionStepImpl extends BaseAtomicNodeImplementation<KibanaActionStep> {
  constructor(
    step: KibanaActionStep,
    contextManager: WorkflowContextManager,
    workflowRuntime: WorkflowExecutionRuntimeManager,
    private workflowLogger: IWorkflowEventLogger
  ) {
    super(step, contextManager, undefined, workflowRuntime);
  }

  public getInput() {
    // Get current context for templating
    const context = this.contextManager.getContext();
    // Render inputs from 'with' - support both direct step.with and step.configuration.with
    const stepWith = this.step.with || (this.step as any).configuration?.with || {};
    return this.renderObjectTemplate(stepWith, context);
  }

  /**
   * Recursively render the object template.
   * @param obj - The object to render.
   * @param context - The context to use for rendering.
   * @returns The rendered object.
   */
  private renderObjectTemplate(obj: any, context: any): any {
    if (Array.isArray(obj)) {
      return obj.map((item) => this.renderObjectTemplate(item, context));
    }
    if (obj && typeof obj === 'object') {
      return Object.entries(obj).reduce((acc, [key, value]) => {
        acc[key] = this.renderObjectTemplate(value, context);
        return acc;
      }, {} as any);
    }
    if (typeof obj === 'string') {
      return this.templatingEngine.render(obj, context);
    }
    return obj;
  }

  public async _run(withInputs?: any): Promise<RunStepResult> {
    try {
      // Support both direct step types (kibana.createCaseDefaultSpace) and atomic+configuration pattern
      const stepType = this.step.type || (this.step as any).configuration?.type;
      // Use rendered inputs if provided, otherwise fall back to raw step.with or configuration.with
      const stepWith = withInputs || this.step.with || (this.step as any).configuration?.with;

      this.workflowLogger.logInfo(`Executing Kibana action: ${stepType}`, {
        event: { action: 'kibana-action', outcome: 'unknown' },
        tags: ['kibana', 'internal-action'],
        labels: {
          step_type: stepType,
          connector_type: stepType,
          action_type: 'kibana',
        },
      });

      // Get Kibana base URL and authentication
      const kibanaUrl = this.getKibanaUrl();
      const authHeaders = this.getAuthHeaders();

      // Generic approach like Dev Console - just forward the request to Kibana
      const result = await this.executeKibanaRequest(kibanaUrl, authHeaders, stepType, stepWith);

      this.workflowLogger.logInfo(`Kibana action completed: ${stepType}`, {
        event: { action: 'kibana-action', outcome: 'success' },
        tags: ['kibana', 'internal-action'],
        labels: {
          step_type: stepType,
          connector_type: stepType,
          action_type: 'kibana',
        },
      });

      return { input: stepWith, output: result, error: undefined };
    } catch (error) {
      const stepType = (this.step as any).configuration?.type || this.step.type;
      const stepWith = withInputs || this.step.with || (this.step as any).configuration?.with;

      this.workflowLogger.logError(`Kibana action failed: ${stepType}`, error as Error, {
        event: { action: 'kibana-action', outcome: 'failure' },
        tags: ['kibana', 'internal-action', 'error'],
        labels: {
          step_type: stepType,
          connector_type: stepType,
          action_type: 'kibana',
        },
      });
      return await this.handleFailure(stepWith, error);
    }
  }

  private getKibanaUrl(): string {
    const coreStart = this.contextManager.getCoreStart();
    
    // First try to get the public base URL if configured
    if (coreStart?.http?.basePath?.publicBaseUrl) {
      return coreStart.http.basePath.publicBaseUrl;
    }

    // If no public base URL, construct it from server info and base path
    if (coreStart?.http) {
      const serverInfo = coreStart.http.getServerInfo();
      const basePath = coreStart.http.basePath.serverBasePath || '';
      
      // Construct the full URL with protocol, host, port, and base path
      const protocol = serverInfo.protocol || 'http';
      const hostname = serverInfo.hostname || 'localhost';
      const port = serverInfo.port || 5601;
      
      return `${protocol}://${hostname}:${port}${basePath}`;
    }

    // Final fallback to localhost (this should rarely be used)
    return 'http://localhost:5601';
  }

  private getAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'kbn-xsrf': 'true',
    };

    // Get fakeRequest for authentication (created by Task Manager from taskInstance.apiKey)
    const fakeRequest = this.contextManager.getFakeRequest();
    if (fakeRequest?.headers?.authorization) {
      // Use API key from fakeRequest if available
      headers.Authorization = fakeRequest.headers.authorization.toString();
    } else {
      // Fallback to basic auth for development
      const basicAuth = Buffer.from('elastic:changeme').toString('base64');
      headers.Authorization = `Basic ${basicAuth}`;
    }

    // Note: User context is not available in KibanaRequestAuth interface
    // Could be added in the future if needed for user attribution

    return headers;
  }

  private async executeKibanaRequest(
    kibanaUrl: string,
    authHeaders: Record<string, string>,
    stepType: string,
    params: any
  ): Promise<any> {
    // Support both raw API format and connector-driven syntax
    if (params.request) {
      // Raw API format: { request: { method, path, body, query, headers } } - like Dev Console
      const { method = 'GET', path, body, query, headers: customHeaders } = params.request;
      return await this.makeHttpRequest(kibanaUrl, {
        method,
        path,
        body,
        query,
        headers: { ...authHeaders, ...customHeaders },
      });
    } else {
      // Use generated connector definitions to determine method and path (covers all 454+ Kibana APIs)
      const {
        method,
        path,
        body,
        query,
        headers: connectorHeaders,
      } = buildKibanaRequestFromAction(stepType, params);

      return await this.makeHttpRequest(kibanaUrl, {
        method,
        path,
        body,
        query,
        headers: { ...authHeaders, ...connectorHeaders },
      });
    }
  }

  private async makeHttpRequest(
    kibanaUrl: string,
    requestConfig: {
      method: string;
      path: string;
      body?: any;
      query?: any;
      headers?: Record<string, string>;
    }
  ): Promise<any> {
    const { method, path, body, query, headers = {} } = requestConfig;

    // Ensure the path is properly constructed with base path
    const coreStart = this.contextManager.getCoreStart();
    let finalPath = path;
    
    // If we have access to basePath service, use it to prepend the base path to API paths
    if (coreStart?.http?.basePath && !path.startsWith('/api')) {
      // Only prepend base path if it's not already included in kibanaUrl
      // and if the path doesn't already start with the base path
      const serverBasePath = coreStart.http.basePath.serverBasePath;
      if (serverBasePath && !kibanaUrl.includes(serverBasePath) && !path.startsWith(serverBasePath)) {
        finalPath = coreStart.http.basePath.prepend(path);
      }
    }

    // Build full URL with query parameters
    let fullUrl = `${kibanaUrl}${finalPath}`;
    if (query && Object.keys(query).length > 0) {
      const queryString = new URLSearchParams(query).toString();
      fullUrl = `${fullUrl}?${queryString}`;
    }

    const response = await fetch(fullUrl, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const responseData = await response.json();
    return responseData;
  }
}
