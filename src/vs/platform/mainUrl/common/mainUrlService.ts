/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../instantiation/common/instantiation.js';

export const IMainUrlService = createDecorator<IMainUrlService>('mainUrlService');

export interface IMainUrlService {

	readonly _serviceBrand: undefined;

	/**
	 * Get the current main URL.
	 */
	url(): Promise<string>;

	/**
	 * Set fragment
	 */
	setFragment(fragment: string): Promise<boolean>;
}
