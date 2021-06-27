/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Typefox. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import * as rpc from 'vscode-jsonrpc';

export interface ValidateExtensionsParam {
	extensions: {
		id: string
		version?: string
	}[]
	links: string[]
}

export interface ValidateExtensionsResult {
	extensions: string[]
	links: string[]
	missingMachined: string[]
}

export type validateExtensionsMethod = 'validateExtensions';
export type setActiveCliIpcHookMethod = 'setActiveCliIpcHook';
export interface ServerExtensionHostConnection {
	sendRequest(method: validateExtensionsMethod, param: ValidateExtensionsParam, token: rpc.CancellationToken): Promise<ValidateExtensionsResult>;
	onRequest(method: validateExtensionsMethod, handler: (param: ValidateExtensionsParam, token: rpc.CancellationToken) => Promise<ValidateExtensionsResult>): void
	sendNotification(method: setActiveCliIpcHookMethod, cliIpcHook: string): void;
	onNotification(method: setActiveCliIpcHookMethod, handler: (cliIpcHook: string) => void): void;
	listen(): void;
	dispose(): void;
}
