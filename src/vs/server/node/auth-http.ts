/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Gitpod. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import * as http from 'http';
import { ILogService } from 'vs/platform/log/common/log';
import { parse } from 'querystring';
import { args } from 'vs/server/node/args';
import { authenticated, generateAndSetPassword, handlePasswordValidation } from 'vs/server/node/auth';
import { APP_ROOT, serveFile } from 'vs/server/node/server.main';

const LOGIN = path.join(APP_ROOT, 'out', 'vs', 'server', 'browser', 'workbench', 'login.html');

export async function handleVerification(req: http.IncomingMessage, res: http.ServerResponse | undefined, logService: ILogService): Promise<boolean> {
	if (args.password === undefined) {
		await generateAndSetPassword(logService);
	}
	const auth = await authenticated(args, req);
	if (!auth && res) {
		const password = (await collectRequestData(req)).password;
		if (password !== undefined) {
			const { valid, hashed } = await handlePasswordValidation({
				reqPassword: password,
				argsPassword: args.password,
			});

			if (valid) {
				res.writeHead(302, {
					'Set-Cookie': `key=${hashed}; HttpOnly`,
					'Location': '/'
				});
				res.end();
			} else {
				serveFile(logService, req, res, LOGIN);
			}
		} else {
			serveFile(logService, req, res, LOGIN);
		}
		return false;
	}
	return auth;
}

function collectRequestData(request: http.IncomingMessage): Promise<Record<string, string>> {
	return new Promise(resolve => {
		const FORM_URLENCODED = 'application/x-www-form-urlencoded';
		if (request.headers['content-type'] === FORM_URLENCODED) {
			let body = '';
			request.on('data', chunk => {
				body += chunk.toString();
			});
			request.on('end', () => {
				const item = parse(body) as Record<string, string>;
				resolve(item);
			});
		}
		else {
			resolve({});
		}
	});
}
