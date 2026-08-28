import { mkdtempSync, mkdirSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { encodeProjectDir, findLatestSessionFile } from '../src/adapters/claude/discovery.js'

describe('encodeProjectDir', () => {
  it('replaces non-alphanumeric characters with dashes', () => {
    expect(encodeProjectDir('/Users/dev/repos/pai')).toBe('-Users-dev-repos-pai')
    expect(encodeProjectDir('/tmp/my_proj v2')).toBe('-tmp-my-proj-v2')
  })
})

describe('findLatestSessionFile', () => {
  function makeClaudeDir(): string {
    return mkdtempSync(join(tmpdir(), 'pai-test-'))
  }

  it('returns the newest jsonl for the project', () => {
    const claudeDir = makeClaudeDir()
    const projectDir = join(claudeDir, 'projects', '-work-app')
    mkdirSync(projectDir, { recursive: true })
    writeFileSync(join(projectDir, 'old.jsonl'), '{}\n')
    utimesSync(join(projectDir, 'old.jsonl'), new Date('2026-01-01'), new Date('2026-01-01'))
    writeFileSync(join(projectDir, 'new.jsonl'), '{}\n')
    writeFileSync(join(projectDir, 'notes.txt'), 'ignore me')

    expect(findLatestSessionFile('/work/app', claudeDir)).toBe(join(projectDir, 'new.jsonl'))
  })

  it('returns undefined when the project has no sessions', () => {
    const claudeDir = makeClaudeDir()
    expect(findLatestSessionFile('/work/app', claudeDir)).toBeUndefined()
  })
})
