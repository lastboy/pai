import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { Guideline } from '../../core/guidelines.js'

export interface GuidelineFile {
  path: string
  scope: 'global' | 'project'
}

// Claude Code guidance locations: ~/.claude/CLAUDE.md (global) and
// CLAUDE.md / CLAUDE.local.md at the project root. Parent-directory
// traversal is not implemented yet.
export function findGuidelineFiles(cwd: string, home: string = homedir()): GuidelineFile[] {
  const candidates: GuidelineFile[] = [
    { path: join(home, '.claude', 'CLAUDE.md'), scope: 'global' },
    { path: join(cwd, 'CLAUDE.md'), scope: 'project' },
    { path: join(cwd, 'CLAUDE.local.md'), scope: 'project' },
  ]
  return candidates.filter((candidate) => existsSync(candidate.path))
}

const HEADING = /^#{1,6}\s+(.+?)\s*$/
const BULLET = /^\s*[-*]\s+(.+?)\s*$/

export function parseGuidelines(markdown: string): Guideline[] {
  const guidelines: Guideline[] = []
  let category = 'General'
  for (const line of markdown.split('\n')) {
    const heading = HEADING.exec(line)
    if (heading?.[1]) {
      category = heading[1]
      continue
    }
    const bullet = BULLET.exec(line)
    if (bullet?.[1]) {
      guidelines.push({ category, text: bullet[1] })
    }
  }
  return guidelines
}
