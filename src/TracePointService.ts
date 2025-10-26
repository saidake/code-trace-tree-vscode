// src/TracePointService.ts

import * as vscode from 'vscode';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { parseXml, serializeXml } from './utils/xmlUtils';
import { CODE_TRACE_TREE_STATE_KEY } from './domain/constants';
import { TracePoint, TracePointState } from './domain/types';



export class TracePointService {
    private static instance: TracePointService;
    private treeItemMap: Map<string, vscode.TreeItem> = new Map();
    private tracePoints: TracePoint[] = [];
    private tracePointMap: Map<string, TracePoint> = new Map();
    private tracePointChildrenMap: Map<string, string[]> = new Map();
    private selectedTracePointIds: Set<string> = new Set();
    private expandedTracePointIds: Set<string> = new Set();
    private highlighters: Map<string, vscode.TextEditorDecorationType> = new Map(); // Key: fileUri
    private listeners: ((tracePoints: TracePoint[], changeType?: 'add' | 'update' | 'delete' | 'all' | 'select' | 'description-update', affectedIds?: string[]) => void)[] = [];
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
                // this.tracePoints = [];
                this.tracePointMap = new Map(state.tracePoints.map(tp => [tp.id, tp]));
                this.rebuildChildrenMap(state.tracePoints);
                this.rebuildTreeItemMap(state.tracePoints);

                // this.selectedTracePointIds = new Set([]);
                // this.expandedTracePointIds = new Set([]);

                // this.tracePointMap = new Map();
                // this.tracePointChildrenMap = new Map();


                this._highlightingEnabled = state.highlightingEnabled;
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
        };
        await this.context.workspaceState.update(CODE_TRACE_TREE_STATE_KEY, state);
    }

    getTracePoints(): TracePoint[] {
        return this.tracePoints;
    }

    isTracePointSelected(id: string): boolean {
        return this.selectedTracePointIds.has(id);
    }

    selectTracePoints(ids: string[]) {
        this.selectedTracePointIds = new Set(ids);
        this.notifyListeners('select', ids);
        this.saveState();
    }


    getExpandedTracePointIds(): Set<string> {
        return this.expandedTracePointIds;
    }

    getTracePointChildrenMap(): Map<string, string[]> {
        return this.tracePointChildrenMap;
    }
    getTracePointMap(): Map<string, TracePoint> {
        return this.tracePointMap;
    }

    getTreeItemMap(): Map<string, vscode.TreeItem> {
        return this.treeItemMap;
    }

    setExpandedTracePointIds(expandedTracePointIds: Set<string>) {
        this.expandedTracePointIds = expandedTracePointIds;
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


    addListener(listener: (tracePoints: TracePoint[], changeType?: 'add' | 'update' | 'delete' | 'select' | 'description-update' | 'all', affectedIds?: string[]) => void) {
        this.listeners.push(listener);
    }

    private notifyListeners(changeType: 'add' | 'update' | 'delete' | 'select' | 'description-update' | 'all' = 'all', affectedIds: string[] = []) {
        this.listeners.forEach(listener => listener(this.getTracePoints(), changeType, affectedIds));
    }

    private addTracePointToParentMap(tracePoint: TracePoint) {
        const parentId = tracePoint.parentId || 'root';
        if (!this.tracePointChildrenMap.has(parentId)) {
            this.tracePointChildrenMap.set(parentId, []);
        }
        this.tracePointChildrenMap.get(parentId)!.push(tracePoint.id);
    }


    async addTracePoint(name: string, file: vscode.Uri, lineNumber: number, parentId?: string, description = '') {
        const document = await vscode.workspace.openTextDocument(file);
        const lineContent = document.lineAt(lineNumber - 1).text.trim();
        const [totalOccurrences, matchingLines] = this.getLineOccurrences(document, lineContent);
        const occurrenceIndex = matchingLines.indexOf(lineNumber) + 1;

        const filePath = vscode.workspace.asRelativePath(file);
        const fileName = path.basename(filePath);
        const tracePoint: TracePoint = {
            id: uuidv4(),
            name,
            filePath,
            fileName,
            lineNumber,
            parentId,
            childCount: 0,
            projectPath: vscode.workspace.workspaceFolders?.[0].uri.fsPath || '',
            lineContent,
            isValid: true,
            totalOccurrenceCount: totalOccurrences,
            occurrenceIndex,
            description, // Defaults to empty string
        };
        if (parentId) {
            let pT = this.tracePointMap.get(parentId);
            if (pT) pT.childCount += 1;
        }
        this.tracePoints.push(tracePoint);
        this.tracePointMap.set(tracePoint.id, tracePoint);
        this.addTracePointToParentMap(tracePoint);
        this.updateTreeItem(tracePoint);

        this.applyHighlightsToAllEditors();
        tracePoint.parentId ? this.notifyListeners('add', [tracePoint.parentId]) : this.notifyListeners();
        this.saveState();
    }
    getTracePointById(id: string) {
        return this.tracePointMap.get(id);
    }
    getTracePointParentIdById(id: string) {
        return this.tracePointMap.get(id)?.parentId ?? "root";
    }

    async updateTracePointDescription(id: string, newDescription: string) {
        const tp = this.getTracePointById(id);
        if (tp) {
            tp.description = newDescription;
            this.notifyListeners('update', [this.getTracePointParentIdById(id)]);
            this.updateTreeItem(tp);
            this.saveState();
        }
    }

    async renameTracePoint(id: string, newName: string) {
        const tp = this.getTracePointById(id);
        if (tp) {
            tp.name == newName;
            this.notifyListeners('update', [this.getTracePointParentIdById(id)]);
            this.updateTreeItem(tp);
            this.saveState();
        }
    }

    async setTracePoints(newTracePoints: TracePoint[]) {
        this.tracePoints = newTracePoints;
        this.tracePointMap = new Map(newTracePoints.map(tp => [tp.id, tp]));
        this.rebuildChildrenMap(newTracePoints);
        this.rebuildTreeItemMap(newTracePoints);

        this.applyHighlightsToAllEditors();
        this.notifyListeners();
        this.saveState();
    }

    // async updateTracePoints(ids: string[]) {
    //     this.applyHighlightsToAllEditors();
    //     this.notifyListeners('update', ids);
    //     this.saveState();
    // }


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
        if (this.tracePoints.some(tp => tp.filePath === vscode.workspace.asRelativePath(document.uri))) {
            this.highlightTracePointsInFile(document);
        }
    }

    async highlightTracePointsInFile(document: vscode.TextDocument) {
        if (!this.isHighlightingEnabled()) return;
        const filePath = vscode.workspace.asRelativePath(document.uri);
        const relevantTracePoints = this.tracePoints.filter(tp => tp.filePath === filePath && tp.isValid);
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
        const affectedTracePoints = this.tracePoints.filter(tp => tp.filePath === filePath);
        if (affectedTracePoints.length === 0) return;

        const updatedTracePoints = this.tracePoints.map(tp => {
            if (tp.filePath !== filePath) return tp;

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
                return { ...tp, lineNumber: adjustedLine, isValid: false, totalOccurrences: 0, occurrenceIndex: 0 };
            }

            const currentContent = event.document.lineAt(adjustedLine0).text.trim();
            if (currentContent !== tp.lineContent) {
                return { ...tp, lineNumber: adjustedLine, isValid: false, totalOccurrences: 0, occurrenceIndex: 0 };
            }

            const [totalOccurrences, matchingLines] = this.getLineOccurrences(event.document, tp.lineContent);
            const occurrenceIndex = matchingLines.indexOf(adjustedLine) + 1;
            return {
                ...tp,
                lineNumber: adjustedLine,
                totalOccurrences: totalOccurrences,
                occurrenceIndex: occurrenceIndex >= 0 ? occurrenceIndex : 0,
                isValid: true
            };
        });

        this.tracePoints = updatedTracePoints;
        this.tracePointMap = new Map(updatedTracePoints.map(tp => [tp.id, tp]));
        // this.rebuildChildrenMap(updatedTracePoints)
        // this.rebuildTreeItemMap(updatedTracePoints);
        this.highlightTracePointsInFile(event.document);
        const parentIdsToUpdate = affectedTracePoints.map(tp => tp.parentId ?? 'root');
        if (parentIdsToUpdate.includes('root')) {
            this.notifyListeners('update', ['root']);
        } else {
            this.notifyListeners('update', parentIdsToUpdate);
        }
        this.saveState();
    }

    private async validateTracePointsOnLoad() {
        const updatedTracePoints = await Promise.all(this.tracePoints.map(async tp => {
            if (!tp.id || !tp.filePath || !tp.projectPath) return { ...tp, isValid: false, totalOccurrenceCount: 0, occurrenceIndex: 0 };
            const fileUri = vscode.Uri.file(path.join(tp.projectPath, tp.filePath));
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
        this.tracePointMap = new Map(updatedTracePoints.map(tp => [tp.id, tp]));
        this.applyHighlightsToAllEditors();
        this.notifyListeners();
    }

    async navigateToTracePoint(tp: TracePoint, treeView: vscode.TreeView<vscode.TreeItem>) {
        const fileUri = vscode.Uri.file(path.join(tp.projectPath, tp.filePath));
        const doc = await vscode.workspace.openTextDocument(fileUri);
        const editor = await vscode.window.showTextDocument(doc);
        const range = new vscode.Range(tp.lineNumber - 1, 0, tp.lineNumber - 1, 0);
        editor.selection = new vscode.Selection(range.start, range.end);
        editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
        // Re-select and focus the tree item to retain blue highlight
        const selected = treeView.selection;
        if (selected.length == 1) {
            treeView.reveal(selected[0], { select: true, focus: true });
        }
    }

    getSelectedTracePointIds(): string[] {
        return Array.from(this.selectedTracePointIds);
    }

    async deleteTracePointsWithChildren(ids: string[]) {
        // Collect child ids.
        const allIdsToDelete = new Set<string>(ids);
        const parentIdsToUpdate = new Set<string>();
        // Check if the item to be deleted has any children.
        const collectChildren = (parentId: string) => {
            if (this.tracePointChildrenMap.get(parentId)) {
                for (const childId of this.tracePointChildrenMap.get(parentId)!) {
                    allIdsToDelete.add(childId);
                    collectChildren(childId);
                }
            }
        };
        ids.forEach(id => collectChildren(id));

        this.tracePoints = this.tracePoints.filter(tp => !allIdsToDelete.has(tp.id));
        allIdsToDelete.forEach(id => {
            parentIdsToUpdate.add(this.tracePointMap.get(id)?.parentId || 'root');
            this.selectedTracePointIds.delete(id);
            this.expandedTracePointIds.delete(id);
            this.tracePointMap.delete(id);
            this.tracePointChildrenMap.delete(id);
            this.treeItemMap.delete(id);
        });

        if (parentIdsToUpdate.has("root")) {
            parentIdsToUpdate.clear();
            parentIdsToUpdate.add("root");
        } else {
            // Remove deleted parent ids.
            for (const parentId of Array.from(parentIdsToUpdate)) {
                if (!this.tracePointMap.has(parentId)) {
                    parentIdsToUpdate.delete(parentId);
                }
            }
        }

        // Update tracePointChildrenMap to remove deleted children.
        for (const parentId of this.tracePointChildrenMap.keys()) {
            const children = this.tracePointChildrenMap.get(parentId)!;
            this.tracePointChildrenMap.set(
                parentId,
                children.filter(childId => !allIdsToDelete.has(childId))
            );
        }

        this.applyHighlightsToAllEditors();
        this.notifyListeners('delete', Array.from(parentIdsToUpdate));
        await this.saveState();
    }


    private updateTreeItem(tp: TracePoint) {
        // Determine collapsible state based on expandedIds
        let collapsibleState = vscode.TreeItemCollapsibleState.None;
        const hasChildren = (this.tracePointChildrenMap.get(tp.id)?.length ?? 0) > 0;
        if (tp.isValid && hasChildren) {
            collapsibleState = this.expandedTracePointIds.has(tp.id)
                ? vscode.TreeItemCollapsibleState.Expanded
                : vscode.TreeItemCollapsibleState.Collapsed;
        }

        const item = new vscode.TreeItem(
            `${tp.name || ''} (${tp.fileName}: ${tp.lineNumber})`,
            collapsibleState
        );
        item.id = tp.id;
        item.contextValue = 'traceable';
        item.description = tp.description ? tp.description.substring(0, 50) + '...' : '';
        item.tooltip = undefined; // Explicitly disable tooltip on hover
        item.command = {
            command: 'codeTraceTree.goToTracePoint',
            title: 'Go to Trace Point',
            arguments: [item]
        };
        if (!tp.isValid) item.label = `~~${item.label}~~`; // Strikethrough for invalid

        this.treeItemMap.set(tp.id, item);
        if (tp.parentId) {
            const pTp = this.treeItemMap.get(tp.parentId);
            if (pTp) {
                pTp.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
            }
        }
    }

    private rebuildChildrenMap(tracePoints: TracePoint[]) {
        this.tracePointChildrenMap = new Map();
        for (const tp of tracePoints) {
            const parentId = tp.parentId || 'root';
            if (!this.tracePointChildrenMap.has(parentId)) {
                this.tracePointChildrenMap.set(parentId, []);
            }
            this.tracePointChildrenMap.get(parentId)!.push(tp.id);
        }
    }

    private rebuildTreeItemMap(tracePoints: TracePoint[]) {
        this.treeItemMap = new Map();
        for (const tp of tracePoints) {
            this.updateTreeItem(tp);
        }
    }
}