import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { emptyStore, parseRuleStore, serializeRuleStore, type RuleStore } from '../core/rule-store.js'

// PAI writes only to its own agent-neutral `.pai/` directories.
export function globalStorePath(home: string = homedir()): string {
  return join(home, '.pai', 'rules.json')
}

export function projectStorePath(cwd: string): string {
  return join(cwd, '.pai', 'rules.json')
}

export function readStore(path: string): RuleStore {
  let contents: string
  try {
    contents = readFileSync(path, 'utf8')
  } catch {
    return emptyStore()
  }
  return parseRuleStore(contents)
}

export function writeStore(path: string, store: RuleStore): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, serializeRuleStore(store), 'utf8')
}
