import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  POINTER_LINE,
  findExportableGuidelineFiles,
  findGuidelineFiles,
  managedGuidelinePath,
  parseGuidelines,
} from '../src/adapters/claude/guidelines.js'
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

  it('keeps the first heading when the file was saved with a BOM', () => {
    const md = '# Engineering Standards\n- Never commit without asking\n'
    expect(parseGuidelines(`﻿${md}`)).toEqual([
      { category: 'Engineering Standards', text: 'Never commit without asking' },
    ])
  })

  it('handles CRLF line endings', () => {
    expect(parseGuidelines(markdown.replace(/\n/g, '\r\n'))).toEqual(parseGuidelines(markdown))
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
      { path: join(home, '.claude', 'CLAUDE.md'), scope: 'global', managed: false },
      { path: join(project, 'CLAUDE.md'), scope: 'project', managed: false },
    ])
  })

  it('returns only what exists', () => {
    const home = mkdtempSync(join(tmpdir(), 'pai-home-'))
    const project = mkdtempSync(join(tmpdir(), 'pai-proj-'))
    expect(findGuidelineFiles(project, home)).toEqual([])
  })

  it('includes PAI-managed files after the hand-written ones of each scope', () => {
    const home = mkdtempSync(join(tmpdir(), 'pai-home-'))
    const project = mkdtempSync(join(tmpdir(), 'pai-proj-'))
    mkdirSync(join(home, '.claude'), { recursive: true })
    writeFileSync(join(home, '.claude', 'CLAUDE.pai.md'), '- managed global\n')
    writeFileSync(join(home, '.claude', 'CLAUDE.md'), '- global rule\n')
    writeFileSync(join(project, 'CLAUDE.pai.md'), '- managed project\n')
    writeFileSync(join(project, 'CLAUDE.local.md'), '- local rule\n')
    writeFileSync(join(project, 'CLAUDE.md'), '- project rule\n')

    expect(findGuidelineFiles(project, home)).toEqual([
      { path: join(home, '.claude', 'CLAUDE.md'), scope: 'global', managed: false },
      { path: join(home, '.claude', 'CLAUDE.pai.md'), scope: 'global', managed: true },
      { path: join(project, 'CLAUDE.md'), scope: 'project', managed: false },
      { path: join(project, 'CLAUDE.local.md'), scope: 'project', managed: false },
      { path: join(project, 'CLAUDE.pai.md'), scope: 'project', managed: true },
    ])
    expect(managedGuidelinePath(project)).toBe(join(project, 'CLAUDE.pai.md'))
    expect(POINTER_LINE).toBe('@CLAUDE.pai.md')
  })

  it('excludes CLAUDE.local.md from exportable files', () => {
    const home = mkdtempSync(join(tmpdir(), 'pai-home-'))
    const project = mkdtempSync(join(tmpdir(), 'pai-proj-'))
    writeFileSync(join(project, 'CLAUDE.md'), '- project rule\n')
    writeFileSync(join(project, 'CLAUDE.local.md'), '- local rule\n')
    writeFileSync(join(project, 'CLAUDE.pai.md'), '- managed project\n')

    expect(findExportableGuidelineFiles(project, home).map((f) => f.path)).toEqual([
      join(project, 'CLAUDE.md'),
      join(project, 'CLAUDE.pai.md'),
    ])
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

  it('labels PAI-managed files', () => {
    const output = renderGuidelines([
      {
        scope: 'global',
        path: '/home/.claude/CLAUDE.pai.md',
        managed: true,
        guidelines: [{ category: 'Decisions', text: 'Ask first.' }],
      },
      { scope: 'project', path: '/proj/CLAUDE.pai.md', managed: true, guidelines: [] },
    ])

    expect(output).toContain('Global — PAI managed (/home/.claude/CLAUDE.pai.md)')
    expect(output).toContain('Project — PAI managed (/proj/CLAUDE.pai.md)')
  })
})
