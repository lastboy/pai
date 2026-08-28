import type { ClaudeSessionListing } from '../adapters/claude/discovery.js'
import type { GuidelineGroup } from '../core/guidelines.js'
import type { ReviewSummary } from '../core/review.js'

export function renderGuidelines(groups: GuidelineGroup[]): string[] {
  const lines: string[] = ['PAI — Guidelines']
  for (const group of groups) {
    lines.push('')
    lines.push(`${group.scope === 'global' ? 'Global' : 'Project'} (${group.path})`)
    if (group.guidelines.length === 0) {
      lines.push('  (no guidelines found)')
      continue
    }
    let category: string | undefined
    for (const guideline of group.guidelines) {
      if (guideline.category !== category) {
        category = guideline.category
        lines.push('')
        lines.push(`  ${category}`)
      }
      lines.push(`    • ${guideline.text}`)
    }
  }
  if (groups.length === 0) {
    lines.push('')
    lines.push('No CLAUDE.md files found (global or project).')
  }
  return lines
}

function formatDuration(ms: number): string {
  const totalMinutes = Math.floor(ms / 60_000)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours > 0) return `${hours}h ${minutes}m`
  if (totalMinutes > 0) return `${minutes}m`
  return `${Math.floor(ms / 1000)}s`
}

function formatClock(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function stat(label: string, value: number): string {
  return `  ${label.padEnd(16)}${String(value).padStart(5)}`
}

function quote(text: string): string {
  const singleLine = text.replace(/\s+/g, ' ').trim()
  return singleLine.length > 60 ? `"${singleLine.slice(0, 57)}..."` : `"${singleLine}"`
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function formatDay(date: Date): string {
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${formatClock(date)}`
}

function formatFullDate(date: Date): string {
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}, ${formatClock(date)}`
}

function snippet(text: string, max = 40): string {
  const singleLine = text.replace(/\s+/g, ' ').trim()
  return singleLine.length > max ? `${singleLine.slice(0, max - 3)}...` : singleLine
}

export function renderSessionList(sessions: ClaudeSessionListing[]): string[] {
  const lines: string[] = ['Sessions for this project:']
  sessions.forEach((session, index) => {
    const started = session.startedAt ? `started ${formatDay(session.startedAt)}` : 'started ?'
    const lastActive = `last active ${formatDay(session.lastActiveAt)}`
    const prompt = session.firstPrompt ? `  "${snippet(session.firstPrompt)}"` : ''
    lines.push(
      `  ${String(index + 1).padStart(2)}. ${session.id.slice(0, 8)}  ${started}  ${lastActive}${prompt}`,
    )
  })
  return lines
}

// Empty input selects the first (most recent) session; otherwise a 1-based index.
export function parseSelection(input: string, count: number): number | undefined {
  const trimmed = input.trim()
  if (trimmed === '') return 0
  if (!/^\d+$/.test(trimmed)) return undefined
  const n = Number(trimmed)
  return n >= 1 && n <= count ? n - 1 : undefined
}

export function renderReview(review: ReviewSummary): string[] {
  const lines: string[] = []
  lines.push('PAI — Session Review')
  lines.push(`Session: ${review.sessionId}`)
  if (review.title) lines.push(`Title: ${review.title}`)
  lines.push(`Model: ${review.model ?? 'unknown'}`)
  if (review.startedAt) lines.push(`Started: ${formatFullDate(review.startedAt)}`)
  if (review.endedAt) lines.push(`Last active: ${formatFullDate(review.endedAt)}`)
  if (review.durationMs !== undefined) lines.push(`Duration: ${formatDuration(review.durationMs)}`)
  lines.push('')
  lines.push('Conversation')
  lines.push(stat('User messages', review.userMessageCount))
  lines.push(stat('Claude messages', review.assistantMessageCount))
  lines.push(stat('Tool calls', review.toolCallCount))
  lines.push(stat('Tool failures', review.toolFailureCount))
  lines.push('')
  lines.push('Activity')
  lines.push(stat('Files read', review.filesRead))
  lines.push(stat('Files modified', review.filesModified))
  lines.push(stat('Commands', review.commandCount))
  lines.push('')
  lines.push(`Possible corrections  ${review.possibleCorrections.length}`)

  const recent = review.possibleCorrections.slice(-5)
  if (recent.length > 0) {
    lines.push('')
    lines.push('Recent user corrections:')
    for (const correction of recent) {
      const time = correction.timestamp ? `${formatClock(new Date(correction.timestamp))}  ` : ''
      lines.push(`  ${time}${quote(correction.text)}`)
    }
  }
  return lines
}
