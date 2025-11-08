import * as vscode from 'vscode';
import { TracePointService } from './TracePointService';
import { TracePoint, TracePointNode } from './domain/types';

export class TracePointTreeDataProvider implements vscode.TreeDataProvider<vscode.TreeItem>, vscode.TreeDragAndDropController<vscode.TreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<vscode.TreeItem | undefined>();
    onDidChangeTreeData = this._onDidChangeTreeData.event;
    dropMimeTypes = ['application/vnd.code.tree.codetracetree'];
    dragMimeTypes = ['application/vnd.code.tree.codetracetree'];

    constructor(private service: TracePointService) {
        this.service.addNodeListener('refresh', (nodes) => this.refresh(nodes));
    }

    getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: vscode.TreeItem): vscode.TreeItem[] {
        const treeItemMap = this.service.getTreeItemMap();
        const tracePointNodes = this.service.getTracePointNodes();
        console.log("[Test] getChildren triggered, element: ", element, "tracePoints: ", this.service.getTracePointNodes(), "treeItemMap: ", treeItemMap);
        if (element && element.id) {
            const children = this.service.getTracePointNodeById(element.id)?.children
                .flatMap(child => {
                    const item = treeItemMap.get(child.id);
                    return item ? [item] : [];
                });
            return children ?? []
        } else {
            return tracePointNodes
        }
        // return (childrenMap.get(element ? element.id! : "root") || []).map(childId => treeItemMap.get(childId)!);
    }


    // Update the tree view when the command is executed.
    private refresh(nodes: Set<TracePointNode | null> | null): void {
        const treeItemMap = this.service.getTreeItemMap();
        if (!nodes) {
            // console.log("[Test] refresh - fire triggered, changeType: ", changeType, "tracePoints: ", this.service.getTracePointNodes(), "nodes: ", nodes)
            this._onDidChangeTreeData.fire(undefined); // Full refresh
            return;
        }

        // console.log("[Test] refresh - fire triggered, changeType: ", changeType, "tracePoints: ", this.service.getTracePointNodes(), "nodes: ", nodes)
        nodes.forEach(node => {
            // console.log("[Test] refresh - treeItemMap.get(id): ", treeItemMap.get(node.id))
            this._onDidChangeTreeData.fire(node ? treeItemMap.get(node.id) : undefined);
        });
    }


    handleDrag(source: readonly vscode.TreeItem[], dataTransfer: vscode.DataTransfer): void {
        dataTransfer.set('application/vnd.code.tree.codetracetree', new vscode.DataTransferItem(source.map(item => item.id)));
    }

    async handleDrop(target: vscode.TreeItem | undefined, dataTransfer: vscode.DataTransfer): Promise<void> {
        console.log("handleDrop triggered")
        const transferred = dataTransfer.get('application/vnd.code.tree.codetracetree')?.value as string[] | undefined;
        if (!transferred) return;
        const draggedIds = transferred;
        let affectedNodes: Set<TracePointNode| null>  = new Set<TracePointNode>();

        for (const tracePointId in draggedIds) {
            const draggedTreeNode = this.service.getTreeNodeById(tracePointId)
            if (!draggedTreeNode) continue
            const draggedTracePointNode = this.service.getTracePointNodeById(tracePointId)
            if (!draggedTracePointNode) continue
            const oldParentTracePointNode = draggedTracePointNode.parentId ? this.service.getTracePointNodeById(draggedTracePointNode.parentId) : null

            // If dropping into empty space (root level), position after original parent
            if (!target) {
                if (!draggedTracePointNode.parentId) continue
                // Detach from old parent
                if (oldParentTracePointNode?.children) {
                    oldParentTracePointNode.children = oldParentTracePointNode.children.filter(
                        child => child !== draggedTracePointNode
                    );
                }
                // Attach under new parent
                const rootParentId: string | null = this.service.findRootParentId(draggedTracePointNode)
                draggedTracePointNode.parentId = undefined;
                if (rootParentId != null) this.service.addRootTracePointNextTo(draggedTracePointNode, rootParentId)
                affectedNodes.add(null)
                continue
            }
            const dropTracePointId = target.id!;
            const dropTracePointNode = this.service.getTracePointNodeById(dropTracePointId)!
            // Prevent dropping on the current parent
            if (draggedTracePointNode.parentId == dropTracePointNode?.id) continue;

            // Skip if trying to drop inside itself or its descendant
            let ancestorTracePoint: TracePointNode | null = dropTracePointNode;
            let invalid = false;
            while (ancestorTracePoint && ancestorTracePoint.parentId) {
                if (ancestorTracePoint?.id === draggedTracePointNode.id) {
                    invalid = true;
                    break;
                }
                ancestorTracePoint = this.service.getTracePointNodeById(ancestorTracePoint.parentId)
            }
            if (invalid) continue;

            // Detach from old parent
            if (oldParentTracePointNode?.children) {
                oldParentTracePointNode.children = oldParentTracePointNode.children.filter(
                    child => child !== draggedTracePointNode
                );
            }
            // Attach under new parent
            dropTracePointNode.children.push(draggedTracePointNode)
            draggedTracePointNode.parentId = dropTracePointNode.id
            affectedNodes.add(dropTracePointNode)
            affectedNodes.add(this.service.getTracePointNodeById(draggedTracePointNode.id))

        }
        // if (validate) await this.validateTracePointsOnLoad();
        this.service.applyHighlightsToAllEditors();
        this.service.notifyListeners('refresh', affectedNodes)
        this.service.saveState();
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
        const getChildrenRecursive = (id: string) => {
            const children = this.service.getTracePointNodeById(id)?.children || [];
            children.forEach(child => {
                const childItem = this.service.getTreeNodeById(child.id);
                if (childItem) {
                    allChildren.push(childItem);
                    getChildrenRecursive(child.id);
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
        const tpNodes = this.service.getTracePointNodes();
        return tpNodes.map(tp => this.service.getTreeNodeById(tp.id)!);
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
        // Find parent trace point
        const currentTp = this.service.getTracePointNodeById(element.id);
        if (!currentTp || !currentTp.parentId) return undefined;
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