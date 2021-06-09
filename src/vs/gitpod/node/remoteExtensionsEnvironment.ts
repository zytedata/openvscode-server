/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Typefox. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import { CancellationToken } from 'vs/base/common/cancellation';
import { Event } from 'vs/base/common/event';
import { FileAccess } from 'vs/base/common/network';
import * as platform from 'vs/base/common/platform';
import Severity from 'vs/base/common/severity';
import { URI } from 'vs/base/common/uri';
import { IRawURITransformer, transformIncomingURIs, transformOutgoingURIs, URITransformer } from 'vs/base/common/uriIpc';
import { IServerChannel } from 'vs/base/parts/ipc/common/ipc';
import { NativeEnvironmentService } from 'vs/platform/environment/node/environmentService';
import { ExtensionIdentifier, IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { LocalizationsService } from 'vs/platform/localizations/node/localizations';
import { ILogService } from 'vs/platform/log/common/log';
import product from 'vs/platform/product/common/product';
import { RemoteAgentConnectionContext } from 'vs/platform/remote/common/remoteAgentEnvironment';
import { Logger, Translations } from 'vs/workbench/services/extensions/common/extensionPoints';
import { ExtensionScanner, ExtensionScannerInput, IExtensionReference } from 'vs/workbench/services/extensions/node/extensionPoints';
import { IGetEnvironmentDataArguments, IRemoteAgentEnvironmentDTO, IScanExtensionsArguments, IScanSingleExtensionArguments } from 'vs/workbench/services/remote/common/remoteAgentEnvironmentChannel';

// see used APIs in vs/workbench/services/remote/common/remoteAgentEnvironmentChannel.ts
export class RemoteExtensionsEnvironment implements IServerChannel<RemoteAgentConnectionContext> {
	private extensionHostLogFileSeq = 1;
	private readonly systemExtensionRoot: string;
	private readonly extraDevSystemExtensionsRoot: string;
	private readonly logger: Logger;
	private readonly initLocalization: Promise<boolean>;

	constructor(
		private readonly devMode: boolean,
		private readonly connectionToken: string,
		private readonly environmentService: NativeEnvironmentService,
		private readonly localizationService: LocalizationsService,
		private readonly rawURITransformerFactory: (remoteAuthority: string) => IRawURITransformer,
		private readonly logService: ILogService,
		private pendingInitialExtensions: Promise<void>
	) {
		const rootPath = FileAccess.asFileUri('', require).fsPath;
		this.systemExtensionRoot = path.normalize(path.join(rootPath, '..', 'extensions'));
		this.extraDevSystemExtensionsRoot = path.normalize(path.join(rootPath, '..', '.build', 'builtInExtensions'));
		this.logger = new Logger((severity, source, message) => {
			const msg = devMode && source ? `[${source}]: ${message}` : message;
			if (severity === Severity.Error) {
				logService.error(msg);
			} else if (severity === Severity.Warning) {
				logService.warn(msg);
			} else {
				logService.info(msg);
			}
		});
		this.initLocalization = this.localizationService.update();
	}

	async call(ctx: RemoteAgentConnectionContext, command: string, arg?: any, cancellationToken?: CancellationToken | undefined): Promise<any> {
		if (command === 'getEnvironmentData') {
			const args: IGetEnvironmentDataArguments = arg;
			const uriTranformer = new URITransformer(this.rawURITransformerFactory(args.remoteAuthority));
			return transformOutgoingURIs({
				pid: process.pid,
				connectionToken: this.connectionToken,
				appRoot: URI.file(this.environmentService.appRoot),
				settingsPath: this.environmentService.machineSettingsResource,
				logsPath: URI.file(this.environmentService.logsPath),
				extensionsPath: URI.file(this.environmentService.extensionsPath),
				extensionHostLogsPath: URI.file(path.join(this.environmentService.logsPath, `extension_host_${this.extensionHostLogFileSeq++}`)),
				globalStorageHome: this.environmentService.globalStorageHome,
				workspaceStorageHome: this.environmentService.workspaceStorageHome,
				userHome: this.environmentService.userHome,
				os: platform.OS,
				marks: [],
				useHostProxy: false
			} as IRemoteAgentEnvironmentDTO, uriTranformer);
		}
		if (command === 'scanSingleExtension') {
			let args: IScanSingleExtensionArguments = arg;
			const uriTranformer = new URITransformer(this.rawURITransformerFactory(args.remoteAuthority));
			args = transformIncomingURIs(args, uriTranformer);
			const translations = await this.resolveTranslations(args.language);

			// see scanSingleExtension in src/vs/workbench/services/extensions/electron-browser/cachedExtensionScanner.ts
			const input = new ExtensionScannerInput(product.version, product.commit, args.language, this.devMode, URI.revive(args.extensionLocation).fsPath, args.isBuiltin, false, translations);
			const extension = await ExtensionScanner.scanSingleExtension(input, this.logService);
			if (!extension) {
				return undefined;
			}
			return transformOutgoingURIs(extension, uriTranformer);
		}
		if (command === 'scanExtensions') {
			let args: IScanExtensionsArguments = arg;
			const uriTranformer = new URITransformer(this.rawURITransformerFactory(args.remoteAuthority));
			args = transformIncomingURIs(args, uriTranformer);
			const translations = await this.resolveTranslations(args.language);

			// see _scanInstalledExtensions in src/vs/workbench/services/extensions/electron-browser/cachedExtensionScanner.ts
			let pendingSystem = ExtensionScanner.scanExtensions(new ExtensionScannerInput(product.version, product.commit, args.language, this.devMode, this.systemExtensionRoot, true, false, translations), this.logger);
			const builtInExtensions = product.builtInExtensions;
			if (this.devMode && builtInExtensions && builtInExtensions.length) {
				pendingSystem = ExtensionScanner.mergeBuiltinExtensions(pendingSystem, ExtensionScanner.scanExtensions(new ExtensionScannerInput(product.version, product.commit, args.language, this.devMode, this.extraDevSystemExtensionsRoot, true, false, translations), this.logger, {
					resolveExtensions: () => {
						const result: IExtensionReference[] = [];
						for (const extension of builtInExtensions) {
							result.push({ name: extension.name, path: path.join(this.extraDevSystemExtensionsRoot, extension.name) });
						}
						return Promise.resolve(result);
					}
				}));
			}
			const pendingUser = this.pendingInitialExtensions.then(() => ExtensionScanner.scanExtensions(new ExtensionScannerInput(product.version, product.commit, args.language, this.devMode, this.environmentService.extensionsPath, false, false, translations), this.logger));
			let pendingDev: Promise<IExtensionDescription[]>[] = [];
			if (args.extensionDevelopmentPath) {
				pendingDev = args.extensionDevelopmentPath.map(devPath => ExtensionScanner.scanOneOrMultipleExtensions(new ExtensionScannerInput(product.version, product.commit, args.language, this.devMode, URI.revive(devPath).fsPath, false, true, translations), this.logger));
			}
			const result: IExtensionDescription[] = [];
			const skipExtensions = new Set<string>(args.skipExtensions.map(ExtensionIdentifier.toKey));
			skipExtensions.add('vscode.github-authentication');
			for (const extensions of await Promise.all([...pendingDev, pendingUser, pendingSystem])) {
				for (let i = extensions.length - 1; i >= 0; i--) {
					const extension = extensions[i];
					const key = ExtensionIdentifier.toKey(extension.identifier);
					if (skipExtensions.has(key)) {
						continue;
					}
					skipExtensions.add(key);
					result.unshift(transformOutgoingURIs(extension, uriTranformer));
				}
			}
			return result;
		}
		this.logService.error('Unknown command: RemoteExtensionsEnvironment.' + command);
		throw new Error('Unknown command: RemoteExtensionsEnvironment.' + command);
	}
	listen(ctx: RemoteAgentConnectionContext, event: string, arg?: any): Event<any> {
		this.logService.error('Unknown event: RemoteExtensionsEnvironment.' + event);
		throw new Error('Unknown event: RemoteExtensionsEnvironment.' + event);
	}

	private async resolveTranslations(language: string): Promise<Translations> {
		await this.initLocalization;
		const langPacks = await this.localizationService['cache'].getLanguagePacks();
		return langPacks[language]?.translations || {};
	}
}
