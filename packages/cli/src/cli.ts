import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { buildSpace, gitHooksStatus, watchSpace } from '@grove/core/node'
import { Command } from 'commander'
import { ops } from './ops'
import { toCli } from './toCli'

function defaultSpace(): string {
  if (process.env.GROVE_SPACE) return process.env.GROVE_SPACE
  if (existsSync(resolve(process.cwd(), '_grove'))) return process.cwd()
  return resolve(process.cwd(), 'spaces/demo')
}

const program = new Command('grove')
program.option('--space <dir>', 'space directory', defaultSpace())

const getCtx = () => ({ spaceDir: program.opts().space as string })

const HOOK_WARN_OPS = new Set([
  'build.run',
  'change.commit',
  'collections.create',
  'commit.run',
  'ingest.run',
  'meta.put',
  'records.create',
  'records.promote',
  'records.remove',
  'spaces.create',
])

function warnIfHooksMissing(ns: string, verb: string, ctx: { spaceDir: string }) {
  if (!HOOK_WARN_OPS.has(`${ns}.${verb}`)) return
  const status = gitHooksStatus(ctx.spaceDir)
  if (status.installed) return
  const where = status.repo ?? ctx.spaceDir
  process.stderr.write(
    `warning: grove git hook missing for ${where}; run "grove hooks install" so plain git commits synthesize README files and respin db/*.\n`,
  )
}

toCli(program, ops, getCtx, { beforeRun: warnIfHooksMissing })

program
  .command('watch')
  .description('rebuild db/ on any change to the space')
  .action(() => {
    const { spaceDir } = getCtx()
    warnIfHooksMissing('build', 'run', { spaceDir })
    const m = buildSpace(spaceDir)
    process.stderr.write(`watching ${spaceDir} (head ${m.headCommit})\n`)
    watchSpace(spaceDir, (rm) =>
      process.stderr.write(`[respin] ${rm.respin.status} in ${rm.respin.durationMs}ms\n`),
    )
  })

await program.parseAsync(process.argv)
