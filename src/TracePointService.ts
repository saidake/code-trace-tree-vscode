// src/TracePointService.ts

import * as vscode from 'vscode';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { parseXml, serializeXml } from './utils/xmlUtils';
import { CODE_TRACE_TREE_STATE_KEY } from './domain/constants';
import { NodeListener, NodeListenerEventType, TracePoint, TracePointNode, TracePointState } from './domain/types';



export class TracePointService {
    private static instance: TracePointService;

    private tracePointNodes: TracePointNode[] = [];
    private nodeMap: Map<string, TracePointNode> = new Map();

    private treeNodeMap: Map<string, vscode.TreeItem> = new Map();
    private listenersMap: Map<NodeListenerEventType, NodeListener[]> = new Map();
    private fileNodesMap: Map<string, TracePointNode[]> = new Map();  // filePath


    private selectedTracePointIds: Set<string> = new Set();
    private expandedTracePointIds: Set<string> = new Set();
    private highlighters: Map<string, vscode.TextEditorDecorationType> = new Map(); // Key: fileUri
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
                tracePointNodes: [],
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
                // state.tracePointNodes = [];
                // state.selectedTracePointIds = [];
                // state.expandedTracePointIds = [];

                this.tracePointNodes = state.tracePointNodes || [];
                this.selectedTracePointIds = new Set(state.selectedTracePointIds || []);
                this.expandedTracePointIds = new Set(state.expandedTracePointIds || []);



                this._highlightingEnabled = state.highlightingEnabled;

                await this.validateTracePointsOnLoad();
                this.updateTracePointMap();
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
            tracePointNodes: this.tracePointNodes,
            selectedTracePointIds: Array.from(this.selectedTracePointIds),
            expandedTracePointIds: Array.from(this.expandedTracePointIds),
            highlightingEnabled: this._highlightingEnabled ?? true,
        };
        await this.context.workspaceState.update(CODE_TRACE_TREE_STATE_KEY, state);
    }

    getTracePointNodes(): TracePointNode[] {
        return this.tracePointNodes;
    }

    isTracePointSelected(id: string): boolean {
        return this.selectedTracePointIds.has(id);
    }

    selectTracePoints(ids: string[]) {
        this.selectedTracePointIds = new Set(ids);
        this.notifyListeners('update-description', null);
        this.saveState();
    }


    getExpandedTracePointIds(): Set<string> {
        return this.expandedTracePointIds;
    }


    getTracePointNodeById(id?: string): TracePointNode | null {
        if (!id) return null
        return this.nodeMap.get(id) ?? null;
    }

    getTracePointSiblingsByParentId(parentId?: string): TracePointNode[] {
        if (!parentId) {
            return this.tracePointNodes;
        }
        const parentNode = this.getTracePointNodeById(parentId);
        if (!parentNode) {
            return [];
        }
        return parentNode.children;
    }

    getTreeItemMap(): Map<string, vscode.TreeItem> {
        return this.treeNodeMap;
    }

    getTreeNodeById(id: string): vscode.TreeItem | undefined {
        return this.treeNodeMap.get(id);
    }
    getTraceNodesByFilePath(filePath: string): TracePointNode[] | undefined {
        return this.fileNodesMap.get(filePath);
    }

    addRootTracePointNextTo(tracePoint: TracePointNode, id: string) {
        if (tracePoint.parentId !== null && tracePoint.parentId !== undefined) return;

        const index = this.tracePointNodes.findIndex(tp => tp.id === id);
        if (index !== -1) {
            this.tracePointNodes.splice(index + 1, 0, tracePoint);
        } else {
            this.tracePointNodes.push(tracePoint);
        }
    }

    findRootParentId(node: TracePointNode): string | null {
        let tempNode: TracePointNode | null = node;
        let rootParentId: string | null = null;

        while (tempNode) {
            rootParentId = tempNode.id;
            if (tempNode.parentId == null) {
                break;
            }
            tempNode = this.getTracePointNodeById(tempNode.parentId)!;
        }

        return rootParentId;
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

    addNodeListener(eventType: NodeListenerEventType, listener: NodeListener) {
        const existing = this.listenersMap.get(eventType);
        if (existing) {
            existing.push(listener);
        } else {
            this.listenersMap.set(eventType, [listener]);
        }
    }



    notifyListeners(eventType: NodeListenerEventType = 'refresh', nodes: Set<TracePointNode | null> | null = null) {
        this.listenersMap.get(eventType)?.forEach(listener => listener(nodes));
    }


    async addTracePoint(name: string, file: vscode.Uri, lineNumber: number, parentId?: string, description = '') {
        const document = await vscode.workspace.openTextDocument(file);
        const lineContent = document.lineAt(lineNumber - 1).text.trim();
        const [totalOccurrences, matchingLines] = this.getLineOccurrences(document, lineContent);
        const occurrenceIndex = matchingLines.indexOf(lineNumber) + 1;

        const filePath = vscode.workspace.asRelativePath(file);
        const fileName = path.basename(filePath);
        const tracePoint: TracePoint = {
            name,
            filePath,
            fileName,
            lineNumber,
            projectPath: vscode.workspace.workspaceFolders?.[0].uri.fsPath || '',
            lineContent,
            isValid: true,
            totalOccurrences: totalOccurrences,
            occurrenceIndex,
            description, // Defaults to empty string
        };
        const newNode: TracePointNode = {
            id: uuidv4(),
            tracePoint,
            parentId,
            children: []
        };
        if (!parentId) {
            this.tracePointNodes.push(newNode);
        } else {
            const parentNode = this.nodeMap.get(parentId);
            if (parentNode?.children?.push(newNode)) {
                newNode.parentId = parentNode.id;
            }
        }
        this.nodeMap.set(newNode.id, newNode);

        this.updateTreeItem(newNode);
        if (!this.fileNodesMap.has(newNode.tracePoint.filePath)) {
            this.fileNodesMap.set(newNode.tracePoint.filePath, []);
        }
        this.fileNodesMap.get(newNode.tracePoint.filePath)!.push(newNode);
        this.highlightTracePointsInFile(document);


        if (!parentId) {
            this.notifyListeners()
        } else {
            const parentNode = this.nodeMap.get(parentId);
            if (parentNode) {
                this.notifyListeners('refresh', new Set<TracePointNode | null>([parentNode]))
            }
        }
        this.saveState();
    }


    getTracePointParentById(id?: string): TracePointNode | null {
        if (!id) return null
        const parentId = this.nodeMap.get(id)?.parentId
        return parentId ? this.getTracePointNodeById(parentId) ?? null : null
    }

    async updateTracePointDescription(id: string, newDescription: string) {
        const tp = this.getTracePointNodeById(id);
        if (tp) {
            tp.tracePoint.description = newDescription;
            this.updateTreeItem(tp);
            this.notifyListeners('update-description', null);
            const parentNode = this.getTracePointParentById(id)
            this.notifyListeners('refresh', new Set<TracePointNode | null>([parentNode]))
            this.saveState();
        }
    }

    async renameTracePoint(id: string, newName: string) {
        const tp = this.getTracePointNodeById(id);
        if (tp) {
            tp.tracePoint.name = newName;
            this.updateTreeItem(tp);
            const parentNode = this.getTracePointParentById(id)
            console.log("[TEST] renameTracePoint, tp: ", tp, " newName: ", newName)
            this.notifyListeners('refresh', new Set<TracePointNode | null>([parentNode]))
            this.saveState();
        }
    }

    updateTracePointMap() {
        this.nodeMap = new Map(this.tracePointNodes.map(tp => [tp.id, tp]));
    }

    async setTracePoints(newTracePoints: TracePointNode[]) {
        this.tracePointNodes = newTracePoints;
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
        if (this.fileNodesMap.has(vscode.workspace.asRelativePath(document.uri))) {
            this.highlightTracePointsInFile(document);
        }
    }

    async highlightTracePointsInFile(document: vscode.TextDocument) {
        if (!this.isHighlightingEnabled()) return;
        console.log("highlightTracePointsInFile triggered")
        const filePath = vscode.workspace.asRelativePath(document.uri);
        const relevantTracePoints = this.fileNodesMap.get(filePath)?.filter(tp => tp.tracePoint.isValid) ?? [];
        console.log("relevantTracePoints: ", relevantTracePoints)

        this.removeHighlights(document.uri.fsPath);

        const decorationType = vscode.window.createTextEditorDecorationType({
            backgroundColor: new vscode.ThemeColor('editor.findMatchBackground'),
            isWholeLine: true,
        });

        const ranges: vscode.Range[] = [];
        relevantTracePoints.forEach(tp => {
            if (tp.tracePoint.lineNumber <= document.lineCount) {
                const line = document.lineAt(tp.tracePoint.lineNumber - 1);
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

    applyHighlightsToAllEditors() {
        console.log("applyHighlightsToAllEditors triggered")
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
        const affectedTracePoints: TracePointNode[] = this.getTraceNodesByFilePath(filePath)!;
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
        const updatedNodes: TracePointNode[] = [];
        let affectedParentNodes: Set<TracePointNode | null> = new Set<TracePointNode | null>();

        // console.log(`lineOffset: ${lineOffset}, changedLine: ${changedLine}`);
        // console.log(`oldLines: ${oldLines}, newLinesCount: ${newLinesCount}`);
        for (const node of affectedTracePoints) {
            const tp = node.
            tracePoint
            if (!tp.isValid) {
                const valid = newLines[tp.lineNumber - 1]?.trim() === tp.lineContent?.trim();
                if (valid) {
                    node.tracePoint = { ...tp, isValid: true };
                    updatedNodes.push(node);
                    affectedParentNodes.add(this.getTracePointNodeById(node.parentId))
                }
                continue;
            }
            const newContent = newLines[tp.lineNumber - 1]?.trim() ?? null;
            const isLineStart = change.range.start.character === 0;
            const isEnter = /\r?\n/.test(change.text);
            // CASE 1: Press Enter at the beginning of the line (lineOffset !== 0)
            if (tp.lineNumber === changedLine && isEnter && lineOffset > 0 && isLineStart) {
                const newLineNumber = tp.lineNumber + lineOffset;
                const newLineContent = newLines[newLineNumber - 1]?.trim() ?? null;
                const [total, matches] = this.getLineOccurrences(event.document, newLineContent ?? '');
                const occIdx = newLineContent === tp.lineContent ? tp.occurrenceIndex : matches.indexOf(newLineNumber) + 1;

                node.tracePoint = {
                    ...tp,
                    lineNumber: newLineNumber,
                    lineContent: newLineContent ?? '',
                    isValid: !!newLineContent,
                    totalOccurrences: total,
                    occurrenceIndex: occIdx >= 0 ? occIdx : 0
                };
                updatedNodes.push(node);
                affectedParentNodes.add(this.getTracePointNodeById(node.parentId))

            }
            // CASE 2: Edit on the trace point line (lineOffset = 0)
            else if (tp.lineNumber === changedLine && lineOffset === 0) {
                const [total, matches] = this.getLineOccurrences(event.document, newContent ?? '');
                const occIdx = newContent === tp.lineContent ? tp.occurrenceIndex : matches.indexOf(changedLine) + 1;

                node.tracePoint = {
                    ...tp,
                    lineContent: newContent ?? '',
                    isValid: !!newContent,
                    totalOccurrences: total,
                    occurrenceIndex: occIdx >= 0 ? occIdx : 0
                };
                updatedNodes.push(node);
                affectedParentNodes.add(this.getTracePointNodeById(node.parentId))

            }

            // CASE 3: Edit above the trace point line (shift line numbers)
            else if (tp.lineNumber > changedLine && lineOffset !== 0) {
                const newLineNumber = Math.max(1, tp.lineNumber + lineOffset);
                const newLineContent = newLines[newLineNumber - 1]?.trim() ?? null;
                const [total, matches] = this.getLineOccurrences(event.document, newLineContent ?? '');
                const occIdx = newLineContent === tp.lineContent ? tp.occurrenceIndex : matches.indexOf(newLineNumber) + 1;

                node.tracePoint = {
                    ...tp,
                    lineNumber: newLineNumber,
                    lineContent: newLineContent ?? '',
                    isValid: !!newLineContent,
                    totalOccurrences: total,
                    occurrenceIndex: occIdx >= 0 ? occIdx : 0
                };
                updatedNodes.push(node);
                affectedParentNodes.add(this.getTracePointNodeById(node.parentId))

            }
        }
        // Update internal states
        // this.rebuildTreeItemMap(updatedNodes);
        updatedNodes.forEach(item => {
            this.updateTreeItem(item)
        })
        // Re-highlight updated trace points in the file
        this.highlightTracePointsInFile(event.document);
        // Notify listeners to refresh affected UI parts
        this.notifyListeners('refresh', affectedParentNodes);
        // Persist changes
        this.saveState();
    }


    /**
     * Update tracePoints and tracePointMap
     */
    /**
     * Recursively validate tracePoints and update tracePointMap
     */
    async validateTracePointsOnLoad(nodes: TracePointNode[] = this.tracePointNodes): Promise<void> {
        console.log("validateTracePointsOnLoad triggered");

        const validateNode = async (node: TracePointNode): Promise<void> => {
            const tracePoint = node.tracePoint;

            // Invalidate trace points with empty or missing required fields
            if (!node.id || !tracePoint.filePath || !tracePoint.projectPath || tracePoint.lineContent == null) {
                node.tracePoint = { ...tracePoint, isValid: false, totalOccurrences: 0, occurrenceIndex: 0 };
            } else {
                // Try to locate the file
                const fileUri = vscode.Uri.file(path.join(tracePoint.projectPath, tracePoint.filePath));
                let document: vscode.TextDocument | undefined;
                try {
                    document = await vscode.workspace.openTextDocument(fileUri);
                } catch {
                    // File not found
                    node.tracePoint = { ...tracePoint, isValid: false, totalOccurrences: 0, occurrenceIndex: 0 };
                }

                if (document) {
                    // Invalid line number (out of range)
                    if (tracePoint.lineNumber > document.lineCount) {
                        node.tracePoint = { ...tracePoint, isValid: false, totalOccurrences: 0, occurrenceIndex: 0 };
                    } else {
                        // Check if current line content matches the stored one
                        const currentLineContent = document.lineAt(tracePoint.lineNumber - 1).text.trim();
                        if (currentLineContent === tracePoint.lineContent.trim()) {
                            // Line still matches, keep it as valid
                            node.tracePoint = { ...tracePoint, isValid: true };
                        } else {
                            // Content does not match at the original lineNumber, search the file for occurrences
                            const [totalOccurrences, matchingLines] = this.getLineOccurrences(document, tracePoint.lineContent);
                            console.log(
                                `occurrence doesn't match: tracePoint.lineContent: ${tracePoint.lineContent} 
                                totalOccurrences: ${totalOccurrences}, matchingLines: ${matchingLines}, 
                                tracePoint.totalOccurrences: ${tracePoint.totalOccurrences}, tracePoint.occurrenceIndex: ${tracePoint.occurrenceIndex}`
                            );

                            // If the total occurrences count is the same and occurrenceIndex is still valid, update the line number
                            if (
                                totalOccurrences === tracePoint.totalOccurrences &&
                                tracePoint.occurrenceIndex >= 1 &&
                                tracePoint.occurrenceIndex <= totalOccurrences
                            ) {
                                const newLineNumber = matchingLines[tracePoint.occurrenceIndex - 1];
                                node.tracePoint = {
                                    ...tracePoint,
                                    lineNumber: newLineNumber,
                                    totalOccurrences,
                                    occurrenceIndex: tracePoint.occurrenceIndex,
                                    isValid: true,
                                };
                            } else {
                                // Otherwise mark as invalid if mismatch or index is out of range
                                node.tracePoint = {
                                    ...tracePoint,
                                    isValid: false,
                                    totalOccurrences,
                                    occurrenceIndex: 0,
                                };
                            }
                        }
                    }
                }
            }

            // Recursively validate children
            if (node.children && node.children.length > 0) {
                for (const child of node.children) {
                    await validateNode(child);
                }
            }
        };

        // Validate all top-level nodes
        for (const node of nodes) {
            await validateNode(node);
        }
    }



    async navigateToTracePoint(tracePointNode: TracePointNode, treeView: vscode.TreeView<vscode.TreeItem>) {
        const tp = tracePointNode.tracePoint
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
        const affectedParentNodes = new Set<TracePointNode | null>();

        // Check if the item to be deleted has any children.
        const collectChildren = (id: string) => {
            const node = this.getTracePointNodeById(id)
            affectedParentNodes.add(this.getTracePointNodeById(node?.parentId))
            if (node) {
                if (node.tracePoint.filePath) {
                    const arr = this.fileNodesMap.get(node.tracePoint.filePath);
                    if (arr) {
                        this.fileNodesMap.set(
                            node.tracePoint.filePath,
                            arr.filter(n => n.id !== node.id)
                        );
                    }
                }
                for (const child of node.children) {
                    allIdsToDelete.add(child.id);
                    collectChildren(child.id);
                }
            }
        };
        ids.forEach(id => collectChildren(id));

        // Recursive in-place delete function
        const deleteNodeRecursively = (nodes: TracePointNode[]): void => {
            // We must mutate `nodes` array in place (splice)
            for (let i = nodes.length - 1; i >= 0; i--) {
                const node = nodes[i];
                // If node is in delete set, remove it from the array
                if (allIdsToDelete.has(node.id)) {
                    nodes.splice(i, 1);
                    continue;
                }
                deleteNodeRecursively(node.children);
            }
        };
        // Apply directly to root
        deleteNodeRecursively(this.tracePointNodes);


        allIdsToDelete.forEach(id => {
            this.selectedTracePointIds.delete(id);
            this.expandedTracePointIds.delete(id);
            this.nodeMap.delete(id);
            this.treeNodeMap.delete(id);
        });

        this.applyHighlightsToAllEditors();
        for (const affectedParentNode of affectedParentNodes) {
            this.expandTreeItem(affectedParentNode)
        }
        this.notifyListeners('refresh', affectedParentNodes);
        await this.saveState();
    }


    expandTreeItem(tracePointNode: TracePointNode | null) {
        if (!tracePointNode) return
        const treeNode = this.getTreeNodeById(tracePointNode.id)
        if (!treeNode) return
        let collapsibleState = vscode.TreeItemCollapsibleState.None;
        const hasChildren = tracePointNode.children.length > 0;
        if (hasChildren) {
            collapsibleState = vscode.TreeItemCollapsibleState.Expanded
            this.expandedTracePointIds.add(tracePointNode.id)
        }
        treeNode.collapsibleState = collapsibleState
    }

    updateTreeItem(tracePointNode: TracePointNode) {
        console.log("updateTreeItem triggered, expandedTracePointIds: ", this.expandedTracePointIds, " tracePointNode.id: ", tracePointNode.id)
        // Determine collapsible state based on expandedIds
        let collapsibleState = vscode.TreeItemCollapsibleState.None;
        const hasChildren = tracePointNode.children.length > 0;
        if (hasChildren) {
            collapsibleState = this.expandedTracePointIds.has(tracePointNode.id)
                ? vscode.TreeItemCollapsibleState.Expanded
                : vscode.TreeItemCollapsibleState.Collapsed;
        }
        const tracePoint = tracePointNode.tracePoint
        const prevItem = this.treeNodeMap.get(tracePointNode.id);
        if (prevItem) {
            prevItem.collapsibleState = collapsibleState
            prevItem.label = `${tracePoint.name || ''} (${tracePoint.fileName}: ${tracePoint.lineNumber})`
        }
        const item = prevItem ? prevItem : new vscode.TreeItem(
            `${tracePoint.name || ''} (${tracePoint.fileName}: ${tracePoint.lineNumber})`,
            collapsibleState
        );
        item.id = tracePointNode.id;
        item.contextValue = 'traceable';
        item.description = tracePoint.description
            ? tracePoint.description.length > 50
                ? tracePoint.description.substring(0, 50) + '...'
                : tracePoint.description
            : '';
        item.tooltip = undefined; // Explicitly disable tooltip on hover
        item.command = {
            command: 'codeTraceTree.goToTracePoint',
            title: 'Go to Trace Point',
            arguments: [item]
        };

        if (!tracePoint.isValid) {
            item.iconPath = new vscode.ThemeIcon('circle-slash', new vscode.ThemeColor('disabledForeground'));
            item.tooltip = 'This trace point is invalid or outdated.';
        } else {
            item.iconPath = undefined;
            item.tooltip = undefined;
        }


        this.treeNodeMap.set(tracePointNode.id, item);
        if (tracePointNode.parentId) {
            const pTp = this.treeNodeMap.get(tracePointNode.parentId);
            if (pTp) {
                pTp.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
                if (pTp.id) this.expandedTracePointIds.add(pTp.id)
            }
        }
    }


    rebuildTreeItemMap(tracePointNodes?: TracePointNode[]) {
        if (!tracePointNodes) tracePointNodes = this.tracePointNodes
        this.treeNodeMap = new Map();
        for (const tp of tracePointNodes) {
            this.updateTreeItem(tp);
        }
    }

    removeRootTracePoint(tpNode: TracePointNode): boolean {
        const index = this.tracePointNodes.findIndex(node => node.id === tpNode.id);
        if (index !== -1) {
            this.tracePointNodes.splice(index, 1);
            return true;
        }
        return false;
    }

}