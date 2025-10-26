import * as vscode from 'vscode';
import { TracePointService } from './TracePointService';
import { TracePoint } from './domain/types';

export class TracePointTreeDataProvider implements vscode.TreeDataProvider<vscode.TreeItem>, vscode.TreeDragAndDropController<vscode.TreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<vscode.TreeItem | undefined>();
    onDidChangeTreeData = this._onDidChangeTreeData.event;
    dropMimeTypes = ['application/vnd.code.tree.codetracetree'];
    dragMimeTypes = ['application/vnd.code.tree.codetracetree'];

    constructor(private service: TracePointService) {
        this.service.addListener((tracePoints, changeType, affectedIds) => this.refresh(changeType, affectedIds));
    }

    getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: vscode.TreeItem): vscode.TreeItem[] {
        const childrenMap = this.service.getTracePointChildrenMap();
        const treeItemMap = this.service.getTreeItemMap();
        console.log("[Test] getChildren triggered, element: ", element, "tracePoints: ", this.service.getTracePoints());
        return (childrenMap.get(element ? element.id! : "root") || []).map(childId => treeItemMap.get(childId)!);
    }


    // Update the tree view when the command is executed.
    private refresh(changeType?: 'add' | 'update' | 'delete' | 'select' | 'description-update' | 'all', affectedIds: string[] = []): void {
        const treeItemMap = this.service.getTreeItemMap();
        if (changeType === 'all' || !changeType) {
            console.log("[Test] refresh - fire triggered, changeType: ", changeType, "tracePoints: ", this.service.getTracePoints(), "affectedIds: ", affectedIds)
            this._onDidChangeTreeData.fire(undefined); // Full refresh
            return;
        }

        if (changeType === 'add' || changeType === 'update' || changeType === 'description-update' || changeType === 'delete') {
            console.log("[Test] refresh - fire triggered, changeType: ", changeType, "tracePoints: ", this.service.getTracePoints(), "affectedIds: ", affectedIds)
            affectedIds.forEach(id => {
                console.log("[Test] refresh - treeItemMap.get(id): ", treeItemMap.get(id))
                this._onDidChangeTreeData.fire(treeItemMap.get(id));
            });
        }
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

            await this.service.setTracePoints(updatedTracePoints);
            return;
        }

        const targetId = target.id!;

        // Prevent dropping an item onto itself
        if (draggedIds.includes(targetId)) {
            return; // Ignore the drop to avoid circular reference
        }

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

        await this.service.setTracePoints(updated);
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


    // Add these methods to the TracePointTreeDataProvider class (at the end, before the closing brace)

    async expandItemRecursively(
        treeView: vscode.TreeView<vscode.TreeItem>,
        item: vscode.TreeItem
    ): Promise<void> {
        // Expand current item
        await treeView.reveal(item, { expand: true, focus: false, select: false });

        // Get all children recursively and expand them
        const allChildren = this.getAllChildrenRecursively(item.id!);
        for (const child of allChildren) {
            await treeView.reveal(child, { expand: true, focus: false, select: false });
        }
    }

    /**
     * Get all children of an item recursively
     */
    getAllChildrenRecursively(itemId: string): vscode.TreeItem[] {
        const allChildren: vscode.TreeItem[] = [];
        const childrenMap = this.service.getTracePointChildrenMap();
        const treeItemMap = this.service.getTreeItemMap();
        const getChildrenRecursive = (id: string) => {
            const childrenIds = childrenMap.get(id) || [];
            childrenIds.forEach(childId => {
                const childItem = treeItemMap.get(childId);
                if (childItem) {
                    allChildren.push(childItem);
                    getChildrenRecursive(childId);
                }
            });
        };

        getChildrenRecursive(itemId);
        return allChildren;
    }


    /**
     * Get all root items
     */
    getRootItems(): vscode.TreeItem[] {
        const childrenMap = this.service.getTracePointChildrenMap();
        const treeItemMap = this.service.getTreeItemMap();
        return (childrenMap.get('root') || []).map(id => treeItemMap.get(id)!);
    }

    /**
     * Expand selected items and all their children recursively
     */
    async expandSelectedAndChildren(treeView: vscode.TreeView<vscode.TreeItem>): Promise<number> {
        const selected = await treeView.selection;
        if (selected.length === 0) return 0;

        let expandedCount = 0;
        for (const item of selected) {
            await this.expandItemRecursively(treeView, item);
            expandedCount++;
        }
        return expandedCount;
    }

    getParent(element: vscode.TreeItem): vscode.TreeItem | undefined {
        if (!element.id) return undefined;
        const treeItemMap = this.service.getTreeItemMap();
        const tracePointMap = this.service.getTracePointMap();
        // Find parent trace point
        const currentTp = tracePointMap.get(element.id);
        if (!currentTp || !currentTp.parentId || currentTp.parentId == "root") return undefined;
        // Return parent TreeItem
        return treeItemMap.get(currentTp.parentId);
    }


    /**
     * Collapse all items and their children recursively
     */
    async collapseAll(): Promise<void> {
        await vscode.commands.executeCommand('workbench.actions.treeView.codeTraceTree.view.collapseAll');
    }

}