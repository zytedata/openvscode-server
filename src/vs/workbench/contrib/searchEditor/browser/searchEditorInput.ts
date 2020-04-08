/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Delayer } from 'vs/base/common/async';
import { Emitter, Event } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { basename } from 'vs/base/common/path';
import { URI } from 'vs/base/common/uri';
import 'vs/css!./media/searchEditor';
import { Range } from 'vs/editor/common/core/range';
import { ITextModel, TrackedRangeStickiness } from 'vs/editor/common/model';
import { IModelService } from 'vs/editor/common/services/modelService';
import { IModeService } from 'vs/editor/common/services/modeService';
import { localize } from 'vs/nls';
import { IFileService } from 'vs/platform/files/common/files';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { ILabelService } from 'vs/platform/label/common/label';
import { GroupIdentifier, IMoveResult, ITextEditorModel } from 'vs/workbench/common/editor';
import { BaseFileEditorInput } from 'vs/workbench/contrib/files/common/editors/fileEditorInput';
import { SearchEditorBodyScheme, SearchEditorFindMatchClass, SearchEditorScheme } from 'vs/workbench/contrib/searchEditor/browser/constants';
import { extractSearchQuery, serializeSearchConfiguration } from 'vs/workbench/contrib/searchEditor/browser/searchEditorSerialization';
import { IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IFilesConfigurationService } from 'vs/workbench/services/filesConfiguration/common/filesConfigurationService';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import { BaseUntitledTextEditorInput } from 'vs/workbench/services/untitled/common/untitledTextEditorInput';
import { IUntitledTextEditorModel } from 'vs/workbench/services/untitled/common/untitledTextEditorModel';


export type SearchConfiguration = {
	query: string,
	includes: string,
	excludes: string
	contextLines: number,
	wholeWord: boolean,
	caseSensitive: boolean,
	regexp: boolean,
	useIgnores: boolean,
	showIncludesExcludes: boolean,
};

const SEARCH_EDITOR_EXT = '.code-search';

class SearchEditorModel extends Disposable {
	private contentsModel!: ITextModel;
	private config!: SearchConfiguration;

	private updateDiskModelDelayer: Delayer<void>;
	private oldDecorationsIDs: string[] = [];

	private readonly _onDidChangeConfig = new Emitter<SearchConfiguration>();
	readonly onDidChangeConfig: Event<SearchConfiguration> = this._onDidChangeConfig.event;

	private splitPromise: Promise<{ contentsModel: ITextModel, config: SearchConfiguration }> | undefined;

	constructor(
		private input: SearchEditorInput,
		@IModeService private readonly _modeService: IModeService,
		@IModelService private readonly _modelService: IModelService,
	) { super(); this.updateDiskModelDelayer = this._register(new Delayer(500)); }

	private async triggerUpdateDiskModel(immediate = false) {
		this.updateDiskModelDelayer.trigger(() => this.updateDiskModel(), immediate ? 0 : undefined);
	}

	private async updateDiskModel() {
		if (!this.contentsModel || !this.config) { throw Error('Calling updateDiskModel unexpectedly'); }

		const resolvedDiskModel = (await this.input.resolve() as ITextEditorModel).textEditorModel;
		resolvedDiskModel.setValue(serializeSearchConfiguration(this.config) + '\n' + this.contentsModel.getValue());
	}

	private async splitModel(): Promise<{ contentsModel: ITextModel, config: SearchConfiguration }> {
		if (this.splitPromise) { return this.splitPromise; }
		this.splitPromise = new Promise(async resolve => {
			const resolvedDiskModel = (await this.input.resolve() as ITextEditorModel).textEditorModel;
			const lines = resolvedDiskModel.getLinesContent();

			const headerlines = [];
			const bodylines = [];

			let inHeader = true;
			for (const line of lines) {
				if (inHeader) {
					headerlines.push(line);
					if (line === '') {
						inHeader = false;
					}
				} else {
					bodylines.push(line);
				}
			}

			const contentsModelURI = this.input.resource.with({ scheme: SearchEditorBodyScheme });
			const contentsModel = this._modelService.getModel(contentsModelURI) ?? this._modelService.createModel('', this._modeService.create('search-result'), contentsModelURI);
			this._register(contentsModel);

			contentsModel.setValue(bodylines.join('\n'));
			this._register(contentsModel.onDidChangeContent(() => { this.triggerUpdateDiskModel(); this.input.setDirty(true); }));

			this.contentsModel = contentsModel;
			this.config = extractSearchQuery(headerlines.join('\n'));
			console.log({ contentsModel, config: this.config });

			resolve({ contentsModel, config: this.config });
		});
		return this.splitPromise;
	}

	async getResultTextModel(): Promise<ITextModel> {
		if (this.contentsModel) { return this.contentsModel; }
		return (await this.splitModel()).contentsModel;
	}

	async setConfig(config: SearchConfiguration) {
		this.config = config;
		await this.triggerUpdateDiskModel(true);
		this._onDidChangeConfig.fire(config);
	}

	async getConfig(): Promise<SearchConfiguration> {
		if (this.config) { return this.config; }
		return (await this.splitModel()).config;
	}

	getMatchRanges(): Range[] {
		return (this.contentsModel?.getAllDecorations() ?? [])
			.filter(decoration => decoration.options.className === SearchEditorFindMatchClass)
			.filter(({ range }) => !(range.startColumn === 1 && range.endColumn === 1))
			.map(({ range }) => range);
	}

	getName(): string | undefined {
		const maxLength = 12;
		const trimToMax = (label: string) => (label.length < maxLength ? label : `${label.slice(0, maxLength - 3)}...`);

		if (this.config) {
			return localize('searchTitle.withQuery', "Search: {0}", trimToMax(this.config.query));
		}
		return;
	}

	async setMatchRanges(ranges: Range[]) {
		await this.splitModel();

		this.oldDecorationsIDs = this.contentsModel
			.deltaDecorations(
				this.oldDecorationsIDs,
				ranges.map(range => ({ range, options: { className: SearchEditorFindMatchClass, stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges } })));
	}
}

export class SavedSearchEditorInput extends BaseFileEditorInput {
	static readonly ID: string = 'workbench.editorinputs.savedSearchEditorInput';

	private searchEditorModel: SearchEditorModel | undefined;

	getTypeId(): string {
		return SavedSearchEditorInput.ID;
	}

	getName(): string {
		return localize('searchTitle.withQuery', "Search: {0}", basename(this.resource.path, SEARCH_EDITOR_EXT));
	}

	move(group: GroupIdentifier, target: URI): IMoveResult {
		return {
			editor: this.instantiationService.createInstance(SavedSearchEditorInput, target, undefined, undefined)
		};
	}

	matches(otherInput: unknown): boolean {
		if (super.matches(otherInput) === true) {
			return true;
		}

		if (otherInput) {
			return otherInput instanceof SavedSearchEditorInput && otherInput.resource.toString() === this.resource.toString();
		}

		return false;
	}

	getModel(): SearchEditorModel {
		if (this.searchEditorModel) { return this.searchEditorModel; }
		this.searchEditorModel = this._register(this.instantiationService.createInstance(SearchEditorModel, this));
		return this.searchEditorModel;
	}

	setDirty(dirty: boolean) {
		console.error('setDirty not implemented');
	}
}

export class UntitledSearchEditorInput extends BaseUntitledTextEditorInput {
	static readonly ID: string = 'workbench.editorinputs.untitledSearchEditorInput';

	private searchEditorModel: SearchEditorModel | undefined;
	private dirty = false;

	constructor(
		public readonly model: IUntitledTextEditorModel,
		@ITextFileService textFileService: ITextFileService,
		@ILabelService labelService: ILabelService,
		@IEditorService editorService: IEditorService,
		@IEditorGroupsService editorGroupService: IEditorGroupsService,
		@IFileService fileService: IFileService,
		@IFilesConfigurationService filesConfigurationService: IFilesConfigurationService,
		@IInstantiationService private instantiationService: IInstantiationService
	) {
		super(model, textFileService, labelService, editorService, editorGroupService, fileService, filesConfigurationService);
	}

	getTypeId(): string {
		return UntitledSearchEditorInput.ID;
	}

	getName(): string {
		return this.searchEditorModel?.getName() ?? localize('searchTitle', "Search");
	}

	matches(otherInput: unknown): boolean {
		if (super.matches(otherInput) === true) {
			return true;
		}

		if (otherInput) {
			return otherInput instanceof UntitledSearchEditorInput && otherInput.resource.toString() === this.resource.toString();
		}

		return false;
	}

	getModel(): SearchEditorModel {
		if (this.searchEditorModel) { return this.searchEditorModel; }
		this.searchEditorModel = this._register(this.instantiationService.createInstance(SearchEditorModel, this));
		return this.searchEditorModel;
	}

	isDirty() {
		return this.dirty;
	}

	setDirty(dirty: boolean) {
		this.dirty = dirty;
		this._onDidChangeDirty.fire();
	}
}

export type SearchEditorInput = UntitledSearchEditorInput | SavedSearchEditorInput;

export function isSearchEditorInput(obj: any): obj is SearchEditorInput {
	const id = obj?.getTypeId();
	return id === UntitledSearchEditorInput.ID || id === SavedSearchEditorInput.ID;
}

const inputs = new Map<string, SearchEditorInput>();
export const getOrMakeSearchEditorInput = (
	accessor: ServicesAccessor,
	existingData:
		{ uri: URI, config?: Partial<SearchConfiguration>, text?: never } |
		{ text: string, uri?: never, config?: never } |
		{ config: Partial<SearchConfiguration>, text?: never, uri?: never }
): SearchEditorInput => {

	let uri = existingData.uri ?? URI.from({ scheme: SearchEditorScheme, fragment: `${Math.random()}` });
	if (uri.scheme === 'untitled') { uri = uri.with({ scheme: SearchEditorScheme }); }

	const existing = inputs.get(uri.toString());
	if (existing) { return existing; }

	const instantiationService = accessor.get(IInstantiationService);

	let input: SearchEditorInput;
	if (uri.scheme === SearchEditorScheme) {
		// Untitled Search Editor
		if (!existingData.text && !existingData.config) { throw Error('Internal Error: no initial conntents for search editor'); }
		const contents = existingData.text ?? serializeSearchConfiguration(existingData.config!);
		const untiteldModel = accessor.get(ITextFileService).untitled.create({ associatedResource: uri, initialValue: contents, mode: 'search-result' });
		input = instantiationService.createInstance(UntitledSearchEditorInput, untiteldModel);
	} else {
		// Saved Search Editor
		input = instantiationService.createInstance(SavedSearchEditorInput, uri, undefined, 'search-result');
	}

	inputs.set(uri.toString(), input);
	input.onDispose(() => inputs.delete(uri.toString()));

	return input;
};
