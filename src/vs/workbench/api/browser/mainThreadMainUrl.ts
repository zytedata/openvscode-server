/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { extHostNamedCustomer } from '../../services/extensions/common/extHostCustomers.js';
import { MainContext, MainThreadMainUrlShape } from '../common/extHost.protocol.js';
import { IMainUrlService } from '../../../platform/mainUrl/common/mainUrlService.js';
import '../../services/mainUrl/browser/mainUrlService.js';

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
