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
`CLAUDE.local.md`) — grouped by their markdown headings.

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

Exports PAI's own rule store as portable, versioned JSON.

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
scope, so global rules land in the global store and project rules in the
current project's store — no flag needed.

The merge is **non-destructive**: new rules are added, rules you already have
gain any new evidence, and nothing is overwritten or removed. Re-importing the
same file changes nothing.

| Option | Effect |
|---|---|
| `--dry-run` | report what would change without writing |

```bash
pai import mine.json --dry-run
pai import mine.json
```

Invalid or unsupported files fail with a clear message and a non-zero exit code.

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

| Path | Contents |
|---|---|
| `~/.pai/rules.json` | your user-level rules |
| `<project>/.pai/rules.json` | rules scoped to that project |

The store is agent-neutral, versioned (`version: 1`), and portable: rule
identity comes from the rule text, so the same rule learned on two machines
merges cleanly instead of duplicating. Each rule keeps its category, scope,
source (`learned` or `manual`) and evidence — your actual words, with session id
and timestamp.

PAI **never writes** to `~/.claude/` or to any CLAUDE.md file.

## What PAI reads

| Path | Used for |
|---|---|
| `~/.claude/projects/<encoded-cwd>/*.jsonl` | session transcripts (read-only) |
| `~/.claude/CLAUDE.md` | global guidelines |
| `<project>/CLAUDE.md`, `CLAUDE.local.md` | project guidelines |

The encoded folder name is the project path with every non-alphanumeric
character replaced by `-`.

## Project layout

```
src/core/          agent-independent logic (sessions, corrections, rules, review)
src/adapters/      per-agent integration — currently only claude/
src/persistence/   PAI's own store on disk
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

Next: `pai learn` — scan sessions, distill candidate rules, approve or reject
them interactively, and store the approved ones. Then auditing sessions against
stored rules (which rules the agent actually violated, with evidence).
