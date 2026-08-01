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
export const DEFAULT_PROFILE_NAME = 'main'

/** Dedicated profile for Agent Notes when target is AGENT. */
export const AGENT_PROFILE_NAME = 'AGENT'

/** Legacy name; use AGENT_PROFILE_NAME. Kept for migration of older storage. */
export const CLAUDE_PROFILE_NAME = 'CLAUDE'

export const PROJECT_DOCUMENT_VERSION = 4

export const PROJECT_ID_FILE_NAME = 'code-trace-tree.project.id'

export const SIGNALS_DIR_NAME = 'signals'

export const REFRESH_SUFFIX = '.request_refresh'

export const SELECT_SUFFIX = '.select_trace_points'

/** Ignore / delete signal files older than this age. */
export const SIGNAL_TTL_MS = 60_000

export const GLOBAL_APP_DIR_NAME = 'code-trace-tree'
