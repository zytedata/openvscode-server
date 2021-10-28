/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Gitpod. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import * as http from 'http';
import * as prometheusClient from 'prom-client';
import { ILogService } from 'vs/platform/log/common/log';

const extensionsInstallCounter = new prometheusClient.Counter({
	name: 'gitpod_code_extensions_installs_total',
	help: 'Total amount of extensions installs',
	labelNames: ['source', 'status'],
	registers: [prometheusClient.register],
});

export function increaseExtensionsInstallCounter(source: string, status: 'ok' | string): void {
	extensionsInstallCounter.inc({ source, status });
}

export async function serve(logService: ILogService, res: http.ServerResponse): Promise<void> {
	try {
		const metrics = await prometheusClient.register.metrics();
		res.writeHead(200, { 'Content-Type': prometheusClient.register.contentType });
		res.end(metrics);
	} catch (error) {
		logService.error(error);
		console.error(error.toString());
		res.writeHead(500, { 'Content-Type': 'text/plain' });
		res.end('Internal Server Error');
	}
}

