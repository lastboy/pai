// PAI's rules live in markdown the coding agent already reads. Hand-written
// guidance files are never edited; PAI owns one sibling file per scope and
// merges into it. Everything here is pure — paths and I/O live elsewhere.

import { HEADING, parseGuidelines, type GuidelineGroup } from './guidelines.js'
import { ruleId } from './rule-store.js'
import { CURRENT_EXPORT_FORMAT, migrateExport } from './export-migrations.js'

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

/** Metadata the CLI attaches when writing an export file. */
export interface ExportMeta {
  pai: string
  exportedAt: string
}

/** Supplied by the CLI so parsing can report which format versions it supports. */
export interface ParseExportOptions {
  currentPaiVersion: string
}

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

export function serializeExportDocument(rules: ExportedRule[], meta: ExportMeta): string {
  const document = {
    version: CURRENT_EXPORT_FORMAT,
    pai: meta.pai,
    exportedAt: meta.exportedAt,
    rules,
  }
  return `${JSON.stringify(document, null, 2)}\n`
}

const MAX_RULE_LENGTH = 500
const MAX_CATEGORY_LENGTH = 80
const MAX_PROBLEMS_SHOWN = 20

export type ValidateExportResult =
  | { ok: true; document: ExportDocument }
  | { ok: false; problems: string[] }

/**
 * Strict validation of a format-2 document (after migration). Collects every
 * problem instead of stopping at the first one; each message is prefixed
 * with a JSON-path so multiple problems in one file can be fixed at once.
 * Unknown extra fields, top-level or per-rule, are ignored for forward
 * compatibility.
 */
export function validateExportDocument(doc: Record<string, unknown>): ValidateExportResult {
  const problems: string[] = []

  if (doc['version'] !== CURRENT_EXPORT_FORMAT) {
    problems.push(`version: expected ${CURRENT_EXPORT_FORMAT}`)
  }
  if (doc['pai'] !== undefined && typeof doc['pai'] !== 'string') {
    problems.push('pai: expected string')
  }
  if (doc['exportedAt'] !== undefined) {
    const exportedAt = doc['exportedAt']
    if (typeof exportedAt !== 'string' || Number.isNaN(Date.parse(exportedAt))) {
      problems.push('exportedAt: expected ISO-8601 timestamp')
    }
  }

  const rawRules = doc['rules']
  if (!Array.isArray(rawRules)) {
    problems.push('rules: expected array')
    return { ok: false, problems }
  }

  const rules: ExportedRule[] = []
  rawRules.forEach((entry, index) => {
    const path = `rules[${index}]`
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
      problems.push(`${path}: expected object`)
      return
    }
    const record = entry as Record<string, unknown>

    const rawText = record['rule']
    // A bullet is one line; line breaks inside a rule would split it.
    const normalizedText =
      typeof rawText === 'string' ? toLf(rawText).replace(/\n/g, ' ').trim() : undefined
    const ruleValid =
      normalizedText !== undefined && normalizedText !== '' && normalizedText.length <= MAX_RULE_LENGTH
    if (!ruleValid) {
      problems.push(`${path}.rule: expected non-empty string (max ${MAX_RULE_LENGTH} chars)`)
    }

    let category = 'General'
    let categoryValid = true
    const rawCategory = record['category']
    if (rawCategory !== undefined) {
      if (typeof rawCategory !== 'string' || rawCategory.trim().length > MAX_CATEGORY_LENGTH) {
        categoryValid = false
        problems.push(`${path}.category: expected string (max ${MAX_CATEGORY_LENGTH} chars)`)
      } else {
        category = rawCategory.trim() === '' ? 'General' : rawCategory.trim()
      }
    }

    const scope = record['scope']
    const scopeValid = scope === 'global' || scope === 'project'
    if (!scopeValid) {
      problems.push(`${path}.scope: expected "global" or "project"`)
    }

    if (ruleValid && categoryValid && scopeValid) {
      rules.push({ rule: normalizedText as string, category, scope: scope as GuidelineScope })
    }
  })

  if (problems.length > 0) return { ok: false, problems }
  return { ok: true, document: { version: CURRENT_EXPORT_FORMAT, rules } }
}

export function parseExportDocument(
  json: string,
  options: ParseExportOptions,
): ExportDocument & { migratedFrom?: number } {
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

  const { document, migratedFrom } = migrateExport(parsed, {
    currentPaiVersion: options.currentPaiVersion,
  })
  const result = validateExportDocument(document)
  if (!result.ok) failValidation(result.problems)
  return { ...result.document, ...(migratedFrom !== undefined ? { migratedFrom } : {}) }
}

function failParse(reason: string): never {
  throw new Error(`Invalid PAI export: ${reason}`)
}

function failValidation(problems: string[]): never {
  const shown = problems.slice(0, MAX_PROBLEMS_SHOWN)
  const remaining = problems.length - shown.length
  const lines = [
    `Invalid PAI export: ${problems.length} problem(s)`,
    ...shown.map((problem) => `  - ${problem}`),
    ...(remaining > 0 ? [`  - … and ${remaining} more`] : []),
  ]
  throw new Error(lines.join('\n'))
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
