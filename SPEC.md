# grove — Design Spec

> An agent-primary, git-backed markdown knowledge base with a server-side "watcher"
> brain and thin clients (PWA editor, MCP, CLI, ingestion).
>
> Status: decisions pinned (see **Decisions**). Scale assumption: single-user, <~50MB.
> Lean on that — full rebuilds and in-memory query are fine; do not prematurely optimize.

## Thesis

A structured, agent-accessible store with automatic AI ingestion, where the human
WYSIWYG editor is one client among several. **Files are canonical; everything queryable
is a derived projection.** A single **core** (ops + index + schema + provenance) sits
behind every surface as thin clients.

## Core principles

1. **Files canonical, DB derived.** Git-tracked text (markdown + yaml schemas + prompts
   + scripts) is the source of truth. The query DB is a derived projection rebuildable
   from source at any revision — never a second store.
2. **One core, many thin clients.** Editor, MCP, CLI, ingestion are adapters over the
   same core operations. "Agent-accessible" is true by construction.
3. **The watcher is the brain.** All intelligence (extraction, linking, ingestion, search
   indexing, provenance, validation) runs once, server-side, at commit time.
4. **Schema does triple duty.** One per-collection hint file drives (a) watcher
   extraction, (b) client form generation/validation, (c) the query/typing contract.

## Decisions (pinned)

- **Frontend: Svelte 5 (runes).** Compiles away to a tiny PWA bundle, fine-grained
  framework-owned reactivity (no separate reactive store needed), good PWA tooling,
  solo-dev-friendly. CM6 mounts cleanly inside an effect. *Consequence:* the mature
  JSON-Schema form generators (RJSF/JSONForms) are React/Vue/Angular only — see Forms for
  the Svelte path. *Close alternative:* Solid (signals). *Fallback:* React, if RJSF/JSONForms
  maturity outweighs bundle size.
- **Client store: JSON + Arquero + git-delta sync.** No reactive DB layer in v1; data
  arrives in batches so framework reactivity suffices. TinyBase deferred (revisit if live-
  widget density grows or you want its persistence+CRDT-sync as the replica layer).
- **Extraction convention: lenient bold-label.** The watcher scans the body for
  `**<Label>:** <value>` lines, matches `<Label>` case-insensitively against declared
  field names, coerces by declared type, and emits warnings (not failures) for missing
  declared fields. Fragility is low because in shape-1 entry the labels are inserted by
  the template + inline widgets, not hand-typed.
- **Editor: CM6 live-preview, near-source**, with schema-driven inline decorations for
  field lines and `[[links]]`. Not a full block-WYSIWYG — that's deferred.

## On-disk layout

Monorepo with top-level "space" folders (NOT git submodules — organizational only). Each
space is self-contained:

```
<space>/
  schema/
    <collection>.yaml          # field hint/schema (drives extraction + forms + typing)
    <collection>.form.yaml     # optional form definition (shape-2 data entry)
  prompts/
    ingest-<collection>.md     # AI ingestion prompt for this collection
  ingest/
    rules.yaml                 # source -> collection, dedup, auto-promote rules
  notes/                       # verified content (one md file per record)
  inbox/                       # staging: AI-ingested / agent-written, pre-review
  db/                          # DERIVED, served, gitignored
    <collection>.json          # typed metadata projection (NO bodies)
    links.json                 # wikilink edge table
    search.json                # serialized MiniSearch index
    meta.json                  # { headCommit, builtAt }
```

`db/` is **gitignored** — never commit derived artifacts. The server rebuilds and serves it.

## Data model & schema hint

Structured field **values live inline in the body** as human-readable labeled lines; no
frontmatter for human fields. Frontmatter is reserved for machine/provenance metadata on
ingested/agent content.

`schema/capital.yaml`:
```yaml
collection: capitals
extract: bold-label
entry: editor                    # document-like -> shape 1
fields:
  country:    { type: string }
  population: { type: integer }
  founded:    { type: integer }  # year; negative = BCE
```

`notes/tokyo.md`:
```markdown
# Tokyo

**Country:** Japan
**Population:** 14094034
**Founded:** 1457

Tokyo, officially the Tokyo Metropolis, sits at the head of Tokyo Bay…
```

## The watcher (server-side, on commit)

Per changed file: read the collection hint, extract + type-coerce labeled values, parse
`[[wikilinks]]` into the edge table, attach standard metadata (last-edit date, git commit
hash + message), build the search index over title+body, **drop the body**, emit the
compact `db/*.json` projections. Full rebuild on change (fine at this scale). Type
normalization happens here, once.

Projection shape (`db/capitals.json`, NO body):
```json
[
  { "slug": "tokyo", "title": "Tokyo", "country": "Japan",
    "population": 14094034, "founded": 1457,
    "lastEdited": "2026-05-31T08:12:04Z", "gitCommit": "a1b2c3d",
    "gitMessage": "Update Tokyo population", "path": "notes/tokyo.md" }
]
```

## Write paths (two, one core)

- **Interactive editor:** fast local path — write file + optimistic in-memory update; git
  commit debounced in the background.
- **Machine-generated** (forms, ingestion, agent/MCP): async `incoming/` → watcher
  parses/validates/files-into-tree/rebuilds/commits.

Both converge at the same git history and rebuilt projections.

## Client: query, search, reactivity, sync

- **Never load all markdown.** Fetch only the small projections (metadata + links + search
  index). Bodies load lazily, one at a time, on open (via the record's `path`).
- **Query: Arquero** — stateless columnar dataframe; relational verbs run on demand.
- **Full-text: MiniSearch** — index built server-side, compact index shipped to client →
  search all prose without loading all prose.
- **Reactivity: Svelte 5 runes** (`$state`/`$derived`) over the loaded JSON.
- **Sync: git-delta.** Client tracks last-synced commit; on open calls
  `GET /delta?since=<commit>`; server runs `git diff --name-status <commit> HEAD`; client
  patches only changed rows.

## Forms

Shape is a per-collection preference (`entry: editor | form`), NOT an architectural fork —
both emit identical markdown through the same `incoming/` pipeline.

- **Document-like** (capitals, research) → **shape 1**: templated markdown in the
  live-preview editor with schema-driven inline widget *decorations* (CM6: date/number/enum
  widgets on field lines, `[[ ]]` link-picker). Prose-first, single surface. **Default.**
- **Record-like** (trades, logs) → **shape 2**: a real form. Svelte path: **TanStack Form**
  (Svelte adapter) driven by a zod schema generated from the hint, *or* a small custom
  schema-driven renderer (the hint is simple enough that ~100 lines beats a heavy dep).
  (If the framework were React, RJSF/JSONForms would generate the form from hint→JSON Schema.)

## AI ingestion & agent surface

- **Ingestion:** source → extract → clean/summarize via the collection's prompt → emit
  house-format markdown → land in `inbox/` with **mandatory provenance** (source URI, model,
  prompt hash, timestamp). Dedup by content/slug hash (idempotent re-ingest). Default to
  staged-for-review with `auto_promote` rules; promotion (review → verified) is a status
  change + move from `inbox/` to `notes/`.
- **One core, three faces:** API + CLI + MCP expose the same ops. The agent reads the JSON
  DB (or via MCP) and writes through the same `incoming/`→inbox path — agent-readable (plain
  md), agent-writable (staged, never straight into verified canon).

## Worked examples

### A second collection — `trades` (record-like, shape-2)

`schema/trade.yaml`:
```yaml
collection: trades
extract: bold-label
entry: form                      # record-like -> shape 2
fields:
  symbol: { type: string }
  side:   { type: enum, values: [long, short] }
  entry:  { type: number }
  exit:   { type: number }
  opened: { type: date }
  closed: { type: date }
  status: { type: enum, values: [open, closed], default: open }
```

`schema/trade.form.yaml`:
```yaml
form: new-trade
target: notes/{slug}.md
template: trade
fields:
  - { field: symbol, widget: text,   required: true }
  - { field: side,   widget: select, options: [long, short], required: true }
  - { field: entry,  widget: number, required: true }
  - { field: exit,   widget: number }
  - { field: opened, widget: date,   required: true }
  - { field: closed, widget: date }
```

`notes/2026-06-10-nvda.md`:
```markdown
# NVDA 2026-06-10

**Symbol:** NVDA
**Side:** long
**Entry:** 142.50
**Exit:** 158.20
**Opened:** 2026-06-10
**Closed:** 2026-06-13
**Status:** closed

Thesis: oversold after the [[2026-q1-datacenter-selloff]]; bought the bounce…
```

### Queries (Arquero)

```js
import { from, op, desc } from 'arquero';

// realized P&L per symbol, closed trades only
const trades = from(await fetch('/db/trades.json').then(r => r.json()));
const pnl = trades
  .filter(d => d.status === 'closed')
  .derive({ pnl: d => d.exit - d.entry })
  .groupby('symbol')
  .rollup({ n: op.count(), total: op.sum('pnl') })
  .orderby(desc('total'))
  .objects();

// big, old capitals with computed age
const caps = from(await fetch('/db/capitals.json').then(r => r.json()));
const view = caps
  .filter(d => d.population > 5_000_000)
  .derive({ age: d => 2026 - d.founded })
  .orderby(desc('population'))
  .select('title', 'country', 'population', 'age')
  .objects();

// titled backlinks to 'japan' (join links -> capitals)
const links = from(await fetch('/db/links.json').then(r => r.json()));
const backlinks = links
  .filter(d => d.dst === 'japan')
  .join_left(caps, ['src', 'slug'])
  .select('src', 'title')
  .objects();
```

### Full-text search (MiniSearch)

```js
import MiniSearch from 'minisearch';
const idx = MiniSearch.loadJSON(
  await fetch('/db/search.json').then(r => r.text()),
  { fields: ['title', 'body'], storeFields: ['slug', 'title'] }
);
idx.search('datacenter selloff');     // -> [{ slug, title, score }]
// bodies still fetched one at a time, only on open:
const md = await fetch('/notes/2026-06-10-nvda.md').then(r => r.text());
```

### Ingested record with provenance (lands in `inbox/`)

```markdown
---
_source: https://en.wikipedia.org/wiki/Seoul
_ingestedAt: 2026-06-14T02:11:00Z
_model: claude-opus-4-8
_promptHash: 7b3e9f
_status: review
---
# Seoul

**Country:** South Korea
**Population:** 9417796
**Founded:** -18

Seoul, officially the Seoul Special City, is the capital of South Korea…
```

### Op surface (same core, three faces)

```
CLI    grove query "<expr>"            grove search "<text>"
       grove new <collection>          grove ingest <url> --collection <c>
       grove promote <slug>            grove serve

MCP    grove.query   grove.search   grove.read   grove.add
       grove.ingest  grove.promote  grove.schema

HTTP   GET  /db/<collection>.json      GET  /delta?since=<commit>
       GET  /notes/<path>              POST /incoming   (form / agent writes)
       POST /ingest
```

## v1 scope

**In:** md+yaml+wikilink storage; watcher → JSON projections; opt-in per-collection schema;
API + CLI + MCP; CM6 live-preview editor; forms (decorated shape-1 default, shape-2 for
record collections); URL/PDF ingestion with provenance + inbox; saved-query "special pages"
+ full-text search.

**Deferred:** real-time collab / CRDT; multi-user / permissions; multi-source ingestion
(email/RSS/webhooks); a real workflow engine; sync beyond single-user; full block-WYSIWYG;
TinyBase reactive-store layer.

## Build order

1. **Core + HTTP API + CLI + MCP** (framework-agnostic; start here).
2. **Watcher + projections + git-delta sync.**
3. **Ingestion pipeline** (URL/PDF → inbox; provenance, dedup, promotion).
4. **PWA editor (Svelte 5 + CM6)** last — dogfood the system via CLI/agent before the
   editor exists.
