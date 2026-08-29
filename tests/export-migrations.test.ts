import { describe, expect, it } from 'vitest'
import { CURRENT_EXPORT_FORMAT, migrateExport } from '../src/core/export-migrations.js'

const opts = { currentPaiVersion: '0.3.1' }

describe('migrateExport', () => {
  it('exposes the current export format', () => {
    expect(CURRENT_EXPORT_FORMAT).toBe(2)
  })

  it('migrates a v1 rule store to v2, mapping fields and dropping extras', () => {
    const v1 = {
      version: 1,
      rules: [
        {
          id: 'x',
          rule: 'Ask first.',
          category: 'Decisions',
          scope: 'project',
          source: 'manual',
          evidence: [{ text: 'ask me first' }],
          createdAt: '2026-01-01T00:00:00.000Z',
        },
        { rule: 'Be brief.' },
      ],
    }
    const result = migrateExport(v1, opts)
    expect(result.migratedFrom).toBe(1)
    expect(result.document).toEqual({
      version: 2,
      rules: [
        { rule: 'Ask first.', category: 'Decisions', scope: 'project' },
        { rule: 'Be brief.', category: 'General', scope: 'global' },
      ],
    })
  })

  it('passes a v2 document through unchanged with no migratedFrom', () => {
    const v2 = { version: 2, pai: '0.3.1', rules: [{ rule: 'x', category: 'y', scope: 'global' }] }
    const result = migrateExport(v2, opts)
    expect(result.migratedFrom).toBeUndefined()
    expect(result.document).toEqual(v2)
  })

  it('rejects a newer format with the exact upgrade message', () => {
    expect(() => migrateExport({ version: 3, pai: '0.9.0', rules: [] }, opts)).toThrow(
      'Invalid PAI export: format 3 was produced by pai 0.9.0; this pai (0.3.1) supports up to format 2 — upgrade pai',
    )
  })

  it('says "pai unknown" when the newer format has no pai field', () => {
    expect(() => migrateExport({ version: 3, rules: [] }, opts)).toThrow(
      'Invalid PAI export: format 3 was produced by pai unknown; this pai (0.3.1) supports up to format 2 — upgrade pai',
    )
  })

  it('rejects version 0, string versions and a missing version', () => {
    expect(() => migrateExport({ version: 0, rules: [] }, opts)).toThrow(
      'Invalid PAI export: "version" must be a positive integer',
    )
    expect(() => migrateExport({ version: '2', rules: [] }, opts)).toThrow(
      'Invalid PAI export: "version" must be a positive integer',
    )
    expect(() => migrateExport({ rules: [] }, opts)).toThrow(
      'Invalid PAI export: "version" must be a positive integer',
    )
  })
})
