/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IMainUrlService } from 'vs/platform/mainUrl/common/mainUrlService';
import { BrowserMainUrlService as BaseBrowserMainUrlService } from 'vs/platform/mainUrl/browser/mainUrlService';

export class BrowserMainUrlService extends BaseBrowserMainUrlService { }

registerSingleton(IMainUrlService, BrowserMainUrlService, true);
