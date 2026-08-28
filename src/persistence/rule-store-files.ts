import { mkdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { emptyStore, parseRuleStore, serializeRuleStore, type RuleStore } from '../core/rule-store.js'
import { readTextFile } from './text-file.js'

// PAI writes only to its own agent-neutral `.pai/` directories.
export function globalStorePath(home: string = homedir()): string {
  return join(home, '.pai', 'rules.json')
}

export function projectStorePath(cwd: string): string {
  return join(cwd, '.pai', 'rules.json')
}

/** A missing store is empty; a corrupt one is an error naming the file. */
export function readStore(path: string): RuleStore {
  let contents: string
  try {
    contents = readTextFile(path)
  } catch {
    return emptyStore()
  }
  try {
    return parseRuleStore(contents)
  } catch (error) {
    throw new Error(`${error instanceof Error ? error.message : String(error)} — ${path}`)
  }
}

/**
 * Written via a temporary file and renamed into place, so an interrupted
 * write cannot leave a half-written store behind.
 */
export function writeStore(path: string, store: RuleStore): void {
  mkdirSync(dirname(path), { recursive: true })
  const temporary = `${path}.tmp`
  try {
    writeFileSync(temporary, serializeRuleStore(store), 'utf8')
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
