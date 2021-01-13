/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Typefox. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';
import { IFileSystemProviderWithFileReadWriteCapability, IFileSystemProviderWithOpenReadWriteCloseCapability } from 'vs/platform/files/common/files';
import { ILogService } from 'vs/platform/log/common/log';
import { FileUserDataProvider } from 'vs/workbench/services/userData/common/fileUserDataProvider';

export class GitpodFileUserDataProvider extends FileUserDataProvider {

	constructor(
		private readonly fileSystemUserDataHome: URI,
		fileSystemProvider: IFileSystemProviderWithFileReadWriteCapability | IFileSystemProviderWithOpenReadWriteCloseCapability,
		private readonly userDataHome: URI,
		logService: ILogService,
	) {
		super(fileSystemUserDataHome.scheme, fileSystemProvider, userDataHome.scheme, logService);
	}

	protected toFileSystemResource(userDataResource: URI): URI {
		const relativePath = this.extUri.relativePath(this.userDataHome, userDataResource)!;
		return this.extUri.joinPath(this.fileSystemUserDataHome, relativePath);
	}

	protected toUserDataResource(fileSystemResource: URI): URI | undefined {
		if (this.extUri.isEqualOrParent(fileSystemResource, this.fileSystemUserDataHome)) {
			const relativePath = this.extUri.relativePath(this.fileSystemUserDataHome, fileSystemResource);
			return relativePath ? this.extUri.joinPath(this.userDataHome, relativePath) : this.userDataHome;
		}
		return undefined;
	}

}
