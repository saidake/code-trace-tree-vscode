/*
 * Copyright (C) 2025-2026 Code Trace Tree Contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */
// src/TracePointService.ts

import * as fs from 'fs'
import * as vscode from 'vscode'
import * as path from 'path'
import { v4 as uuidv4 } from 'uuid'
import { AGENT_PROFILE_NAME, DEFAULT_PROFILE_NAME } from './domain/constants'
import {
  ClaudeAssistTarget,
  NodeListener,
  NodeListenerEventType,
  ProfileListener,
  TracePoint,
  TracePointNode,
  TraceProfile
} from './domain/types'
import { formatDisplayText, formatLocationSuffix } from './utils/displayText'
import * as AgentSignalFiles from './storage/agentSignalFiles'
import { migrateClaudeProfileToAgent } from './storage/projectDataXml'
import { ProjectStorage } from './storage/projectStorage'

export class TracePointService {
  private static instance: TracePointService

  private tracePointNodes: TracePointNode[] = []
  private nodeMap: Map<string, TracePointNode> = new Map()

  private treeNodeMap: Map<string, vscode.TreeItem> = new Map()
  private listenersMap: Map<NodeListenerEventType, NodeListener[]> = new Map()
  private fileNodesMap: Map<string, TracePointNode[]> = new Map() // tracePath

  private selectedTracePointIds: Set<string> = new Set()
  private expandedTracePointIds: Set<string> = new Set()
  private highlighters: Map<string, vscode.TextEditorDecorationType> = new Map() // Key: fileUri
  private _highlightingEnabled: boolean = true
  private _descriptionAreaOpened: boolean = false
  private _namePromptEnabled: boolean = true
  private _claudeAssistEnabled: boolean = false
  private _claudeAssistTarget: ClaudeAssistTarget = 'CURRENT'
  private ignoreExternalChangesUntilMs = 0
  private suppressPersist = false
  private workspaceRoot: string | undefined

  private profiles: TraceProfile[] = [
    { name: DEFAULT_PROFILE_NAME, tracePointNodes: [], expandedTracePointIds: [] }
  ]
  private activeProfileName: string = DEFAULT_PROFILE_NAME
  private profileListeners: ProfileListener[] = []
  private storage: ProjectStorage | undefined
  private persistTimer: ReturnType<typeof setTimeout> | undefined
  /** Ignore TreeView expand/collapse while rebuilding after a profile switch. */
  private ignoreExpandEvents = false
  private ignoreExpandTimer: ReturnType<typeof setTimeout> | undefined

  private constructor(private context: vscode.ExtensionContext) {}

  getBoundStorageFile(): string | undefined {
    return this.storage?.getBoundStorageFile()
  }

  getBoundProjectId(): string | undefined {
    return this.storage?.getBoundProjectId()
  }

  getWorkspaceRoot(): string | undefined {
    return this.workspaceRoot
  }

  shouldIgnoreExternalChanges(): boolean {
    return Date.now() < this.ignoreExternalChangesUntilMs
  }

  static getInstance(context: vscode.ExtensionContext): TracePointService {
    if (!TracePointService.instance) {
      TracePointService.instance = new TracePointService(context)
    }
    return TracePointService.instance
  }

  /** Resolve hybrid storage and load the active profile into working memory. */
  async loadState() {
    try {
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
      if (!workspaceRoot) {
        vscode.window.showWarningMessage('Code Trace Tree: open a workspace folder to persist data.')
        return
      }

      this.workspaceRoot = workspaceRoot
      this.storage = new ProjectStorage(workspaceRoot)
      const doc = this.storage.resolveAndLoad()
      await this.applyDocument(doc)
      this.notifyProfileListeners()
    } catch (e) {
      vscode.window.showErrorMessage(`Failed to load trace points: ${e}`)
    }
  }

  private async applyDocument(doc: {
    profiles: TraceProfile[]
    activeProfileName: string
    highlightingEnabled: boolean
    descriptionAreaOpened: boolean
    namePromptEnabled: boolean
    claudeAssistEnabled: boolean
    claudeAssistTarget: ClaudeAssistTarget
  }) {
    this.profiles = doc.profiles.map((p) => ({
      name: p.name || DEFAULT_PROFILE_NAME,
      tracePointNodes: p.tracePointNodes,
      expandedTracePointIds: [...p.expandedTracePointIds]
    }))
    if (this.profiles.length === 0) {
      this.profiles = [
        { name: DEFAULT_PROFILE_NAME, tracePointNodes: [], expandedTracePointIds: [] }
      ]
    }
    this.activeProfileName =
      doc.activeProfileName && this.profiles.some((p) => p.name === doc.activeProfileName)
        ? doc.activeProfileName
        : this.profiles[0].name
    const { active: migratedActive, changed: profileMigrated } = migrateClaudeProfileToAgent(
      this.profiles,
      this.activeProfileName
    )
    this.activeProfileName =
      migratedActive && this.profiles.some((p) => p.name === migratedActive)
        ? migratedActive
        : this.profiles[0].name
    this._highlightingEnabled = doc.highlightingEnabled
    this._descriptionAreaOpened = doc.descriptionAreaOpened
    this._namePromptEnabled = doc.namePromptEnabled
    this._claudeAssistEnabled = doc.claudeAssistEnabled
    this._claudeAssistTarget = doc.claudeAssistTarget
    await this.syncToggleContextKeys()
    await this.loadActiveProfileFromStore()
    if (profileMigrated && !this.suppressPersist) {
      this.schedulePersist()
    }
  }

  /** Debounce disk writes after mutations. */
  schedulePersist() {
    if (this.suppressPersist) return
    if (this.persistTimer) clearTimeout(this.persistTimer)
    this.persistTimer = setTimeout(() => this.persistNow(), 300)
  }

  /** Flush active profile into the profile store and write global XML. */
  persistNow() {
    if (this.suppressPersist) return
    if (this.persistTimer) {
      clearTimeout(this.persistTimer)
      this.persistTimer = undefined
    }
    this.ignoreExternalChangesUntilMs = Date.now() + 1500
    this.syncActiveProfileToStore()
    this.storage?.save(
      this.profiles,
      this.activeProfileName,
      this._descriptionAreaOpened,
      this._highlightingEnabled,
      this._namePromptEnabled,
      this._claudeAssistEnabled,
      this._claudeAssistTarget
    )
  }

  /** @deprecated Prefer schedulePersist — kept for call-site compatibility during refactor. */
  saveState() {
    this.schedulePersist()
  }

  getTracePointNodes(): TracePointNode[] {
    return this.tracePointNodes
  }

  isTracePointSelected(id: string): boolean {
    return this.selectedTracePointIds.has(id)
  }

  selectTracePoints(ids: string[]) {
    this.selectedTracePointIds = new Set(ids)
    this.notifyListeners('update-description', null)
  }

  getExpandedTracePointIds(): Set<string> {
    return this.expandedTracePointIds
  }

  getTracePointNodeById(id?: string): TracePointNode | null {
    if (!id) return null
    return this.nodeMap.get(id) ?? null
  }

  getTracePointSiblingsByParentId(parentId?: string): TracePointNode[] {
    if (!parentId) {
      return this.tracePointNodes
    }
    const parentNode = this.getTracePointNodeById(parentId)
    if (!parentNode) {
      return []
    }
    return parentNode.children
  }

  getTreeItemMap(): Map<string, vscode.TreeItem> {
    return this.treeNodeMap
  }

  getTreeNodeById(id: string): vscode.TreeItem | undefined {
    return this.treeNodeMap.get(id)
  }
  getTraceNodesByFilePath(filePath: string): TracePointNode[] | undefined {
    return this.fileNodesMap.get(filePath)
  }

  /** Valid LINE trace points on a given relative file path + 1-based line. */
  findValidTracePointsAt(filePath: string, lineNumber: number): TracePointNode[] {
    return (
      this.fileNodesMap
        .get(filePath)
        ?.filter(
          (n) =>
            n.tracePoint.traceType === 'LINE' &&
            n.tracePoint.isValid &&
            n.tracePoint.lineNumber === lineNumber
        ) ?? []
    )
  }

  addRootTracePointNextTo(tracePoint: TracePointNode, id: string) {
    if (tracePoint.parentId !== null && tracePoint.parentId !== undefined) return

    const index = this.tracePointNodes.findIndex((tp) => tp.id === id)
    if (index !== -1) {
      this.tracePointNodes.splice(index + 1, 0, tracePoint)
    } else {
      this.tracePointNodes.push(tracePoint)
    }
  }

  findRootParentId(node: TracePointNode): string | null {
    let tempNode: TracePointNode | null = node
    let rootParentId: string | null = null

    while (tempNode) {
      rootParentId = tempNode.id
      if (tempNode.parentId == null) {
        break
      }
      tempNode = this.getTracePointNodeById(tempNode.parentId)!
    }

    return rootParentId
  }

  setExpandedTracePointIds(expandedTracePointIds: Set<string>) {
    this.expandedTracePointIds = expandedTracePointIds
    this.schedulePersist()
  }

  isHighlightingEnabled(): boolean {
    return this._highlightingEnabled
  }

  setHighlightingEnabled(enabled: boolean) {
    this._highlightingEnabled = enabled
    this.applyHighlightsToAllEditors()
    this.schedulePersist()
  }

  isDescriptionAreaOpened(): boolean {
    return this._descriptionAreaOpened
  }

  setDescriptionAreaOpened(opened: boolean) {
    this._descriptionAreaOpened = opened
    this.schedulePersist()
  }

  isNamePromptEnabled(): boolean {
    return this._namePromptEnabled
  }

  setNamePromptEnabled(enabled: boolean) {
    this._namePromptEnabled = enabled
    void this.syncToggleContextKeys()
    this.schedulePersist()
  }

  isClaudeAssistEnabled(): boolean {
    return this._claudeAssistEnabled
  }

  getClaudeAssistTarget(): ClaudeAssistTarget {
    return this._claudeAssistTarget
  }

  setClaudeAssistEnabled(enabled: boolean) {
    this._claudeAssistEnabled = enabled
    void this.syncToggleContextKeys()
    this.schedulePersist()
  }

  async enableClaudeAssist(target: ClaudeAssistTarget) {
    this._claudeAssistTarget = target
    this._claudeAssistEnabled = true
    if (target === 'AGENT') {
      await this.ensureAgentProfileActive()
    }
    await this.syncToggleContextKeys()
    this.schedulePersist()
  }

  private async ensureAgentProfileActive() {
    const { active: migratedActive } = migrateClaudeProfileToAgent(
      this.profiles,
      this.activeProfileName
    )
    this.activeProfileName =
      migratedActive && this.profiles.some((p) => p.name === migratedActive)
        ? migratedActive
        : this.activeProfileName
    const existing = this.profiles.find(
      (p) => p.name.toLowerCase() === AGENT_PROFILE_NAME.toLowerCase()
    )
    if (!existing) {
      await this.addProfile(AGENT_PROFILE_NAME)
      return
    }
    const wasActive = this.activeProfileName.toLowerCase() === existing.name.toLowerCase()
    existing.name = AGENT_PROFILE_NAME
    if (wasActive) {
      this.activeProfileName = AGENT_PROFILE_NAME
      this.notifyProfileListeners()
    } else {
      await this.switchProfile(AGENT_PROFILE_NAME)
    }
  }

  private async syncToggleContextKeys() {
    await vscode.commands.executeCommand(
      'setContext',
      'codeTraceTree.namePromptEnabled',
      this._namePromptEnabled
    )
    await vscode.commands.executeCommand(
      'setContext',
      'codeTraceTree.claudeAssistEnabled',
      this._claudeAssistEnabled
    )
  }

  getActiveProfileName(): string {
    return this.activeProfileName
  }

  getProfileNames(): string[] {
    return this.profiles.map((p) => p.name)
  }

  addProfileListener(listener: ProfileListener) {
    this.profileListeners.push(listener)
  }

  private notifyProfileListeners() {
    this.profileListeners.forEach((listener) => listener())
  }

  /** Copy working tree + expand ids back into the active TraceProfile. */
  private syncActiveProfileToStore() {
    const profile = this.profiles.find((p) => p.name === this.activeProfileName)
    if (!profile) return
    profile.tracePointNodes = this.tracePointNodes
    profile.expandedTracePointIds = Array.from(this.expandedTracePointIds)
  }

  /** Fill runtime projectPath on every node from the current workspace. */
  private applyProjectPathToNodes(nodes: TracePointNode[]) {
    const projectPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || ''
    const walk = (node: TracePointNode) => {
      node.tracePoint.projectPath = projectPath
      node.children.forEach(walk)
    }
    nodes.forEach(walk)
  }

  private clearAllHighlights() {
    for (const filePath of [...this.highlighters.keys()]) {
      this.removeHighlights(filePath)
    }
  }

  /**
   * TreeItem.id scoped by profile so VS Code does not restore expand/selection
   * across profiles that share the same node UUIDs.
   */
  toTreeItemId(nodeId: string): string {
    // Encode profile so names containing "::" cannot break parsing
    return `${encodeURIComponent(this.activeProfileName)}::${nodeId}`
  }

  /** Extract the domain node UUID from a profile-scoped TreeItem.id. */
  resolveNodeId(treeItemId: string | undefined | null): string | undefined {
    if (!treeItemId) return undefined
    const idx = treeItemId.indexOf('::')
    return idx >= 0 ? treeItemId.slice(idx + 2) : treeItemId
  }

  shouldPersistExpandEvents(): boolean {
    return !this.ignoreExpandEvents
  }

  private beginIgnoreExpandEvents() {
    this.ignoreExpandEvents = true
    if (this.ignoreExpandTimer) clearTimeout(this.ignoreExpandTimer)
  }

  private endIgnoreExpandEventsSoon() {
    if (this.ignoreExpandTimer) clearTimeout(this.ignoreExpandTimer)
    // TreeView may emit expand events asynchronously after refresh
    this.ignoreExpandTimer = setTimeout(() => {
      this.ignoreExpandEvents = false
      this.ignoreExpandTimer = undefined
    }, 150)
  }

  /** Swap working memory to the active profile and refresh UI/highlights. */
  private async loadActiveProfileFromStore() {
    let profile = this.profiles.find((p) => p.name === this.activeProfileName)
    if (!profile) {
      profile = this.profiles[0]
      if (!profile) {
        profile = { name: DEFAULT_PROFILE_NAME, tracePointNodes: [], expandedTracePointIds: [] }
        this.profiles = [profile]
      }
      this.activeProfileName = profile.name
    }

    // Block expand/collapse persistence while the tree is rebuilt for this profile
    this.beginIgnoreExpandEvents()
    try {
      this.clearAllHighlights()
      this.selectedTracePointIds.clear()
      this.tracePointNodes = profile.tracePointNodes
      this.expandedTracePointIds = new Set(profile.expandedTracePointIds)
      this.applyProjectPathToNodes(this.tracePointNodes)

      this.rebuildNodeMapAndFileNodesMap()
      await this.validateTracePointsOnLoad()
      this.rebuildTreeNodeMap()
      this.applyHighlightsToAllEditors()
      this.notifyListeners()
      // Selection was cleared for the new profile; refresh the description pane so it
      // does not keep the previous profile's text.
      this.notifyListeners('update-description', null)
    } finally {
      this.endIgnoreExpandEventsSoon()
    }
  }

  async switchProfile(name: string) {
    if (name === this.activeProfileName || !this.profiles.some((p) => p.name === name)) return
    this.syncActiveProfileToStore()
    this.activeProfileName = name
    await this.loadActiveProfileFromStore()
    this.notifyProfileListeners()
    this.schedulePersist()
  }

  async addProfile(name: string): Promise<boolean> {
    const trimmed = name.trim()
    if (
      !trimmed ||
      this.profiles.some((p) => p.name.toLowerCase() === trimmed.toLowerCase())
    ) {
      return false
    }
    this.syncActiveProfileToStore()
    this.profiles.push({ name: trimmed, tracePointNodes: [], expandedTracePointIds: [] })
    this.activeProfileName = trimmed
    await this.loadActiveProfileFromStore()
    this.notifyProfileListeners()
    this.schedulePersist()
    return true
  }

  async deleteProfile(name: string): Promise<boolean> {
    if (this.profiles.length <= 1) return false
    const index = this.profiles.findIndex((p) => p.name === name)
    if (index < 0) return false
    this.profiles.splice(index, 1)
    if (this.activeProfileName === name) {
      this.activeProfileName = this.profiles[0].name
      await this.loadActiveProfileFromStore()
    }
    this.notifyProfileListeners()
    this.schedulePersist()
    return true
  }

  async replaceActiveProfileTree(nodes: TracePointNode[], expandedIds: string[]) {
    this.clearAllHighlights()
    this.selectedTracePointIds.clear()
    this.tracePointNodes = nodes
    this.expandedTracePointIds = new Set(expandedIds)
    this.applyProjectPathToNodes(this.tracePointNodes)
    this.rebuildNodeMapAndFileNodesMap()
    await this.validateTracePointsOnLoad()
    this.rebuildTreeNodeMap()
    this.applyHighlightsToAllEditors()
    this.syncActiveProfileToStore()
    this.notifyListeners()
    this.notifyListeners('update-description', null)
    this.schedulePersist()
  }

  /** Snapshot every profile (active tree is synced first). */
  getProfilesSnapshot(): TraceProfile[] {
    this.syncActiveProfileToStore()
    return this.profiles.map((p) => ({
      name: p.name,
      tracePointNodes: p.tracePointNodes,
      expandedTracePointIds: [...p.expandedTracePointIds]
    }))
  }

  allocateUniqueProfileName(desired: string): string {
    const base = desired.trim() || 'imported'
    if (!this.profiles.some((p) => p.name.toLowerCase() === base.toLowerCase())) return base
    let i = 2
    while (this.profiles.some((p) => p.name.toLowerCase() === `${base} (${i})`.toLowerCase())) {
      i++
    }
    return `${base} (${i})`
  }

  async importAsNewProfile(
    desiredName: string,
    nodes: TracePointNode[],
    expandedIds: string[]
  ): Promise<string> {
    this.syncActiveProfileToStore()
    const name = this.allocateUniqueProfileName(desiredName)
    this.profiles.push({
      name,
      tracePointNodes: nodes,
      expandedTracePointIds: [...expandedIds]
    })
    this.activeProfileName = name
    await this.loadActiveProfileFromStore()
    this.notifyProfileListeners()
    this.schedulePersist()
    return name
  }

  async importAsNewProfiles(imported: TraceProfile[]): Promise<string[]> {
    if (imported.length === 0) return []
    this.syncActiveProfileToStore()
    const created: string[] = []
    for (const profile of imported) {
      const name = this.allocateUniqueProfileName(profile.name)
      this.profiles.push({
        name,
        tracePointNodes: profile.tracePointNodes,
        expandedTracePointIds: [...profile.expandedTracePointIds]
      })
      created.push(name)
    }
    this.activeProfileName = created[0]
    await this.loadActiveProfileFromStore()
    this.notifyProfileListeners()
    this.schedulePersist()
    return created
  }

  async mergeProfiles(imported: TraceProfile[], preferredActiveName?: string) {
    if (imported.length === 0) return
    this.syncActiveProfileToStore()
    for (const incoming of imported) {
      const existing = this.profiles.find(
        (p) => p.name.toLowerCase() === incoming.name.toLowerCase()
      )
      if (existing) {
        existing.tracePointNodes = incoming.tracePointNodes
        existing.expandedTracePointIds = [...incoming.expandedTracePointIds]
      } else {
        this.profiles.push({
          name: incoming.name,
          tracePointNodes: incoming.tracePointNodes,
          expandedTracePointIds: [...incoming.expandedTracePointIds]
        })
      }
    }
    const preferred =
      preferredActiveName && this.profiles.some((p) => p.name === preferredActiveName)
        ? preferredActiveName
        : undefined
    if (preferred) {
      this.activeProfileName = preferred
    } else if (!this.profiles.some((p) => p.name === this.activeProfileName)) {
      this.activeProfileName = this.profiles[0].name
    }
    await this.loadActiveProfileFromStore()
    this.notifyProfileListeners()
    this.schedulePersist()
  }

  async replaceAllProfiles(imported: TraceProfile[], preferredActiveName?: string) {
    if (imported.length === 0) return
    this.profiles = imported.map((p) => ({
      name: p.name.trim() || DEFAULT_PROFILE_NAME,
      tracePointNodes: p.tracePointNodes,
      expandedTracePointIds: [...p.expandedTracePointIds]
    }))
    this.activeProfileName =
      preferredActiveName && this.profiles.some((p) => p.name === preferredActiveName)
        ? preferredActiveName
        : this.profiles[0].name
    await this.loadActiveProfileFromStore()
    this.notifyProfileListeners()
    this.schedulePersist()
  }

  addNodeListener(eventType: NodeListenerEventType, listener: NodeListener) {
    const existing = this.listenersMap.get(eventType)
    if (existing) {
      existing.push(listener)
    } else {
      this.listenersMap.set(eventType, [listener])
    }
  }

  notifyListeners(
    eventType: NodeListenerEventType = 'refresh',
    nodes: Set<TracePointNode | null> | null = null
  ) {
    this.listenersMap.get(eventType)?.forEach((listener) => listener(nodes))
  }

  async addTracePoint(
    name: string,
    file: vscode.Uri,
    lineNumber: number,
    parentId?: string,
    description = ''
  ) {
    const document = await vscode.workspace.openTextDocument(file)
    const lineContent = document.lineAt(lineNumber - 1).text.trim()
    const [totalOccurrences, matchingLines] = this.getLineOccurrences(document, lineContent)
    const occurrenceIndex = matchingLines.indexOf(lineNumber) + 1

    const tracePath = vscode.workspace.asRelativePath(file)
    const baseName = path.basename(tracePath)
    const tracePoint: TracePoint = {
      traceName: name,
      traceType: 'LINE',
      tracePath,
      baseName,
      lineNumber,
      projectPath: vscode.workspace.workspaceFolders?.[0].uri.fsPath || '',
      lineContent,
      isValid: true,
      totalOccurrences: totalOccurrences,
      occurrenceIndex,
      description
    }
    this.insertTracePointNode(
      { id: uuidv4(), tracePoint, parentId, children: [] },
      parentId
    )
  }

  /** Adds a FILE or DIRECTORY trace point from Explorer (no line anchor). */
  async addPathTracePoint(
    name: string,
    uri: vscode.Uri,
    parentId?: string,
    description = ''
  ) {
    const stat = await vscode.workspace.fs.stat(uri)
    const isDir = (stat.type & vscode.FileType.Directory) !== 0
    const tracePath = vscode.workspace.asRelativePath(uri)
    const tracePoint: TracePoint = {
      traceName: name,
      traceType: isDir ? 'DIRECTORY' : 'FILE',
      tracePath,
      baseName: path.basename(tracePath),
      lineNumber: 0,
      projectPath: vscode.workspace.workspaceFolders?.[0].uri.fsPath || '',
      lineContent: null,
      isValid: true,
      totalOccurrences: 0,
      occurrenceIndex: 0,
      description
    }
    this.insertTracePointNode(
      { id: uuidv4(), tracePoint, parentId, children: [] },
      parentId
    )
  }

  private insertTracePointNode(newNode: TracePointNode, parentId?: string) {
    if (!parentId) {
      this.tracePointNodes.push(newNode)
    } else {
      const parentNode = this.nodeMap.get(parentId)
      if (parentNode?.children?.push(newNode)) {
        newNode.parentId = parentNode.id
      }
    }
    this.nodeMap.set(newNode.id, newNode)
    this.updateTreeItem(newNode)
    if (parentId) {
      this.expandTreeItem(this.getTracePointNodeById(parentId))
    }
    if (!this.fileNodesMap.has(newNode.tracePoint.tracePath)) {
      this.fileNodesMap.set(newNode.tracePoint.tracePath, [])
    }
    this.fileNodesMap.get(newNode.tracePoint.tracePath)!.push(newNode)
  }

  getTracePointParentById(id?: string): TracePointNode | null {
    if (!id) return null
    const parentId = this.nodeMap.get(id)?.parentId
    return parentId ? (this.getTracePointNodeById(parentId) ?? null) : null
  }

  async updateTracePointDescription(id: string, newDescription: string) {
    if (!id) return
    const tp = this.getTracePointNodeById(id)
    if (!tp) return
    const next = newDescription ?? ''
    if ((tp.tracePoint.description || '') === next) return
    tp.tracePoint.description = next
    // Update the existing TreeItem in place (tooltip). Avoid tree refresh here:
    // refreshing on every keystroke can clear selection while VS Code is also
    // opening files / reloading views, which raced and wiped descriptions.
    this.updateTreeItem(tp)
    this.schedulePersist()
  }

  async renameTracePoint(id: string, newName: string) {
    const tp = this.getTracePointNodeById(id)
    if (tp) {
      tp.tracePoint.traceName = newName
      this.updateTreeItem(tp)
      const parentNode = this.getTracePointParentById(id)
      this.notifyListeners('refresh', new Set<TracePointNode | null>([parentNode]))
      this.saveState()
    }
  }

  rebuildNodeMapAndFileNodesMap() {
    this.nodeMap = new Map<string, TracePointNode>()
    this.fileNodesMap = new Map<string, TracePointNode[]>()

    const traverse = (node: TracePointNode) => {
      this.nodeMap.set(node.id, node)
      const filePath = node.tracePoint.tracePath
      if (!this.fileNodesMap.has(filePath)) {
        this.fileNodesMap.set(filePath, [])
      }
      this.fileNodesMap.get(filePath)!.push(node)
      for (const child of node.children) {
        traverse(child)
      }
    }

    // Process all root-level nodes
    for (const rootNode of this.tracePointNodes) {
      traverse(rootNode)
    }
  }

  async setTracePoints(newTracePoints: TracePointNode[]) {
    this.tracePointNodes = newTracePoints
  }

  getLineOccurrences(document: vscode.TextDocument, content?: string): [number, number[]] {
    if (!content) return [0, []]
    const matchingLines: number[] = []
    for (let i = 0; i < document.lineCount; i++) {
      if (document.lineAt(i).text.trim() === content) {
        matchingLines.push(i + 1)
      }
    }
    return [matchingLines.length, matchingLines]
  }

  async attachListenersAndHighlight(document: vscode.TextDocument) {
    if (this.fileNodesMap.has(vscode.workspace.asRelativePath(document.uri))) {
      this.highlightTracePointsInFile(document)
    }
  }

  async highlightTracePointsInFile(document: vscode.TextDocument) {
    if (!this.isHighlightingEnabled()) return
    const filePath = vscode.workspace.asRelativePath(document.uri)
    const relevantTracePoints =
      this.fileNodesMap
        .get(filePath)
        ?.filter((tp) => tp.tracePoint.traceType === 'LINE' && tp.tracePoint.isValid) ?? []

    this.removeHighlights(document.uri.fsPath)

    const decorationType = vscode.window.createTextEditorDecorationType({
      backgroundColor: new vscode.ThemeColor('editor.findMatchBackground'),
      isWholeLine: true
    })

    const ranges: vscode.Range[] = []
    relevantTracePoints.forEach((tp) => {
      if (tp.tracePoint.lineNumber <= document.lineCount) {
        const line = document.lineAt(tp.tracePoint.lineNumber - 1)
        ranges.push(line.range)
      }
    })
    vscode.window.visibleTextEditors
      .filter((editor) => editor.document.uri.fsPath === document.uri.fsPath)
      .forEach((editor) => editor.setDecorations(decorationType, ranges))
    this.highlighters.set(document.uri.fsPath, decorationType)
  }

  private removeHighlights(filePath: string) {
    const decorationType = this.highlighters.get(filePath)
    if (decorationType) {
      vscode.window.visibleTextEditors.forEach((editor) =>
        editor.setDecorations(decorationType, [])
      )
      decorationType.dispose()
      this.highlighters.delete(filePath)
    }
  }

  applyHighlightsToAllEditors(editor: vscode.TextEditor | null = null) {
    console.log('applyHighlightsToAllEditors triggered')
    if (editor) {
      if (this.isHighlightingEnabled()) {
        this.highlightTracePointsInFile(editor.document)
      } else {
        this.removeHighlights(editor.document.uri.fsPath)
      }
      return
    }
    vscode.window.visibleTextEditors.forEach((editor) => {
      if (this.isHighlightingEnabled()) {
        this.highlightTracePointsInFile(editor.document)
      } else {
        this.removeHighlights(editor.document.uri.fsPath)
      }
    })
  }

  async handleDocumentChange(event: vscode.TextDocumentChangeEvent) {
    const filePath = vscode.workspace.asRelativePath(event.document.uri)
    const affectedTracePoints =
      this.getTraceNodesByFilePath(filePath)?.filter((n) => n.tracePoint.traceType === 'LINE') ?? []
    if (affectedTracePoints.length === 0) return

    const newLines = event.document.getText().split(/\r?\n/)

    // VSCode may include multiple content changes in a single event.
    // For now, handle the first major change (extendable later).
    const change = event.contentChanges[0]
    if (!change) return

    const oldLines = change.range.end.line - change.range.start.line
    const newLinesCount = change.text.split(/\r?\n/).length - 1
    const lineOffset = newLinesCount - oldLines
    const changedLine = change.range.start.line + 1
    const updatedNodes: TracePointNode[] = []
    let affectedParentNodes: Set<TracePointNode | null> = new Set<TracePointNode | null>()

    for (const node of affectedTracePoints) {
      const tp = node.tracePoint
      if (!tp.isValid) {
        const valid = newLines[tp.lineNumber - 1]?.trim() === tp.lineContent?.trim()
        if (valid) {
          node.tracePoint = { ...tp, isValid: true }
          updatedNodes.push(node)
          affectedParentNodes.add(this.getTracePointNodeById(node.parentId))
        }
        continue
      }
      const newContent = newLines[tp.lineNumber - 1]?.trim() ?? null
      const isLineStart = change.range.start.character === 0
      const isEnter = /\r?\n/.test(change.text)
      // CASE 1: Press Enter at the beginning of the line (lineOffset !== 0)
      if (tp.lineNumber === changedLine && isEnter && lineOffset > 0 && isLineStart) {
        const newLineNumber = tp.lineNumber + lineOffset
        const newLineContent = newLines[newLineNumber - 1]?.trim() ?? null
        const [total, matches] = this.getLineOccurrences(event.document, newLineContent ?? '')
        const occIdx =
          newLineContent === tp.lineContent
            ? tp.occurrenceIndex
            : matches.indexOf(newLineNumber) + 1

        node.tracePoint = {
          ...tp,
          lineNumber: newLineNumber,
          lineContent: newLineContent ?? '',
          isValid: newLineContent !== null,
          totalOccurrences: total,
          occurrenceIndex: occIdx >= 0 ? occIdx : 0
        }
        updatedNodes.push(node)
        affectedParentNodes.add(this.getTracePointNodeById(node.parentId))
      }
      // CASE 2: Edit on the trace point line (lineOffset = 0)
      else if (tp.lineNumber === changedLine && lineOffset === 0) {
        const [total, matches] = this.getLineOccurrences(event.document, newContent ?? '')
        const occIdx =
          newContent === tp.lineContent ? tp.occurrenceIndex : matches.indexOf(changedLine) + 1

        node.tracePoint = {
          ...tp,
          lineContent: newContent ?? '',
          isValid: newContent !== null,
          totalOccurrences: total,
          occurrenceIndex: occIdx >= 0 ? occIdx : 0
        }
        updatedNodes.push(node)
        affectedParentNodes.add(this.getTracePointNodeById(node.parentId))
      }

      // CASE 3: Edit above the trace point line (shift line numbers)
      else if (tp.lineNumber > changedLine && lineOffset !== 0) {
        const newLineNumber = Math.max(1, tp.lineNumber + lineOffset)
        const newLineContent = newLines[newLineNumber - 1]?.trim() ?? null
        const [total, matches] = this.getLineOccurrences(event.document, newLineContent ?? '')
        const occIdx =
          newLineContent === tp.lineContent
            ? tp.occurrenceIndex
            : matches.indexOf(newLineNumber) + 1

        node.tracePoint = {
          ...tp,
          lineNumber: newLineNumber,
          lineContent: newLineContent ?? '',
          isValid: newLineContent !== null,
          totalOccurrences: total,
          occurrenceIndex: occIdx >= 0 ? occIdx : 0
        }
        updatedNodes.push(node)
        affectedParentNodes.add(this.getTracePointNodeById(node.parentId))
      }
    }
    // Update internal states
    // this.rebuildTreeItemMap(updatedNodes);
    updatedNodes.forEach((item) => {
      this.updateTreeItem(item)
    })
    // Re-highlight updated trace points in the file
    this.highlightTracePointsInFile(event.document)
    // Notify listeners to refresh affected UI parts
    this.notifyListeners('refresh', affectedParentNodes)
    // Persist changes
    this.saveState()
  }

  /**
   * Update tracePoints and tracePointMap
   */
  /**
   * Recursively validate tracePoints and update tracePointMap
   */
  async validateTracePointsOnLoad(nodes: TracePointNode[] = this.tracePointNodes): Promise<void> {
    const validateNode = async (node: TracePointNode): Promise<void> => {
      const tp = node.tracePoint
      if (!node.id || !tp.tracePath || !tp.projectPath) {
        node.tracePoint = { ...tp, isValid: false, totalOccurrences: 0, occurrenceIndex: 0 }
      } else if (tp.traceType === 'FILE' || tp.traceType === 'DIRECTORY') {
        const abs = path.join(tp.projectPath, tp.tracePath)
        try {
          const st = fs.statSync(abs)
          const ok =
            tp.traceType === 'DIRECTORY' ? st.isDirectory() : st.isFile()
          node.tracePoint = { ...tp, isValid: ok, totalOccurrences: 0, occurrenceIndex: 0 }
        } catch {
          node.tracePoint = { ...tp, isValid: false, totalOccurrences: 0, occurrenceIndex: 0 }
        }
      } else {
        const abs = path.join(tp.projectPath, tp.tracePath)
        let lines: string[] | undefined
        try {
          lines = fs.readFileSync(abs, 'utf8').split(/\r?\n/)
        } catch {
          node.tracePoint = { ...tp, isValid: false, totalOccurrences: 0, occurrenceIndex: 0 }
        }
        if (lines) {
          node.tracePoint = this.rebindLineTracePoint(tp, lines)
        }
      }

      for (const child of node.children) {
        await validateNode(child)
      }
    }

    for (const node of nodes) {
      await validateNode(node)
    }
  }

  /** Content-based LINE rebind (matches JetBrains / skill `trace_tree rebind`). */
  rebindLineTracePoint(tp: TracePoint, lines: string[]): TracePoint {
    const content = tp.lineContent?.trim()
    if (!content) {
      return { ...tp, isValid: false, totalOccurrences: 0, occurrenceIndex: 0 }
    }
    const matches: number[] = []
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim() === content) matches.push(i + 1)
    }
    const total = matches.length
    if (total === 0) {
      return { ...tp, isValid: false, totalOccurrences: 0, occurrenceIndex: 0 }
    }
    const oldLine = tp.lineNumber
    let newLine: number
    let newIndex: number
    if (oldLine >= 1 && oldLine <= lines.length && lines[oldLine - 1].trim() === content) {
      newLine = oldLine
      newIndex = matches.indexOf(oldLine) + 1
    } else if (total === 1) {
      newLine = matches[0]
      newIndex = 1
    } else if (total === tp.totalOccurrences && tp.occurrenceIndex >= 1 && tp.occurrenceIndex <= total) {
      newLine = matches[tp.occurrenceIndex - 1]
      newIndex = tp.occurrenceIndex
    } else {
      newLine = matches.reduce((best, n) =>
        Math.abs(n - oldLine) < Math.abs(best - oldLine) ? n : best
      )
      newIndex = matches.indexOf(newLine) + 1
    }
    return {
      ...tp,
      lineNumber: newLine,
      totalOccurrences: total,
      occurrenceIndex: newIndex,
      isValid: true
    }
  }

  async rebindLineNodesForPaths(relativePaths?: string[]): Promise<boolean> {
    const paths =
      relativePaths && relativePaths.length > 0
        ? relativePaths
        : [...this.fileNodesMap.keys()]
    let changed = false
    const root = this.workspaceRoot || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
    if (!root) return false
    for (const relativePath of paths) {
      const nodes = this.fileNodesMap.get(relativePath)
      if (!nodes) continue
      const abs = path.join(root, relativePath)
      let lines: string[]
      try {
        lines = fs.readFileSync(abs, 'utf8').split(/\r?\n/)
      } catch {
        continue
      }
      for (const node of nodes) {
        if (node.tracePoint.traceType !== 'LINE') continue
        const rebound = this.rebindLineTracePoint(node.tracePoint, lines)
        if (
          rebound.lineNumber !== node.tracePoint.lineNumber ||
          rebound.isValid !== node.tracePoint.isValid ||
          rebound.occurrenceIndex !== node.tracePoint.occurrenceIndex
        ) {
          node.tracePoint = rebound
          this.updateTreeItem(node)
          changed = true
        }
      }
    }
    if (changed) {
      this.applyHighlightsToAllEditors()
      this.notifyListeners()
      this.schedulePersist()
    }
    return changed
  }

  async reloadFromExternalStorage(_reason = 'manual'): Promise<boolean> {
    if (this.shouldIgnoreExternalChanges()) return false
    const doc = this.storage?.reloadBoundDocument()
    if (!doc) return false
    this.suppressPersist = true
    try {
      await this.applyDocument(doc)
      this.notifyProfileListeners()
      // Leave the refresh signal for other IDE windows; TTL cleans it up.
    } finally {
      this.suppressPersist = false
    }
    return true
  }

  /**
   * Selects / reveals trace points listed in the global select signal
   * (`signals/<projectId>.select_trace_points`, one UUID per line).
   * TTL-stale files are ignored; fresh signals are left for other windows.
   * When exactly one id resolves in the current profile, also navigates to its source.
   */
  async handleExternalSelectRequest(
    treeView: vscode.TreeView<vscode.TreeItem>
  ): Promise<void> {
    const projectId = this.getBoundProjectId()
    if (!projectId) return
    const requestPath = AgentSignalFiles.selectPath(projectId)
    if (!AgentSignalFiles.isFresh(requestPath)) return

    let requestedIds: string[] = []
    try {
      requestedIds = [
        ...new Set(
          fs
            .readFileSync(requestPath, 'utf8')
            .split(/\r?\n/)
            .map((l) => l.trim())
            .filter(Boolean)
        )
      ]
    } catch {
      return
    }
    // Leave the signal file for other IDE windows; TTL cleans it up.
    if (requestedIds.length === 0) return

    const resolved = requestedIds
      .map((id) => this.getTracePointNodeById(id))
      .filter((n): n is TracePointNode => !!n)
    if (resolved.length === 0) return

    await vscode.commands.executeCommand('codeTraceTree.view.focus')
    const ids = resolved.map((n) => n.id)
    for (const id of ids) {
      const item = this.getTreeNodeById(id)
      if (item) await treeView.reveal(item, { expand: true, select: false, focus: false })
    }
    const firstItem = this.getTreeNodeById(ids[0])
    if (firstItem) {
      await treeView.reveal(firstItem, { expand: true, select: true, focus: true })
    }
    this.selectTracePoints(ids)
    if (resolved.length === 1) {
      await this.navigateToTracePoint(resolved[0], treeView)
    }
  }

  async navigateToTracePoint(
    tracePointNode: TracePointNode,
    treeView: vscode.TreeView<vscode.TreeItem>
  ) {
    const tp = tracePointNode.tracePoint
    const targetUri = vscode.Uri.file(path.join(tp.projectPath, tp.tracePath))
    if (tp.traceType === 'DIRECTORY') {
      await vscode.commands.executeCommand('revealInExplorer', targetUri)
      return
    }
    const doc = await vscode.workspace.openTextDocument(targetUri)
    const editor = await vscode.window.showTextDocument(doc)
    if (tp.traceType === 'LINE' && tp.lineNumber > 0) {
      const range = new vscode.Range(tp.lineNumber - 1, 0, tp.lineNumber - 1, 0)
      editor.selection = new vscode.Selection(range.start, range.end)
      editor.revealRange(range, vscode.TextEditorRevealType.InCenter)
    }
    const selected = treeView.selection
    if (selected.length == 1) {
      treeView.reveal(selected[0], { select: true, focus: true })
    }
  }

  getSelectedTracePointIds(): string[] {
    return Array.from(this.selectedTracePointIds)
  }

  async deleteTracePointsWithChildren(ids: string[]) {
    // Collect child ids.
    const allIdsToDelete = new Set<string>(ids)
    const affectedParentNodes = new Set<TracePointNode | null>()

    // Check if the item to be deleted has any children.
    const collectChildren = (id: string) => {
      const node = this.getTracePointNodeById(id)
      affectedParentNodes.add(this.getTracePointNodeById(node?.parentId))
      if (node) {
        if (node.tracePoint.tracePath) {
          const arr = this.fileNodesMap.get(node.tracePoint.tracePath)
          if (arr) {
            this.fileNodesMap.set(
              node.tracePoint.tracePath,
              arr.filter((n) => n.id !== node.id)
            )
          }
        }
        for (const child of node.children) {
          allIdsToDelete.add(child.id)
          collectChildren(child.id)
        }
      }
    }
    ids.forEach((id) => collectChildren(id))

    // Recursive in-place delete function
    const deleteNodeRecursively = (nodes: TracePointNode[]): void => {
      // We must mutate `nodes` array in place (splice)
      for (let i = nodes.length - 1; i >= 0; i--) {
        const node = nodes[i]
        // If node is in delete set, remove it from the array
        if (allIdsToDelete.has(node.id)) {
          nodes.splice(i, 1)
          continue
        }
        deleteNodeRecursively(node.children)
      }
    }
    // Apply directly to root
    deleteNodeRecursively(this.tracePointNodes)

    allIdsToDelete.forEach((id) => {
      this.selectedTracePointIds.delete(id)
      this.expandedTracePointIds.delete(id)
      this.nodeMap.delete(id)
      this.treeNodeMap.delete(id)
    })

    this.applyHighlightsToAllEditors()
    for (const affectedParentNode of affectedParentNodes) {
      this.expandTreeItem(affectedParentNode)
    }
    this.notifyListeners('refresh', affectedParentNodes)
    await this.saveState()
  }

  expandTreeItem(tracePointNode: TracePointNode | null) {
    if (!tracePointNode) return
    const treeNode = this.getTreeNodeById(tracePointNode.id)
    if (!treeNode) return
    let collapsibleState = vscode.TreeItemCollapsibleState.None
    const hasChildren = tracePointNode.children.length > 0
    if (hasChildren) {
      collapsibleState = vscode.TreeItemCollapsibleState.Expanded
      this.expandedTracePointIds.add(tracePointNode.id)
    }
    treeNode.collapsibleState = collapsibleState
  }

  updateInFileNodesMap(prevFilePath: string, node: TracePointNode) {
    if (prevFilePath == node.tracePoint.tracePath) return
    // Remove the node from the previous node list
    const prevList = this.fileNodesMap.get(prevFilePath)
    if (prevList) {
      const index = prevList.indexOf(node)
      if (index !== -1) {
        prevList.splice(index, 1)
      }
    }
    // Add the node to the new file path
    if (!this.fileNodesMap.has(node.tracePoint.tracePath)) {
      this.fileNodesMap.set(node.tracePoint.tracePath, [])
    }
    this.fileNodesMap.get(node.tracePoint.tracePath)!.push(node)
  }
  updateTreeItem(tracePointNode: TracePointNode) {
    // Determine collapsible state only from this profile's expanded ids
    let collapsibleState = vscode.TreeItemCollapsibleState.None
    const hasChildren = tracePointNode.children.length > 0
    if (hasChildren) {
      collapsibleState = this.expandedTracePointIds.has(tracePointNode.id)
        ? vscode.TreeItemCollapsibleState.Expanded
        : vscode.TreeItemCollapsibleState.Collapsed
    }
    const tracePoint = tracePointNode.tracePoint
    const label = tracePoint.traceName || ''
    const location = formatLocationSuffix(tracePoint)
    const prevItem = this.treeNodeMap.get(tracePointNode.id)
    if (prevItem) {
      prevItem.collapsibleState = collapsibleState
      prevItem.label = label
    }
    const item = prevItem ? prevItem : new vscode.TreeItem(label, collapsibleState)
    // Profile-scoped id prevents cross-profile expand/selection restore
    item.id = this.toTreeItemId(tracePointNode.id)
    item.contextValue = 'traceable'
    // VS Code renders description after the label with a space
    item.description = location
    item.command = {
      command: 'codeTraceTree.goToTracePoint',
      title: 'Go to Trace Point',
      arguments: [item]
    }

    const display = formatDisplayText(tracePoint)
    if (!tracePoint.isValid) {
      item.iconPath = new vscode.ThemeIcon(
        'circle-slash',
        new vscode.ThemeColor('disabledForeground')
      )
      item.tooltip = `${display}\nThis trace point is invalid or outdated.`
    } else if (tracePoint.description) {
      item.iconPath = undefined
      item.tooltip = `${display}\n${tracePoint.description}`
    } else {
      item.iconPath = undefined
      item.tooltip = display
    }

    this.treeNodeMap.set(tracePointNode.id, item)
  }

  rebuildTreeNodeMap(tracePointNodes?: TracePointNode[]) {
    if (!tracePointNodes) tracePointNodes = this.tracePointNodes
    this.treeNodeMap = new Map()

    const traverse = (node: TracePointNode) => {
      this.updateTreeItem(node)
      for (const child of node.children) {
        traverse(child)
      }
    }

    for (const rootNode of tracePointNodes) {
      traverse(rootNode)
    }
  }

  removeRootTracePoint(tpNode: TracePointNode): boolean {
    const index = this.tracePointNodes.findIndex((node) => node.id === tpNode.id)
    if (index !== -1) {
      this.tracePointNodes.splice(index, 1)
      return true
    }
    return false
  }
}
