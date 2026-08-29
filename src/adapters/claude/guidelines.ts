import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, join } from 'node:path'

import { parseGuidelines, type GuidelineFile } from '../../core/guidelines.js'
import type { ManagedImportTarget } from '../../core/managed-guidelines.js'

export { parseGuidelines, type GuidelineFile }

/** PAI's own guidance file, next to the hand-written CLAUDE.md. */
export const MANAGED_FILE_NAME = 'CLAUDE.pai.md'

/** Claude Code's native import line; added once to CLAUDE.md so it reads ours. */
export const POINTER_LINE = `@${MANAGED_FILE_NAME}`

const LOCAL_FILE_NAME = 'CLAUDE.local.md'

/** Directory that holds a scope's CLAUDE.md family of files. */
export function guidelineDir(
  scope: 'global' | 'project',
  cwd: string,
  home: string = homedir(),
): string {
  return scope === 'global' ? join(home, '.claude') : cwd
}

export function managedGuidelinePath(dir: string): string {
  return join(dir, MANAGED_FILE_NAME)
}

/** Everything `pai import` needs to know about one scope's directory. */
export function managedImportTarget(dir: string): ManagedImportTarget {
  return {
    claudeMdPath: join(dir, 'CLAUDE.md'),
    managedPath: managedGuidelinePath(dir),
    pointer: POINTER_LINE,
  }
}

// Claude Code guidance locations: ~/.claude/CLAUDE.md (global) and
// CLAUDE.md / CLAUDE.local.md at the project root, each followed by the
// PAI-managed sibling. Parent-directory traversal is not implemented yet.
export function findGuidelineFiles(cwd: string, home: string = homedir()): GuidelineFile[] {
  const global = guidelineDir('global', cwd, home)
  const project = guidelineDir('project', cwd, home)
  const candidates: GuidelineFile[] = [
    { path: join(global, 'CLAUDE.md'), scope: 'global', managed: false },
    { path: managedGuidelinePath(global), scope: 'global', managed: true },
    { path: join(project, 'CLAUDE.md'), scope: 'project', managed: false },
    { path: join(project, LOCAL_FILE_NAME), scope: 'project', managed: false },
    { path: managedGuidelinePath(project), scope: 'project', managed: true },
  ]
  return candidates.filter((candidate) => existsSync(candidate.path))
}

/** Files that travel between machines: CLAUDE.local.md is per-machine and stays out. */
export function findExportableGuidelineFiles(
  cwd: string,
  home: string = homedir(),
): GuidelineFile[] {
  return findGuidelineFiles(cwd, home).filter((file) => basename(file.path) !== LOCAL_FILE_NAME)
}
