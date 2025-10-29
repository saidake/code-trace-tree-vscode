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
        console.log("[TEST] loadState triggered")
        try {
            const state = this.context.workspaceState.get<TracePointState>(CODE_TRACE_TREE_STATE_KEY);
            if (state) {
                // state.tracePoints = [];
                // state.selectedTracePointIds = [];
                // state.expandedTracePointIds = [];

                this.tracePoints = state.tracePoints || [];
                this.selectedTracePointIds = new Set(state.selectedTracePointIds || []);
                this.expandedTracePointIds = new Set(state.expandedTracePointIds || []);



                this._highlightingEnabled = state.highlightingEnabled;

                await this.validateTracePointsOnLoad();
                this.updateTracePointMap();
                this.rebuildChildrenMap();
                this.rebuildTreeItemMap();

                this.applyHighlightsToAllEditors();
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
            projectPath: vscode.workspace.workspaceFolders?.[0].uri.fsPath || '',
            lineContent,
            isValid: true,
            totalOccurrences: totalOccurrences,
            occurrenceIndex,
            description, // Defaults to empty string
        };
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
            this.updateTreeItem(tp);
            this.notifyListeners('update', [this.getTracePointParentIdById(id)]);
            this.saveState();
        }
    }

    async renameTracePoint(id: string, newName: string) {
        const tp = this.getTracePointById(id);
        if (tp) {
            tp.name = newName;
            this.updateTreeItem(tp);
            console.log("[TEST] renameTracePoint, tp: ", tp, " newName: ", newName)
            this.notifyListeners('update', [this.getTracePointParentIdById(id)]);
            this.saveState();
        }
    }

    updateTracePointMap() {
        this.tracePointMap = new Map(this.tracePoints.map(tp => [tp.id, tp]));
    }

    async setTracePoints(newTracePoints: TracePoint[]) {
        this.tracePoints = newTracePoints;
        this.updateTracePointMap();
    }

    async saveTracePoints(newTracePoints: TracePoint[], validate: boolean = false) {
        this.tracePoints = newTracePoints;
        if (validate) await this.validateTracePointsOnLoad();
        this.updateTracePointMap();
        this.rebuildChildrenMap();
        this.rebuildTreeItemMap();

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
        const affectedTracePoints: TracePoint[] = this.tracePoints.filter(tp => tp.filePath === filePath);
        if (affectedTracePoints.length === 0) return;

        const newLines = event.document.getText().split(/\r?\n/);

        // VSCode may include multiple content changes in a single event.
        // For now, handle the first major change (extendable later).
        const change = event.contentChanges[0];
        if (!change) return;

        const oldLines = change.range.end.line - change.range.start.line;
        const newLinesCount = change.text.split(/\r?\n/).length - 1;
        const lineOffset = newLinesCount - oldLines;
        const changedLine = change.range.start.line + 1;

        // console.log(`lineOffset: ${lineOffset}, changedLine: ${changedLine}`);
        // console.log(`oldLines: ${oldLines}, newLinesCount: ${newLinesCount}`);

        const updatedTracePoints: TracePoint[] = this.tracePoints.map(tp => {
            if (tp.filePath !== filePath) return tp;
            // Revalidate invalid line
            if (!tp.isValid) {
                tp.isValid = newLines[tp.lineNumber - 1] === tp.lineContent;
                return tp;
            }
            // CASE 1: The edited line is the same as the trace point line,
            // and lines were added or removed (lineOffset > 0)
            if (tp.lineNumber === changedLine && lineOffset > 0) {
                const newLineNumber = tp.lineNumber + lineOffset;
                const newContent = newLineNumber <= newLines.length ? newLines[newLineNumber - 1].trim() : null;
                // Update occurrence.
                const [totalOccurrences, matchingLines] = this.getLineOccurrences(event.document, newContent ?? '');
                const newOccurrenceIndex =
                    newContent === tp.lineContent
                        ? tp.occurrenceIndex
                        : matchingLines.indexOf(newLineNumber) + 1;

                return {
                    ...tp,
                    lineNumber: newLineNumber,
                    lineContent: newContent ?? '',
                    isValid: tp.isValid,
                    totalOccurrences,
                    occurrenceIndex: newOccurrenceIndex,
                };
            }

            // CASE 2: The edited line is the same as the trace point line,
            // but no lines were added or removed (only text content changed)
            else if (tp.lineNumber === changedLine && lineOffset === 0) {
                const newContent = newLines[changedLine - 1]?.trim() ?? null;
                // Update occurrence.
                const [totalOccurrences, matchingLines] = this.getLineOccurrences(event.document, newContent ?? '');
                const newOccurrenceIndex =
                    newContent === tp.lineContent
                        ? tp.occurrenceIndex
                        : matchingLines.indexOf(changedLine) + 1;

                return {
                    ...tp,
                    lineContent: newContent ?? '',
                    isValid: tp.isValid,
                    totalOccurrences,
                    occurrenceIndex: newOccurrenceIndex,
                };
            }

            // CASE 3: The edited line is above the trace point line,
            // and lines were added or removed (shift line numbers)
            else if (tp.lineNumber > changedLine && lineOffset !== 0) {
                const newLineNumber = Math.max(1, tp.lineNumber + lineOffset);
                const newContent = newLineNumber <= newLines.length ? newLines[newLineNumber - 1].trim() : null;
                // Update occurrence.
                const [totalOccurrences, matchingLines] = this.getLineOccurrences(event.document, newContent ?? '');
                const newOccurrenceIndex =
                    newContent === tp.lineContent
                        ? tp.occurrenceIndex
                        : matchingLines.indexOf(newLineNumber) + 1;

                return {
                    ...tp,
                    lineNumber: newLineNumber,
                    lineContent: newContent ?? '',
                    isValid: tp.isValid,
                    totalOccurrences,
                    occurrenceIndex: newOccurrenceIndex,
                };
            }

            // CASE 4: No change relevant to this trace point
            return tp;
        });

        // Update internal states
        this.tracePoints = updatedTracePoints;
        this.updateTracePointMap();
        this.rebuildChildrenMap();
        this.rebuildTreeItemMap();

        // Re-highlight updated trace points in the file
        this.highlightTracePointsInFile(event.document);

        // Notify listeners to refresh affected UI parts
        const parentIdsToUpdate = affectedTracePoints.map(tp => tp.parentId ?? 'root');
        if (parentIdsToUpdate.includes('root')) {
            this.notifyListeners('update', ['root']);
        } else {
            this.notifyListeners('update', parentIdsToUpdate);
        }

        // Persist changes
        this.saveState();
    }


    /**
     * Update tracePoints and tracePointMap
     */
    async validateTracePointsOnLoad() {
        console.log("validateTracePointsOnLoad triggered");
        const updatedTracePoints = await Promise.all(this.tracePoints.map(async (tracePoint) => {
            // Invalidate trace points with empty or missing required fields
            if (!tracePoint.id || !tracePoint.filePath || !tracePoint.projectPath || tracePoint.lineContent == null) {
                return { ...tracePoint, isValid: false, totalOccurrences: 0, occurrenceIndex: 0 };
            }

            // Try to locate the file
            const fileUri = vscode.Uri.file(path.join(tracePoint.projectPath, tracePoint.filePath));
            let document: vscode.TextDocument;
            try {
                document = await vscode.workspace.openTextDocument(fileUri);
            } catch {
                // File not found
                return { ...tracePoint, isValid: false, totalOccurrences: 0, occurrenceIndex: 0 };
            }

            // Invalid line number (out of range)
            if (tracePoint.lineNumber > document.lineCount) {
                return { ...tracePoint, isValid: false, totalOccurrences: 0, occurrenceIndex: 0 };
            }

            // Check if current line content matches the stored one
            const currentLineContent = document.lineAt(tracePoint.lineNumber - 1).text.trim();
            if (currentLineContent === tracePoint.lineContent.trim()) {
                // Line still matches, keep it as valid
                return { ...tracePoint, isValid: true };
            }

            // Content does not match at the original lineNumber, search the file for occurrences
            const [totalOccurrences, matchingLines] = this.getLineOccurrences(document, tracePoint.lineContent);
            console.log(`occurrence doesn't match: tracePoint.lineContent: ${tracePoint.lineContent} totalOccurrences: ${totalOccurrences}, matchingLines: ${matchingLines}, tracePoint.totalOccurrences: ${tracePoint.totalOccurrences}, tracePoint.occurrenceIndex: ${tracePoint.occurrenceIndex}`);

            // If the total occurrences count is the same and occurrenceIndex is still valid, update the line number
            if (totalOccurrences === tracePoint.totalOccurrences && tracePoint.occurrenceIndex >= 1 && tracePoint.occurrenceIndex <= totalOccurrences) {
                const newLineNumber = matchingLines[tracePoint.occurrenceIndex - 1];
                return {
                    ...tracePoint,
                    lineNumber: newLineNumber,
                    totalOccurrences,
                    occurrenceIndex: tracePoint.occurrenceIndex,
                    isValid: true,
                };
            } else {
                // Otherwise mark as invalid if mismatch or index is out of range
                return {
                    ...tracePoint,
                    isValid: false,
                    totalOccurrences,
                    occurrenceIndex: 0,
                };
            }
        }));

        // Replace current trace points with updated ones
        this.tracePoints = updatedTracePoints;
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

        if (!tp.isValid) {
            item.iconPath = new vscode.ThemeIcon('circle-slash', new vscode.ThemeColor('disabledForeground'));
            item.tooltip = 'This trace point is invalid or outdated.';
        } else {
            item.iconPath = undefined;
            item.tooltip = undefined;
        }


        this.treeItemMap.set(tp.id, item);
        if (tp.parentId) {
            const pTp = this.treeItemMap.get(tp.parentId);
            if (pTp) {
                pTp.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
            }
        }
    }

    private rebuildChildrenMap() {
        this.tracePointChildrenMap = new Map();
        for (const tp of this.tracePoints) {
            const parentId = tp.parentId || 'root';
            if (!this.tracePointChildrenMap.has(parentId)) {
                this.tracePointChildrenMap.set(parentId, []);
            }
            this.tracePointChildrenMap.get(parentId)!.push(tp.id);
        }
    }

    private rebuildTreeItemMap() {
        this.treeItemMap = new Map();
        for (const tp of this.tracePoints) {
            this.updateTreeItem(tp);
        }
    }
}