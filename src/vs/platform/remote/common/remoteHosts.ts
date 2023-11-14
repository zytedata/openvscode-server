/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Schemas } from 'vs/base/common/network';
import { URI } from 'vs/base/common/uri';

export function getUrlPathPrefix(): string {
	try {
		return `/o/${process.env.ORGANIZATION_ID}`;
	} catch (e) {
		// fallback for frontend calls
		const m = window.location.pathname.match('/o/[0-9]+');
		if (m) {
			return m[0];
		}
		console.error('can not detect organization ID');
		return '';
	}
}

export function getRemoteAuthority(uri: URI): string | undefined {
	return uri.scheme === Schemas.vscodeRemote ? uri.authority : undefined;
}

export function getRemoteName(authority: string): string;
export function getRemoteName(authority: undefined): undefined;
export function getRemoteName(authority: string | undefined): string | undefined;
export function getRemoteName(authority: string | undefined): string | undefined {
	if (!authority) {
		return undefined;
	}
	const pos = authority.indexOf('+');
	if (pos < 0) {
		// e.g. localhost:8000
		return authority;
	}
	return authority.substr(0, pos);
}

/**
 * The root path to use when accessing the remote server. The path contains the quality and commit of the current build.
 * @param product
 * @returns
 */
export function getRemoteServerRootPath(product: { quality?: string; commit?: string }): string {
	return `${getUrlPathPrefix()}/${product.quality ?? 'oss'}-${product.commit ?? 'dev'}`;
}
