/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Gitpod. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import * as os from 'os';
import { URI } from 'vs/base/common/uri';
import { NativeParsedArgs } from 'vs/platform/environment/common/argv';
import { OptionDescriptions, OPTIONS, parseArgs } from 'vs/platform/environment/node/argv';
import product from 'vs/platform/product/common/product';

export interface ServerParsedArgs extends NativeParsedArgs {
	port?: string
	password?: string
}
const SERVER_OPTIONS: OptionDescriptions<Required<ServerParsedArgs>> = {
	...OPTIONS,
	port: { type: 'string' },
	password: { type: 'string' }
};

export const devMode = !!process.env['VSCODE_DEV'];
export const args = parseArgs(process.argv, SERVER_OPTIONS);
args['user-data-dir'] = URI.file(path.join(os.homedir(), product.dataFolderName)).fsPath;
