/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from 'vs/base/browser/dom';
import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { IThemeService, registerThemingParticipant, IColorTheme, ICssStyleCollector } from 'vs/platform/theme/common/themeService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ISettingsEditorViewState, SettingsTreeElement, SettingsTreeGroupElement, SettingsTreeSettingElement } from 'vs/workbench/contrib/preferences/browser/settingsTreeModels';
import { ITreeRenderer } from 'vs/base/browser/ui/tree/tree';
import { isDefined } from 'vs/base/common/types';
import { SettingsTreeDelegate, ISettingItemTemplate, SettingsTreeFilter } from 'vs/workbench/contrib/preferences/browser/settingsTree';
import { focusBorder, foreground, errorForeground, inputValidationErrorBackground, inputValidationErrorForeground, inputValidationErrorBorder, scrollbarSliderHoverBackground, scrollbarSliderActiveBackground, scrollbarSliderBackground, editorBackground } from 'vs/platform/theme/common/colorRegistry';
import { RGBA, Color } from 'vs/base/common/color';
import { settingsHeaderForeground } from 'vs/workbench/contrib/preferences/browser/settingsWidgets';
import 'vs/css!./media/settingsListScrollbar';
import { localize } from 'vs/nls';
import { Button } from 'vs/base/browser/ui/button/button';

const $ = DOM.$;

interface ISettingsListView {
	group: SettingsTreeGroupElement;
	settings: SettingsTreeSettingElement[];
}

interface ISettingsListCacheItem {
	container: HTMLElement;
	template: ISettingItemTemplate;
}

class SettingsListModel {
	readonly PAGE_SIZE = 20;

	private settings: SettingsTreeSettingElement[] = [];
	private page = 1;

	get visibleSettings(): SettingsTreeSettingElement[] {
		return this.settings.slice(0, this.page * this.PAGE_SIZE);
	}

	get newSettings(): SettingsTreeSettingElement[] {
		return this.settings.slice(
			(this.page - 1) * this.PAGE_SIZE,
			this.page * this.PAGE_SIZE,
		);
	}

	get hasMoreSettings(): boolean {
		return this.settings.length > this.page * this.PAGE_SIZE;
	}

	loadMoreSettings(): void {
		this.page++;
	}

	setSettings(settings: SettingsTreeSettingElement[], shouldResetPage: boolean): void {
		if (shouldResetPage) {
			this.page = 1;
		}

		this.settings = settings;
	}
}

export class SettingsList extends Disposable {
	private searchFilter: (element: SettingsTreeElement) => boolean;
	private getTemplateId = new SettingsTreeDelegate().getTemplateId;
	// private paginator = new SettingsListPaginator(this.renderPage.bind(this));
	private paginator = new SettingsListModel();
	private templateToRenderer = new Map<string, ITreeRenderer<SettingsTreeElement, never, ISettingItemTemplate>>();
	private freePool = new Map<string, ISettingsListCacheItem[]>();
	private usedPool = new Map<string, ISettingsListCacheItem[]>();
	private pageDisposables = new DisposableStore();
	private currentView?: ISettingsListView;
	private pageBody: HTMLElement;
	private loadMoreElement: HTMLElement;

	dispose() {
		for (const items of this.usedPool.values()) {
			items.forEach(({ template }) => template.toDispose.dispose());
		}

		for (const items of this.freePool.values()) {
			items.forEach(({ template }) => template.toDispose.dispose());
		}

		this.usedPool.clear();
		this.freePool.clear();

		this.pageDisposables.dispose();

		super.dispose();
	}

	constructor(
		private container: HTMLElement,
		viewState: ISettingsEditorViewState,
		renderers: ITreeRenderer<SettingsTreeElement, never, any>[],
		@IThemeService themeService: IThemeService,
		@IConfigurationService configurationService: IConfigurationService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();

		container.setAttribute('tabindex', '-1');
		container.setAttribute('role', 'form');
		container.setAttribute('aria-label', localize('settings', "Settings"));
		container.classList.add('settings-editor-tree');

		this.pageBody = DOM.append(container, $('div'));
		this.loadMoreElement = DOM.append(container, $('.settings-paginator'));

		renderers.forEach(renderer => this.templateToRenderer.set(renderer.templateId, renderer));

		this.searchFilter = element => instantiationService.createInstance(SettingsTreeFilter, viewState).filter(element, null as any);

		this._register(registerThemingParticipant((theme: IColorTheme, collector: ICssStyleCollector) => {
			const activeBorderColor = theme.getColor(focusBorder);
			if (activeBorderColor) {
				// TODO@rob - why isn't this applied when added to the stylesheet from tocTree.ts? Seems like a chromium glitch.
				collector.addRule(`.settings-editor > .settings-body > .settings-toc-container .monaco-list:focus .monaco-list-row.focused {outline: solid 1px ${activeBorderColor}; outline-offset: -1px;  }`);
			}

			const foregroundColor = theme.getColor(foreground);
			if (foregroundColor) {
				// Links appear inside other elements in markdown. CSS opacity acts like a mask. So we have to dynamically compute the description color to avoid
				// applying an opacity to the link color.
				const fgWithOpacity = new Color(new RGBA(foregroundColor.rgba.r, foregroundColor.rgba.g, foregroundColor.rgba.b, 0.9));
				collector.addRule(`.settings-editor > .settings-body > .settings-tree-container .setting-item-contents .setting-item-description { color: ${fgWithOpacity}; }`);

				collector.addRule(`.settings-editor > .settings-body .settings-toc-container .monaco-list-row:not(.selected) { color: ${fgWithOpacity}; }`);
			}

			const editorBackgroundColor = theme.getColor(editorBackground);
			if (editorBackgroundColor) {
				// -webkit-background-clip makes the heading clip the background color
				collector.addRule(`.settings-editor > .settings-body > .settings-tree-container > * { background-color: ${editorBackgroundColor}; }`);
			}

			const errorColor = theme.getColor(errorForeground);
			if (errorColor) {
				collector.addRule(`.settings-editor > .settings-body > .settings-tree-container .setting-item-contents .setting-item-deprecation-message { color: ${errorColor}; }`);
			}

			const invalidInputBackground = theme.getColor(inputValidationErrorBackground);
			if (invalidInputBackground) {
				collector.addRule(`.settings-editor > .settings-body > .settings-tree-container .setting-item-contents .setting-item-validation-message { background-color: ${invalidInputBackground}; }`);
			}

			const invalidInputForeground = theme.getColor(inputValidationErrorForeground);
			if (invalidInputForeground) {
				collector.addRule(`.settings-editor > .settings-body > .settings-tree-container .setting-item-contents .setting-item-validation-message { color: ${invalidInputForeground}; }`);
			}

			const invalidInputBorder = theme.getColor(inputValidationErrorBorder);
			if (invalidInputBorder) {
				collector.addRule(`.settings-editor > .settings-body > .settings-tree-container .setting-item-contents .setting-item-validation-message { border-style:solid; border-width: 1px; border-color: ${invalidInputBorder}; }`);
				collector.addRule(`.settings-editor > .settings-body > .settings-tree-container .setting-item.invalid-input .setting-item-control .monaco-inputbox.idle { outline-width: 0; border-style:solid; border-width: 1px; border-color: ${invalidInputBorder}; }`);
			}

			const headerForegroundColor = theme.getColor(settingsHeaderForeground);
			if (headerForegroundColor) {
				collector.addRule(`.settings-editor > .settings-body > .settings-tree-container .settings-group-title-label { color: ${headerForegroundColor}; }`);
				collector.addRule(`.settings-editor > .settings-body > .settings-tree-container .setting-item-label { color: ${headerForegroundColor}; }`);
			}

			const focusBorderColor = theme.getColor(focusBorder);
			if (focusBorderColor) {
				collector.addRule(`.settings-editor > .settings-body > .settings-tree-container .setting-item-contents .setting-item-markdown a:focus { outline-color: ${focusBorderColor} }`);
			}

			// Scrollbar
			const scrollbarSliderBackgroundColor = theme.getColor(scrollbarSliderBackground);
			if (scrollbarSliderBackgroundColor) {
				collector.addRule(`.settings-editor > .settings-body .settings-tree-container:hover { background-color: ${scrollbarSliderBackgroundColor}; }`);
			}

			const scrollbarSliderHoverBackgroundColor = theme.getColor(scrollbarSliderHoverBackground);
			if (scrollbarSliderHoverBackgroundColor) {
				collector.addRule(`.settings-editor > .settings-body .settings-tree-container::-webkit-scrollbar-thumb:hover { background-color: ${scrollbarSliderHoverBackgroundColor}; }`);
			}

			const scrollbarSliderActiveBackgroundColor = theme.getColor(scrollbarSliderActiveBackground);
			if (scrollbarSliderActiveBackgroundColor) {
				collector.addRule(`.settings-editor > .settings-body .settings-tree-container::-webkit-scrollbar-thumb:active { background-color: ${scrollbarSliderActiveBackgroundColor}; }`);
			}
		}));
	}

	getHTMLElement(): HTMLElement {
		return this.container;
	}

	refresh(rootGroup: SettingsTreeGroupElement): void {
		if (isDefined(this.currentView)) {
			const refreshedGroup = findGroup(rootGroup, this.currentView.group.id);

			if (isDefined(refreshedGroup)) {
				this.currentView = this.getSettingsFromGroup(refreshedGroup);
			} else {
				this.currentView = undefined;
			}
		}

		this.currentView = this.currentView || this.getSettingsFromGroup(rootGroup);
		this.paginator.setSettings(this.currentView.settings, true);
		this.renderPage(true, false);
	}

	render(group: SettingsTreeGroupElement): void {
		this.currentView = this.getSettingsFromGroup(group);
		this.paginator.setSettings(this.currentView.settings, true);
		this.renderPage(true, true);
	}

	private renderPage(shouldRenderAllSettings: boolean, shouldScrollToTop: boolean): void {
		if (shouldRenderAllSettings) {
			DOM.clearNode(this.pageBody);
			this.pageDisposables.clear();

			if (this.currentView?.group.label) {
				const headingContainer = DOM.append(this.pageBody, $('.setting-group-heading'));
				const groupElement = this.currentView!.group;
				const groupRenderer = this.templateToRenderer.get(this.getTemplateId(groupElement))!;
				groupRenderer.renderElement({ element: groupElement } as any, 0, groupRenderer.renderTemplate(headingContainer), undefined);
			}
		}

		const settingsToRender = shouldRenderAllSettings ? this.paginator.visibleSettings : this.paginator.newSettings;
		const renderedSettings = settingsToRender.map(setting => this.renderSetting(setting));
		this.pageBody.append(...renderedSettings);

		if (this.paginator.hasMoreSettings) {
			this.showPaginationControls();
		} else {
			DOM.clearNode(this.loadMoreElement);
		}

		if (shouldScrollToTop) {
			this.container.scrollTop = 0;
		}

		if (!shouldRenderAllSettings) {
			renderedSettings[0].scrollIntoView();
		}
	}

	private showPaginationControls(): void {
		DOM.clearNode(this.loadMoreElement);
		const loadMoreButton = this.pageDisposables.add(new Button(this.loadMoreElement, {
			title: localize('loadMoreSettings', "Load more settings"),
		}));
		loadMoreButton.label = localize('loadMoreSettings', "Load more settings");
		this.pageDisposables.add(loadMoreButton.onDidClick(() => {
			this.paginator.loadMoreSettings();
			this.renderPage(false, false);
		}));
	}

	private getSettingsFromGroup(group: SettingsTreeGroupElement): ISettingsListView {
		if (!this.searchFilter(group)) {
			return { group, settings: [] };
		}

		const settings = group.children.filter(isSettingElement).filter(this.searchFilter);

		if (settings.length > 0) {
			return { group, settings };
		}

		const groups = group.children.filter(isGroupElement).filter(this.searchFilter);

		for (const child of groups) {
			const childResult = this.getSettingsFromGroup(child);

			if (childResult.settings.length > 0) {
				return childResult;
			}
		}

		return { group, settings };
	}

	private renderSetting(element: SettingsTreeSettingElement): HTMLElement {
		const templateId = this.getTemplateId(element);
		const renderer = this.templateToRenderer.get(this.getTemplateId(element))!;
		const freeItems = this.freePool.get(templateId);

		let container: HTMLElement;
		let template: ISettingItemTemplate;

		if (isDefined(freeItems) && freeItems.length > 0) {
			container = freeItems[0].container;
			template = freeItems[0].template;
			this.freePool.set(templateId, freeItems.slice(1));
		} else {
			container = $('div');
			template = renderer.renderTemplate(container);
		}

		this.usedPool.set(templateId, [
			...(this.usedPool.get(templateId) ?? []),
			{ container, template }
		]);

		renderer.renderElement({ element } as any, 0, template, undefined);

		return container;
	}

	// TODO@9at8 remove / implement these stubs

	scrollTop = 0;
	scrollHeight = 0;
	firstVisibleElement: SettingsTreeElement = { id: 'first visible', index: 0 };
	lastVisibleElement: SettingsTreeElement = { id: 'last visible', index: 0 };

	reveal(...args: any[]) {
		// TODO@9at8 STUB
	}
	getRelativeTop(...args: any[]): number {
		return 0;
	}
	layout(...args: any[]) {
		// TODO@9at8 STUB
	}
}

function isGroupElement(element: SettingsTreeElement): element is SettingsTreeGroupElement {
	return element instanceof SettingsTreeGroupElement;
}

function isSettingElement(element: SettingsTreeElement): element is SettingsTreeSettingElement {
	return element instanceof SettingsTreeSettingElement;
}

function findGroup(rootGroup: SettingsTreeGroupElement, id: string): SettingsTreeGroupElement | undefined {
	if (rootGroup.id === id) {
		return rootGroup;
	}

	for (const child of rootGroup.children) {
		if (child instanceof SettingsTreeGroupElement) {
			const result = findGroup(child, id);

			if (isDefined(result)) {
				return result;
			}
		}
	}

	return;
}
