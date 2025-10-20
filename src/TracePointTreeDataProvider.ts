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
            const item = new vscode.TreeItem(
                `${tp.name} (${tp.fileName.split('/').pop()}: ${tp.lineNumber})`,
                tp.isValid ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None
            );
            item.id = tp.id;
            item.contextValue = 'traceable';
            item.description = tp.description ? tp.description.substring(0, 50) + '...' : '';
            item.tooltip = undefined; // Explicitly disable tooltip on hover
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
        if (!transferred || !target) return;
        const draggedIds = transferred;
        const targetId = target.id!;
        const tracePoints = this.service.getTracePoints();
        const updated = tracePoints.map(tp => {
            if (draggedIds.includes(tp.id)) {
                return { ...tp, parentId: targetId };
            }
            return tp;
        });
        await this.service.updateTracePoints(updated);
    }
}