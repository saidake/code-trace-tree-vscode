import * as vscode from 'vscode';
import { TracePointService, TracePoint } from './TracePointService';

export class TracePointTreeDataProvider implements vscode.TreeDataProvider<vscode.TreeItem>, vscode.TreeDragAndDropController<vscode.TreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<vscode.TreeItem | undefined>();
    onDidChangeTreeData = this._onDidChangeTreeData.event;
    dropMimeTypes = ['application/vnd.code.tree.codetracetree'];
    dragMimeTypes = ['application/vnd.code.tree.codetracetree'];
    private treeItems: Map<string, vscode.TreeItem> = new Map();
    private childrenMap: Map<string, string[]> = new Map();

    constructor(private service: TracePointService) {
        this.service.addListener((tracePoints, expandedIds) => this.refresh());
    }

    getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: vscode.TreeItem): vscode.TreeItem[] {
        if (!element) {
            return this.buildTree();
        }
        const id = element.id!;
        return (this.childrenMap.get(id) || []).map(childId => this.treeItems.get(childId)!);
    }

    private buildTree(): vscode.TreeItem[] {
        this.treeItems.clear();
        this.childrenMap.clear();
        const tracePoints = this.service.getTracePoints();
        tracePoints.forEach(tp => {
            // Check if the trace point has children
            const hasChildren = tracePoints.some(child => child.parentId === tp.id);
            const item = new vscode.TreeItem(
                `${tp.name || ''} (${tp.fileName.split('/').pop()}: ${tp.lineNumber})`,
                tp.isValid && hasChildren ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None
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
            this.treeItems.set(tp.id, item);
            const parentId = tp.parentId || 'root';
            if (!this.childrenMap.has(parentId)) this.childrenMap.set(parentId, []);
            this.childrenMap.get(parentId)!.push(tp.id);
        });
        return (this.childrenMap.get('root') || []).map(id => this.treeItems.get(id)!);
    }

    refresh(): void {
        this._onDidChangeTreeData.fire(undefined); // refreshes entire tree
    }

    handleDrag(source: readonly vscode.TreeItem[], dataTransfer: vscode.DataTransfer): void {
        dataTransfer.set('application/vnd.code.tree.codetracetree', new vscode.DataTransferItem(source.map(item => item.id)));
    }

    async handleDrop(target: vscode.TreeItem | undefined, dataTransfer: vscode.DataTransfer): Promise<void> {
        const transferred = dataTransfer.get('application/vnd.code.tree.codetracetree')?.value as string[] | undefined;
        if (!transferred) return;

        const draggedIds = transferred;
        const tracePoints = this.service.getTracePoints();

        // If dropping into empty space (root level), position after original parent
        if (!target) {
            const updatedTracePoints = [];
            const rootTracePoints = tracePoints.filter(tp => !tp.parentId);
            const nonRootTracePoints = tracePoints.filter(tp => tp.parentId);

            // Build new root list, placing dragged items after their original parents
            const processedIds = new Set<string>();
            for (const tp of rootTracePoints) {
                updatedTracePoints.push(tp);
                processedIds.add(tp.id);
                if (draggedIds.includes(tp.id)) {
                    // If the root item itself is dragged, it stays in place
                    continue;
                }
                // Add any dragged children of this parent
                const draggedChildren = nonRootTracePoints.filter(child => child.parentId === tp.id && draggedIds.includes(child.id));
                for (const child of draggedChildren) {
                    updatedTracePoints.push({ ...child, parentId: undefined });
                    processedIds.add(child.id);
                }
            }
            // Add remaining non-dragged root items and non-dragged non-root items
            for (const tp of tracePoints) {
                if (!processedIds.has(tp.id)) {
                    updatedTracePoints.push(draggedIds.includes(tp.id) ? { ...tp, parentId: undefined } : tp);
                }
            }

            await this.service.updateTracePoints(updatedTracePoints);
            return;
        }

        const targetId = target.id!;

        // Check if any dragged item is an ancestor of the target
        const isDescendantDrop = draggedIds.some(draggedId => this.isAncestor(draggedId, targetId, tracePoints));
        if (isDescendantDrop) {
            // Do nothing if dropping into a descendant
            return;
        }

        // Update parentId for valid drops
        const updated = tracePoints.map(tp => {
            if (draggedIds.includes(tp.id)) {
                return { ...tp, parentId: targetId };
            }
            return tp;
        });

        await this.service.updateTracePoints(updated);
    }

    private isAncestor(parentId: string, targetId: string, tracePoints: TracePoint[]): boolean {
        // If targetId is not in tracePoints, it can't be a descendant
        const target = tracePoints.find(tp => tp.id === targetId);
        if (!target) return false;

        // Traverse up the parent chain from targetId
        let currentId = target.parentId;
        while (currentId) {
            if (currentId === parentId) return true;
            const current = tracePoints.find(tp => tp.id === currentId);
            currentId = current?.parentId;
        }
        return false;
    }
}