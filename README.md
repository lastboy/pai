# PAI — Personal AI Supervisor

A local-first tool that observes how you work with AI coding agents (Claude Code
first) and turns that into knowledge you own.

PAI reads what already exists on your machine — coding-agent session
transcripts and guidance files — and never sends anything anywhere. It observes
and informs; it never controls or blocks the coding agent.

See [docs/principles.md](docs/principles.md) for the principles and validation
layers every feature is built against.

## Install

Requires Node.js 22+ (developed on 24).

```bash
npm install -g @lastboy/pai
```

The package is scoped, but the command it installs is `pai`.

### From source

```bash
npm install
npm run build
npm link          # makes `pai` available everywhere
```

Without `npm link`, run any command through `npm run dev -- <command>`
(e.g. `npm run dev -- review`).

## Commands

Run `pai --help`, or `pai <command> --help`, for the authoritative list.

### `pai status`

Prints whether PAI is ready and which mode it runs in.

### `pai review`

Reviews a Claude Code session for the **current folder**: title, model, start
and last-active dates, duration, conversation counts, activity counts, and
possible corrections with your own words as evidence.

Sessions are discovered automatically from `~/.claude/projects/<encoded-cwd>/`.
With several sessions for a folder, PAI lists them (short id, started, last
active, first prompt) and asks which one; pressing Enter picks the most recent.
Piped/non-interactive input picks the most recent without asking.

```bash
pai review
```

### `pai rules`

Shows your guidelines from the CLAUDE.md files that apply to the current
folder — global (`~/.claude/CLAUDE.md`) and project (`CLAUDE.md`,
`CLAUDE.local.md`) — plus the PAI-managed `CLAUDE.pai.md` next to each, all
grouped by their markdown headings. Managed files are labeled `PAI managed`.

| Option | Effect |
|---|---|
| `--global` | only global rules |
| `--project` | only project rules |
| `--search <text>` | only rules whose text or category starts a word with `<text>` |

```bash
pai rules
pai rules --project
pai rules --global --search decision
```

Search matches word starts, so `--search ask` finds "Ask me before…" but not
"Small tasks".

### `pai export`

Exports the same rules `pai rules` shows — from `CLAUDE.md` and
`CLAUDE.pai.md`, global then project — as portable, versioned JSON.
`CLAUDE.local.md` is per-machine and is not exported.

```json
{
  "version": 2,
  "pai": "0.3.1",
  "exportedAt": "2026-08-29T12:00:00.000Z",
  "rules": [ { "rule": "…", "category": "…", "scope": "global" } ]
}
```

`version` is the export format (for compatibility checks), `pai` is the PAI
version that produced the file, and `exportedAt` is when it was written;
files from a newer format than this `pai` supports are rejected with an
upgrade hint.

| Option | Effect |
|---|---|
| `--out <file>` | write to a file instead of stdout |
| `--scope global\|project` | export only that scope |

```bash
pai export                                  # everything, to stdout
pai export --scope global --out mine.json   # only user-level rules
```

### `pai import <file>`

Merges a previously exported file into this machine. Rules carry their own
scope: global rules go to `~/.claude/CLAUDE.pai.md`, project rules to
`<project>/CLAUDE.pai.md` — no flag needed. For each scope PAI:

1. makes sure `CLAUDE.md` exists and contains the import line `@CLAUDE.pai.md`
   (created with only that line if missing; the line is appended in place if
   absent, so a symlinked CLAUDE.md stays a symlink; nothing else in the file
   is touched);
2. adds the rules that `CLAUDE.pai.md` does not have yet, under their category
   headings, keeping everything already there exactly as it is.

The merge is **non-destructive** and idempotent: nothing is overwritten or
removed, and re-importing the same file adds nothing. Rule identity is the
normalized text (case, punctuation, whitespace and line endings ignored).
Hand-written `CLAUDE.md` rules are never used for deduplication — only
`CLAUDE.pai.md` is. Files from the older `version: 1` store format are accepted.

| Option | Effect |
|---|---|
| `--dry-run` | report what would change ("would add …") without writing |

```bash
pai import mine.json --dry-run
pai import mine.json
```

Invalid or unsupported files fail with a clear message and a non-zero exit code.

**Cross-platform.** A file exported on macOS or Linux imports on Windows and
back. Exports contain no filesystem paths, so nothing is machine-specific, and
import accepts the encodings Windows tooling produces: UTF-8, UTF-8 with a BOM
(Notepad, `Set-Content`) and UTF-16 with a BOM (PowerShell 5.1's `>` redirect).
Line endings are normalized, so the same rule written on Windows and on
macOS/Linux counts as one instead of duplicating; `CLAUDE.pai.md` is always
written as UTF-8 with LF line endings.

### `pai experiment …`

Experimental commands. They may change or disappear, and they are the only
place PAI uses an LLM. They require [Ollama](https://ollama.com) running
locally; nothing else in PAI depends on it.

- `pai experiment correction [--model <name>] [--correction <n>]` — analyzes one
  correction candidate from a real session: shows the deterministic detector
  result, the exact context sent to the model, the structured result, and latency.
- `pai experiment distill [--model <name>] [--limit <n>]` — distills candidate
  personal-guidance rules from recent user messages, so distillation quality can
  be judged before rules are stored.

Default model: `qwen2.5:14b`.

## Where PAI stores things

Your rules have one source of truth: the CLAUDE.md family of files the coding
agent already reads.

| Path | Contents | Who writes it |
|---|---|---|
| `~/.claude/CLAUDE.md` | your hand-written global rules | you |
| `~/.claude/CLAUDE.pai.md` | global rules PAI added | PAI |
| `<project>/CLAUDE.md` | hand-written project rules | you |
| `<project>/CLAUDE.pai.md` | project rules PAI added | PAI |
| `~/.pai/`, `<project>/.pai/` | reserved for PAI metadata (future) | PAI |

PAI never merges into a hand-written CLAUDE.md. The only change it makes there
is adding the single line `@CLAUDE.pai.md` — Claude Code's native import — so
the agent reads the managed file too. Rule identity comes from the rule text,
so the same rule imported twice, or written on two machines, counts once.

## What PAI reads

| Path | Used for |
|---|---|
| `~/.claude/projects/<encoded-cwd>/*.jsonl` | session transcripts (read-only) |
| `~/.claude/CLAUDE.md`, `CLAUDE.pai.md` | global guidelines |
| `<project>/CLAUDE.md`, `CLAUDE.local.md`, `CLAUDE.pai.md` | project guidelines |

The encoded folder name is the project path with every non-alphanumeric
character replaced by `-`.

## Project layout

```
src/core/          agent-independent logic (sessions, corrections, rules, review)
src/adapters/      per-agent integration — currently only claude/
src/persistence/   file I/O — CLAUDE.pai.md, text decoding, the .pai/ store
src/experiments/   local-LLM experiments (Ollama, optional)
src/cli/           command wiring and rendering
tests/             vitest suites and sanitized fixtures
docs/              principles and validation layers
```

Supporting another agent (e.g. Codex CLI) means adding one adapter that answers
three questions: where its session logs live, how to parse them into PAI's
normalized events, and where its guidance file is. Nothing in `core/` changes.

## Development

```bash
npm run dev -- <command>   # run from source via tsx
npm test                   # vitest
npm run typecheck          # tsc, strict
npm run build              # compile to dist/
```

Tests use small sanitized fixtures. Real transcripts are never copied into the
repository.

## Status

Working today: `status`, `review`, `rules`, `export`, `import`, and the two
experiments.

Next: see [Roadmap](#roadmap).

## Roadmap

- **`pai learn`** — scan sessions, distill candidate rules with a local model, approve/reject/edit interactively, write approved rules to `CLAUDE.pai.md`.
- **Compliance audit** — check sessions against your rules and report violations with evidence (which rule, how often, your own words) — the "is the agent following my guidance" measure.
- **Trends** — violations over time, before/after a rule was added, and comparison across models/configurations.
- **Cross-project promotion** — rules that keep appearing in several projects get proposed as global rules.
- **Better session review** — active time instead of wall-clock duration, filtering out headless/automation sessions.
- **Long-list UX** — category summaries with counts, `--category`, an interactive picker.
- **More agents** — Codex CLI adapter (`AGENTS.md`); the core stays agent-independent.
- **Optional integrations, only if needed** — Claude Code hooks for real-time capture; MCP so the agent can ask PAI about rules.

Order is not a commitment; each item ships as its own small, tested step.
