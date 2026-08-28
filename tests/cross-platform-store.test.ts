import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  addRule,
  emptyStore,
  mergeStores,
  parseRuleStore,
  ruleId,
  serializeRuleStore,
} from '../src/core/rule-store.js'
import { readStore } from '../src/persistence/rule-store-files.js'

const now = '2026-08-28T10:00:00.000Z'

describe('rules exported on one platform and imported on another', () => {
  it('gives a rule the same id regardless of line endings', () => {
    expect(ruleId('Ask first,\r\nthen act')).toBe(ruleId('Ask first,\nthen act'))
  })

  it('normalizes CRLF in stored rule and evidence text', () => {
    const store = addRule(
      emptyStore(),
      {
        rule: 'Ask first,\r\nthen act',
        category: 'Decisions',
        scope: 'global',
        source: 'learned',
        evidence: [{ text: 'no,\r\nask me first' }],
      },
      now,
    )

    expect(store.rules[0]?.rule).toBe('Ask first,\nthen act')
    expect(store.rules[0]?.evidence[0]?.text).toBe('no,\nask me first')
  })

  it('does not duplicate evidence that differs only by line endings', () => {
    const unix = addRule(
      emptyStore(),
      {
        rule: 'Keep answers short',
        category: 'Communication',
        scope: 'global',
        source: 'learned',
        evidence: [{ text: 'short answers,\nplease' }],
      },
      now,
    )
    const windows = addRule(
      emptyStore(),
      {
        rule: 'Keep answers short',
        category: 'Communication',
        scope: 'global',
        source: 'learned',
        evidence: [{ text: 'short answers,\r\nplease' }],
      },
      now,
    )

    const result = mergeStores(unix, windows)
    expect(result.added).toBe(0)
    expect(result.merged).toBe(0)
    expect(result.store.rules[0]?.evidence).toHaveLength(1)
  })

  it('parses a store whose file has a BOM and CRLF line endings', () => {
    const store = addRule(
      emptyStore(),
      {
        rule: 'Keep answers short',
        category: 'Communication',
        scope: 'global',
        source: 'learned',
        evidence: [],
      },
      now,
    )
    const windowsFile = `﻿${serializeRuleStore(store).replace(/\n/g, '\r\n')}`

    expect(parseRuleStore(windowsFile)).toEqual(store)
  })

  it('reads a store file written as UTF-16 by PowerShell', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pai-win-'))
    const path = join(dir, 'rules.json')
    const store = addRule(
      emptyStore(),
      {
        rule: 'Never commit without asking',
        category: 'Git',
        scope: 'project',
        source: 'manual',
        evidence: [],
      },
      now,
    )
    writeFileSync(path, Buffer.from(`﻿${serializeRuleStore(store)}`, 'utf16le'))

    expect(readStore(path)).toEqual(store)
  })

  it('stores no filesystem paths, so a store is portable as-is', () => {
    const store = addRule(
      emptyStore(),
      {
        rule: 'Keep answers short',
        category: 'Communication',
        scope: 'project',
        source: 'learned',
        evidence: [{ text: 'short please', sessionId: 's1', timestamp: now }],
      },
      now,
    )
    const json = serializeRuleStore(store)

    expect(json).not.toMatch(/[A-Za-z]:\\/) // no Windows drive paths
    expect(json).not.toMatch(/\/(Users|home)\//) // no POSIX home paths
  })
})
