// The ops registry + handlers — the single source the CLI (and later MCP/HTTP) generate from.
// Reads/writes operate over the space on disk via ctx.spaceDir.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import {
  type Ctx,
  allLinks,
  backlinks,
  buildTree,
  collectionDetail,
  collectionScaffold,
  composeMarkdown,
  defineOps,
  dirOf,
  instantiateTemplate,
  recordRead,
  recordRows,
  resolveSchema,
  runQuery,
  searchDocs,
  slugify,
} from '@grove/core'
import {
  abortChange,
  beginChange,
  buildSpace,
  commitChange,
  gitCommitAll,
  loadCorpusFromDir,
} from '@grove/core/node'
import { ingestSource } from '@grove/ingest'
import { z } from 'zod'
import { buildSystemPrompt } from './ai-prompt'

const corpus = (ctx: Ctx) => loadCorpusFromDir(ctx.spaceDir)

function writeFile(ctx: Ctx, rel: string, content: string) {
  const p = join(ctx.spaceDir, rel)
  mkdirSync(dirname(p), { recursive: true })
  writeFileSync(p, content)
}

const flipStatus = (raw: string) => raw.replace(/^(\s*_status:\s*)review\s*$/m, '$1verified')

export const ops = defineOps({
  collections: {
    tree: { input: z.object({}), handler: (_i, ctx) => buildTree(corpus(ctx)) },
    get: {
      input: z.object({ path: z.string() }),
      handler: (i, ctx) => collectionDetail(corpus(ctx), i.path),
    },
    create: {
      input: z.object({
        name: z.string(),
        parent: z.string().optional(), // nest under an existing collection; omitted = root level
        entry: z.enum(['editor', 'form']).default('form'),
        extends: z.string().optional(),
      }),
      handler: (i, ctx) => {
        const dir = i.parent ? `${i.parent}/${i.name}` : i.name
        const files = collectionScaffold({ name: i.name, entry: i.entry, extends: i.extends })
        for (const [rel, content] of Object.entries(files)) writeFile(ctx, `${dir}/${rel}`, content)
        gitCommitAll(ctx.spaceDir, `grove: create collection ${dir}`)
        return { path: dir }
      },
    },
  },
  records: {
    list: {
      input: z.object({ collection: z.string() }),
      handler: (i, ctx) => recordRows(corpus(ctx), i.collection),
    },
    read: {
      input: z.object({ slug: z.string() }),
      handler: (i, ctx) => recordRead(corpus(ctx), i.slug),
    },
    create: {
      input: z.object({
        collection: z.string(),
        title: z.string(),
        template: z.string().optional(),
      }),
      handler: (i, ctx) => {
        const slug = `${i.collection}/${slugify(i.title)}`
        const c = corpus(ctx)
        let md: string
        if (i.template) {
          const inst = instantiateTemplate(
            c[`${i.collection}/_grove/templates/${i.template}`] ?? '',
            i.title,
          )
          md = inst.trimStart().startsWith('#')
            ? `${inst.trimEnd()}\n`
            : composeMarkdown({ title: i.title, fields: [], body: inst })
        } else {
          md = composeMarkdown({ title: i.title, fields: [], body: '' })
        }
        writeFile(ctx, `${slug}.md`, md)
        gitCommitAll(ctx.spaceDir, `grove: create ${slug}`)
        return { slug }
      },
    },
    promote: {
      input: z.object({ slug: z.string() }),
      handler: (i, ctx) => {
        const raw = corpus(ctx)[`${i.slug}.md`]
        if (raw === undefined) throw new Error(`no such record: ${i.slug}`)
        writeFile(ctx, `${i.slug}.md`, flipStatus(raw))
        gitCommitAll(ctx.spaceDir, `grove: promote ${i.slug}`)
        return { slug: i.slug, status: 'verified' }
      },
    },
    remove: {
      input: z.object({ slug: z.string() }),
      handler: (i, ctx) => {
        rmSync(join(ctx.spaceDir, `${i.slug}.md`))
        gitCommitAll(ctx.spaceDir, `grove: remove ${i.slug}`)
        return { slug: i.slug, removed: true }
      },
    },
  },
  // Typed query over a collection's projection rows — same engine the FE collection page uses.
  query: {
    run: {
      input: z.object({
        collection: z.string(),
        where: z.string().optional(),
        sort: z.string().optional(),
        select: z.string().optional(), // comma-separated column list
        limit: z.coerce.number().optional(),
        agg: z.string().optional(), // "avg:pe,max:marketCap,count"
        groupBy: z.string().optional(),
      }),
      handler: (i, ctx) =>
        runQuery(recordRows(corpus(ctx), i.collection) as Record<string, unknown>[], {
          where: i.where,
          sort: i.sort,
          select: i.select
            ?.split(',')
            .map((s: string) => s.trim())
            .filter(Boolean),
          limit: i.limit,
          agg: i.agg,
          groupBy: i.groupBy,
        }),
    },
  },
  search: {
    run: {
      input: z.object({ q: z.string() }),
      handler: (i, ctx) => {
        const q = i.q.toLowerCase()
        return searchDocs(corpus(ctx))
          .filter((d) => d.title.toLowerCase().includes(q) || d.body.toLowerCase().includes(q))
          .map((d) => ({ slug: d.slug, title: d.title }))
      },
    },
  },
  links: {
    of: {
      input: z.object({ slug: z.string() }),
      handler: (i, ctx) => {
        const c = corpus(ctx)
        return { out: allLinks(c).filter((l) => l.src === i.slug), in: backlinks(c, i.slug) }
      },
    },
  },
  schema: {
    get: {
      input: z.object({ collection: z.string() }),
      handler: (i, ctx) => resolveSchema(corpus(ctx), i.collection),
    },
  },
  build: {
    run: {
      input: z.object({}),
      handler: (_i, ctx) => {
        const m = buildSpace(ctx.spaceDir)
        return {
          headCommit: m.headCommit,
          collections: Object.keys(m.collections).length,
          warnings: m.respin.warnings.length,
          durationMs: m.respin.durationMs,
        }
      },
    },
  },
  ingest: {
    run: {
      input: z.object({ source: z.string(), collection: z.string() }),
      handler: async (i, ctx) => {
        const res = await ingestSource({
          spaceDir: ctx.spaceDir,
          source: i.source,
          collection: i.collection,
        })
        gitCommitAll(ctx.spaceDir, `grove: ingest ${i.source} → ${i.collection}`)
        return res
      },
    },
  },
  commit: {
    run: {
      input: z.object({ message: z.string().optional() }),
      handler: (i, ctx) => ({
        headCommit: gitCommitAll(ctx.spaceDir, i.message ?? 'grove: update'),
      }),
    },
  },
  // Mechanism (a): the worktree transaction, same engine the UI commits through. Take out a
  // change (a worktree off HEAD), mutate its files, then commit (build-gated merge → respin).
  change: {
    begin: {
      input: z.object({}),
      handler: (_i, ctx) => beginChange(ctx.spaceDir),
    },
    commit: {
      input: z.object({ id: z.string(), message: z.string().optional() }),
      handler: (i, ctx) => commitChange(ctx.spaceDir, i.id, i.message ?? 'grove: change'),
    },
    abort: {
      input: z.object({ id: z.string() }),
      handler: (i, ctx) => {
        abortChange(ctx.spaceDir, i.id)
        return { id: i.id, aborted: true }
      },
    },
  },
  // The prompt that seeds an interactive Claude session: grove's system prompt (generated from this
  // registry) + the space's editable project prompt (_grove/prompt.md, edited on the Project page).
  ai: {
    prompt: {
      input: z.object({}),
      handler: (_i, ctx) => {
        const project = corpus(ctx)['_grove/prompt.md']
        const system = buildSystemPrompt(ops)
        return project ? `${system}\n\n---\n\n# This project\n\n${project}` : system
      },
    },
  },
  meta: {
    get: {
      input: z.object({ path: z.string() }),
      handler: (i, ctx) => corpus(ctx)[i.path] ?? null,
    },
    put: {
      input: z.object({ path: z.string(), source: z.string() }),
      handler: (i, ctx) => {
        writeFile(ctx, i.path, i.source)
        gitCommitAll(ctx.spaceDir, `grove: meta ${i.path}`)
        return { ok: true }
      },
    },
  },
})
