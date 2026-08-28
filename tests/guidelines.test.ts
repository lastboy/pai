import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { findGuidelineFiles, parseGuidelines } from '../src/adapters/claude/guidelines.js'
import { renderGuidelines } from '../src/cli/render.js'

const markdown = `# How We Work

Intro prose that is not a rule.

## Small tasks
- Work one focused step at a time.
- Do not expand scope on your own.

## Communication
- Keep answers short.
* Give the minimum information needed.
`

describe('parseGuidelines', () => {
  const guidelines = parseGuidelines(markdown)

  it('extracts bullets with their nearest heading as category', () => {
    expect(guidelines).toEqual([
      { category: 'Small tasks', text: 'Work one focused step at a time.' },
      { category: 'Small tasks', text: 'Do not expand scope on your own.' },
      { category: 'Communication', text: 'Keep answers short.' },
      { category: 'Communication', text: 'Give the minimum information needed.' },
    ])
  })

  it('ignores prose and returns empty for bullet-free markdown', () => {
    expect(parseGuidelines('# Title\n\nJust prose.\n')).toEqual([])
  })
})

describe('findGuidelineFiles', () => {
  it('finds global and project files that exist', () => {
    const home = mkdtempSync(join(tmpdir(), 'pai-home-'))
    const project = mkdtempSync(join(tmpdir(), 'pai-proj-'))
    mkdirSync(join(home, '.claude'), { recursive: true })
    writeFileSync(join(home, '.claude', 'CLAUDE.md'), '- global rule\n')
    writeFileSync(join(project, 'CLAUDE.md'), '- project rule\n')

    const files = findGuidelineFiles(project, home)
    expect(files).toEqual([
      { path: join(home, '.claude', 'CLAUDE.md'), scope: 'global' },
      { path: join(project, 'CLAUDE.md'), scope: 'project' },
    ])
  })

  it('returns only what exists', () => {
    const home = mkdtempSync(join(tmpdir(), 'pai-home-'))
    const project = mkdtempSync(join(tmpdir(), 'pai-proj-'))
    expect(findGuidelineFiles(project, home)).toEqual([])
  })
})

describe('renderGuidelines', () => {
  it('renders scopes, categories, and bullets', () => {
    const output = renderGuidelines([
      {
        scope: 'global',
        path: '/home/.claude/CLAUDE.md',
        guidelines: [
          { category: 'Small tasks', text: 'One step at a time.' },
          { category: 'Communication', text: 'Keep answers short.' },
        ],
      },
      { scope: 'project', path: '/proj/CLAUDE.md', guidelines: [] },
    ]).join('\n')

    expect(output).toContain('PAI — Guidelines')
    expect(output).toContain('Global')
    expect(output).toContain('Small tasks')
    expect(output).toContain('• One step at a time.')
    expect(output).toContain('Communication')
    expect(output).toContain('(no guidelines found)')
  })
})
