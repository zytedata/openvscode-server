/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IMainContext, MainContext } from 'vs/workbench/api/common/extHost.protocol';
import type * as vscode from 'vscode';

export class ExtHostMainUrl {

	readonly value: vscode.MainUrl;

	constructor(mainContext: IMainContext) {
		const proxy = mainContext.getProxy(MainContext.MainThreadMainUrl);
		this.value = Object.freeze({
			url() {
				return proxy.$url();
			},
			setFragment(fragment: string) {
				return proxy.$setFragment(fragment);
			}
		});
	}
}
