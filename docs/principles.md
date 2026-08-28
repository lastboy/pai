# PAI — Principles & Validation Layers

## Principles

1. **Read-only toward agents' data.** PAI never modifies coding-agent files
   (transcripts, configs, CLAUDE.md). PAI writes only to its own store
   (`.pai/` in a project) — and to agent guidance files only as an explicit,
   user-approved sync feature (future).
2. **Approval gates knowledge.** Nothing becomes a stored rule without the
   user approving it. Every stored or reported item carries evidence: the
   user's actual words, session id, timestamp.
3. **Candidates, not verdicts.** Detection output is labeled as possible /
   candidate with confidence. PAI informs; it never blocks or controls.
4. **Local-only.** Transcripts and derived data never leave the machine.
   LLM analysis runs on a local model (Ollama). No cloud calls. Portability is
   the user's move, not PAI's: `pai export` / `pai import` produce a portable,
   versioned JSON store the user carries between machines. Imports merge
   non-destructively; they never overwrite existing knowledge. A hosted
   backend is a later swap, only if PAI ever becomes a multi-user service.
5. **Degrade, never block.** A failed or unavailable layer reduces the
   result and says so. Commands do not crash or guess when data is missing.
6. **Outside the agent's context.** Anything that can be observed and
   processed outside the coding agent's context stays outside it.

## Validation layers

Each layer is independent, optional, and ordered cheap → expensive.
Command output states which layers ran (footer), so the user always knows
how much to trust a result.

| Layer | Validates | Cost | On failure / absence |
|---|---|---|---|
| L0 Data | transcripts exist, parseable, known format | free | report what was skipped; show partial results |
| L1 Deterministic | keyword corrections, tool failures | free | always available — the floor |
| L2 Semantic | local LLM: confirm corrections, distill rules, match rules | seconds, local | deliver L1 results labeled "unfiltered"; note skip |
| L3 Compliance | sessions vs stored rules → violations | uses L2 | no stored rules → report "nothing to audit" |
| L4 Trends (future) | violations over time; before/after a rule; model/config comparison | aggregation | needs accumulated history |

Adding a future validation = adding a row here and one module — not a framework.
