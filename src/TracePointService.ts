import * as vscode from 'vscode';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { parseXml, serializeXml } from './utils/xmlUtils';
import { CODE_TRACE_TREE_STATE_KEY } from './domain/constants';

export interface TracePoint {
    id: string;
    name: string;
    fileName: string;
    lineNumber: number;
    parentId?: string;
    projectPath: string;
    lineContent?: string;
    isValid: boolean;
    totalOccurrenceCount: number;
    occurrenceIndex: number;
    description: string;
}

interface TracePointState {
    tracePoints: TracePoint[];
    selectedTracePointIds: string[];
    expandedTracePointIds: string[];
    highlightingEnabled: boolean;
    descriptionAreaOpened: boolean;
}

export class TracePointService {
    private static instance: TracePointService;
    private tracePoints: TracePoint[] = [];
    private selectedTracePointIds: Set<string> = new Set();
    private expandedTracePointIds: Set<string> = new Set();
    private highlighters: Map<string, vscode.TextEditorDecorationType> = new Map(); // Key: fileUri
    private listeners: ((tracePoints: TracePoint[], expandedIds: string[]) => void)[] = [];
    private _highlightingEnabled: boolean = true;
    private _descriptionAreaOpened: boolean = false;

    private constructor(private context: vscode.ExtensionContext) {
        this.initConfig();
    }

    static getInstance(context: vscode.ExtensionContext): TracePointService {
        if (!TracePointService.instance) {
            TracePointService.instance = new TracePointService(context);
        }
        return TracePointService.instance;
    }

    private async initConfig() {
        const state = this.context.workspaceState.get<TracePointState>(CODE_TRACE_TREE_STATE_KEY);
        if (!state) {
            const initialState: TracePointState = {
                tracePoints: [],
                selectedTracePointIds: [],
                expandedTracePointIds: [],
                highlightingEnabled: true,
                descriptionAreaOpened: false,
            };
            await this.context.workspaceState.update(CODE_TRACE_TREE_STATE_KEY, initialState);
        }
    }

    async loadState() {
        try {
            const state = this.context.workspaceState.get<TracePointState>(CODE_TRACE_TREE_STATE_KEY);
            if (state) {
                this.tracePoints = state.tracePoints || [];
                this.selectedTracePointIds = new Set(state.selectedTracePointIds || []);
                this.expandedTracePointIds = new Set(state.expandedTracePointIds || []);
                // this.tracePoints =  [];
                // this.selectedTracePointIds =  new Set([]);
                // this.expandedTracePointIds =  new Set([]);
                
                this._highlightingEnabled = state.highlightingEnabled;
                this._descriptionAreaOpened = state.descriptionAreaOpened;
                await this.validateTracePointsOnLoad();
                this.notifyListeners();
            }
        } catch (e) {
            vscode.window.showErrorMessage(`Failed to load trace points: ${e}`);
        }
    }

    async saveState() {
        const state: TracePointState = {
            tracePoints: this.tracePoints,
            selectedTracePointIds: Array.from(this.selectedTracePointIds),
            expandedTracePointIds: Array.from(this.expandedTracePointIds),
            highlightingEnabled: this._highlightingEnabled ?? true,
            descriptionAreaOpened: this._descriptionAreaOpened ?? false,
        };
        await this.context.workspaceState.update(CODE_TRACE_TREE_STATE_KEY, state);
    }

    getTracePoints(): TracePoint[] {
        return [...this.tracePoints];
    }

    isTracePointSelected(id: string): boolean {
        return this.selectedTracePointIds.has(id);
    }

    selectTracePoints(ids: string[]) {
        this.selectedTracePointIds.clear();
        ids.forEach(id => this.selectedTracePointIds.add(id));
        this.notifyListeners();
        this.saveState();
    }

    toggleTracePointSelection(id: string) {
        if (this.selectedTracePointIds.has(id)) {
            this.selectedTracePointIds.delete(id);
        } else {
            this.selectedTracePointIds.add(id);
        }
        this.notifyListeners();
        this.saveState();
    }

    getExpandedTracePointIds(): string[] {
        return Array.from(this.expandedTracePointIds);
    }

    setExpandedTracePointIds(ids: string[]) {
        this.expandedTracePointIds.clear();
        ids.forEach(id => this.expandedTracePointIds.add(id));
        this.notifyListeners();
        this.saveState();
    }

    isHighlightingEnabled(): boolean {
        return this._highlightingEnabled;
    }

    setHighlightingEnabled(enabled: boolean) {
        this._highlightingEnabled = enabled;
        this.applyHighlightsToAllEditors();
        this.saveState();
    }

    isDescriptionAreaOpened(): boolean {
        return this._descriptionAreaOpened;
    }

    setDescriptionAreaOpened(opened: boolean) {
        this._descriptionAreaOpened = opened;
        this.saveState();
    }

    private getState(): TracePointState {
        return {
            tracePoints: this.tracePoints,
            selectedTracePointIds: Array.from(this.selectedTracePointIds),
            expandedTracePointIds: Array.from(this.expandedTracePointIds),
            highlightingEnabled: this.isHighlightingEnabled(),
            descriptionAreaOpened: this.isDescriptionAreaOpened(),
        };
    }

    addListener(listener: (tracePoints: TracePoint[], expandedIds: string[]) => void) {
        this.listeners.push(listener);
    }

    private notifyListeners() {
        this.listeners.forEach(listener => listener(this.getTracePoints(), this.getExpandedTracePointIds()));
    }

    async addTracePoint(name: string, file: vscode.Uri, lineNumber: number, parentId?: string, description = '') {
        const document = await vscode.workspace.openTextDocument(file);
        const lineContent = document.lineAt(lineNumber - 1).text.trim();
        const [totalOccurrences, matchingLines] = this.getLineOccurrences(document, lineContent);
        const occurrenceIndex = matchingLines.indexOf(lineNumber) + 1;
        const tracePoint: TracePoint = {
            id: uuidv4(),
            name,
            fileName: vscode.workspace.asRelativePath(file),
            lineNumber,
            parentId,
            projectPath: vscode.workspace.workspaceFolders?.[0].uri.fsPath || '',
            lineContent,
            isValid: !!lineContent,
            totalOccurrenceCount: totalOccurrences,
            occurrenceIndex,
            description,
        };
        this.tracePoints.push(tracePoint);
        this.applyHighlightsToAllEditors();
        this.notifyListeners();
        this.saveState();
    }

    async updateTracePointDescription(id: string, newDescription: string) {
        const index = this.tracePoints.findIndex(tp => tp.id === id);
        if (index >= 0) {
            this.tracePoints[index].description = newDescription;
            this.notifyListeners();
            this.saveState();
        }
    }

    async renameTracePoint(id: string, newName: string) {
        const index = this.tracePoints.findIndex(tp => tp.id === id);
        if (index >= 0) {
            this.tracePoints[index].name = newName;
            this.notifyListeners();
            this.saveState();
        }
    }

    async deleteTracePoints(ids: string[]) {
        this.tracePoints = this.tracePoints.filter(tp => !ids.includes(tp.id));
        ids.forEach(id => {
            this.selectedTracePointIds.delete(id);
            this.expandedTracePointIds.delete(id);
        });
        this.applyHighlightsToAllEditors();
        this.notifyListeners();
        this.saveState();
    }

    async updateTracePoints(newTracePoints: TracePoint[]) {
        this.tracePoints = newTracePoints;
        this.applyHighlightsToAllEditors();
        this.notifyListeners();
        this.saveState();
    }

    getLineOccurrences(document: vscode.TextDocument, content?: string): [number, number[]] {
        if (!content) return [0, []];
        const matchingLines: number[] = [];
        for (let i = 0; i < document.lineCount; i++) {
            if (document.lineAt(i).text.trim() === content) {
                matchingLines.push(i + 1);
            }
        }
        return [matchingLines.length, matchingLines];
    }

    async attachListenersAndHighlight(document: vscode.TextDocument) {
        // Global listener handles this; just highlight if relevant
        if (this.tracePoints.some(tp => tp.fileName === vscode.workspace.asRelativePath(document.uri))) {
            this.highlightTracePointsInFile(document);
        }
    }

    async highlightTracePointsInFile(document: vscode.TextDocument) {
        if (!this.isHighlightingEnabled()) return;
        const filePath = vscode.workspace.asRelativePath(document.uri);
        const relevantTracePoints = this.tracePoints.filter(tp => tp.fileName === filePath && tp.isValid);
        this.removeHighlights(document.uri.fsPath);

        const decorationType = vscode.window.createTextEditorDecorationType({
            backgroundColor: new vscode.ThemeColor('editor.findMatchBackground'),
            isWholeLine: true,
        });

        const ranges: vscode.Range[] = [];
        relevantTracePoints.forEach(tp => {
            if (tp.lineNumber <= document.lineCount) {
                const line = document.lineAt(tp.lineNumber - 1);
                ranges.push(line.range);
            }
        });
        vscode.window.visibleTextEditors
            .filter(editor => editor.document.uri.fsPath === document.uri.fsPath)
            .forEach(editor => editor.setDecorations(decorationType, ranges));
        this.highlighters.set(document.uri.fsPath, decorationType);
    }

    private removeHighlights(filePath: string) {
        const decorationType = this.highlighters.get(filePath);
        if (decorationType) {
            vscode.window.visibleTextEditors.forEach(editor => editor.setDecorations(decorationType, []));
            decorationType.dispose();
            this.highlighters.delete(filePath);
        }
    }

    private applyHighlightsToAllEditors() {
        vscode.window.visibleTextEditors.forEach(editor => {
            if (this.isHighlightingEnabled()) {
                this.highlightTracePointsInFile(editor.document);
            } else {
                this.removeHighlights(editor.document.uri.fsPath);
            }
        });
    }

    async handleDocumentChange(event: vscode.TextDocumentChangeEvent) {
        const filePath = vscode.workspace.asRelativePath(event.document.uri);
        const affectedTracePoints = this.tracePoints.filter(tp => tp.fileName === filePath);
        if (affectedTracePoints.length === 0) return;

        const updatedTracePoints = this.tracePoints.map(tp => {
            if (tp.fileName !== filePath) return tp;

            // Adjust line number based on cumulative deltas
            let adjustedLine0 = tp.lineNumber - 1;
            for (const change of event.contentChanges) {
                const oldLines = change.range.end.line - change.range.start.line + 1;
                const newLines = change.text.split(/\r?\n/).length;
                const delta = newLines - oldLines;
                if (adjustedLine0 > change.range.end.line) {
                    adjustedLine0 += delta;
                }
            }
            const adjustedLine = adjustedLine0 + 1;

            if (adjustedLine < 1 || adjustedLine > event.document.lineCount) {
                return { ...tp, lineNumber: adjustedLine, isValid: false, totalOccurrenceCount: 0, occurrenceIndex: 0 };
            }

            const currentContent = event.document.lineAt(adjustedLine0).text.trim();
            if (currentContent !== tp.lineContent) {
                return { ...tp, lineNumber: adjustedLine, isValid: false, totalOccurrenceCount: 0, occurrenceIndex: 0 };
            }

            const [totalOccurrences, matchingLines] = this.getLineOccurrences(event.document, tp.lineContent);
            const occurrenceIndex = matchingLines.indexOf(adjustedLine) + 1;
            return {
                ...tp,
                lineNumber: adjustedLine,
                totalOccurrenceCount: totalOccurrences,
                occurrenceIndex: occurrenceIndex >= 0 ? occurrenceIndex : 0,
                isValid: true
            };
        });

        this.tracePoints = updatedTracePoints;
        this.highlightTracePointsInFile(event.document);
        this.notifyListeners();
        this.saveState();
    }

    private async validateTracePointsOnLoad() {
        const updatedTracePoints = await Promise.all(this.tracePoints.map(async tp => {
            if (!tp.id || !tp.fileName || !tp.projectPath) return { ...tp, isValid: false, totalOccurrenceCount: 0, occurrenceIndex: 0 };
            const fileUri = vscode.Uri.file(path.join(tp.projectPath, tp.fileName));
            try {
                const document = await vscode.workspace.openTextDocument(fileUri);
                if (tp.lineNumber > document.lineCount) return { ...tp, isValid: false, totalOccurrenceCount: 0, occurrenceIndex: 0 };
                const currentContent = document.lineAt(tp.lineNumber - 1).text.trim();
                const [totalOccurrences, matchingLines] = this.getLineOccurrences(document, tp.lineContent);
                const occurrenceIndex = matchingLines.indexOf(tp.lineNumber) + 1;
                return { ...tp, totalOccurrenceCount: totalOccurrences, occurrenceIndex: occurrenceIndex >= 0 ? occurrenceIndex : 0, isValid: true };
            } catch {
                return { ...tp, isValid: false, totalOccurrenceCount: 0, occurrenceIndex: 0 };
            }
        }));
        this.tracePoints = updatedTracePoints;
        this.applyHighlightsToAllEditors();
        this.notifyListeners();
    }

    async navigateToTracePoint(tp: TracePoint) {
        const fileUri = vscode.Uri.file(path.join(tp.projectPath, tp.fileName));
        const doc = await vscode.workspace.openTextDocument(fileUri);
        const editor = await vscode.window.showTextDocument(doc);
        const range = new vscode.Range(tp.lineNumber - 1, 0, tp.lineNumber - 1, 0);
        editor.selection = new vscode.Selection(range.start, range.end);
        editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
    }
}