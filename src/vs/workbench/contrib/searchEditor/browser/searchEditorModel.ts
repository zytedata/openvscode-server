/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITextModel, ITextBufferFactory, DefaultEndOfLine, ITextSnapshot } from 'vs/editor/common/model';
import { SearchConfiguration, DEFAULT_SEARCH_CONFIG } from 'vs/workbench/contrib/searchEditor/browser/searchEditorInput';
import { createTextBuffer } from 'vs/editor/common/model/textModel';
import { IModelService } from 'vs/editor/common/services/modelService';
import { extractSearchQuery, serializeSearchConfiguration } from 'vs/workbench/contrib/searchEditor/browser/searchEditorSerialization';
import { IModeService } from 'vs/editor/common/services/modeService';
import { URI } from 'vs/base/common/uri';
import { Disposable } from 'vs/base/common/lifecycle';
import { stringToSnapshot } from 'vs/workbench/services/textfile/common/textfiles';
import { Event, Emitter } from 'vs/base/common/event';

type SearchEditorModelConfig =
	| { rawTextModel: string | ITextBufferFactory, resultsTextModel?: never, searchConfig?: never }
	| { resultsTextModel: ITextModel, searchConfig: Partial<SearchConfiguration>, rawTextModel?: never }
	;

export class SearchEditorModel extends Disposable {

	public resultsTextModel: ITextModel;
	public searchConfig!: SearchConfiguration;

	private readonly _onDispose = new Emitter<void>();
	readonly onDispose: Event<void> = this._onDispose.event;

	constructor(config: SearchEditorModelConfig, uri: URI,
		@IModelService private readonly modelService: IModelService,
		@IModeService private readonly modeService: IModeService,
	) {
		super();

		if (config.rawTextModel !== undefined) {
			const buffer = createTextBuffer(config.rawTextModel, DefaultEndOfLine.LF);

			const header = [];
			const body = [];
			let inHeader = true;

			for (const line of buffer.getLinesContent()) {
				if (inHeader) {
					if (line.startsWith('#')) {
						header.push(line);
					} else if (line === '') {
						inHeader = false;
					}
				} else {
					body.push(line);
				}
			}

			this.searchConfig = extractSearchQuery(header.join('\n'));
			this.resultsTextModel = this.modelService.createModel(
				body.join('\n'),
				this.modeService.create('search-result'),
				uri);

		} else {
			this.resultsTextModel = config.resultsTextModel;
			this.setConfig(config.searchConfig);
		}

		this._register(this.resultsTextModel);
	}

	setConfig(config: Partial<SearchConfiguration>) {
		this.searchConfig = { ...DEFAULT_SEARCH_CONFIG, ...config };
	}

	createSnapshot(): ITextSnapshot {
		return stringToSnapshot(serializeSearchConfiguration(this.searchConfig) + this.resultsTextModel.getValue());
	}

	isDisposed() {
		return this.resultsTextModel.isDisposed();
	}

	async load() {
		return this.resultsTextModel;
	}
}
