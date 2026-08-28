import { closeSync, openSync, readdirSync, readSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, join } from 'node:path'
import { isRealUserPrompt } from './parser.js'

export interface ClaudeSessionListing {
  path: string
  id: string
  lastActiveAt: Date
  startedAt?: Date
  firstPrompt?: string
}

// Claude Code stores sessions in ~/.claude/projects/<encoded-cwd>/<uuid>.jsonl
// where the encoded name is the project cwd with every non-alphanumeric
// character replaced by '-'.
export function encodeProjectDir(cwd: string): string {
  return cwd.replace(/[^a-zA-Z0-9]/g, '-')
}

function listSessionFiles(cwd: string, claudeDir: string): Array<{ path: string; mtime: Date }> {
  const projectDir = join(claudeDir, 'projects', encodeProjectDir(cwd))
  let names: string[]
  try {
    names = readdirSync(projectDir)
  } catch {
    return []
  }

  const files: Array<{ path: string; mtime: Date }> = []
  for (const name of names) {
    if (!name.endsWith('.jsonl')) continue
    const path = join(projectDir, name)
    try {
      files.push({ path, mtime: statSync(path).mtime })
    } catch {
      // File disappeared between readdir and stat — skip it.
    }
  }
  return files.sort((a, b) => b.mtime.getTime() - a.mtime.getTime())
}

// Reads only the head of the transcript — files can be many MB and the
// first prompt/timestamp appear early.
function readSessionPreview(
  path: string,
  maxBytes = 256 * 1024,
): { startedAt?: Date; firstPrompt?: string } {
  let head: string
  try {
    const fd = openSync(path, 'r')
    try {
      const buffer = Buffer.alloc(maxBytes)
      const bytesRead = readSync(fd, buffer, 0, maxBytes, 0)
      head = buffer.toString('utf8', 0, bytesRead)
    } finally {
      closeSync(fd)
    }
  } catch {
    return {}
  }

  let startedAt: Date | undefined
  let firstPrompt: string | undefined
  const lines = head.split('\n')
  // Drop the last line — it may be cut mid-JSON by the byte limit.
  for (const line of lines.slice(0, -1)) {
    if (startedAt && firstPrompt) break
    let entry: Record<string, unknown>
    try {
      entry = JSON.parse(line) as Record<string, unknown>
    } catch {
      continue
    }
    if (entry === null || typeof entry !== 'object') continue
    if (entry['type'] !== 'user' && entry['type'] !== 'assistant') continue
    if (entry['isSidechain'] === true || entry['isMeta'] === true) continue

    if (!startedAt && typeof entry['timestamp'] === 'string') {
      const ts = new Date(entry['timestamp'])
      if (!Number.isNaN(ts.getTime())) startedAt = ts
    }
    if (!firstPrompt && entry['type'] === 'user') {
      const message = entry['message'] as Record<string, unknown> | undefined
      const content = message?.['content']
      if (typeof content === 'string') {
        const text = content.trim()
        if (isRealUserPrompt(text)) firstPrompt = text
      }
    }
  }
  return { startedAt, firstPrompt }
}

export function listSessions(
  cwd: string,
  claudeDir: string = join(homedir(), '.claude'),
): ClaudeSessionListing[] {
  return listSessionFiles(cwd, claudeDir).map(({ path, mtime }) => ({
    path,
    id: basename(path, '.jsonl'),
    lastActiveAt: mtime,
    ...readSessionPreview(path),
  }))
}

export function findLatestSessionFile(
  cwd: string,
  claudeDir: string = join(homedir(), '.claude'),
): string | undefined {
  return listSessionFiles(cwd, claudeDir)[0]?.path
}
