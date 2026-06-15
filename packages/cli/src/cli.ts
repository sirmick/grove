import { resolve } from 'node:path'
import { buildSpace, watchSpace } from '@grove/core/node'
import { Command } from 'commander'
import { ops } from './ops'
import { toCli } from './toCli'

const program = new Command('grove')
program.option(
  '--space <dir>',
  'space directory',
  process.env.GROVE_SPACE ?? resolve(process.cwd(), 'spaces/demo'),
)

const getCtx = () => ({ spaceDir: program.opts().space as string })

toCli(program, ops, getCtx)

program
  .command('watch')
  .description('rebuild db/ on any change to the space')
  .action(() => {
    const { spaceDir } = getCtx()
    const m = buildSpace(spaceDir)
    process.stderr.write(`watching ${spaceDir} (head ${m.headCommit})\n`)
    watchSpace(spaceDir, (rm) =>
      process.stderr.write(`[respin] ${rm.respin.status} in ${rm.respin.durationMs}ms\n`),
    )
  })

await program.parseAsync(process.argv)
