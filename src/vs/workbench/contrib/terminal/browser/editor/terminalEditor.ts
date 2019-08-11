/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BaseEditor } from 'vs/workbench/browser/parts/editor/baseEditor';
import { Dimension } from 'vs/base/browser/dom';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { ITerminalService, ITerminalInstance } from 'vs/workbench/contrib/terminal/common/terminal';
import { IEditorGroup } from 'vs/workbench/services/editor/common/editorGroupsService';

export class TerminalEditor extends BaseEditor {

	static readonly ID: string = 'workbench.editor.terminal';

	private _instance: ITerminalInstance | undefined;
	private _parentElement: HTMLElement | undefined;
	private _isAttached: boolean = false;

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@ITerminalService private readonly _terminalService: ITerminalService
	) {
		super(TerminalEditor.ID, telemetryService, themeService, storageService);
	}

	protected createEditor(parent: HTMLElement): void {
		this._parentElement = parent;
		// this._container = document.createElement('div');
		// parent.appendChild(this._container);'
		this._instance = this._terminalService.createInstance(undefined, {});
		console.log('createEditor', parent, this._instance);
	}

	layout(dimension: Dimension): void {
		console.log('layout', dimension);
		if (this._instance) {
			this._instance.layout(dimension);
		}
	}

	setVisible(visible: boolean, group?: IEditorGroup): void {
		super.setVisible(visible, group);

		if (!this._instance) {
			return;
		}

		if (!this._isAttached) {
			this._instance.attachToElement(this._parentElement!);
			this._isAttached = true;
		}
		this._instance.setVisible(visible);
	}
}
