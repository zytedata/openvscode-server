/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EditorInput } from 'vs/workbench/common/editor';
import { IEditorModel } from 'vs/platform/editor/common/editor';

const typeId = 'workbench.editors.terminalEditorInput';

export class TerminalEditorInput extends EditorInput {

	getTypeId(): string {
		return typeId;
	}

	async resolve(): Promise<IEditorModel | null> {
		return null;
	}

	getName(): string | null {
		return 'Terminal';
	}
}
