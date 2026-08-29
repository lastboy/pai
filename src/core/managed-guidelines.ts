// PAI's rules live in markdown the coding agent already reads. Hand-written
// guidance files are never edited; PAI owns one sibling file per scope and
// merges into it. Everything here is pure — paths and I/O live elsewhere.

import { HEADING, parseGuidelines, type GuidelineGroup } from './guidelines.js'
import { parseRuleStore, ruleId } from './rule-store.js'

export type GuidelineScope = 'global' | 'project'

export interface ExportedRule {
  rule: string
  category: string
  scope: GuidelineScope
}

export interface ExportDocument {
  version: 2
  rules: ExportedRule[]
}

const EXPORT_VERSION = 2

export const MANAGED_HEADER =
  '<!-- Managed by PAI. Hand-written rules belong in CLAUDE.md; PAI adds rules here via `pai import` / `pai learn`. -->'

function toLf(text: string): string {
  return text.replace(/\r\n?/g, '\n')
}

/** Flatten groups into export order: caller supplies global before project. */
export function toExportRules(groups: GuidelineGroup[]): ExportedRule[] {
  return groups.flatMap((group) =>
    group.guidelines.map((g) => ({ rule: g.text, category: g.category, scope: group.scope })),
  )
}

export function serializeExportDocument(rules: ExportedRule[]): string {
  const document: ExportDocument = { version: EXPORT_VERSION, rules }
  return `${JSON.stringify(document, null, 2)}\n`
}

export function parseExportDocument(json: string): ExportDocument {
  let parsed: unknown
  try {
    // Tolerate a byte-order mark left by Windows editors.
    parsed = JSON.parse(json.replace(/^﻿/, ''))
  } catch {
    return failParse('file is not valid JSON')
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return failParse('file is not a JSON object')
  }
  const raw = parsed as Record<string, unknown>
  if (raw['version'] === 1) {
    // Older `.pai/rules.json` stores carry the same three fields we need.
    return {
      version: EXPORT_VERSION,
      rules: parseRuleStore(json).rules.map((r) => ({
        rule: r.rule,
        category: r.category,
        scope: r.scope,
      })),
    }
  }
  if (raw['version'] !== EXPORT_VERSION) {
    return failParse(
      `unsupported version: ${String(raw['version'])} (expected ${EXPORT_VERSION})`,
    )
  }
  if (!Array.isArray(raw['rules'])) {
    return failParse('"rules" must be an array')
  }

  const rules: ExportedRule[] = []
  for (const [index, entry] of (raw['rules'] as unknown[]).entries()) {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
      return failParse(`rule ${index + 1} is not an object`)
    }
    const record = entry as Record<string, unknown>
    const text = record['rule']
    if (typeof text !== 'string' || text.trim() === '') {
      return failParse(`rule ${index + 1} is missing a non-empty "rule" field`)
    }
    const category = record['category']
    if (category !== undefined && typeof category !== 'string') {
      return failParse(`rule ${index + 1} has a non-string "category"`)
    }
    const scope = record['scope']
    if (scope !== 'global' && scope !== 'project') {
      return failParse(`rule ${index + 1} has an invalid "scope" (expected "global" or "project")`)
    }
    rules.push({
      // A bullet is one line; line breaks inside a rule would split it.
      rule: toLf(text).replace(/\n/g, ' ').trim(),
      category: category === undefined || category.trim() === '' ? 'General' : category.trim(),
      scope,
    })
  }
  return { version: EXPORT_VERSION, rules }
}

function failParse(reason: string): never {
  throw new Error(`Invalid PAI export: ${reason}`)
}

/** Where one scope's files live; built by the agent adapter, consumed by persistence. */
export interface ManagedImportTarget {
  claudeMdPath: string
  managedPath: string
  pointer: string
}

export interface PointerResult {
  /**
   * Text to append to the hand-written file (`appended`), or the whole
   * content of the new file (`created`). Empty when `unchanged`.
   */
  suffix: string
  action: 'created' | 'appended' | 'unchanged'
}

/**
 * Make sure the hand-written file references the managed one. Only a suffix
 * is ever produced — the caller appends it in place, so a symlinked CLAUDE.md
 * keeps pointing at its target and existing bytes are never rewritten.
 */
export function ensurePointer(claudeMd: string | undefined, pointer: string): PointerResult {
  if (claudeMd === undefined) {
    return { suffix: `${pointer}\n`, action: 'created' }
  }
  const hasPointer = toLf(claudeMd)
    .split('\n')
    .some((line) => line.trim() === pointer)
  if (hasPointer) return { suffix: '', action: 'unchanged' }

  const trailing = /\s*$/.exec(claudeMd)?.[0] ?? ''
  if (trailing.length === claudeMd.length) {
    // Empty or whitespace-only: the pointer is the first real line.
    const needsBreak = claudeMd !== '' && !claudeMd.endsWith('\n')
    return { suffix: `${needsBreak ? '\n' : ''}${pointer}\n`, action: 'appended' }
  }
  // Exactly one blank line before the pointer, given what is already there.
  const newlines = trailing.split('\n').length - 1
  const separator = newlines >= 2 ? '' : newlines === 1 ? '\n' : '\n\n'
  return { suffix: `${separator}${pointer}\n`, action: 'appended' }
}

export interface MergeManagedResult {
  markdown: string
  added: number
  existing: number
}

/**
 * Merge rules into PAI's managed markdown. Identity is the normalized rule
 * text (`ruleId`), so wording that differs only in case, punctuation,
 * whitespace or line endings counts as already present. Existing content,
 * order and prose are preserved; new bullets go under their category heading,
 * and missing headings are appended at the end.
 */
export function mergeManagedMarkdown(
  existingMarkdown: string | undefined,
  rules: Array<{ rule: string; category: string }>,
): MergeManagedResult {
  const isNew = existingMarkdown === undefined || existingMarkdown.trim() === ''
  const source = isNew ? MANAGED_HEADER : toLf(existingMarkdown)
  const seen = new Set(parseGuidelines(source).map((g) => ruleId(g.text)))

  // Category → new bullets, in first-appearance order.
  const additions = new Map<string, string[]>()
  let added = 0
  let existing = 0
  for (const incoming of rules) {
    const id = ruleId(incoming.rule)
    if (seen.has(id)) {
      existing += 1
      continue
    }
    seen.add(id)
    added += 1
    const bullets = additions.get(incoming.category) ?? []
    bullets.push(`- ${toLf(incoming.rule).replace(/\n/g, ' ').trim()}`)
    additions.set(incoming.category, bullets)
  }
  if (added === 0) {
    return { markdown: existingMarkdown ?? '', added, existing }
  }

  // Each existing heading's section ends at its last non-blank line; new
  // bullets for that category are inserted right after it.
  const lines = source.split('\n')
  const sectionEnd = new Map<string, number>()
  let current: string | undefined
  for (const [index, line] of lines.entries()) {
    const heading = HEADING.exec(line)
    if (heading?.[1]) {
      current = sectionEnd.has(heading[1]) ? undefined : heading[1]
      if (current !== undefined) sectionEnd.set(current, index)
      continue
    }
    if (current !== undefined && line.trim() !== '') sectionEnd.set(current, index)
  }

  const insertAfter = new Map<number, string[]>()
  const missing: string[] = []
  for (const [category, bullets] of additions) {
    const end = sectionEnd.get(category)
    if (end === undefined) {
      missing.push(category)
      continue
    }
    insertAfter.set(end, bullets)
  }

  const output: string[] = []
  for (const [index, line] of lines.entries()) {
    output.push(line)
    const bullets = insertAfter.get(index)
    if (bullets) output.push(...bullets)
  }
  while (output.length > 0 && output[output.length - 1]?.trim() === '') output.pop()
  for (const category of missing) {
    output.push('', `## ${category}`, ...(additions.get(category) ?? []))
  }
  return { markdown: `${output.join('\n')}\n`, added, existing }
}
