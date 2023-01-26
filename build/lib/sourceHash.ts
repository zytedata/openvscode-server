/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import glob = require('glob');
import crypto = require('crypto');
import * as fs from 'fs';

/**
 * Gets a hash of the source code of VS Code itself, excluding all Gitpod built-in extensions
 */
async function getHashOfSourceCode() {
    const files = glob.sync('**/*', { ignore: [...fs.readFileSync('.gitignore', 'utf-8').split('\n'), 'extensions/gitpod-*/**'] });

	const hash = crypto.createHash('sha1');
	files.forEach(file => {
		if (fs.lstatSync(file).isFile()) {
			hash.update(Buffer.from(fs.readFileSync(file)));
		}
	});

	console.log(hash.digest('hex'));
}


getHashOfSourceCode();
