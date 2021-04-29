/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator, optional } from 'vs/platform/instantiation/common/instantiation';
import { IFileService } from 'vs/platform/files/common/files';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { isUUID, generateUuid } from 'vs/base/common/uuid';
import { VSBuffer } from 'vs/base/common/buffer';
import { isWeb, Platform, PlatformToString } from 'vs/base/common/platform';

export const ICurrentMachineService = createDecorator<ICurrentMachineService>('currentMachineService');

export interface ICurrentMachineService {

	readonly _serviceBrand: undefined;

	getId(): Promise<string>;
	getName(): string;
}

export class CurrentMachineService implements ICurrentMachineService {

	_serviceBrand: any;

	constructor(
		@IEnvironmentService private readonly environmentService: IEnvironmentService,
		@IFileService private readonly fileService: IFileService,
		@optional(IStorageService) private readonly storageService: IStorageService | undefined,
	) { }

	async getId(): Promise<string> {
		let uuid: string | null = this.storageService ? this.storageService.get('storage.serviceMachineId', StorageScope.GLOBAL) || null : null;
		if (uuid) {
			return uuid;
		}
		try {
			const contents = await this.fileService.readFile(this.environmentService.serviceMachineIdResource);
			const value = contents.value.toString();
			uuid = isUUID(value) ? value : null;
		} catch (e) {
			uuid = null;
		}

		if (!uuid) {
			uuid = generateUuid();
			try {
				await this.fileService.writeFile(this.environmentService.serviceMachineIdResource, VSBuffer.fromString(uuid));
			} catch (error) {
				//noop
			}
		}
		if (this.storageService) {
			this.storageService.store('storage.serviceMachineId', uuid, StorageScope.GLOBAL, StorageTarget.MACHINE);
		}
		return uuid;
	}

	getName(): string {
		// const namePrefix = this.workbenchEnvironmentService.options?.settingsSyncOptions?.currentMachineProvider?.name ||
		return `${this.productService.nameLong} (${PlatformToString(isWeb ? Platform.Web : platform)})`;

	}

}
