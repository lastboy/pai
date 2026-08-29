import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  POINTER_LINE,
  findExportableGuidelineFiles,
  guidelineDir,
  managedImportTarget,
} from '../src/adapters/claude/guidelines.js'
import {
  MANAGED_HEADER,
  parseExportDocument,
  serializeExportDocument,
  toExportRules,
  type ExportedRule,
} from '../src/core/managed-guidelines.js'
import {
  importManagedGuidelines,
  readGuidelineGroups,
} from '../src/persistence/managed-guideline-files.js'
import { decodeTextFile } from '../src/persistence/text-file.js'

function fakeMachine(): { home: string; cwd: string } {
  return {
    home: mkdtempSync(join(tmpdir(), 'pai-home-')),
    cwd: mkdtempSync(join(tmpdir(), 'pai-proj-')),
  }
}

// What the CLI does for `pai export`.
function exportRules(cwd: string, home: string): ExportedRule[] {
  return toExportRules(readGuidelineGroups(findExportableGuidelineFiles(cwd, home)))
}

// What the CLI does for `pai import`.
function importRules(
  rules: ExportedRule[],
  cwd: string,
  home: string,
  dryRun = false,
): ReturnType<typeof importManagedGuidelines>[] {
  const results: ReturnType<typeof importManagedGuidelines>[] = []
  for (const scope of ['global', 'project'] as const) {
    const scoped = rules.filter((rule) => rule.scope === scope)
    if (scoped.length === 0) continue
    results.push(
      importManagedGuidelines(managedImportTarget(guidelineDir(scope, cwd, home)), scoped, {
        dryRun,
      }),
    )
  }
  return results
}

const rules: ExportedRule[] = [
  { rule: 'Keep answers short.', category: 'Communication', scope: 'global' },
  { rule: 'Ask before deciding.', category: 'Decisions', scope: 'global' },
  { rule: 'Never force-push.', category: 'Git', scope: 'project' },
]

describe('pai import into a machine with no CLAUDE.md files', () => {
  it('creates CLAUDE.md with the pointer and CLAUDE.pai.md with the rules', () => {
    const { home, cwd } = fakeMachine()

    const results = importRules(rules, cwd, home)

    expect(results.map((r) => ({ pointer: r.pointer, added: r.added, existing: r.existing }))).toEqual([
      { pointer: 'created', added: 2, existing: 0 },
      { pointer: 'created', added: 1, existing: 0 },
    ])
    expect(readFileSync(join(home, '.claude', 'CLAUDE.md'), 'utf8')).toBe(`${POINTER_LINE}\n`)
    expect(readFileSync(join(cwd, 'CLAUDE.md'), 'utf8')).toBe(`${POINTER_LINE}\n`)
    expect(readFileSync(join(home, '.claude', 'CLAUDE.pai.md'), 'utf8')).toBe(
      `${MANAGED_HEADER}\n\n## Communication\n- Keep answers short.\n\n## Decisions\n- Ask before deciding.\n`,
    )
    expect(readFileSync(join(cwd, 'CLAUDE.pai.md'), 'utf8')).toBe(
      `${MANAGED_HEADER}\n\n## Git\n- Never force-push.\n`,
    )
    expect(results[1]?.managedPath).toBe(join(cwd, 'CLAUDE.pai.md'))
    expect(results[1]?.claudeMdPath).toBe(join(cwd, 'CLAUDE.md'))
    // No temp files left behind.
    expect(readdirSync(cwd).sort()).toEqual(['CLAUDE.md', 'CLAUDE.pai.md'])
  })
})

describe('pai import into a machine with hand-written CLAUDE.md', () => {
  it('appends only the pointer line and never touches the hand-written rules', () => {
    const { home, cwd } = fakeMachine()
    const handWritten = '# How We Work\n\n## Communication\n- Keep answers short.\n'
    writeFileSync(join(cwd, 'CLAUDE.md'), handWritten)

    const [result] = importRules(rules.filter((r) => r.scope === 'project'), cwd, home)

    expect(result?.pointer).toBe('appended')
    expect(readFileSync(join(cwd, 'CLAUDE.md'), 'utf8')).toBe(`${handWritten}\n${POINTER_LINE}\n`)
    expect(existsSync(join(home, '.claude'))).toBe(false)
  })

  it('keeps a symlinked CLAUDE.md a symlink and appends the pointer to its target once', () => {
    const { home, cwd } = fakeMachine()
    const dotfiles = mkdtempSync(join(tmpdir(), 'pai-dotfiles-'))
    const target = join(dotfiles, 'CLAUDE.md')
    const handWritten = '# How We Work\n- Keep answers short.\n'
    writeFileSync(target, handWritten)
    symlinkSync(target, join(cwd, 'CLAUDE.md'))

    importRules(rules.filter((r) => r.scope === 'project'), cwd, home)
    importRules(rules.filter((r) => r.scope === 'project'), cwd, home)

    expect(lstatSync(join(cwd, 'CLAUDE.md')).isSymbolicLink()).toBe(true)
    const content = readFileSync(target, 'utf8')
    expect(content).toBe(`${handWritten}\n${POINTER_LINE}\n`)
    expect(content.split(POINTER_LINE)).toHaveLength(2)
  })

  it('writes through a symlinked CLAUDE.pai.md instead of replacing it', () => {
    const { home, cwd } = fakeMachine()
    const dotfiles = mkdtempSync(join(tmpdir(), 'pai-dotfiles-'))
    const target = join(dotfiles, 'CLAUDE.pai.md')
    writeFileSync(target, '## Git\n- Never force-push.\n')
    symlinkSync(target, join(cwd, 'CLAUDE.pai.md'))

    importRules([{ rule: 'Ask first.', category: 'Git', scope: 'project' }], cwd, home)

    expect(lstatSync(join(cwd, 'CLAUDE.pai.md')).isSymbolicLink()).toBe(true)
    expect(readFileSync(target, 'utf8')).toBe('## Git\n- Never force-push.\n- Ask first.\n')
  })

  it('leaves existing CLAUDE.md bytes intact and adds exactly one blank line before the pointer', () => {
    const { home, cwd } = fakeMachine()
    const cases: Array<[string, string]> = [
      ['# Rules\r\n- Ask first.\r\n', `\n${POINTER_LINE}\n`],
      ['# Rules\n- Ask first.', `\n\n${POINTER_LINE}\n`],
      ['# Rules\n- Ask first.\n\n', `${POINTER_LINE}\n`],
    ]
    for (const [original, suffix] of cases) {
      const dir = mkdtempSync(join(cwd, 'case-'))
      writeFileSync(join(dir, 'CLAUDE.md'), original)
      importManagedGuidelines(managedImportTarget(dir), [{ rule: 'x', category: 'y' }])
      expect(readFileSync(join(dir, 'CLAUDE.md'), 'utf8')).toBe(`${original}${suffix}`)
    }
    expect(existsSync(join(home, '.claude'))).toBe(false)
  })

  it('does not dedupe against hand-written CLAUDE.md; only CLAUDE.pai.md matters', () => {
    const { home, cwd } = fakeMachine()
    writeFileSync(join(cwd, 'CLAUDE.md'), '## Git\n- Never force-push.\n')

    const [result] = importRules(rules.filter((r) => r.scope === 'project'), cwd, home)

    expect(result?.added).toBe(1)
    expect(readFileSync(join(cwd, 'CLAUDE.pai.md'), 'utf8')).toContain('- Never force-push.')
  })
})

describe('pai import is idempotent', () => {
  it('adds nothing on the second run', () => {
    const { home, cwd } = fakeMachine()
    importRules(rules, cwd, home)
    const before = {
      globalMd: readFileSync(join(home, '.claude', 'CLAUDE.md'), 'utf8'),
      globalPai: readFileSync(join(home, '.claude', 'CLAUDE.pai.md'), 'utf8'),
      projectMd: readFileSync(join(cwd, 'CLAUDE.md'), 'utf8'),
      projectPai: readFileSync(join(cwd, 'CLAUDE.pai.md'), 'utf8'),
    }

    const results = importRules(rules, cwd, home)

    expect(results.map((r) => ({ pointer: r.pointer, added: r.added, existing: r.existing }))).toEqual([
      { pointer: 'unchanged', added: 0, existing: 2 },
      { pointer: 'unchanged', added: 0, existing: 1 },
    ])
    expect(readFileSync(join(home, '.claude', 'CLAUDE.md'), 'utf8')).toBe(before.globalMd)
    expect(readFileSync(join(home, '.claude', 'CLAUDE.pai.md'), 'utf8')).toBe(before.globalPai)
    expect(readFileSync(join(cwd, 'CLAUDE.md'), 'utf8')).toBe(before.projectMd)
    expect(readFileSync(join(cwd, 'CLAUDE.pai.md'), 'utf8')).toBe(before.projectPai)
  })

  it('imports a UTF-16 + BOM + CRLF export file, and re-importing it adds nothing', () => {
    const { home, cwd } = fakeMachine()
    const windowsFile = join(mkdtempSync(join(tmpdir(), 'pai-win-')), 'rules.json')
    writeFileSync(
      windowsFile,
      Buffer.from(`﻿${serializeExportDocument(rules).replace(/\n/g, '\r\n')}`, 'utf16le'),
    )
    const document = parseExportDocument(decodeTextFile(readFileSync(windowsFile)))
    expect(document.rules).toEqual(rules)

    const first = importRules(document.rules, cwd, home)
    const second = importRules(document.rules, cwd, home)

    expect(first.map((r) => r.added)).toEqual([2, 1])
    expect(second.map((r) => r.added)).toEqual([0, 0])
    expect(readFileSync(join(cwd, 'CLAUDE.pai.md'), 'utf8')).not.toContain('\r')
  })
})

describe('pai import --dry-run', () => {
  it('reports what would change and writes nothing', () => {
    const { home, cwd } = fakeMachine()
    writeFileSync(join(cwd, 'CLAUDE.md'), '# Rules\n')

    const results = importRules(rules, cwd, home, true)

    expect(results.map((r) => ({ pointer: r.pointer, added: r.added }))).toEqual([
      { pointer: 'created', added: 2 },
      { pointer: 'appended', added: 1 },
    ])
    expect(existsSync(join(home, '.claude'))).toBe(false)
    expect(readdirSync(cwd)).toEqual(['CLAUDE.md'])
    expect(readFileSync(join(cwd, 'CLAUDE.md'), 'utf8')).toBe('# Rules\n')
  })
})

describe('pai export', () => {
  it('collects CLAUDE.md and CLAUDE.pai.md but not CLAUDE.local.md', () => {
    const { home, cwd } = fakeMachine()
    mkdirSync(join(home, '.claude'), { recursive: true })
    writeFileSync(join(home, '.claude', 'CLAUDE.md'), '## Communication\n- Keep answers short.\n')
    writeFileSync(join(cwd, 'CLAUDE.md'), '## Git\n- Never force-push.\n')
    writeFileSync(join(cwd, 'CLAUDE.local.md'), '## Local\n- Machine-specific.\n')
    writeFileSync(join(cwd, 'CLAUDE.pai.md'), '## Decisions\n- Ask first.\n')

    expect(exportRules(cwd, home)).toEqual([
      { rule: 'Keep answers short.', category: 'Communication', scope: 'global' },
      { rule: 'Never force-push.', category: 'Git', scope: 'project' },
      { rule: 'Ask first.', category: 'Decisions', scope: 'project' },
    ])
  })

  it('round-trips byte-identically: export → import into an empty machine → export', () => {
    const source = fakeMachine()
    mkdirSync(join(source.home, '.claude'), { recursive: true })
    writeFileSync(
      join(source.home, '.claude', 'CLAUDE.md'),
      '# How We Work\n\nProse.\n\n## Communication\n- Keep answers short.\n- Do not add background.\n\n## Decisions\n- Ask first.\n',
    )
    writeFileSync(join(source.cwd, 'CLAUDE.md'), '## Git\n- Never force-push.\n')
    const exported = serializeExportDocument(exportRules(source.cwd, source.home))

    const target = fakeMachine()
    importRules(parseExportDocument(exported).rules, target.cwd, target.home)
    const reExported = serializeExportDocument(exportRules(target.cwd, target.home))

    expect(reExported).toBe(exported)
  })
})
