# The ops registry

**Area:** cli
**Order:** 3

One nested registry declares every operation; the [[concepts/the-five-faces|faces]] are generated
from it.

```ts
export const ops = defineOps({
  records: {
    read:   { input: z.object({ slug: z.string() }), handler: (i, ctx) => recordRead(corpus(ctx), i.slug) },
    create: { input: z.object({ collection: z.string(), title: z.string() }), handler: (i, ctx) => { … } },
  },
  query:  { run: { input: z.object({ collection: z.string(), where: z.string().optional(), … }), handler: … } },
  // collections, search, links, schema, build, ingest, commit, change, meta, ai …
})
```

Each descriptor is `{ input: zodSchema, handler }`. A handler takes the validated input and a `ctx`
(`{ spaceDir }`) and returns plain data.

## Generating the CLI

`toCli(program, ops, getCtx)` walks the registry: one commander sub-command per `namespace.verb`,
one `--option` per key in the zod shape. It validates with `input.parse(opts)`, awaits the handler,
and prints the result (string as-is, else JSON).

Because there is exactly one source:

- the CLI cannot drift from the JS API,
- the AI system prompt is rendered from the same registry ([[guides/the-ai-terminal]]),
- adding an op lights it up everywhere at once.

HTTP (`POST /op/<ns>/<verb>`) and MCP faces generate the same way and are planned next.
