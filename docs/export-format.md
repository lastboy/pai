# PAI export format

The contract for the JSON file `pai export` writes and `pai import` reads.
It exists so a file exported by one version of PAI, on one machine, imports
safely — or fails clearly — on another.

## Format 2 (current)

```json
{
  "version": 2,
  "pai": "0.3.1",
  "exportedAt": "2026-08-29T12:00:00.000Z",
  "rules": [
    { "rule": "Keep answers short.", "category": "Communication", "scope": "global" },
    { "rule": "Never force-push.", "category": "Git", "scope": "project" }
  ]
}
```

| Field | Type | Required | Constraint |
|---|---|---|---|
| `version` | number | yes | must be `2` |
| `pai` | string | no | PAI version that produced the file |
| `exportedAt` | string | no | ISO-8601 timestamp, parseable by `Date` |
| `rules` | array | yes | array of rule objects (may be empty) |
| `rules[].rule` | string | yes | non-empty after trim, max 500 chars |
| `rules[].category` | string | no | max 80 chars; defaults to `"General"` |
| `rules[].scope` | string | yes | `"global"` or `"project"` |

Unknown extra fields — at the top level or inside a rule object — are
ignored, both by validation and on import. This is what lets a newer PAI add
fields to the format without breaking an older one that only understands the
fields above.

## Normalization

On import, each rule is normalized before it is compared or written:

- CRLF and lone CR are converted to LF
- newlines inside `rule` become a single space (a rule is one bullet, one line)
- the result is trimmed
- an empty or missing `category` becomes `"General"`

## Compatibility policy

- **Same format** (`version: 2`) — always safe to import, on any PAI version
  that supports format 2.
- **Older format** — migrated automatically. Migrations applied so far:
  - **1 → 2**: reads the old `.pai/rules.json` store shape
    (`rules[].{rule,category,scope}`, plus `id`, `evidence`, `source`,
    `createdAt`/`updatedAt`). Only `rule`, `category` and `scope` survive;
    `id`, `evidence`, `source` and the timestamps are dropped — none of them
    are part of the export format.
- **Newer format** — rejected with an exact, upgrade-pointing message:

  ```
  Invalid PAI export: format <N> was produced by pai <pai or "unknown">; this pai (<current>) supports up to format 2 — upgrade pai
  ```

## Validation errors

An invalid file (right format, wrong contents) is rejected with every
problem found, not just the first one:

```
Invalid PAI export: 2 problem(s)
  - rules[0].rule: expected non-empty string (max 500 chars)
  - rules[0].scope: expected "global" or "project"
```

Each line is prefixed with a JSON path to the offending field. At most 20
problems are listed; beyond that, a final line reads `  - … and N more`.

Run `pai import <file> --validate` to check a file against this contract —
parse, migrate, and validate — without writing anything.

## Encodings accepted

`pai import` decodes, in order of likelihood: UTF-8, UTF-8 with a BOM
(as written by Notepad or PowerShell's `Set-Content`), and UTF-16 with a BOM
(as written by PowerShell 5.1's `>` redirect). `pai export` always writes
UTF-8 with LF line endings and no BOM.
