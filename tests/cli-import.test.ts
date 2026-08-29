import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createProgram } from '../src/cli/program.js'
import { serializeExportDocument } from '../src/core/managed-guidelines.js'

// Only global rules are imported, so the CLI resolves everything from $HOME
// (os.homedir() honours it on POSIX) and never looks at the real ~/.claude.
const originalHome = process.env['HOME']
let home: string
let file: string

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'pai-home-'))
  process.env['HOME'] = home
  file = join(mkdtempSync(join(tmpdir(), 'pai-export-')), 'rules.json')
  writeFileSync(
    file,
    serializeExportDocument(
      [
        { rule: 'Keep answers short.', category: 'Communication', scope: 'global' },
        { rule: 'Ask first.', category: 'Decisions', scope: 'global' },
      ],
      { pai: '0.3.1', exportedAt: '2026-08-29T12:00:00.000Z' },
    ),
  )
})

afterEach(() => {
  process.env['HOME'] = originalHome
})

describe('pai import --dry-run', () => {
  it('uses conditional wording and writes nothing', async () => {
    const lines: string[] = []
    await createProgram((line) => lines.push(line)).parseAsync(['import', file, '--dry-run'], {
      from: 'user',
    })

    expect(lines).toEqual([
      `Target (global): ${join(home, '.claude')}`,
      '  would create CLAUDE.md with pointer',
      `global: would add 2 rule(s), 0 already present → ${join(home, '.claude', 'CLAUDE.pai.md')}`,
      '(dry run — nothing was written)',
    ])
    expect(existsSync(join(home, '.claude'))).toBe(false)
  })

  it('says "would add pointer line" for an existing CLAUDE.md without one', async () => {
    mkdirSync(join(home, '.claude'))
    writeFileSync(join(home, '.claude', 'CLAUDE.md'), '# Mine\n')
    const lines: string[] = []
    await createProgram((line) => lines.push(line)).parseAsync(['import', file, '--dry-run'], {
      from: 'user',
    })

    expect(lines[1]).toBe('  would add pointer line to CLAUDE.md')
    expect(existsSync(join(home, '.claude', 'CLAUDE.pai.md'))).toBe(false)
  })
})

describe('pai import', () => {
  it('uses past-tense wording once files are written', async () => {
    const lines: string[] = []
    await createProgram((line) => lines.push(line)).parseAsync(['import', file], { from: 'user' })

    expect(lines).toEqual([
      `Target (global): ${join(home, '.claude')}`,
      '  created CLAUDE.md with pointer',
      `global: 2 added, 0 already present → ${join(home, '.claude', 'CLAUDE.pai.md')}`,
    ])
    expect(existsSync(join(home, '.claude', 'CLAUDE.pai.md'))).toBe(true)
  })

  it('prints a "Migrated from format" line before the Target lines', async () => {
    const v1File = join(mkdtempSync(join(tmpdir(), 'pai-export-')), 'rules.json')
    writeFileSync(
      v1File,
      JSON.stringify({
        version: 1,
        rules: [{ rule: 'Ask first.', category: 'Decisions', scope: 'global' }],
      }),
    )
    const lines: string[] = []
    await createProgram((line) => lines.push(line)).parseAsync(['import', v1File], {
      from: 'user',
    })

    expect(lines[0]).toBe('Migrated from format 1.')
    expect(lines[1]).toBe(`Target (global): ${join(home, '.claude')}`)
  })
})

describe('pai import --validate', () => {
  it('prints a summary for a valid file and writes nothing', async () => {
    const lines: string[] = []
    await createProgram((line) => lines.push(line)).parseAsync(['import', file, '--validate'], {
      from: 'user',
    })

    expect(lines).toEqual([
      'Valid PAI export (format 2, pai 0.3.1, exported 2026-08-29T12:00:00.000Z)',
      'Rules: 2 (global 2, project 0)',
    ])
    expect(existsSync(join(home, '.claude'))).toBe(false)
  })

  it('prints a "Migrated from" line for a v1 file and writes nothing', async () => {
    const v1File = join(mkdtempSync(join(tmpdir(), 'pai-export-')), 'rules.json')
    writeFileSync(
      v1File,
      JSON.stringify({
        version: 1,
        rules: [{ rule: 'Ask first.', category: 'Decisions', scope: 'global' }],
      }),
    )
    const lines: string[] = []
    await createProgram((line) => lines.push(line)).parseAsync(['import', v1File, '--validate'], {
      from: 'user',
    })

    expect(lines).toEqual([
      'Valid PAI export (format 2, pai unknown)',
      'Rules: 1 (global 1, project 0)',
      'Migrated from format 1 (would be imported as format 2)',
    ])
    expect(existsSync(join(home, '.claude'))).toBe(false)
  })

  it('exits 1 and prints problems for an invalid file', async () => {
    const badFile = join(mkdtempSync(join(tmpdir(), 'pai-export-')), 'rules.json')
    writeFileSync(badFile, JSON.stringify({ version: 2, rules: [{ scope: 'team' }] }))
    const lines: string[] = []
    const previousExitCode = process.exitCode
    process.exitCode = undefined
    await createProgram((line) => lines.push(line)).parseAsync(['import', badFile, '--validate'], {
      from: 'user',
    })

    expect(lines[0]).toMatch(/^Invalid PAI export: 2 problem\(s\)$/)
    expect(lines).toContain('  - rules[0].rule: expected non-empty string (max 500 chars)')
    expect(lines).toContain('  - rules[0].scope: expected "global" or "project"')
    expect(process.exitCode).toBe(1)
    expect(existsSync(join(home, '.claude'))).toBe(false)
    process.exitCode = previousExitCode
  })
})
