/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Gitpod. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import * as http from 'http';
import * as crypto from 'crypto';
import { args, ServerParsedArgs } from 'vs/server/node/args';
import { ILogService } from 'vs/platform/log/common/log';

export function sanitizeString(str: string): string {
	return typeof str === 'string' && str.trim().length > 0 ? str.trim() : '';
}

export function parseCookies(request: http.IncomingMessage): Record<string, string> {
	const cookies: Record<string, string> = {};
	const rc = request.headers.cookie;

	if (rc) {
		rc.split(';').forEach(cookie => {
			let parts = cookie.split('=');
			if (parts.length > 0) {
				const name = parts.shift()!.trim();
				let value = decodeURI(parts.join('='));
				cookies[name] = value;
			}
		});
	}

	return cookies;
}

export async function authenticated(args: ServerParsedArgs, req: http.IncomingMessage): Promise<boolean> {
	if (!args.password) {
		return true;
	}
	const cookies = parseCookies(req);
	return isHashMatch(args.password || '', sanitizeString(cookies.key));
};

interface PasswordValidation {
	valid: boolean
	hashed: string
}

interface HandlePasswordValidationArgs {
	reqPassword: string | undefined
	argsPassword: string | undefined
}

function safeCompare(a: string, b: string): boolean {
	return a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export async function generateAndSetPassword(logService: ILogService, length = 24): Promise<void> {
	if (args.password || !length) {
		return;
	}
	const password = await generatePassword(length);
	args.password = password;
	logService.info(`Automatically generated password\r\n        ${password}`);
}

export async function generatePassword(length = 24): Promise<string> {
	const buffer = Buffer.alloc(Math.ceil(length / 2));
	await new Promise(resolve => {
		crypto.randomFill(buffer, (_, buf) => resolve(buf));
	});
	return buffer.toString('hex').substring(0, length);
}

export function hash(str: string): string {
	return crypto.createHash('sha256').update(str).digest('hex');
}

export function isHashMatch(password: string, hashPassword: string): boolean {
	const hashed = hash(password);
	return safeCompare(hashed, hashPassword);
}

export async function handlePasswordValidation({ argsPassword: passwordFromArgs, reqPassword: passwordFromRequestBody }: HandlePasswordValidationArgs): Promise<PasswordValidation> {
	if (passwordFromRequestBody) {
		const valid = passwordFromArgs ? safeCompare(passwordFromRequestBody, passwordFromArgs) : false;
		const hashed = hash(passwordFromRequestBody);
		return {
			valid,
			hashed
		};
	}

	return {
		valid: false,
		hashed: ''
	}
}
