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
})
