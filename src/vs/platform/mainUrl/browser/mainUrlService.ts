/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { IMainUrlService } from 'vs/platform/mainUrl/common/mainUrlService';

export class BrowserMainUrlService extends Disposable implements IMainUrlService {

	declare readonly _serviceBrand: undefined;

	async url() {
		return Promise.resolve(document.location.href);
	}

	async setFragment(fragment: string) {
		let result = false;
		if (history.pushState) {
			history.pushState(null, '', `#${fragment}`);
			result = true;
		}
		return Promise.resolve(result);
	}
}
