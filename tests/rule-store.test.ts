import { describe, expect, it } from 'vitest'
import {
  addRule,
  emptyStore,
  mergeStores,
  parseRuleStore,
  ruleId,
  serializeRuleStore,
} from '../src/core/rule-store.js'

const now = '2026-08-28T10:00:00.000Z'
const later = '2026-08-29T10:00:00.000Z'

describe('ruleId', () => {
  it('is stable across case, punctuation and whitespace', () => {
    expect(ruleId('Ask before making decisions')).toBe(ruleId('  ask before,  making decisions! '))
  })

  it('differs for different rules', () => {
    expect(ruleId('Keep answers short')).not.toBe(ruleId('Ask before deciding'))
  })
})

describe('addRule', () => {
  it('stores a rule with id, timestamps and evidence', () => {
    const store = addRule(
      emptyStore(),
      {
        rule: 'Keep answers short',
        category: 'Communication',
        scope: 'global',
        source: 'learned',
        evidence: [{ text: 'i will want to have that really short', sessionId: 's1' }],
      },
      now,
    )

    expect(store.rules).toHaveLength(1)
    expect(store.rules[0]).toMatchObject({
      id: ruleId('Keep answers short'),
      rule: 'Keep answers short',
      category: 'Communication',
      scope: 'global',
      source: 'learned',
      createdAt: now,
    })
    expect(store.rules[0]?.evidence).toHaveLength(1)
  })

  it('merges evidence instead of duplicating an existing rule', () => {
    const first = addRule(
      emptyStore(),
      {
        rule: 'Keep answers short',
        category: 'Communication',
        scope: 'global',
        source: 'learned',
        evidence: [{ text: 'simple short' }],
      },
      now,
    )
    const second = addRule(
      first,
      {
        rule: 'keep answers short',
        category: 'Communication',
        scope: 'global',
        source: 'learned',
        evidence: [{ text: 'really short' }],
      },
      later,
    )

    expect(second.rules).toHaveLength(1)
    expect(second.rules[0]?.evidence.map((e) => e.text)).toEqual(['simple short', 'really short'])
    expect(second.rules[0]?.createdAt).toBe(now)
    expect(second.rules[0]?.updatedAt).toBe(later)
  })
})

describe('parseRuleStore', () => {
  it('round-trips a serialized store', () => {
    const store = addRule(
      emptyStore(),
      { rule: 'Ask first', category: 'Decisions', scope: 'project', source: 'manual', evidence: [] },
      now,
    )
    expect(parseRuleStore(serializeRuleStore(store))).toEqual(store)
  })

  it('fills defaults for optional fields', () => {
    const parsed = parseRuleStore('{"version":1,"rules":[{"rule":"Ask first"}]}')
    expect(parsed.rules[0]).toMatchObject({
      rule: 'Ask first',
      category: 'General',
      scope: 'global',
      evidence: [],
    })
  })

  it('rejects malformed input with a clear error', () => {
    expect(() => parseRuleStore('nope')).toThrow(/not valid JSON/i)
    expect(() => parseRuleStore('{"version":99,"rules":[]}')).toThrow(/version/i)
    expect(() => parseRuleStore('{"version":1}')).toThrow(/rules/i)
    expect(() => parseRuleStore('{"version":1,"rules":[{"category":"x"}]}')).toThrow(/rule/i)
  })
})

describe('mergeStores', () => {
  it('adds new rules, merges evidence, and reports counts', () => {
    const base = addRule(
      emptyStore(),
      {
        rule: 'Keep answers short',
        category: 'Communication',
        scope: 'global',
        source: 'learned',
        evidence: [{ text: 'simple short' }],
      },
      now,
    )
    const incoming = addRule(
      addRule(
        emptyStore(),
        {
          rule: 'Keep answers short',
          category: 'Communication',
          scope: 'global',
          source: 'learned',
          evidence: [{ text: 'really short' }],
        },
        later,
      ),
      {
        rule: 'Ask before deciding',
        category: 'Decisions',
        scope: 'global',
        source: 'manual',
        evidence: [],
      },
      later,
    )

    const result = mergeStores(base, incoming)
    expect(result.added).toBe(1)
    expect(result.merged).toBe(1)
    expect(result.store.rules).toHaveLength(2)
    expect(
      result.store.rules.find((r) => r.rule === 'Keep answers short')?.evidence.map((e) => e.text),
    ).toEqual(['simple short', 'really short'])
  })

  it('does not duplicate identical evidence', () => {
    const rule = {
      rule: 'Keep answers short',
      category: 'Communication',
      scope: 'global' as const,
      source: 'learned' as const,
      evidence: [{ text: 'simple short', sessionId: 's1' }],
    }
    const base = addRule(emptyStore(), rule, now)
    const result = mergeStores(base, addRule(emptyStore(), rule, later))
    expect(result.added).toBe(0)
    expect(result.store.rules[0]?.evidence).toHaveLength(1)
  })
})
