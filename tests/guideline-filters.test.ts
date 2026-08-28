import { describe, expect, it } from 'vitest'
import { filterGuidelineGroups, type GuidelineGroup } from '../src/core/guidelines.js'

const groups: GuidelineGroup[] = [
  {
    scope: 'global',
    path: '/home/.claude/CLAUDE.md',
    guidelines: [
      { category: 'Small tasks', text: 'Work one focused step at a time.' },
      { category: 'Communication', text: 'Keep answers short.' },
    ],
  },
  {
    scope: 'project',
    path: '/proj/CLAUDE.md',
    guidelines: [{ category: 'Git', text: 'Never commit without asking.' }],
  },
]

describe('filterGuidelineGroups', () => {
  it('returns everything unchanged with no filters', () => {
    expect(filterGuidelineGroups(groups, {})).toEqual(groups)
  })

  it('filters by scope', () => {
    expect(filterGuidelineGroups(groups, { scope: 'project' })).toEqual([groups[1]])
    expect(filterGuidelineGroups(groups, { scope: 'global' })).toEqual([groups[0]])
  })

  it('searches rule text case-insensitively', () => {
    const result = filterGuidelineGroups(groups, { search: 'COMMIT' })
    expect(result).toHaveLength(1)
    expect(result[0]?.guidelines).toEqual([
      { category: 'Git', text: 'Never commit without asking.' },
    ])
  })

  it('searches category names too', () => {
    const result = filterGuidelineGroups(groups, { search: 'communication' })
    expect(result[0]?.guidelines.map((g) => g.text)).toEqual(['Keep answers short.'])
  })

  it('drops groups with no matches and combines scope with search', () => {
    expect(filterGuidelineGroups(groups, { scope: 'global', search: 'commit' })).toEqual([])
  })

  it('matches word starts, not substrings inside words', () => {
    const tricky: GuidelineGroup[] = [
      {
        scope: 'global',
        path: '/g',
        guidelines: [
          { category: 'Small tasks', text: 'Work one focused step at a time.' },
          { category: 'Model usage', text: 'Ask me before launching a large scan.' },
          { category: 'Communication', text: 'Unless I ask for more.' },
        ],
      },
    ]
    const result = filterGuidelineGroups(tricky, { search: 'ask' })
    expect(result[0]?.guidelines.map((g) => g.text)).toEqual([
      'Ask me before launching a large scan.',
      'Unless I ask for more.',
    ])
  })

  it('treats regex characters in the query as literal text', () => {
    expect(() => filterGuidelineGroups(groups, { search: 'a(b' })).not.toThrow()
  })
})
