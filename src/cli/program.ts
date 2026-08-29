import { readFileSync, writeFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { Command } from 'commander'
import { listSessions, type ClaudeSessionListing } from '../adapters/claude/discovery.js'
import { parseTranscript } from '../adapters/claude/parser.js'
import { buildReview } from '../core/review.js'
import { getStatus, renderStatus } from '../core/status.js'
import { parseEvents } from '../adapters/claude/events.js'
import { detectPossibleCorrections } from '../core/corrections.js'
import {
  analyzeWithOllama,
  buildCorrectionContext,
  buildPrompt,
} from '../experiments/correction-analysis.js'
import { ollamaGenerate } from '../experiments/ollama.js'
import { buildDistillPrompt, parseDistillResponse } from '../experiments/rule-distillation.js'
import {
  findExportableGuidelineFiles,
  findGuidelineFiles,
  guidelineDir,
  managedImportTarget,
} from '../adapters/claude/guidelines.js'
import { filterGuidelineGroups } from '../core/guidelines.js'
import {
  parseExportDocument,
  serializeExportDocument,
  toExportRules,
  type ExportDocument,
} from '../core/managed-guidelines.js'
import { CURRENT_EXPORT_FORMAT } from '../core/export-migrations.js'
import {
  importManagedGuidelines,
  readGuidelineGroups,
} from '../persistence/managed-guideline-files.js'
import { decodeTextFile } from '../persistence/text-file.js'
import { parseSelection, renderGuidelines, renderReview, renderSessionList } from './render.js'

async function ask(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const answer = await rl.question(question)
  rl.close()
  return answer
}

async function chooseSession(out: OutputWriter): Promise<ClaudeSessionListing | undefined> {
  const sessions = listSessions(process.cwd())
  if (sessions.length === 0) {
    out('No Claude Code sessions found for this project.')
    return undefined
  }
  if (sessions.length === 1) return sessions[0]

  for (const line of renderSessionList(sessions)) out(line)
  out('')
  if (!process.stdin.isTTY) {
    out('(non-interactive input: using the most recent session)')
    out('')
    return sessions[0]
  }
  const answer = await ask(`Select session [1-${sessions.length}, Enter = 1]: `)
  const index = parseSelection(answer, sessions.length)
  if (index === undefined) {
    out('Invalid selection.')
    return undefined
  }
  out('')
  return sessions[index]
}

export type OutputWriter = (line: string) => void

/** Node's fs errors are readable already; anything else gets stringified. */
function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Best-effort read of the file's own `pai`/`exportedAt` fields for the
 * `--validate` summary. Only called after `parseExportDocument` has already
 * succeeded on the same text, so this re-parse cannot fail in practice.
 */
function readExportMeta(text: string): { pai?: string; exportedAt?: string } {
  try {
    const parsed = JSON.parse(text.replace(/^﻿/, '')) as Record<string, unknown>
    return {
      ...(typeof parsed['pai'] === 'string' ? { pai: parsed['pai'] } : {}),
      ...(typeof parsed['exportedAt'] === 'string' ? { exportedAt: parsed['exportedAt'] } : {}),
    }
  } catch {
    return {}
  }
}

// Same relative depth from src/cli and dist/cli.
export function packageVersion(): string {
  const pkg = JSON.parse(
    readFileSync(join(import.meta.dirname, '..', '..', 'package.json'), 'utf8'),
  ) as { version?: string }
  return pkg.version ?? '0.0.0'
}

export function createProgram(out: OutputWriter): Command {
  const program = new Command('pai')
  program.description('PAI — Personal AI Supervisor')
  program.version(packageVersion(), '-v, --version', 'show the PAI version')

  program
    .command('status')
    .description('Show PAI status')
    .action(() => {
      for (const line of renderStatus(getStatus())) {
        out(line)
      }
    })

  program
    .command('review')
    .description('Review the latest Claude Code session for this project')
    .action(async () => {
      const chosen = await chooseSession(out)
      if (!chosen) {
        process.exitCode = 1
        return
      }

      const transcript = decodeTextFile(await readFile(chosen.path))
      const session = parseTranscript(transcript, chosen.id)
      for (const line of renderReview(buildReview(session))) {
        out(line)
      }
    })

  program
    .command('rules')
    .description('Show your guidelines from CLAUDE.md files, categorized')
    .option('--global', 'only global rules (~/.claude/CLAUDE.md, CLAUDE.pai.md)')
    .option('--project', 'only project rules (CLAUDE.md, CLAUDE.local.md, CLAUDE.pai.md)')
    .option('--search <text>', 'only rules whose text or category starts a word with <text>')
    .action((options: { global?: boolean; project?: boolean; search?: string }) => {
      const groups = readGuidelineGroups(findGuidelineFiles(process.cwd()))
      // --global and --project together = no scope filter (same as neither).
      const scope =
        options.global && !options.project
          ? ('global' as const)
          : options.project && !options.global
            ? ('project' as const)
            : undefined
      const filtered = filterGuidelineGroups(groups, { scope, search: options.search })
      if (filtered.length === 0 && groups.length > 0) {
        out(`No rules matching the given filters.`)
        return
      }
      for (const line of renderGuidelines(filtered)) out(line)
    })

  program
    .command('export')
    .description('Export your rules (CLAUDE.md + CLAUDE.pai.md) to a portable JSON file (or stdout)')
    .option('--out <file>', 'write to this file instead of stdout')
    .option('--scope <scope>', 'export only "global" or "project" rules')
    .action((options: { out?: string; scope?: string }) => {
      if (options.scope && options.scope !== 'global' && options.scope !== 'project') {
        out('--scope must be "global" or "project".')
        process.exitCode = 1
        return
      }
      try {
        // Global files come first, so the output order is global → project.
        const files = findExportableGuidelineFiles(process.cwd()).filter(
          (file) => options.scope === undefined || file.scope === options.scope,
        )
        const rules = toExportRules(readGuidelineGroups(files))
        const json = serializeExportDocument(rules, {
          pai: packageVersion(),
          exportedAt: new Date().toISOString(),
        })
        if (options.out === undefined) {
          out(json.trimEnd())
          return
        }
        writeFileSync(options.out, json, 'utf8')
        out(`Exported ${rules.length} rule(s) to ${options.out}`)
      } catch (error) {
        out(`Export failed: ${describeError(error)}`)
        process.exitCode = 1
      }
    })

  program
    .command('import')
    .argument('<file>', 'JSON file previously produced by "pai export"')
    .description('Merge rules from a file into CLAUDE.pai.md on this machine (never overwrites)')
    .option('--dry-run', 'show what would change without writing')
    .option('--validate', 'check the file only; print a summary and exit without writing')
    .action(async (file: string, options: { dryRun?: boolean; validate?: boolean }) => {
      const text = decodeTextFile(await readFile(file))
      let incoming: ExportDocument & { migratedFrom?: number }
      try {
        incoming = parseExportDocument(text, { currentPaiVersion: packageVersion() })
      } catch (error) {
        if (options.validate) {
          for (const line of describeError(error).split('\n')) out(line)
        } else {
          out(`Could not read ${file}: ${describeError(error)}`)
        }
        process.exitCode = 1
        return
      }

      if (options.validate) {
        const meta = readExportMeta(text)
        const paiPart = meta.pai !== undefined ? `pai ${meta.pai}` : 'pai unknown'
        const exportedPart = meta.exportedAt !== undefined ? `, exported ${meta.exportedAt}` : ''
        out(`Valid PAI export (format ${CURRENT_EXPORT_FORMAT}, ${paiPart}${exportedPart})`)
        const global = incoming.rules.filter((rule) => rule.scope === 'global').length
        const project = incoming.rules.filter((rule) => rule.scope === 'project').length
        out(`Rules: ${incoming.rules.length} (global ${global}, project ${project})`)
        if (incoming.migratedFrom !== undefined) {
          out(
            `Migrated from format ${incoming.migratedFrom} (would be imported as format ${CURRENT_EXPORT_FORMAT})`,
          )
        }
        return
      }

      try {
        if (incoming.migratedFrom !== undefined) {
          out(`Migrated from format ${incoming.migratedFrom}.`)
        }
        for (const scope of ['global', 'project'] as const) {
          const rules = incoming.rules.filter((rule) => rule.scope === scope)
          if (rules.length === 0) continue
          const dir = guidelineDir(scope, process.cwd())
          out(`Target (${scope}): ${dir}`)
          const result = importManagedGuidelines(managedImportTarget(dir), rules, {
            dryRun: options.dryRun,
          })
          const dry = options.dryRun === true
          if (result.pointer === 'created') {
            out(dry ? '  would create CLAUDE.md with pointer' : '  created CLAUDE.md with pointer')
          }
          if (result.pointer === 'appended') {
            out(dry ? '  would add pointer line to CLAUDE.md' : '  added pointer line to CLAUDE.md')
          }
          const added = dry ? `would add ${result.added} rule(s)` : `${result.added} added`
          out(`${scope}: ${added}, ${result.existing} already present → ${result.managedPath}`)
        }
      } catch (error) {
        out(`Import failed: ${describeError(error)}`)
        out('Nothing was changed for the scope that failed.')
        process.exitCode = 1
        return
      }
      if (incoming.rules.length === 0) out('Nothing to import — the file contains no rules.')
      if (options.dryRun) out('(dry run — nothing was written)')
    })

  const experiment = program
    .command('experiment')
    .description('Experimental features — may change or disappear')

  experiment
    .command('correction')
    .description('EXPERIMENT: analyze one correction candidate with a local Ollama model')
    .option('--model <name>', 'Ollama model to use', 'qwen2.5:14b')
    .option('--correction <n>', 'correction candidate number (1-based, default: last)')
    .action(async (options: { model: string; correction?: string }) => {
      const chosen = await chooseSession(out)
      if (!chosen) {
        process.exitCode = 1
        return
      }

      const transcript = decodeTextFile(await readFile(chosen.path))
      const events = parseEvents(transcript)
      const candidates = events
        .map((event, index) => ({ event, index }))
        .filter(
          ({ event }) =>
            event.kind === 'user' &&
            detectPossibleCorrections([{ text: event.text }]).length > 0,
        )
      if (candidates.length === 0) {
        out('No correction candidates found in this session.')
        process.exitCode = 1
        return
      }

      out(`Correction candidates in session ${chosen.id.slice(0, 8)}:`)
      candidates.forEach(({ event }, i) => {
        const text = event.kind === 'user' ? event.text : ''
        out(`  ${i + 1}. "${text.replace(/\s+/g, ' ').slice(0, 70)}"`)
      })
      out('')

      let pick = candidates.length - 1
      if (options.correction !== undefined) {
        const index = parseSelection(options.correction, candidates.length)
        if (index === undefined) {
          out('Invalid --correction number.')
          process.exitCode = 1
          return
        }
        pick = index
      } else if (process.stdin.isTTY) {
        const answer = await ask(
          `Select candidate [1-${candidates.length}, Enter = ${candidates.length}]: `,
        )
        const index = answer.trim() === '' ? candidates.length - 1 : parseSelection(answer, candidates.length)
        if (index === undefined) {
          out('Invalid selection.')
          process.exitCode = 1
          return
        }
        pick = index
      }

      const candidate = candidates[pick]
      if (!candidate) return
      const context = buildCorrectionContext(events, candidate.index)
      const prompt = buildPrompt(context)

      out('=== 1. Deterministic detector ===')
      out(`Flagged as possible correction (keyword match).`)
      out('')
      out('=== 2. Context sent to Ollama ===')
      out(prompt)
      out('')
      out(
        `Context size: ${prompt.length} chars (~${Math.round(prompt.length / 4)} tokens)`,
      )
      out('')
      out(`=== 3. Ollama result (${options.model}) ===`)
      try {
        const result = await analyzeWithOllama(prompt, options.model)
        out(`Raw response: ${result.raw.trim()}`)
        out('')
        if (result.parsed) {
          out(`Parsed: isCorrection=${result.parsed.isCorrection}  category=${result.parsed.category}  confidence=${result.parsed.confidence}`)
          out(`Reason: ${result.parsed.reason}`)
        } else {
          out('Could not parse a structured result from the response.')
        }
        out('')
        out('=== 4. Latency ===')
        out(`Wall clock: ${(result.latencyMs / 1000).toFixed(1)}s`)
        if (result.modelDurationMs !== undefined) {
          out(`Ollama total_duration: ${(result.modelDurationMs / 1000).toFixed(1)}s`)
        }
      } catch (error) {
        out(`Ollama call failed: ${error instanceof Error ? error.message : String(error)}`)
        out('Is Ollama running? (ollama serve, then ollama pull <model>)')
        process.exitCode = 1
      }
    })

  experiment
    .command('distill')
    .description('EXPERIMENT: distill candidate rules from recent user messages via Ollama')
    .option('--model <name>', 'Ollama model to use', 'qwen2.5:14b')
    .option('--limit <n>', 'how many recent user messages to analyze', '10')
    .action(async (options: { model: string; limit: string }) => {
      const chosen = await chooseSession(out)
      if (!chosen) {
        process.exitCode = 1
        return
      }
      const transcript = decodeTextFile(await readFile(chosen.path))
      const messages = parseEvents(transcript).filter((e) => e.kind === 'user')
      const limit = Math.max(1, Number(options.limit) || 10)
      const sample = messages.slice(-limit)
      out(`Distilling from the last ${sample.length} user messages (session ${chosen.id.slice(0, 8)}, model ${options.model})`)
      out('')

      let totalMs = 0
      let ruleCount = 0
      for (const [i, message] of sample.entries()) {
        const text = message.kind === 'user' ? message.text : ''
        out(`--- Message ${i + 1}/${sample.length} ---`)
        out(`  "${text.replace(/\s+/g, ' ').slice(0, 120)}${text.length > 120 ? '...' : ''}"`)
        try {
          const generation = await ollamaGenerate(buildDistillPrompt(text), options.model)
          totalMs += generation.latencyMs
          const rules = parseDistillResponse(generation.raw)
          if (rules.length === 0) {
            out('  → no lasting guidance found')
          }
          for (const rule of rules) {
            ruleCount += 1
            out(`  → [${rule.category}] ${rule.rule}  (confidence ${rule.confidence})`)
          }
        } catch (error) {
          out(`  Ollama call failed: ${error instanceof Error ? error.message : String(error)}`)
          process.exitCode = 1
          return
        }
      }
      out('')
      out(`Layers: L0 ✓ 1 session · L1 ✓ ${sample.length} messages · L2 ✓ ${options.model}`)
      out(`Candidates: ${ruleCount} rules · total LLM time ${(totalMs / 1000).toFixed(1)}s`)
    })

  return program
}
