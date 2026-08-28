/*
 * Copyright (C) 2025-2026 Code Trace Tree Contributors
 *
 * SPDX-License-Identifier: MIT
 */
export const DEFAULT_PROFILE_NAME = 'main'

export const PROJECT_DOCUMENT_VERSION = 4

export const STORAGE_READY_SUFFIX = '.storage-ready'

export const SIGNALS_DIR_NAME = 'signals'

export const REFRESH_SUFFIX = '.request_refresh'

/** Reload one profile from XML; body = profile name (empty → active profile). */
export const REFRESH_PROFILE_SUFFIX = '.request_refresh_profile'

/** Reload project toolbar flags / activeProfileName only. */
export const REFRESH_SETTINGS_SUFFIX = '.request_refresh_settings'

/** Global highlight-color reload (no projectId). Distinct from `<projectId>.request_refresh_settings`. */
export const GLOBAL_REFRESH_SETTINGS_FILE_NAME = 'request_refresh_global_settings'

export const SELECT_SUFFIX = '.select_trace_points'

/** Ignore / delete signal files older than this age. */
export const SIGNAL_TTL_MS = 60_000

export const GLOBAL_APP_DIR_NAME = 'code-trace-tree'

export const GLOBAL_SETTINGS_FILE_NAME = 'settings.xml'
