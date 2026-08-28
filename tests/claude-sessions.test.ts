import { copyFileSync, mkdirSync, mkdtempSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { listSessions } from '../src/adapters/claude/discovery.js'

const fixturePath = join(import.meta.dirname, 'fixtures', 'sample-session.jsonl')

function makeProject(): { claudeDir: string; projectDir: string } {
  const claudeDir = mkdtempSync(join(tmpdir(), 'pai-test-'))
  const projectDir = join(claudeDir, 'projects', '-work-app')
  mkdirSync(projectDir, { recursive: true })
  return { claudeDir, projectDir }
}

describe('listSessions', () => {
  it('lists sessions newest-first with id, first prompt, and started time', () => {
    const { claudeDir, projectDir } = makeProject()
    copyFileSync(fixturePath, join(projectDir, 'aaa-old.jsonl'))
    utimesSync(join(projectDir, 'aaa-old.jsonl'), new Date('2026-01-01'), new Date('2026-01-01'))
    writeFileSync(
      join(projectDir, 'bbb-new.jsonl'),
      '{"type":"user","timestamp":"2026-02-01T09:00:00.000Z","message":{"role":"user","content":"Fix the login bug"}}\n',
    )

    const sessions = listSessions('/work/app', claudeDir)

    expect(sessions.map((s) => s.id)).toEqual(['bbb-new', 'aaa-old'])
    expect(sessions[0]?.firstPrompt).toBe('Fix the login bug')
    expect(sessions[0]?.startedAt?.toISOString()).toBe('2026-02-01T09:00:00.000Z')
    expect(sessions[1]?.firstPrompt).toBe('Please add a health endpoint')
    expect(sessions[1]?.lastActiveAt.getFullYear()).toBe(2026)
    expect(sessions[1]?.path).toBe(join(projectDir, 'aaa-old.jsonl'))
  })

  it('returns an empty list when the project has no sessions', () => {
    const { claudeDir } = makeProject()
    expect(listSessions('/work/app', claudeDir)).toEqual([])
  })
})
