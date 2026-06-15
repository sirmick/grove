// Generic CLI generator: one commander subcommand per registry op, options from the zod shape.
import type { Ctx, OpTree, ProgressEvent } from '@grove/core'
import type { Command } from 'commander'

export function toCli(program: Command, ops: OpTree, getCtx: () => Ctx): void {
  for (const [ns, verbs] of Object.entries(ops)) {
    const nsCmd = program.command(ns)
    for (const [verb, desc] of Object.entries(verbs)) {
      const cmd = nsCmd.command(verb)
      const shape = (desc.input as { shape?: Record<string, unknown> }).shape ?? {}
      for (const key of Object.keys(shape)) cmd.option(`--${key} <value>`)
      cmd.action(async (opts: Record<string, unknown>) => {
        try {
          const input = desc.input.parse(opts)
          const result = await desc.handler(input, getCtx())
          const iter = (result as { [Symbol.asyncIterator]?: unknown } | null)?.[
            Symbol.asyncIterator
          ]
          if (typeof iter === 'function') {
            for await (const ev of result as AsyncIterable<ProgressEvent>) {
              process.stderr.write(`[${ev.phase}] ${ev.message ?? ''}\n`)
            }
          } else {
            process.stdout.write(
              `${typeof result === 'string' ? result : JSON.stringify(result, null, 2)}\n`,
            )
          }
        } catch (e) {
          process.stderr.write(`error: ${(e as Error).message}\n`)
          process.exitCode = 1
        }
      })
    }
  }
}
