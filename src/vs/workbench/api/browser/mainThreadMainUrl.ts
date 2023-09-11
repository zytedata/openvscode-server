/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { extHostNamedCustomer } from 'vs/workbench/services/extensions/common/extHostCustomers';
import { MainContext, MainThreadMainUrlShape } from '../common/extHost.protocol';
import { IMainUrlService } from 'vs/platform/mainUrl/common/mainUrlService';
import 'vs/workbench/services/mainUrl/browser/mainUrlService';

@extHostNamedCustomer(MainContext.MainThreadMainUrl)
export class MainThreadMainUrl implements MainThreadMainUrlShape {

	constructor(
		_context: any,
		@IMainUrlService private readonly _mainUrlService: IMainUrlService,
	) { }

	dispose(): void {
		// nothing
	}

	async $url() {
		return this._mainUrlService.url();
	}

	async $setFragment(fragment: string) {
		return this._mainUrlService.setFragment(fragment);
	}
}
