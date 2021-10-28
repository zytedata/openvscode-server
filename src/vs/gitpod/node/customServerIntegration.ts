/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Gitpod. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import * as http from 'http';
import { Emitter } from 'vs/base/common/event';
import { ILogService } from 'vs/platform/log/common/log';
import { IDisposable } from 'vs/base/common/lifecycle';
import * as yaml from 'js-yaml';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { generateUuid } from 'vs/base/common/uuid';
import { asText, IRequestService } from 'vs/platform/request/common/request';
import { CancellationToken } from 'vs/base/common/cancellation';
import { streamToBuffer } from 'vs/base/common/buffer';
import * as metrics from 'vs/gitpod/node/prometheusMetrics';
import { IExtensionGalleryService, IExtensionManagementService } from 'vs/platform/extensionManagement/common/extensionManagement';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';

const devMode = !!process.env['VSCODE_DEV'];
const supervisorAddr = process.env.SUPERVISOR_ADDR || 'localhost:22999';

let activeCliIpcHook: string | undefined;
const didChangeActiveCliIpcHookEmitter = new Emitter<void>();

function withActiveCliIpcHook(cb: (activeCliIpcHook: string) => void): IDisposable {
	if (activeCliIpcHook) {
		cb(activeCliIpcHook);
		return { dispose: () => { } };
	}
	const listener = didChangeActiveCliIpcHookEmitter.event(() => {
		if (activeCliIpcHook) {
			listener.dispose();
			cb(activeCliIpcHook);
		}
	});
	return listener;
}

function deleteActiveCliIpcHook(cliIpcHook: string) {
	if (!activeCliIpcHook || activeCliIpcHook !== cliIpcHook) {
		return;
	}
	activeCliIpcHook = undefined;
	didChangeActiveCliIpcHookEmitter.fire();
}

function setActiveCliIpcHook(cliIpcHook: string): void {
	if (activeCliIpcHook === cliIpcHook) {
		return;
	}
	activeCliIpcHook = cliIpcHook;
	didChangeActiveCliIpcHookEmitter.fire();
}

export function handleGitpodRequests(logService: ILogService, pathname: string, req: http.IncomingMessage, res: http.ServerResponse): boolean {
	if (pathname === '/__gitpod/metrics') {
		metrics.serve(logService, res);
		return true;
	}
	if (pathname === '/cli') {
		if (req.method === 'GET') {
			res.writeHead(200, { 'Content-Type': 'text/plain' });
			res.end(activeCliIpcHook);
			return true;
		}
		if (req.method === 'DELETE') {
			let cliIpcHook = '';
			req.setEncoding('utf8');
			req.on('data', (chunk: string) => cliIpcHook += chunk);
			req.on('end', () => {
				deleteActiveCliIpcHook(cliIpcHook);
				res.writeHead(200);
				res.end();
			});
			return true;
		}
		if (req.method === 'PUT') {
			let cliIpcHook = '';
			req.setEncoding('utf8');
			req.on('data', (chunk: string) => cliIpcHook += chunk);
			req.on('end', () => {
				setActiveCliIpcHook(cliIpcHook);
				res.writeHead(200);
				res.end();
			});
			return true;
		}
		if (req.method === 'POST') {
			const listener = withActiveCliIpcHook(activeCliIpcHook =>
				req.pipe(http.request({
					socketPath: activeCliIpcHook,
					method: req.method,
					headers: req.headers
				}, res2 => res2.pipe(res)))
			);
			req.on('close', () => listener.dispose());
			return true;
		}
		return false;
	}
	if (devMode && pathname.startsWith('/_supervisor')) {
		const [host, port] = supervisorAddr.split(':');
		req.pipe(http.request({
			host,
			port,
			method: req.method,
			path: pathname
		}, res2 => res2.pipe(res)));
		return true;
	}
	return false;
}

async function downloadInitialExtension(url: string, requestService: IRequestService): Promise<string> {
	const context = await requestService.request({
		type: 'GET', url, headers: {
			'Content-Type': '*/*' // GCP requires that the content-type header match those used during the signing operation (*/* in our case)
		}
	}, CancellationToken.None);
	if (context.res.statusCode !== 200) {
		const message = await asText(context);
		throw new Error(`expected 200, got back ${context.res.statusCode} instead.\n\n${message}`);
	}
	const downloadedLocation = path.join(os.tmpdir(), `${generateUuid()}.vsix`);
	const buffer = await streamToBuffer(context.stream);
	await fs.promises.writeFile(downloadedLocation, buffer.buffer);
	return downloadedLocation;
}

export async function getInitialExtensionsToInstall(logService: ILogService, requestService: IRequestService) {
	const pendingExtensions = async () => {
		const extensions = [];
		try {
			const workspaceContextUrl = process.env.GITPOD_WORKSPACE_CONTEXT_URL;
			if (workspaceContextUrl && /github\.com/i.test(workspaceContextUrl)) {
				extensions.push('github.vscode-pull-request-github');
			}

			const repoRoot = process.env.GITPOD_REPO_ROOT;
			if (repoRoot) {
				let config: { vscode?: { extensions?: string[] } } | undefined;
				try {
					const content = await fs.promises.readFile(path.join(repoRoot, '.gitpod.yml'), 'utf-8');
					config = yaml.safeLoad(content) as any;
				} catch { }

				if (config?.vscode?.extensions) {
					const extensionIdRegex = /^([^.]+\.[^@]+)(@(\d+\.\d+\.\d+(-.*)?))?$/;
					for (const extension of config.vscode.extensions) {
						const normalizedExtension = extension.toLocaleLowerCase();
						if (extensionIdRegex.exec(normalizedExtension)) {
							extensions.push(normalizedExtension);
						}
					}
				}
			}
		} catch (e) {
			logService.error('code server: failed to detect workspace context dependent extensions:', e);
		}
		return extensions;
	};

	const vsixPaths: string[] = [];
	const pendingVsixs: Promise<void>[] = [];

	if (process.env.GITPOD_RESOLVED_EXTENSIONS) {
		let resolvedPlugins: any = {};
		try {
			resolvedPlugins = JSON.parse(process.env.GITPOD_RESOLVED_EXTENSIONS);
		} catch (e) {
			logService.error('code server: failed to parse process.env.GITPOD_RESOLVED_EXTENSIONS:', e);
		}
		for (const pluginId in resolvedPlugins) {
			const resolvedPlugin = resolvedPlugins[pluginId];
			if (resolvedPlugin?.kind !== 'workspace') {
				// ignore built-in extensions configured for Theia, we default to VS Code built-in extensions
				// ignore user extensions installed in Theia, since we switched to the sync storage for them
				continue;
			}
			pendingVsixs.push(downloadInitialExtension(resolvedPlugin.url, requestService).then(vsix => {
				vsixPaths.push(vsix);
			}, e => {
				logService.error(`code server: failed to download initial configured extension from '${resolvedPlugin.url}':`, e);
			}));
		}
	}

	if (process.env.GITPOD_EXTERNAL_EXTENSIONS) {
		let external: string[] = [];
		try {
			external = JSON.parse(process.env.GITPOD_EXTERNAL_EXTENSIONS);
		} catch (e) {
			logService.error('code server: failed to parse process.env.GITPOD_EXTERNAL_EXTENSIONS:', e);
		}
		for (const url of external) {
			pendingVsixs.push(downloadInitialExtension(url, requestService).then(vsix => {
				vsixPaths.push(vsix);
			}, e => {
				logService.error(`code server: failed to download initial external extension from '${url}':`, e);
			}));
		}
	}

	await Promise.all(pendingVsixs);
	const extIds = await pendingExtensions();

	return [...vsixPaths, ...extIds];
}

export function instrumentExtensionsMetrics(accessor: ServicesAccessor): void {
	const extensionManagementService = accessor.get(IExtensionManagementService);

	const install = extensionManagementService.install.bind(extensionManagementService);
	extensionManagementService.install = async (vsix, options) => {
		const source = 'RemoteExtensionManagementService.install';
		try {
			const result = await install(vsix, options);
			metrics.increaseExtensionsInstallCounter(source, 'ok');
			return result;
		} catch (e) {
			metrics.increaseExtensionsInstallCounter(source, e.message);
			throw e;
		}
	};

	const installFromGallery = extensionManagementService.installFromGallery.bind(extensionManagementService);
	extensionManagementService.installFromGallery = async (extension, options) => {
		const source = 'RemoteExtensionManagementService.installFromGallery';
		try {
			const result = await installFromGallery(extension, options);
			metrics.increaseExtensionsInstallCounter(source, 'ok');
			return result;
		} catch (e) {
			metrics.increaseExtensionsInstallCounter(source, e.message);
			throw e;
		}
	};

	const extensionGalleryService = accessor.get(IExtensionGalleryService);
	const getExtensions = extensionGalleryService.getExtensions.bind(extensionGalleryService);
	extensionGalleryService.getExtensions = async (identifiers, token) => {
		const source = 'RemoteExtensionGalleryService.getExtensions';
		try {
			const result = await getExtensions(identifiers, token);
			metrics.increaseExtensionsInstallCounter(source, 'ok');
			return result;
		} catch (e) {
			metrics.increaseExtensionsInstallCounter(source, e.message);
			throw e;
		}
	};

	const getManifest = extensionGalleryService.getManifest.bind(extensionGalleryService);
	extensionGalleryService.getManifest = async (extension, token) => {
		const source = 'RemoteExtensionGalleryService.getManifest';
		try {
			const result = await getManifest(extension, token);
			metrics.increaseExtensionsInstallCounter(source, 'ok');
			return result;
		} catch (e) {
			metrics.increaseExtensionsInstallCounter(source, e.message);
			throw e;
		}
	};
}
