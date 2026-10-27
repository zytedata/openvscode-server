/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IMainUrlService } from '../../../../platform/mainUrl/common/mainUrlService.js';
import { BrowserMainUrlService as BaseBrowserMainUrlService } from '../../../../platform/mainUrl/browser/mainUrlService.js';

export class BrowserMainUrlService extends BaseBrowserMainUrlService { }

registerSingleton(IMainUrlService, BrowserMainUrlService, InstantiationType.Delayed);
