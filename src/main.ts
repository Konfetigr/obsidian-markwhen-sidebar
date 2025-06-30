import { Plugin, WorkspaceLeaf, ItemView, TFile } from 'obsidian';

const VIEW_TYPE = 'markwhen-event-view';

interface MarkwhenEventData {
    id: string;
    title: string;
    fullContent: string;
    rawContent: string;
    date: string;
    filePath: string;
    checkboxPositions: number[][];
}

class MarkwhenEventView extends ItemView {
    private eventData: MarkwhenEventData | null = null;
    private plugin: MarkwhenSidebarPlugin;
    public active = false;
    private contentContainer: HTMLElement | null = null;

    constructor(leaf: WorkspaceLeaf, plugin: MarkwhenSidebarPlugin) {
        super(leaf);
        this.plugin = plugin;
    }
    
    public clearView() {
        this.setEventData(null);
    }

    getViewType() {
        return VIEW_TYPE;
    }

    getDisplayText() {
        return 'MarkWhen Event Details';
    }

    getIcon() {
        return 'calendar';
    }
    
    // Публичный метод для получения данных события
    public getEventData() {
        return this.eventData;
    }
    
     // Публичный метод для обновления данных
    public setEventData(data: MarkwhenEventData | null) {
        this.eventData = data;
        this.displayEvent();
    }

    // Публичный метод для обновления отображения
    public refreshView() {
        this.displayEvent();
    }

    async onOpen() {
        this.active = true;
        this.containerEl.empty();
        this.containerEl.addClass('markwhen-event-view');
        this.contentContainer = this.containerEl.createDiv('markwhen-content-container');
        this.displayEvent();
    }

    async onClose() {
        this.active = false;
        this.contentContainer = null;
    }

    public updateEvent(data: MarkwhenEventData) {
        this.eventData = data;
        this.displayEvent();
    }

    private displayEvent() {
        if (!this.contentContainer) return;
        this.contentContainer.empty();

        if (!this.eventData) {
            this.contentContainer.createEl('div', { 
                text: 'Select an event in MarkWhen timeline', 
                cls: 'markwhen-event-null'
            });
            return;
        }

        // Заголовок
        this.contentContainer.createEl('div', { 
            text: this.eventData.title, 
            cls: 'markwhen-event-title'
        });
        
        // Дата
        this.contentContainer.createEl('div', { 
            text: this.eventData.date, 
            cls: 'markwhen-event-date'
        });
        
        // Длительность события
        const durationContainer = this.contentContainer.createEl('div', {
            cls: 'markwhen-event-duration'
        });
        const durationText = this.calculateDuration(this.eventData.date);
        durationContainer.textContent = durationText;
        
        // Описание события
        const descriptionContainer = this.contentContainer.createDiv('markwhen-description');
        this.renderEventContent(descriptionContainer);
    }

    private renderEventContent(container: HTMLElement) {
        if (!this.eventData) return;
        
        // Инициализируем массив позиций
        const lines = this.eventData.fullContent.split('\n');
        this.eventData.checkboxPositions = Array(lines.length).fill(null).map(() => []);
        
        for (let i = 0; i < lines.length; i++) {
            const lineEl = container.createDiv('markwhen-line');
            lineEl.dataset.index = i.toString();
            lineEl.innerHTML = this.convertMarkdown(lines[i], i);
        }

        // Обработчики для интерактивных элементов
        this.attachContentHandlers(container);
    }

    private attachContentHandlers(container: HTMLElement) {
        container.addEventListener('change', (e) => {
            const target = e.target as HTMLElement;
            if (target.tagName === 'INPUT' && target.getAttribute('type') === 'checkbox') {
                this.handleCheckboxChange(target as HTMLInputElement);
            }
        });

        // Обработчики для ссылок
        const links = container.querySelectorAll('a.internal-link');
        links.forEach(link => {
            link.addEventListener('click', (e) => {
                this.handleLinkClick(e as MouseEvent, link as HTMLAnchorElement);
            });
        });
    }
    
    private calculateDuration(dateString: string): string {
        if (!dateString) return "Duration: Unknown";

        try {
            const parts = dateString.split('/');
            const startDate = this.parseDate(parts[0].trim());
            
            let endDate: Date | null = null;
            if (parts.length > 1) {
                if (parts[1].trim().toLowerCase() === 'now') {
                    endDate = new Date();
                } else {
                    endDate = this.parseDate(parts[1].trim());
                }
            }
            
            if (!endDate) return "1 day";

            const timeDiff = Math.abs(endDate.getTime() - startDate.getTime());
            const days = Math.ceil(timeDiff / (1000 * 3600 * 24)) + 1;
            
            return `${days} day${days !== 1 ? 's' : ''}`;
        } catch (e) {
            console.error("Error calculating duration:", e);
            return "Duration: Unknown";
        }
    }

    private parseDate(dateStr: string): Date {
        if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(dateStr)) {
            return new Date(dateStr);
        }
        
        const match = dateStr.match(/^(\d{1,2})\s+([a-z]{3,})\s+(\d{4})$/i);
        if (match) {
            const day = parseInt(match[1]);
            const month = this.getMonthNumber(match[2].toLowerCase());
            const year = parseInt(match[3]);
            
            if (month !== -1) {
                return new Date(year, month, day);
            }
        }
        
        console.error(`Unsupported date format: ${dateStr}, using current date.`);
        return new Date();
    }

    private getMonthNumber(monthStr: string): number {
        const months: Record<string, number> = {
            'jan': 0, 'feb': 1, 'mar': 2, 'apr': 3, 'may': 4, 'jun': 5,
            'jul': 6, 'aug': 7, 'sep': 8, 'oct': 9, 'nov': 10, 'dec': 11
        };
        
        return months[monthStr.substring(0, 3)] ?? -1;
    }

    private convertMarkdown(line: string, lineIndex: number): string {
        // Уникальные метки для защиты чекбоксов
        let checkboxCount = 0;
        const placeholderPrefix = '%%CHECKBOX_';
        let placeholderIndex = 0;
        const placeholders: string[] = [];
        const positions: { start: number }[] = []; 

        // Временная замена чекбоксов с сохранением позиции
        line = line.replace(/\[( |x|X)\]/g, (match, state) => {
            // Сохраняем только индекс чекбокса
            if (this.eventData) {
                if (!this.eventData.checkboxPositions[lineIndex]) {
                    this.eventData.checkboxPositions[lineIndex] = [];
                }
                this.eventData.checkboxPositions[lineIndex].push(checkboxCount);
            }
            placeholders.push(state);
            return `%%CHECKBOX_${checkboxCount++}%%`;
        });

        // Обработка ссылок
        line = line.replace(/\[\[([^\]]+)\]\]/g, (match, noteName) => {
            return `<a href="#" class="internal-link" data-note="${noteName}">${noteName}</a>`;
        });

        // Восстановление чекбоксов с добавлением индекса
        return line.replace(/%%CHECKBOX_(\d+)%%/g, (_, indexStr) => {
            const index = parseInt(indexStr);
            const state = placeholders[index];
            return `<input type="checkbox" ${state.toLowerCase() === 'x' ? 'checked' : ''} 
                    data-line="${lineIndex}" data-index="${index}">`;
        });
    }

    private handleCheckboxChange(checkbox: HTMLInputElement) {
        if (!this.eventData) return;

        const lineIndex = parseInt(checkbox.dataset.line || '-1');
        const checkboxIndex = parseInt(checkbox.dataset.index || '-1');

        if (lineIndex === -1 || checkboxIndex === -1) return;

        const newState = checkbox.checked ? 'x' : ' ';
        const rawLines = this.eventData.rawContent.split('\n');

        if (lineIndex >= rawLines.length) return;

        let updatedLine = rawLines[lineIndex];
        let currentIndex = 0;
        let pos = 0;
        let result = '';

        while (pos < updatedLine.length) {
            const checkboxStart = updatedLine.indexOf('[', pos);

            // Если чекбокс не найден, добавляем остаток строки и выходим
            if (checkboxStart === -1) {
                result += updatedLine.substring(pos);
                break;
            }

            // Проверяем что это действительно чекбокс: [ ], [x], [X]
            if (checkboxStart + 2 < updatedLine.length && 
                updatedLine[checkboxStart + 2] === ']' && 
                [' ', 'x', 'X'].includes(updatedLine[checkboxStart + 1])) {

                // Добавляем часть до чекбокса
                result += updatedLine.substring(pos, checkboxStart);

                // Если это нужный чекбокс - заменяем состояние
                if (currentIndex === checkboxIndex) {
                    result += `[${newState}]`;
                } else {
                    result += updatedLine.substring(checkboxStart, checkboxStart + 3);
                }

                pos = checkboxStart + 3;
                currentIndex++;
            } else {
                // Не валидный чекбокс, пропускаем
                result += updatedLine.substring(pos, checkboxStart + 1);
                pos = checkboxStart + 1;
            }
        }

        rawLines[lineIndex] = result;

        // Сохраняем изменения
        const newRawContent = rawLines.join('\n');
        this.saveUpdatedContent(newRawContent);
    }
    
    private updateCheckboxInLine(line: string, checkboxIndex: number, newState: string): string {
        let currentIndex = 0;
        let result = '';
        let pos = 0;

        while (pos < line.length) {
            const startPos = line.indexOf('[', pos);
            if (startPos === -1) {
                result += line.substring(pos);
                break;
            }

            if (startPos + 2 >= line.length || line[startPos + 2] !== ']') {
                result += line.substring(pos, startPos + 1);
                pos = startPos + 1;
                continue;
            }

            const stateChar = line[startPos + 1];
            if (![' ', 'x', 'X'].includes(stateChar)) {
                result += line.substring(pos, startPos + 1);
                pos = startPos + 1;
                continue;
            }

            if (currentIndex === checkboxIndex) {
                result += line.substring(pos, startPos) + `[${newState}]`;
                pos = startPos + 3;
            } else {
                result += line.substring(pos, startPos + 3);
                pos = startPos + 3;
            }

            currentIndex++;
        }

        return result;
    }
    
    /*private async saveUpdatedContent(newRawContent: string) {
        if (!this.eventData) return;

        const file = this.app.vault.getAbstractFileByPath(this.eventData.filePath);
        if (!(file instanceof TFile)) return;

        try {
            const content = await this.app.vault.read(file);
            const updatedContent = content.replace(
                this.eventData.rawContent, 
                newRawContent
            );

            await this.app.vault.modify(file, updatedContent);
            this.eventData.rawContent = newRawContent;
            this.eventData.fullContent = this.removeCommonIndent(newRawContent);
        } catch (error) {
            console.error("Error updating file:", error);
        }
    }*/
    private async saveUpdatedContent(newRawContent: string) {
        if (!this.eventData) return;

        const file = this.app.vault.getAbstractFileByPath(this.eventData.filePath);
        if (!(file instanceof TFile)) return;

        try {
            // Читаем текущее содержимое файла
            const currentContent = await this.app.vault.read(file);

            // Экранируем спецсимволы для регулярного выражения
            const escapedRaw = this.eventData.rawContent.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(escapedRaw);

            // Заменяем ТОЛЬКО измененный блок
            const updatedContent = currentContent.replace(regex, newRawContent);

            await this.app.vault.modify(file, updatedContent);

            // Обновляем данные в представлении
            this.eventData.rawContent = newRawContent;
            this.eventData.fullContent = this.removeCommonIndent(newRawContent);

            // Обновляем отображение
            if (this.contentContainer) {
                this.displayEvent();
            }
        } catch (error) {
            console.error("Error updating file:", error);
        }
    }
    
    
    private removeCommonIndent(content: string): string {
        const lines = content.split('\n');
        const minIndent = lines.reduce((min, line) => {
            if (line.trim() === '') return min;
            const leadingSpaces = line.match(/^\s*/)?.[0].length || 0;
            return Math.min(min, leadingSpaces);
        }, Infinity);

        return lines
            .map(line => line.substring(minIndent))
            .join('\n');
    }

    private handleLinkClick(event: MouseEvent, link: HTMLAnchorElement) {
        event.preventDefault();
        const noteName = link.dataset.note;
        if (!noteName) return;
        
        const file = this.app.metadataCache.getFirstLinkpathDest(noteName, '');
        if (file) {
            this.app.workspace.openLinkText(file.path, '', true);
        }
    }
}

function escapeRegExp(string: string) {
    return string
        .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        .replace(/-/g, '\\-')
        .replace(/\//g, '\\/')
        .replace(/\./g, '\\.')
        .replace(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/gi, 
                 '(?:$1|${$1uary.substring(0,3)})');
}

export default class MarkwhenSidebarPlugin extends Plugin {
    private readonly DEBUG_MODE = false; // Переключить на true для отладки
    private view: MarkwhenEventView | null = null;
    private observer: MutationObserver | null = null;
    private ignoreNextMutation = false;
    private isHandlerRegistered = false;

    public setIgnoreMutation(value: boolean) {
        this.ignoreNextMutation = value;
    }
    
    public reinitializeHandlers() {
        this.isHandlerRegistered = false;

        // Проверяем активен ли markwhen в текущем файле
        const activeFile = this.app.workspace.getActiveFile();
        if (activeFile && this.isMarkwhenFile(activeFile)) {
            this.registerMarkwhenClickHandlers();
        }
    }

    async onload() {
        if (!this.DEBUG_MODE) {
            console.log = () => {};
            console.warn = () => {};
            console.debug = () => {};
            console.info = () => {};
        }
        console.log("Loading MarkWhen Sidebar plugin");

        this.registerView(VIEW_TYPE, (leaf) => {
            this.view = new MarkwhenEventView(leaf, this);
            return this.view;
        });
        
        this.registerEvent(
            this.app.workspace.on('file-open', (file) => {
                if (this.view?.active) {
                    // Очищаем окно просмотра
                    this.view.clearView();
                    
                    // Переинициализируем обработчики только для файлов markwhen
                    if (file && this.isMarkwhenFile(file)) {
                        this.reinitializeHandlers();
                    }
                }
            })
        );

        // Исправленная регистрация события изменения файлов
        this.registerEvent(this.app.vault.on('modify', (file) => {
            if (file instanceof TFile) {
                this.handleFileModify(file);
            }
        }));

        this.app.workspace.onLayoutReady(() => {
            this.activateView();
            this.registerMarkwhenClickHandlers();
            this.setupMutationObserver();
        });
    }
    
    // Вспомогательный метод для проверки markwhen файлов
        private isMarkwhenFile(file: TFile): boolean {
            return file.extension === 'md' && 
                   (file.name.endsWith('.mw') || 
                    /```(?:markwhen|mw)/i.test(file.name));
        }
    
    private setupMutationObserver() {
        const workspaceEl = this.app.workspace.containerEl;

        this.observer = new MutationObserver((mutations) => {
            if (this.ignoreNextMutation) return;
            // Добавляем принудительное переподключение
            if (this.view?.active) {
                this.reinitializeHandlers();
            }
        });

        this.observer.observe(workspaceEl, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['class']
        });
    }

    private async activateView() {
        const { workspace } = this.app;
        let leaf: WorkspaceLeaf | null = null;
        const leaves = workspace.getLeavesOfType(VIEW_TYPE);
        
        if (leaves.length > 0) {
            leaf = leaves[0];
            this.view = leaf.view as MarkwhenEventView;
        } else {
            const rightLeaf = workspace.getRightLeaf(false);
            if (rightLeaf) {
                leaf = rightLeaf;
                await leaf.setViewState({ type: VIEW_TYPE });
                this.view = leaf.view as MarkwhenEventView;
            } else {
                leaf = workspace.getLeaf(true);
                await leaf.setViewState({ type: VIEW_TYPE });
                this.view = leaf.view as MarkwhenEventView;
            }
        }

        if (leaf) {
            workspace.revealLeaf(leaf);
        }
    }
    
    private registerMarkwhenClickHandlers() {
        if (this.isHandlerRegistered) return;
        const iframeContainer = document.querySelector('.mw.active') as HTMLIFrameElement;
        
        if (iframeContainer && iframeContainer.contentWindow) {
            const checkInterval = setInterval(() => {
                const iframeDocument = iframeContainer.contentDocument;
                
                if (iframeDocument && iframeDocument.readyState === 'complete') {
                    clearInterval(checkInterval);
                    iframeDocument.addEventListener('click', this.handleIframeClick.bind(this));
                    this.isHandlerRegistered = true;
                }
            }, 1000);
        }
        this.startConnectionMonitor();
    }
    
    private startConnectionMonitor() {
        const monitorInterval = setInterval(() => {
            if (!this.isHandlerActive()) {
                this.registerMarkwhenClickHandlers();
            }
        }, 5000);
        this.registerInterval(monitorInterval);
    }
    
    private isHandlerActive(): boolean {
        try {
            const iframeContainer = document.querySelector('.mw.active') as HTMLIFrameElement;
            return !!iframeContainer?.contentDocument;
        } catch (e) {
            return false;
        }
    }
    
    async onunload() {
        if (this.observer) {
            this.observer.disconnect();
        }
    }

    private lastClickTime = 0;
    private lastEventId = '';

    // Новый метод: обработчик изменений файлов
    private handleFileModify(file: TFile) {
        // Переподключаем обработчики при изменении файла
        this.reinitializeHandlers();
        if (!this.view || !this.view.active) return;

        // Используем публичный метод для получения данных
        const eventData = this.view.getEventData();
        if (!eventData) return;

        // Проверяем, связан ли измененный файл с текущим событием
        if (file.path === eventData.filePath) {
            this.reloadCurrentEvent();
        }
    }
    
    // Новый метод: перезагрузка текущего события
    private async reloadCurrentEvent() {
        if (!this.view || !this.view.active) return;

        // Используем публичный метод для получения данных
        const eventData = this.view.getEventData();
        if (!eventData) return;

        const file = this.app.vault.getAbstractFileByPath(eventData.filePath);
        if (!(file instanceof TFile)) return;

        try {
            const content = await this.app.vault.cachedRead(file);
            const contentResult = this.extractEventContent(content, eventData.title);

            if (contentResult.raw) {
                // Обновляем данные события
                const updatedData: MarkwhenEventData = {
                    ...eventData,
                    fullContent: contentResult.display,
                    rawContent: contentResult.raw
                };

                // Используем публичный метод для обновления данных
                this.view.setEventData(updatedData);
            } else {
                // Используем публичный метод для очистки данных
                this.view.setEventData(null);
            }
        } catch (error) {
            console.error("Error reloading event:", error);
        }
    }
    
    private handleIframeClick(event: MouseEvent) {
        event.stopPropagation();
        if (!this.view?.active) return;

        const now = Date.now();
        if (now - this.lastClickTime < 300) return;
        this.lastClickTime = now;

        const target = event.target as HTMLElement;
        if (!target.closest('.eventBarAndTitle')) return;

        const eventRow = target.closest('.eventRow');
        if (!eventRow) return;

        const titleElement = eventRow.querySelector('.ml-px');
        if (!titleElement) return;

        const firstSpan = titleElement.querySelector('span:first-child');
        let title = firstSpan?.textContent?.trim() || '';
        title = title.replace(/…|\.\.\./g, '').trim();

        const dateElement = eventRow.querySelector('.eventDate');
        if (!dateElement) return;

        const date = dateElement.textContent?.trim() || '';
        const eventId = `${date}-${title}`;
        
        if (eventId === this.lastEventId) return;
        this.lastEventId = eventId;

        this.handleEventSelection(title, date);
    }
    
    private async handleEventSelection(title: string, date: string) {
        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile) return;

        try {
            const content = await this.app.vault.cachedRead(activeFile);
            const contentResult = this.extractEventContent(content, title);

            if (this.view) {
                this.view.updateEvent({ 
                    id: `${date}-${title}`, 
                    title, 
                    fullContent: contentResult.display, 
                    rawContent: contentResult.raw,
                    date,
                    filePath: activeFile.path,
                    checkboxPositions: [] // Добавляем пустой массив
                });
            }
        } catch (error) {
            console.error("Error processing event:", error);
        }
    }
    
    private extractEventContent(content: string, title: string): { display: string; raw: string } {
        const markwhenBlockRegex = /```(?:markwhen|mw)\s+([\s\S]*?)\s*```/i;
        const match = content.match(markwhenBlockRegex);
        
        let result = '';
        
        if (match && match[1]) {
            result = this.findEventInContent(match[1], title);
        } else if (this.isEntireFileMarkwhen(content)) {
            result = this.findEventInContent(content, title);
        } else {
            return { display: '', raw: '' };
        }
        
        const cleanedResult = this.removeDateAndTitle(result);
        return {
            display: cleanedResult,
            raw: cleanedResult
        };
    }

    private isEntireFileMarkwhen(content: string): boolean {
        return content.trim().startsWith('section:') || 
            /\d{4}[-\/]\d{1,2}[-\/]\d{1,2}/.test(content);
    }

    private removeDateAndTitle(content: string): string {
        if (!content) return '';
        const lines = content.split('\n');
        return lines.length > 1 
            ? lines.slice(1).join('\n').trim()
            : '';
    }

    private findEventInContent(content: string, title: string): string {
        const lines = content.split('\n');
        const titleParts = title.split(/\s+/).filter(part => part.length > 0);
        const titlePattern = new RegExp(
            titleParts.map(part => escapeRegExp(part)).join('[\\s\\S]*?'), 
            'i'
        );

        let inTargetEvent = false;
        let eventContent: string[] = [];

        const newEventPattern = /^\s*(\d{4}[-\/]\d{1,2}[-\/]\d{1,2}|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2},?\s*\d{4}|now|section|endSection|group|endGroup|timeline)/i;

        for (const line of lines) {
            const isNewEvent = newEventPattern.test(line);

            if (isNewEvent) {
                if (inTargetEvent) {
                    break;
                }

                if (titlePattern.test(line)) {
                    inTargetEvent = true;
                    eventContent.push(line);
                    continue;
                }
            }

            if (inTargetEvent) {
                eventContent.push(line);
            }
        }

        if (eventContent.length > 0) {
            return eventContent.join('\n').trim();
        }

        // Fallback: поиск по точному вхождению заголовка
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes(title)) {
                eventContent.push(lines[i]);

                for (let j = i + 1; j < lines.length; j++) {
                    if (newEventPattern.test(lines[j])) {
                        break;
                    }

                    if (lines[j].trim() === '' && j > 0 && lines[j].length > 0 && lines[j][0] !== ' ') {
                        break;
                    }

                    eventContent.push(lines[j]);
                }

                return eventContent.join('\n').trim();
            }
        }

        return '';
    }
}