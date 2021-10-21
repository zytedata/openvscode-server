/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Gitpod. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

/// <reference path='../../../src/vs/vscode.d.ts'/>

import crypto from 'crypto';
import * as vscode from 'vscode';
const create = require('pkce').create;

import { GitpodClient, GitpodServer, GitpodServiceImpl } from '@gitpod/gitpod-protocol/lib/gitpod-service';
import { JsonRpcProxyFactory } from '@gitpod/gitpod-protocol/lib/messaging/proxy-factory';
import WebSocket = require('ws');
import ReconnectingWebSocket from 'reconnecting-websocket';
import { ConsoleLogger, listen as doListen } from 'vscode-ws-jsonrpc';

import GitpodAuthSession from './sessionhandler';
import fetch from 'node-fetch';
import { URL, URLSearchParams } from 'url';

export const authCompletePath = '/auth-complete';
const getBaseURL = () => vscode.workspace.getConfiguration('gitpod').get('authOrigin', 'https://gitpod.io');

type UsedGitpodFunction = ['getLoggedInUser', 'getGitpodTokenScopes'];
type Union<Tuple extends any[], Union = never> = Tuple[number] | Union;
export type GitpodConnection = Omit<GitpodServiceImpl<GitpodClient, GitpodServer>, 'server'> & {
	server: Pick<GitpodServer, Union<UsedGitpodFunction>>
};
const gitpodFunctions: UsedGitpodFunction = ['getLoggedInUser', 'getGitpodTokenScopes'];

export const gitpodScopes = new Set<string>([
	'function:accessCodeSyncStorage',
	'resource:default'
]);
for (const gitpodFunction of gitpodFunctions) {
	gitpodScopes.add('function:' + gitpodFunction);
}

export interface PromiseAdapter<T, U> {
	(
		value: T,
		resolve:
			(value: U | PromiseLike<U>) => void,
		reject:
			(reason: any) => void
	): any;
}

const passthrough = (value: any, resolve: (value?: any) => void) => resolve(value);

/**
 * Return a promise that resolves with the next emitted event, or with some future
 * event as decided by an adapter.
 *
 * If specified, the adapter is a function that will be called with
 * `(event, resolve, reject)`. It will be called once per event until it resolves or
 * rejects.
 *
 * The default adapter is the passthrough function `(value, resolve) => resolve(value)`.
 *
 * @param event the event
 * @param adapter controls the resolution of the returned promise
 * @returns a promise that resolves or rejects as specified by the adapter
 */
function promiseFromEvent<T, U>(
	event: vscode.Event<T>,
	adapter: PromiseAdapter<T, U> = passthrough): { promise: Promise<U>, cancel: vscode.EventEmitter<void> } {
	let subscription: vscode.Disposable;
	let cancel = new vscode.EventEmitter<void>();
	return {
		promise: new Promise<U>((resolve, reject) => {
			cancel.event(_ => reject());
			subscription = event((value: T) => {
				try {
					Promise.resolve(adapter(value, resolve, reject))
						.catch(reject);
				} catch (error) {
					reject(error);
				}
			});
		}).then(
			(result: U) => {
				subscription.dispose();
				return result;
			},
			error => {
				subscription.dispose();
				throw error;
			}
		),
		cancel
	};
}

/**
 * Gets all auth sessions that are stored by the extension
 * @param context the VS Code Extension context
 * @returns a list of auth sessions.
 */
export async function getAuthSessions(context: vscode.ExtensionContext): Promise<vscode.AuthenticationSession[]> {
	const existingSessionsJSON = await context.secrets.get('gitpod.authSessions') || '[]';
	const sessions: vscode.AuthenticationSession[] = JSON.parse(existingSessionsJSON);
	return sessions;
}

/**
 * Stores a provided array of authentication sessions to the secret store
 * @param sessions an array of auth sessions to store
 * @param context the VS Code Extension context
 */
export async function storeAuthSessions(sessions: vscode.AuthenticationSession[], context: vscode.ExtensionContext): Promise<void> {
	const parsedSessions = JSON.stringify(sessions);
	await context.secrets.store('gitpod.authSessions', parsedSessions);
}

/**
 * Prompts the user to reload VS Code (executes native `workbench.action.reloadWindow`)
 * @param msg - optionally, overwrite the message to be displayed
*/
function promptToReload(msg?: string): void {
	const action = 'Reload';

	vscode.window.showInformationMessage(msg || `Reload VS Code for the new Settings Sync configuration to take effect.`, action)
		.then(selectedAction => {
			if (selectedAction === action) {
				vscode.commands.executeCommand('workbench.action.reloadWindow');
			}
		});
}

const syncStoreURL = `${getBaseURL()}/code-sync`;
const newConfig = {
	url: syncStoreURL,
	stableUrl: syncStoreURL,
	insidersUrl: syncStoreURL,
	canSwitch: true,
	authenticationProviders: {
		gitpod: {
			scopes: ['function:accessCodeSyncStorage']
		}
	}
};

async function waitForAuthenticationSession(context: vscode.ExtensionContext): Promise<vscode.AuthenticationSession> {
	// Wait until a session is added to the context's secret store
	await promiseFromEvent(context.secrets.onDidChange, (changeEvent: vscode.SecretStorageChangeEvent, resolve): void => {
		if (changeEvent.key === 'gitpod.authSessions') {
			resolve(changeEvent.key);
		}
	}).promise;

	const currentSessions = await readSessions(context);
	if (!currentSessions.length) {
		throw new Error('Not found');
	}
	return currentSessions[currentSessions.length - 1];
}

export async function readSessions(context: vscode.ExtensionContext): Promise<vscode.AuthenticationSession[]> {
	let sessions = await getAuthSessions(context);
	sessions = sessions.filter(session => validateSession(session));
	await storeAuthSessions(sessions, context);
	return sessions;
}

export async function validateSession(session: vscode.AuthenticationSession): Promise<boolean> {
	try {
		const hash = crypto.createHash('sha256').update(session.accessToken, 'utf8').digest('hex');
		const tokenScopes = new Set(await withServerApi(session.accessToken, service => service.server.getGitpodTokenScopes(hash)));
		for (const scope of gitpodScopes) {
			if (!tokenScopes.has(scope)) {
				return false;
			}
		}
		return true;
	} catch (e) {
		if (e.message !== unauthorizedErr) {
			console.error('gitpod: invalid session:', e);
		}
		return false;
	}
}

/**
 * Updates the VS Code context to reflect whether the user added Gitpod as their Settings Sync provider.
 */
async function updateSyncContext() {
	const config = vscode.workspace.getConfiguration();
	const syncConfig = config.get('configurationSync.store');
	const adddedSyncProvider = syncConfig && JSON.stringify(syncConfig) === JSON.stringify(newConfig);
	await vscode.commands.executeCommand('setContext', 'gitpod.addedSyncProvider', adddedSyncProvider);
}

/**
 * Adds an authentication provider as a possible provider for code sync.
 * It adds some key configuration to the user settings, so that the user can choose the Gitpod provider when deciding what to use with setting sync.
 * @param enabled - indicates whether to add or remove the configuration
 */
export async function setSettingsSync(enabled?: boolean): Promise<void> {
	const config = vscode.workspace.getConfiguration();
	if (!enabled) {
		try {
			await config.update('configurationSync.store', undefined, true);
			updateSyncContext();
			promptToReload();
		} catch (e) {
			vscode.window.showErrorMessage(`Error setting up code sync config: ${e}`);
		}
		return;
	}

	try {
		const currentConfig = await config.get('configurationSync.store');
		if (JSON.stringify(currentConfig) !== JSON.stringify(newConfig)) {
			await config.update('configurationSync.store', newConfig, true);
			updateSyncContext();
			promptToReload();
		}
	} catch (e) {
		vscode.window.showErrorMessage(`Error setting up code sync config: ${e}`);
	}
}

class GitpodServerApi extends vscode.Disposable {

	readonly service: GitpodConnection;
	private readonly socket: ReconnectingWebSocket;
	private readonly onWillCloseEmitter = new vscode.EventEmitter<number | undefined>();
	readonly onWillClose = this.onWillCloseEmitter.event;

	constructor(accessToken: string) {
		super(() => {
			this.close();
			this.onWillCloseEmitter.dispose();
		});
		const factory = new JsonRpcProxyFactory<GitpodServer>();
		this.service = new GitpodServiceImpl<GitpodClient, GitpodServer>(factory.createProxy());

		let retry = 1;
		const maxRetries = 3;
		class GitpodServerWebSocket extends WebSocket {
			constructor(address: string, protocols?: string | string[]) {
				super(address, protocols, {
					headers: {
						'Origin': new URL(getBaseURL()).origin,
						'Authorization': `Bearer ${accessToken}`
					}
				});
				this.on('unexpected-response', (_, resp) => {
					this.terminate();

					// if mal-formed handshake request (unauthorized, forbidden) or client actions (redirect) are required then fail immediately
					// otherwise try several times and fail, maybe temporarily unavailable, like server restart
					if (retry++ >= maxRetries || (typeof resp.statusCode === 'number' && 300 <= resp.statusCode && resp.statusCode < 500)) {
						socket.close(resp.statusCode);
					}
				});
			}
		}
		const socket = new ReconnectingWebSocket(`${getBaseURL().replace('https', 'wss')}/api/v1`, undefined, {
			maxReconnectionDelay: 10000,
			minReconnectionDelay: 1000,
			reconnectionDelayGrowFactor: 1.5,
			connectionTimeout: 10000,
			maxRetries: Infinity,
			debug: false,
			startClosed: false,
			WebSocket: GitpodServerWebSocket
		});
		socket.onerror = e => {
			console.error('gitpod: server api: failed to open socket:', e);
		};

		doListen({
			webSocket: socket,
			logger: new ConsoleLogger(),
			onConnection: connection => factory.listen(connection),
		});
		this.socket = socket;
	}

	private close(statusCode?: number): void {
		this.onWillCloseEmitter.fire(statusCode);
		try {
			this.socket.close();
		} catch (e) {
			console.error('gitpod: server api: failed to close socket:', e);
		}
	}

}

const unauthorizedErr = 'unauthorized';
function withServerApi<T>(accessToken: string, cb: (service: GitpodConnection) => Promise<T>): Promise<T> {
	const api = new GitpodServerApi(accessToken);
	return Promise.race([
		cb(api.service),
		new Promise<T>((_, reject) => api.onWillClose(statusCode => {
			if (statusCode === 401) {
				reject(new Error(unauthorizedErr));
			} else {
				reject(new Error('closed'));
			}
		}))
	]).finally(() => api.dispose());
}

interface ExchangeTokenResponse {
	token_type: 'Bearer',
	expires_in: number
	access_token: string,
	refresh_token: string,
	scope: string
}

/**
 * Returns a promise that resolves with the current authentication session of the provided access token. This includes the token itself, the scopes, the user's ID and name.
 * @param code the access token used to authenticate the Gitpod WS connection
 * @param scopes the authentication session must have
 * @returns a promise that resolves with the authentication session
 */
export async function resolveAuthenticationSession(scopes: readonly string[], code: string, context: vscode.ExtensionContext): Promise<vscode.AuthenticationSession | null> {
	const callbackUri = (await vscode.env.asExternalUri(vscode.Uri.parse(`${vscode.env.uriScheme}://gitpod.gitpod-desktop/complete-gitpod-auth`))).toString(true);
	try {
		const exchangeTokenResponse = await fetch(`${getBaseURL()}/api/oauth/token`, {
			method: 'POST',
			body: new URLSearchParams({
				code,
				grant_type: 'authorization_code',
				client_id: `${vscode.env.uriScheme}-gitpod`,
				redirect_uri: callbackUri,
				code_verifier: await context.secrets.get('gitpod.code_verifier')
			})
		});

		if (!exchangeTokenResponse.ok) {
			vscode.window.showErrorMessage(`Couldn't connect (token exchange): ${exchangeTokenResponse.statusText}, ${await exchangeTokenResponse.text()}`);
			return null;
		}

		const exchangeTokenData: ExchangeTokenResponse = await exchangeTokenResponse.json();
		const jwtToken = exchangeTokenData.access_token;
		const accessToken = JSON.parse(Buffer.from(jwtToken.split('.')[1], 'base64').toString())['jti'];

		const user = await withServerApi(accessToken, service => service.server.getLoggedInUser());
		return {
			id: 'gitpod.user',
			account: {
				label: user.name!,
				id: user.id
			},
			scopes,
			accessToken
		};
	} catch (e) {
		vscode.window.showErrorMessage(`Couldn't connect: ${e}`);
		return null;
	}
}

/**
 * Creates a URL to be opened for the whole OAuth2 flow to kick-off
 * @returns a `URL` string containing the whole auth URL
 */
async function createOauth2URL(context: vscode.ExtensionContext, options: { authorizationURI: string, clientID: string, redirectURI: vscode.Uri, scopes: string[] }): Promise<string> {
	const { authorizationURI, clientID, redirectURI, scopes } = options;
	const { codeChallenge, codeVerifier }: { codeChallenge: string, codeVerifier: string } = create();

	let query = '';
	function set(field: string, value: string): void {
		if (query) {
			query += '&';
		}
		query += `${field}=${value}`;
	}

	set('client_id', clientID);
	set('redirect_uri', (redirectURI.toString(true)));
	set('response_type', 'code');
	set('scope', scopes.join(' '));
	set('code_challenge', codeChallenge);
	set('code_challenge_method', 'S256');

	await context.secrets.store('gitpod.code_verifier', codeVerifier);
	return `${authorizationURI}?${query}`;
}

/**
 * Asks the user to setup Settings Sync
 * @param context the extension context
 */
async function askToEnable(context: vscode.ExtensionContext): Promise<void> {
	if (!(await context.secrets.get('gitpod.syncPopupShown'))) {
		vscode.window.showInformationMessage('Would you like to use Settings Sync with Gitpod?', 'Yes', 'No')
			.then(async selectedAction => {
				await context.globalState.update('gitpod.syncPopupShown', 'true');
				if (selectedAction === 'Yes') {
					setSettingsSync(true);
				}
			});
	}
}

/**
 * Creates a user session for Settings Sync
 * @returns a promise which resolves to an `AuthenticationSession`
 */
export async function createSession(scopes: readonly string[], context: vscode.ExtensionContext): Promise<vscode.AuthenticationSession> {
	if (scopes.some(scope => !gitpodScopes.has(scope))) {
		throw new Error('Auth failed');
	}

	const callbackUri = await vscode.env.asExternalUri(vscode.Uri.parse(`${vscode.env.uriScheme}://gitpod.gitpod-desktop/complete-gitpod-auth`));

	const gitpodAuth = await createOauth2URL(context, {
		clientID: `${vscode.env.uriScheme}-gitpod`,
		authorizationURI: `${getBaseURL()}/api/oauth/authorize`,
		redirectURI: callbackUri,
		scopes: [...gitpodScopes],
	});

	const opened = await vscode.env.openExternal(gitpodAuth as any);
	if (!opened) {
		const selected = await vscode.window.showErrorMessage(`Couldn't open ${gitpodAuth} automatically, please copy and paste it to your browser manually.`, 'Copy', 'Cancel');
		if (selected === 'Copy') {
			vscode.env.clipboard.writeText(gitpodAuth);
		}
	}

	return Promise.race([
		waitForAuthenticationSession(context),
		new Promise<vscode.AuthenticationSession>((_, reject) => setTimeout(() => reject(new Error('Login timed out.')), 1000 * 60 * 5))
	]);
}

/**
 * Adds a authentication provider to the provided extension context
 * @param context the extension context to act upon and the context to which push the authentication service
 * @param logger a function used for logging outputs
 */
export function registerAuth(context: vscode.ExtensionContext, logger: (value: string) => void): void {

	const removeCmd = vscode.commands.registerCommand('gitpod.auth.remove', () => {
		setSettingsSync(false);
	});
	context.subscriptions.push(removeCmd);

	const addCmd = vscode.commands.registerCommand('gitpod.auth.add', () => {
		setSettingsSync(true);
	});
	context.subscriptions.push(addCmd);

	logger('Registering authentication provider...');
	context.subscriptions.push(new GitpodAuthSession(context));
	logger('Pushed auth');
	updateSyncContext();
	askToEnable(context);
}
