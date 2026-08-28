import { mkdtempSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  addRule,
  emptyStore,
  parseRuleStore,
  serializeRuleStore,
} from '../src/core/rule-store.js'
import { readStore, writeStore } from '../src/persistence/rule-store-files.js'

const now = '2026-08-28T10:00:00.000Z'

function sampleStore() {
  return addRule(
    emptyStore(),
    {
      rule: 'Keep answers short',
      category: 'Communication',
      scope: 'global',
      source: 'learned',
      evidence: [{ text: 'short please', sessionId: 's1', timestamp: now }],
    },
    now,
  )
}

describe('readStore', () => {
  it('names the offending file when a store is corrupt', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pai-corrupt-'))
    const path = join(dir, 'rules.json')
    writeFileSync(path, '{ this is corrupt')

    expect(() => readStore(path)).toThrow(new RegExp(path.replace(/[/\\]/g, '.')))
  })
})

describe('writeStore', () => {
  it('leaves no temporary files behind', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pai-write-'))
    const path = join(dir, 'rules.json')

    writeStore(path, sampleStore())

    expect(readdirSync(dir)).toEqual(['rules.json'])
  })

  it('replaces existing content completely', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pai-write-'))
    const path = join(dir, 'rules.json')
    writeFileSync(path, `${'x'.repeat(5_000)}\n`)

    writeStore(path, emptyStore())

    expect(readStore(path)).toEqual(emptyStore())
  })
})

describe('round-trip fidelity', () => {
  it('is stable across serialize → parse → serialize', () => {
    const store = sampleStore()
    const once = serializeRuleStore(store)
    const twice = serializeRuleStore(parseRuleStore(once))

    expect(twice).toBe(once)
  })

  it('does not invent empty timestamps for rules that lack them', () => {
    const parsed = parseRuleStore('{"version":1,"rules":[{"rule":"Ask first"}]}')

    expect(parsed.rules[0]).not.toHaveProperty('createdAt', '')
    expect(serializeRuleStore(parsed)).not.toContain('""')
  })
})
