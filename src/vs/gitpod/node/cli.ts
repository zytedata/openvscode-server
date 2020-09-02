/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Gitpod. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import type * as http from 'http';
import { parseArgs } from 'vs/platform/environment/node/argv';
import { main, OPTIONS, sendCommand, ServerNativeParsedArgs } from 'vs/server/node/cli.main';

interface GitpodNativeParsedArgs extends ServerNativeParsedArgs {
	command?: boolean
}

Object.assign(OPTIONS, {
	command: {
		type: 'boolean',
	}
});

const devMode = !!process.env['VSCODE_DEV'];

let port = 3000;
if (!devMode && process.env.GITPOD_THEIA_PORT) {
	port = Number(process.env.GITPOD_THEIA_PORT);
}
const reqOptions: http.RequestOptions = {
	hostname: 'localhost',
	port,
	protocol: 'http:',
	path: '/cli',
	method: 'POST'
};

main<GitpodNativeParsedArgs>(process.argv, {
	parseArgs: (args, errorReporter) => parseArgs(args, OPTIONS, errorReporter),
	handleArgs: async args => {
		if (!args.command) {
			return false;
		}
		const command = args._.shift();
		assert(command, 'Arguments in `--command` mode should be in the format of `COMMAND ARG1 ARG2 ARGN`.');
		await sendCommand(reqOptions, {
			type: 'command',
			command,
			args: args._
		});
		return true;
	},
	createRequestOptions: () => reqOptions
});
