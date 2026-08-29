// Migration chain that brings an older PAI export up to the current format.
// Pure: no I/O, no filesystem, no process access.

import { parseRuleStore } from './rule-store.js'

export const CURRENT_EXPORT_FORMAT = 2

/** Older `.pai/rules.json` stores carry the same three fields an export needs. */
function v1ToV2(doc: Record<string, unknown>): Record<string, unknown> {
  const store = parseRuleStore(JSON.stringify(doc))
  return {
    version: 2,
    rules: store.rules.map((r) => ({ rule: r.rule, category: r.category, scope: r.scope })),
  }
}

// Adding a future migration is one new entry here: key N migrates format N to N+1.
const MIGRATIONS: Record<number, (doc: Record<string, unknown>) => Record<string, unknown>> = {
  1: v1ToV2,
}

export interface MigrateExportResult {
  document: Record<string, unknown>
  migratedFrom?: number
}

export function migrateExport(
  raw: unknown,
  options: { currentPaiVersion: string },
): MigrateExportResult {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('Invalid PAI export: file is not a JSON object')
  }
  const record = raw as Record<string, unknown>
  const version = record['version']
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    throw new Error('Invalid PAI export: "version" must be a positive integer')
  }
  if (version > CURRENT_EXPORT_FORMAT) {
    const producer =
      typeof record['pai'] === 'string' && record['pai'].trim() !== '' ? record['pai'] : 'unknown'
    throw new Error(
      `Invalid PAI export: format ${version} was produced by pai ${producer}; this pai (${options.currentPaiVersion}) supports up to format ${CURRENT_EXPORT_FORMAT} — upgrade pai`,
    )
  }

  let document = record
  let from = version
  while (from < CURRENT_EXPORT_FORMAT) {
    const migrate = MIGRATIONS[from]
    if (!migrate) {
      throw new Error(`Invalid PAI export: no migration path from format ${from}`)
    }
    document = migrate(document)
    from += 1
  }
  return { document, ...(version !== CURRENT_EXPORT_FORMAT ? { migratedFrom: version } : {}) }
}
