import { describe, expect, it } from 'vitest'
import {
  MANAGED_HEADER,
  ensurePointer,
  mergeManagedMarkdown,
  parseExportDocument,
  serializeExportDocument,
  toExportRules,
  validateExportDocument,
} from '../src/core/managed-guidelines.js'
import { parseGuidelines } from '../src/core/guidelines.js'

const POINTER = '@CLAUDE.pai.md'

describe('mergeManagedMarkdown', () => {
  it('creates a new file with the header and rules under their headings', () => {
    const result = mergeManagedMarkdown(undefined, [
      { rule: 'Keep answers short.', category: 'Communication' },
      { rule: 'Ask before deciding.', category: 'Decisions' },
      { rule: 'Do not add background.', category: 'Communication' },
    ])

    expect(result.added).toBe(3)
    expect(result.existing).toBe(0)
    expect(result.markdown).toBe(
      `${MANAGED_HEADER}\n\n## Communication\n- Keep answers short.\n- Do not add background.\n\n## Decisions\n- Ask before deciding.\n`,
    )
    expect(result.markdown.startsWith('﻿')).toBe(false)
  })

  it('appends under an existing heading and creates missing headings at the end', () => {
    const existing = `${MANAGED_HEADER}\n\n## Communication\n- Keep answers short.\n\n## Git\n- Never force-push.\n`
    const result = mergeManagedMarkdown(existing, [
      { rule: 'Do not add background.', category: 'Communication' },
      { rule: 'Ask before deciding.', category: 'Decisions' },
    ])

    expect(result.added).toBe(2)
    expect(result.markdown).toBe(
      `${MANAGED_HEADER}\n\n## Communication\n- Keep answers short.\n- Do not add background.\n\n## Git\n- Never force-push.\n\n## Decisions\n- Ask before deciding.\n`,
    )
  })

  it('preserves prose and order exactly', () => {
    const existing = `# Title\n\nSome prose that is not a rule.\n\n## Communication\n- Keep answers short.\n\nMore prose inside the section.\n\n## Git\n- Never force-push.\n`
    const result = mergeManagedMarkdown(existing, [
      { rule: 'Do not add background.', category: 'Communication' },
    ])

    expect(result.markdown).toBe(
      `# Title\n\nSome prose that is not a rule.\n\n## Communication\n- Keep answers short.\n\nMore prose inside the section.\n- Do not add background.\n\n## Git\n- Never force-push.\n`,
    )
    expect(parseGuidelines(result.markdown)).toEqual([
      { category: 'Communication', text: 'Keep answers short.' },
      { category: 'Communication', text: 'Do not add background.' },
      { category: 'Git', text: 'Never force-push.' },
    ])
  })

  it('treats case, punctuation, whitespace and CRLF variants as the same rule', () => {
    const existing = `## Communication\n- Keep answers short.\n`
    const result = mergeManagedMarkdown(existing, [
      { rule: 'keep answers short', category: 'Communication' },
      { rule: 'Keep  answers, short!', category: 'Other' },
      { rule: 'Keep answers\r\nshort.', category: 'Communication' },
    ])

    expect(result.added).toBe(0)
    expect(result.existing).toBe(3)
    expect(result.markdown).toBe(existing)
  })

  it('does not add the same incoming rule twice', () => {
    const result = mergeManagedMarkdown(undefined, [
      { rule: 'Ask first.', category: 'Decisions' },
      { rule: 'ask first', category: 'Decisions' },
    ])
    expect(result.added).toBe(1)
    expect(result.existing).toBe(1)
  })

  it('renders the General category as a heading', () => {
    const result = mergeManagedMarkdown(undefined, [{ rule: 'Be brief.', category: 'General' }])
    expect(result.markdown).toBe(`${MANAGED_HEADER}\n\n## General\n- Be brief.\n`)
  })

  it('normalizes an existing CRLF file to LF when it changes', () => {
    const result = mergeManagedMarkdown('## Git\r\n- Never force-push.\r\n', [
      { rule: 'Ask first.', category: 'Git' },
    ])
    expect(result.markdown).toBe('## Git\n- Never force-push.\n- Ask first.\n')
  })
})

describe('ensurePointer', () => {
  it('creates CLAUDE.md with only the pointer when missing', () => {
    expect(ensurePointer(undefined, POINTER)).toEqual({
      suffix: `${POINTER}\n`,
      action: 'created',
    })
  })

  it('leaves CLAUDE.md unchanged when the pointer line is present', () => {
    const content = `# Rules\n\n- Ask first.\n\n  ${POINTER}  \n`
    expect(ensurePointer(content, POINTER)).toEqual({ suffix: '', action: 'unchanged' })
  })

  it('returns a suffix that leaves exactly one blank line before the pointer', () => {
    expect(ensurePointer('# Rules\n- Ask first.\n', POINTER)).toEqual({
      suffix: `\n${POINTER}\n`,
      action: 'appended',
    })
    expect(ensurePointer('# Rules\n- Ask first.', POINTER).suffix).toBe(`\n\n${POINTER}\n`)
    expect(ensurePointer('# Rules\n- Ask first.\r\n', POINTER).suffix).toBe(`\n${POINTER}\n`)
    expect(ensurePointer('# Rules\n- Ask first.\n\n', POINTER).suffix).toBe(`${POINTER}\n`)
  })

  it('does not count the pointer when it is embedded in other text', () => {
    const result = ensurePointer(`See ${POINTER} for PAI rules.\n`, POINTER)
    expect(result).toEqual({ suffix: `\n${POINTER}\n`, action: 'appended' })
  })

  it('appends just the pointer to an empty or whitespace-only file', () => {
    expect(ensurePointer('', POINTER).suffix).toBe(`${POINTER}\n`)
    expect(ensurePointer('\n\n', POINTER).suffix).toBe(`${POINTER}\n`)
  })
})

describe('export document', () => {
  const rules = [
    { rule: 'Keep answers short.', category: 'Communication', scope: 'global' as const },
    { rule: 'Never force-push.', category: 'Git', scope: 'project' as const },
  ]
  const meta = { pai: '0.3.1', exportedAt: '2026-08-29T12:00:00.000Z' }
  const opts = { currentPaiVersion: '0.3.1' }

  it('serializes to version 2 with two-space indent and a trailing newline', () => {
    const json = serializeExportDocument(rules, meta)
    expect(json).toBe(
      `${JSON.stringify({ version: 2, pai: meta.pai, exportedAt: meta.exportedAt, rules }, null, 2)}\n`,
    )
    expect(json.startsWith('﻿')).toBe(false)
  })

  it('includes version, pai and exportedAt as the header, in that order', () => {
    const json = serializeExportDocument(rules, meta)
    const parsed = JSON.parse(json) as Record<string, unknown>
    expect(Object.keys(parsed)).toEqual(['version', 'pai', 'exportedAt', 'rules'])
    expect(parsed['pai']).toBe(meta.pai)
    expect(parsed['exportedAt']).toBe(meta.exportedAt)
  })

  it('parses a valid version 2 document', () => {
    expect(parseExportDocument(serializeExportDocument(rules, meta), opts)).toEqual({
      version: 2,
      rules,
    })
  })

  it('parses a version 2 document without pai or exportedAt', () => {
    const json = `${JSON.stringify({ version: 2, rules }, null, 2)}\n`
    expect(parseExportDocument(json, opts)).toEqual({ version: 2, rules })
  })

  it('ignores unknown extra top-level fields', () => {
    const json = `${JSON.stringify({ version: 2, rules, futureField: 'x' }, null, 2)}\n`
    expect(parseExportDocument(json, opts)).toEqual({ version: 2, rules })
  })

  it('accepts a version 1 rule store and maps rule, category and scope', () => {
    const v1 = JSON.stringify({
      version: 1,
      rules: [
        {
          id: 'x',
          rule: 'Ask first.',
          category: 'Decisions',
          scope: 'project',
          source: 'manual',
          evidence: [{ text: 'ask me first' }],
        },
        { rule: 'Be brief.' },
      ],
    })
    expect(parseExportDocument(v1, opts)).toEqual({
      version: 2,
      migratedFrom: 1,
      rules: [
        { rule: 'Ask first.', category: 'Decisions', scope: 'project' },
        { rule: 'Be brief.', category: 'General', scope: 'global' },
      ],
    })
  })

  it('does not set migratedFrom for a document that is already the current format', () => {
    const result = parseExportDocument(serializeExportDocument(rules, meta), opts)
    expect(result.migratedFrom).toBeUndefined()
  })

  it('tolerates a BOM and CRLF line endings', () => {
    const windows = `﻿${serializeExportDocument(rules, meta).replace(/\n/g, '\r\n')}`
    expect(parseExportDocument(windows, opts)).toEqual({ version: 2, rules })
  })

  it('rejects a newer format with an upgrade message naming the producer version', () => {
    const json = JSON.stringify({ version: 3, pai: '0.9.0', rules: [] })
    expect(() => parseExportDocument(json, { currentPaiVersion: '0.3.1' })).toThrow(
      'Invalid PAI export: format 3 was produced by pai 0.9.0; this pai (0.3.1) supports up to format 2 — upgrade pai',
    )
  })

  it('says "pai unknown" when the newer format has no pai field', () => {
    const json = JSON.stringify({ version: 3, rules: [] })
    expect(() => parseExportDocument(json, { currentPaiVersion: '0.3.1' })).toThrow(
      'Invalid PAI export: format 3 was produced by pai unknown; this pai (0.3.1) supports up to format 2 — upgrade pai',
    )
  })

  it('formats multiple problems as a header line plus one indented line each', () => {
    const json = JSON.stringify({
      version: 2,
      pai: 42,
      exportedAt: 'not-a-date',
      rules: [{ rule: '', category: 'x', scope: 'global' }],
    })
    let message = ''
    try {
      parseExportDocument(json, opts)
    } catch (error) {
      message = error instanceof Error ? error.message : String(error)
    }
    expect(message).toBe(
      [
        'Invalid PAI export: 3 problem(s)',
        '  - pai: expected string',
        '  - exportedAt: expected ISO-8601 timestamp',
        '  - rules[0].rule: expected non-empty string (max 500 chars)',
      ].join('\n'),
    )
  })

  it('rejects malformed input with clear errors', () => {
    expect(() => parseExportDocument('nope', opts)).toThrow(/^Invalid PAI export: .*not valid JSON/)
    expect(() => parseExportDocument('[]', opts)).toThrow(/^Invalid PAI export: /)
    expect(() => parseExportDocument('{"version":0,"rules":[]}', opts)).toThrow(
      'Invalid PAI export: "version" must be a positive integer',
    )
    expect(() => parseExportDocument('{"version":2}', opts)).toThrow(
      /^Invalid PAI export: 1 problem\(s\)\n {2}- rules: expected array$/,
    )
    expect(() => parseExportDocument('{"version":2,"rules":[1]}', opts)).toThrow(
      /rules\[0\]: expected object/,
    )
    expect(() => parseExportDocument('{"version":2,"rules":[{"category":"x"}]}', opts)).toThrow(
      /rules\[0\]\.rule: expected non-empty string \(max 500 chars\)/,
    )
    expect(() =>
      parseExportDocument(
        '{"version":2,"rules":[{"rule":"x","category":"y","scope":"team"}]}',
        opts,
      ),
    ).toThrow(
      /^Invalid PAI export: 1 problem\(s\)\n {2}- rules\[0\]\.scope: expected "global" or "project"$/,
    )
  })
})

describe('validateExportDocument', () => {
  it('collects every problem, each with a JSON-path prefix', () => {
    const result = validateExportDocument({
      version: 1,
      pai: 42,
      rules: [{ rule: 'x'.repeat(501), category: 'y', scope: 'global' }],
    })
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected failure')
    expect(result.problems).toEqual([
      'version: expected 2',
      'pai: expected string',
      'rules[0].rule: expected non-empty string (max 500 chars)',
    ])
  })

  it('rejects a rule over 500 chars and a category over 80 chars', () => {
    const result = validateExportDocument({
      version: 2,
      rules: [{ rule: 'x'.repeat(501), category: 'y'.repeat(81), scope: 'global' }],
    })
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected failure')
    expect(result.problems).toEqual([
      'rules[0].rule: expected non-empty string (max 500 chars)',
      'rules[0].category: expected string (max 80 chars)',
    ])
  })

  it('ignores unknown top-level and per-rule fields', () => {
    const result = validateExportDocument({
      version: 2,
      futureField: 'x',
      rules: [{ rule: 'Ask first.', category: 'Decisions', scope: 'global', futureField: 'y' }],
    })
    expect(result).toEqual({
      ok: true,
      document: {
        version: 2,
        rules: [{ rule: 'Ask first.', category: 'Decisions', scope: 'global' }],
      },
    })
  })

  it('stops rule-level checks when "rules" is missing or not an array', () => {
    expect(validateExportDocument({ version: 2 })).toEqual({
      ok: false,
      problems: ['rules: expected array'],
    })
  })
})

describe('toExportRules', () => {
  it('flattens groups in file order and document order', () => {
    expect(
      toExportRules([
        {
          scope: 'global',
          path: '/h/.claude/CLAUDE.md',
          guidelines: [{ category: 'Communication', text: 'Keep answers short.' }],
        },
        {
          scope: 'global',
          path: '/h/.claude/CLAUDE.pai.md',
          managed: true,
          guidelines: [{ category: 'Decisions', text: 'Ask first.' }],
        },
        {
          scope: 'project',
          path: '/p/CLAUDE.md',
          guidelines: [{ category: 'Git', text: 'Never force-push.' }],
        },
      ]),
    ).toEqual([
      { rule: 'Keep answers short.', category: 'Communication', scope: 'global' },
      { rule: 'Ask first.', category: 'Decisions', scope: 'global' },
      { rule: 'Never force-push.', category: 'Git', scope: 'project' },
    ])
  })
})
