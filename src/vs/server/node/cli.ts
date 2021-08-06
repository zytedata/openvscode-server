/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Gitpod. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { OptionDescriptions, OPTIONS as ALL_OPTIONS, parseArgs } from 'vs/platform/environment/node/argv';
import { main, ServerNativeParsedArgs } from 'vs/server/node/cli.main';

const OPTIONS_KEYS: (keyof typeof ALL_OPTIONS)[] = [
	'help',

	'diff',
	'add',
	'goto',
	'new-window',
	'reuse-window',
	'folder-uri',
	'file-uri',
	'wait',

	'list-extensions',
	'show-versions',
	'category',
	'install-extension',
	'uninstall-extension',
	'force',

	'version',
	'status',
	'verbose'
];
export const OPTIONS: OptionDescriptions<ServerNativeParsedArgs> = {
	_: ALL_OPTIONS['_'],
	'open-external': {
		type: 'string[]'
	}
};
for (const key of OPTIONS_KEYS) {
	Object.assign(OPTIONS, { [key]: ALL_OPTIONS[key] });
}

main(process.argv, {
	parseArgs: (args, errorReporter) => parseArgs(args, OPTIONS, errorReporter),
	createRequestOptions: () => {
		const ipcHandlePath = process.env['VSCODE_IPC_HOOK_CLI'];

		if (!ipcHandlePath) {
			throw new Error('Missing VSCODE_IPC_HOOK_CLI');
		}
		return {
			socketPath: ipcHandlePath,
			method: 'POST'
		};
	}
});


