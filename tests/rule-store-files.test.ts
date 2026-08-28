import { existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { addRule, emptyStore } from '../src/core/rule-store.js'
import {
  globalStorePath,
  projectStorePath,
  readStore,
  writeStore,
} from '../src/persistence/rule-store-files.js'

describe('store paths', () => {
  it('are agent-neutral .pai locations', () => {
    expect(globalStorePath('/home/me')).toBe(join('/home/me', '.pai', 'rules.json'))
    expect(projectStorePath('/work/app')).toBe(join('/work/app', '.pai', 'rules.json'))
  })
})

describe('readStore / writeStore', () => {
  it('returns an empty store when the file does not exist', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pai-store-'))
    expect(readStore(join(dir, '.pai', 'rules.json'))).toEqual(emptyStore())
  })

  it('creates the directory and round-trips the store', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pai-store-'))
    const path = join(dir, '.pai', 'rules.json')
    const store = addRule(
      emptyStore(),
      {
        rule: 'Keep answers short',
        category: 'Communication',
        scope: 'global',
        source: 'manual',
        evidence: [],
      },
      '2026-08-28T10:00:00.000Z',
    )

    writeStore(path, store)

    expect(existsSync(path)).toBe(true)
    expect(readStore(path)).toEqual(store)
  })
})
