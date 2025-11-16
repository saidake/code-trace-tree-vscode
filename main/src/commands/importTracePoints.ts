import { XMLParser } from 'fast-xml-parser'
import * as vscode from 'vscode'
import { TracePointService } from '../TracePointService'
import { TracePointTreeDataProvider } from '../TracePointTreeDataProvider'
import { parseXml } from '../utils/xmlUtils'
import { TracePoint, TracePointExportState, TracePointNodeExport } from '../domain/types'
/**
 * Recursively convert imported TracePointNodeExport to TracePointNode,
 * updating project path and preserving children structure.
 */
const convertTracePoint = (tp: any, currentProjectPath: string): TracePoint => ({
  name: tp.name,
  fileName: tp.fileName,
  filePath: tp.filePath,
  lineNumber: Number(tp.lineNumber),
  projectPath: currentProjectPath,
  lineContent: tp.lineContent,
  isValid: tp.isValid === 'true' || tp.isValid === true,
  totalOccurrences: Number(tp.totalOccurrences),
  occurrenceIndex: Number(tp.occurrenceIndex),
  description: tp.description
})
/**
 * Registers the command to import trace points from an XML file.
 * The imported nodes are integrated into the current workspace project.
 */
export function registerImportTracePoints(
  context: vscode.ExtensionContext,
  service: TracePointService,
  treeDataProvider: TracePointTreeDataProvider
) {
  context.subscriptions.push(
    vscode.commands.registerCommand('codeTraceTree.importTracePoints', async () => {
      // Prompt user to select an XML file
      const uri = await vscode.window.showOpenDialog({
        canSelectMany: false,
        filters: { XML: ['xml'] }
      })
      if (!uri?.[0]) return

      // Extract state
      const data = await vscode.workspace.fs.readFile(uri[0])
      const xml = new TextDecoder().decode(data)
      const parsed: TracePointExportState = parseXml(xml)
      const state = parsed.tracePointState
      const tracePointsArray: TracePointNodeExport[] = state.tracePointNodes.tracePointNode ?? []
      const currentProjectPath = vscode.workspace.workspaceFolders?.[0].uri.fsPath || ''

      /**
       * Recursively convert imported TracePointNodeExport to TracePointNode,
       * updating the project path and maintaining children structure.
       */
      const convertNode = (nodeExport: TracePointNodeExport): any => {
        // Normalize children to array
        const childrenRaw = nodeExport.children?.tracePointNode
        const childrenArray = childrenRaw
          ? Array.isArray(childrenRaw)
            ? childrenRaw
            : [childrenRaw] // wrap single object in array
          : []

        return {
          id: nodeExport.id,
          tracePoint: convertTracePoint(nodeExport.tracePoint, currentProjectPath),
          parentId: nodeExport.parentId,
          children: childrenArray.map(convertNode)
        }
      }

      const updatedTracePoints = tracePointsArray.map(convertNode)

      // Restore expanded IDs from import
      const expandedIdsArray = state.expandedTracePointIds?.id ?? []
      service.setExpandedTracePointIds(new Set(expandedIdsArray))

      // Enable highlighting
      service.setHighlightingEnabled(true)

      // Update service with imported trace points
      service.setTracePoints(updatedTracePoints)
      service.rebuildNodeMapAndFileNodesMap()
      service.rebuildTreeNodeMap()

      // Validate trace points in current editor
      service.validateTracePointsOnLoad()
      service.applyHighlightsToAllEditors()

      // Notify TreeDataProvider to refresh the view
      service.notifyListeners()

      // Save state in workspace
      service.saveState()

      vscode.window.showInformationMessage('Trace points imported.')
    })
  )
}
