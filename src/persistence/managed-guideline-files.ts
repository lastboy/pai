import {
  appendFileSync,
  lstatSync,
  mkdirSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { dirname } from 'node:path'
import { parseGuidelines, type GuidelineFile, type GuidelineGroup } from '../core/guidelines.js'
import {
  ensurePointer,
  mergeManagedMarkdown,
  type ManagedImportTarget,
  type PointerResult,
} from '../core/managed-guidelines.js'
import { readTextFile } from './text-file.js'

export function readGuidelineGroups(files: GuidelineFile[]): GuidelineGroup[] {
  return files.map((file) => ({
    scope: file.scope,
    path: file.path,
    managed: file.managed,
    guidelines: parseGuidelines(readTextFile(file.path)),
  }))
}

/** A missing file is `undefined`; any other read error propagates. */
function readOptionalTextFile(path: string): string | undefined {
  try {
    return readTextFile(path)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw error
  }
}

function isSymlink(path: string): boolean {
  try {
    return lstatSync(path).isSymbolicLink()
  } catch {
    return false
  }
}

/**
 * Written via a temporary file and renamed into place, so an interrupted
 * write cannot leave a half-written file behind. A symlink is written through
 * instead — renaming over it would replace the link with a plain file.
 * UTF-8, no BOM.
 */
function writeTextFileAtomic(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true })
  if (isSymlink(path)) {
    writeFileSync(path, content, 'utf8')
    return
  }
  const temporary = `${path}.tmp`
  try {
    writeFileSync(temporary, content, 'utf8')
    renameSync(temporary, path)
  } catch (error) {
    try {
      unlinkSync(temporary)
    } catch {
      // Nothing to clean up.
    }
    throw error
  }
}

export interface ImportScopeResult {
  claudeMdPath: string
  managedPath: string
  pointer: PointerResult['action']
  added: number
  existing: number
}

/**
 * Bring one scope's directory up to date: CLAUDE.md gets the pointer line if
 * it lacks one, CLAUDE.pai.md gets the rules it does not have yet. The
 * hand-written file is only ever appended to in place (never renamed over,
 * so symlinks into a dotfiles repo survive) and is not read for deduplication.
 */
export function importManagedGuidelines(
  target: ManagedImportTarget,
  rules: Array<{ rule: string; category: string }>,
  options: { dryRun?: boolean } = {},
): ImportScopeResult {
  const { claudeMdPath, managedPath } = target
  const pointer = ensurePointer(readOptionalTextFile(claudeMdPath), target.pointer)
  const merge = mergeManagedMarkdown(readOptionalTextFile(managedPath), rules)

  if (!options.dryRun) {
    if (pointer.action === 'created') {
      mkdirSync(dirname(claudeMdPath), { recursive: true })
      writeFileSync(claudeMdPath, pointer.suffix, 'utf8')
    } else if (pointer.action === 'appended') {
      appendFileSync(claudeMdPath, pointer.suffix, 'utf8')
    }
    if (merge.added > 0) writeTextFileAtomic(managedPath, merge.markdown)
  }
  return {
    claudeMdPath,
    managedPath,
    pointer: pointer.action,
    added: merge.added,
    existing: merge.existing,
  }
}
