/* eslint-disable local/code-import-patterns */
/* eslint-disable header/header */
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Gitpod. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { onUnexpectedError } from 'vs/base/common/errors';
import { ITelemetryAppender, validateTelemetryData } from 'vs/platform/telemetry/common/telemetryUtils';
import { InfoServiceClient } from '@gitpod/supervisor-api-grpc/lib/info_grpc_pb';
import { WorkspaceInfoRequest, WorkspaceInfoResponse } from '@gitpod/supervisor-api-grpc/lib/info_pb';
import * as grpc from '@grpc/grpc-js';
import * as util from 'util';
import { filter } from 'vs/base/common/objects';
import { mapMetrics, mapTelemetryData } from 'vs/gitpod/common/insightsHelper';
import { MetricsServiceClient, sendMetrics, ReportErrorRequest } from '@gitpod/ide-metrics-api-grpcweb';
import { IGitpodPreviewConfiguration } from 'vs/base/common/product';
import { NodeHttpTransport } from '@improbable-eng/grpc-web-node-http-transport';
import { ErrorEvent } from 'vs/platform/telemetry/common/errorTelemetry';
import { Analytics, AnalyticsSettings } from '@segment/analytics-node';

class SupervisorConnection {
	readonly deadlines = {
		long: 30 * 1000,
		normal: 15 * 1000,
		short: 5 * 1000
	};
	private readonly addr = process.env.SUPERVISOR_ADDR || 'localhost:22999';
	readonly metadata = new grpc.Metadata();
	readonly info: InfoServiceClient;

	constructor() {
		this.info = new InfoServiceClient(this.addr, grpc.credentials.createInsecure());
	}
}

export class GitpodInsightsAppender implements ITelemetryAppender {

	private _asyncAIClient: Promise<Analytics> | null;
	private readonly _baseProperties: { appName: string; uiKind: 'web' };
	private readonly supervisor = new SupervisorConnection();
	private galleryHost: string | undefined;

	constructor(
		productName: string,
		private readonly segmentKey: string,
		private readonly productVersion: string,
		private readonly gitpodPreview?: IGitpodPreviewConfiguration,
		readonly galleryServiceUrl?: string
	) {
		this._asyncAIClient = null;
		this._baseProperties = {
			appName: productName,
			uiKind: 'web',
		};
		this.galleryHost = galleryServiceUrl ? new URL(galleryServiceUrl).host : undefined;
	}

	private _withAIClient(callback: (aiClient: Analytics) => void): void {
		if (!this._asyncAIClient) {
			this._asyncAIClient = this.getWorkspaceInfo().then(({ gitpodHost }) => {
				const settings: AnalyticsSettings = {
					writeKey: this.segmentKey,
					// in dev mode we report directly to IDE playground source
					host: 'https://api.segment.io',
					path: '/v1/batch'
				};
				if (this.segmentKey === 'untrusted-dummy-key') {
					settings.host = gitpodHost;
					settings.path = '/analytics' + settings.path;
				}
				return new Analytics(settings);
			});
		}

		this._asyncAIClient.then(
			(aiClient) => {
				callback(aiClient);
			},
			(err) => {
				onUnexpectedError(err);
				console.error(err);
			}
		);
	}

	log(eventName: string, data?: any): void {
		this.sendAnalytics(data, eventName);
		this.sendMetrics(data, eventName);
		if (eventName === 'UnhandledError') {
			if (data.fromBrowser) {
				return;
			}
			this.sendErrorReport(data as ErrorEvent);
		}
	}

	private async sendAnalytics(data: any, eventName: string): Promise<void> {
		try {
			const mappedEvent = await this.mapAnalytics(eventName, data);
			if (!mappedEvent) {
				return;
			}
			if (process.env['VSCODE_DEV']) {
				if (this.gitpodPreview?.log?.analytics) {
					console.log('Gitpod Analytics: ', JSON.stringify(mappedEvent, undefined, 2));
				}
			} else {
				this._withAIClient((aiClient) => {
					aiClient.track(mappedEvent);
				});
			}
		} catch (e) {
			console.error('failed to send IDE analytics:', e);
		}
	}

	private async mapAnalytics(eventName: string, data: any) {
		data = validateTelemetryData(data);
		const mappedEvent = mapTelemetryData('remote-server', eventName, data.properties);
		if (!mappedEvent) {
			return undefined;
		}
		const { workspaceId, instanceId, debugWorkspaceType, ownerId } = await this.getWorkspaceInfo();
		mappedEvent.properties = filter(mappedEvent.properties, (_, v) => v !== undefined && v !== null);
		mappedEvent.properties = {
			...mappedEvent.properties,
			...this._baseProperties,
			workspaceId,
			instanceId,
			debugWorkspace: debugWorkspaceType > 0,
			// for backward compatibility with reports, we use instanceId in other places
			workspaceInstanceId: instanceId
		};
		return { userId: ownerId, ...mappedEvent };
	}

	private async sendMetrics(data: any, eventName: string): Promise<void> {
		try {
			const metrics = mapMetrics('remote-server', eventName, data, { galleryHost: this.galleryHost });
			if (!metrics || !metrics.length) {
				return;
			}
			if (process.env['VSCODE_DEV'] && this.gitpodPreview?.log?.metrics) {
				console.log('Gitpod Metrics: ', JSON.stringify(metrics, undefined, 2));
			}
			const client = await this.getMetricsClient();
			if (client) {
				await sendMetrics(client, metrics);
			}
		} catch (e) {
			console.error('failed to send IDE metric:', e);
		}
	}

	private async sendErrorReport(error: ErrorEvent): Promise<void> {
		const { workspaceId, instanceId, ownerId, debugWorkspaceType } = await this.getWorkspaceInfo();
		const req = new ReportErrorRequest();
		req.setWorkspaceId(workspaceId);
		req.setInstanceId(instanceId);
		req.setUserId(ownerId);
		req.setErrorStack(error.callstack);
		req.setComponent('vscode-server');
		req.setVersion(this.productVersion);
		req.getPropertiesMap().set('error_name', error.uncaught_error_name || '');
		req.getPropertiesMap().set('error_message', error.msg || '');
		req.getPropertiesMap().set('appName', this._baseProperties.appName);
		req.getPropertiesMap().set('uiKind', this._baseProperties.uiKind);
		req.getPropertiesMap().set('debug_workspace', String(debugWorkspaceType > 0));

		if (process.env['VSCODE_DEV']) {
			console.log('Gitpod Error Reports: ', JSON.stringify(req.toObject(), null, 2));
		}
		const client = await this.getMetricsClient();
		if (client) {
			client.reportError(req, (e) => {
				if (e) {
					console.error('failed to send IDE error report:', e);
				}
			});
		}
	}

	flush(): Promise<any> {
		return new Promise(resolve => {
			if (!this._asyncAIClient) {
				return resolve(undefined);
			}
			this._asyncAIClient
				.then(aiClient => aiClient.closeAndFlush({ timeout: 3000 }))
				.finally(() => resolve(undefined));
		});
	}

	private _metricsClient: Promise<MetricsServiceClient | undefined> | undefined;
	private getMetricsClient(): Promise<MetricsServiceClient | undefined> {
		if (this._metricsClient) {
			return this._metricsClient;
		}
		return this._metricsClient = (async () => {
			let gitpodHost: string | undefined;
			if (process.env['VSCODE_DEV']) {
				gitpodHost = this.gitpodPreview?.host;
			} else {
				const info = await this.getWorkspaceInfo();
				gitpodHost = new URL(info.gitpodHost).host;
			}
			if (!gitpodHost) {
				return undefined;
			}
			const ideMetricsEndpoint = 'https://ide.' + gitpodHost + '/metrics-api';
			return new MetricsServiceClient(ideMetricsEndpoint, { transport: NodeHttpTransport() });
		})();
	}

	private _workspaceInfo: WorkspaceInfoResponse.AsObject | undefined;
	private async getWorkspaceInfo() {
		if (!this._workspaceInfo) {
			this._workspaceInfo = (await util.promisify(this.supervisor.info.workspaceInfo.bind(this.supervisor.info, new WorkspaceInfoRequest(), this.supervisor.metadata, {
				deadline: Date.now() + this.supervisor.deadlines.long
			}))()).toObject();
		}

		return this._workspaceInfo;
	}
}
