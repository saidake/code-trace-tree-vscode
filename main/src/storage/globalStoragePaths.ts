import * as os from 'os'
import * as path from 'path'
import { GLOBAL_APP_DIR_NAME } from '../domain/constants'

/** Resolve OS-specific base dir for global Code Trace Tree storage. */
export function resolveBaseDir(): string {
  const platform = process.platform
  const home = os.homedir()

  if (platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA
    if (localAppData && localAppData.trim()) return localAppData
    return path.join(home, 'AppData', 'Local')
  }
  if (platform === 'darwin') {
    return path.join(home, 'Library', 'Application Support')
  }
  const xdg = process.env.XDG_CONFIG_HOME
  if (xdg && xdg.trim()) return xdg
  return path.join(home, '.config')
}

export function resolveAppDir(): string {
  return path.join(resolveBaseDir(), GLOBAL_APP_DIR_NAME)
}
