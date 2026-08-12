import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'

// Publish: the second half of the commit cycle. Commit writes the space's local git history; the
// Publish button pushes it to the space's remote. The test gives test-space a real remote (a bare
// repo in tmp — no network, no credentials) and checks the commits actually land in it.
//
// Serial: each test builds on the git state the previous one left (no remote → remote → published).
const SERVER = 'http://localhost:5279'
const SPACE = fileURLToPath(new URL('../test-space', import.meta.url))

let bare: string

const git = (cwd: string, args: string[]): string =>
  execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()

const publishBtn = (page: import('@playwright/test').Page) =>
  page.getByRole('button', { name: /^Publish/ })

test.describe.configure({ mode: 'serial' })

test.beforeAll(() => {
  bare = mkdtempSync(join(tmpdir(), 'grove-e2e-remote-'))
  git(bare, ['init', '--bare', '-q'])
})

test.afterAll(() => {
  rmSync(bare, { recursive: true, force: true })
  try {
    git(SPACE, ['remote', 'remove', 'origin'])
  } catch {
    // never added / already gone
  }
})

test('publish is disabled and says why when the space has no remote', async ({ page, request }) => {
  // Guarantee the space is a git repo with at least one commit, whatever ran before.
  await request.put(`${SERVER}/incoming/notes/pub-seed.md`, {
    data: '# Pub Seed\n\nseed\n',
    headers: { 'content-type': 'text/plain' },
  })
  await page.goto('/')

  const btn = publishBtn(page)
  await expect(btn).toBeVisible({ timeout: 15000 })
  await expect(btn).toBeDisabled()
  await expect(btn).toHaveAttribute('data-publish-state', 'no git remote configured', {
    timeout: 15000,
  })
  await expect(btn).toHaveText(/^\s*Publish$/) // no count: nothing is publishable
})

test('with a remote configured, Publish shows the backlog and pushes it', async ({ page }) => {
  git(SPACE, ['remote', 'add', 'origin', bare])
  await page.goto('/')

  // Never pushed → every commit in the space is ahead.
  const btn = publishBtn(page)
  await expect(btn).toBeEnabled({ timeout: 15000 })
  await expect(btn).toHaveText(/^\s*Publish \(\d+\)$/)
  await expect(btn).toHaveAttribute('data-publish-state', 'ready')

  await btn.click()

  // The button reports what it pushed, then goes quiet: the remote has everything.
  await expect(page.locator('.pubst')).toContainText('published', { timeout: 20000 })
  await expect(page.locator('.pubst')).toContainText('origin')
  await expect(btn).toBeDisabled()
  await expect(btn).toHaveAttribute('data-publish-state', 'nothing to publish')

  // …and the commits are really in the remote repo.
  const branch = git(SPACE, ['rev-parse', '--abbrev-ref', 'HEAD'])
  expect(git(bare, ['rev-parse', branch])).toBe(git(SPACE, ['rev-parse', 'HEAD']))
})

test('a commit made in the UI becomes publishable, and publishing sends it', async ({
  page,
  request,
}) => {
  await request.put(`${SERVER}/incoming/notes/pub-edit.md`, {
    data: '# Pub Edit\n\noriginal\n',
    headers: { 'content-type': 'text/plain' },
  })
  await page.goto('/')

  // Edit + Commit → local history moves ahead of the remote, and Publish says so.
  await page.locator('[data-record="notes/pub-edit"]').click()
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  await page.getByRole('button', { name: 'Source' }).click()
  await page.locator('.cm-content').click()
  await page.keyboard.press('Control+End')
  await page.keyboard.type(' PUBLISHED-BY-E2E')
  await page.getByRole('button', { name: /^Commit \(/ }).click()
  await expect(page.getByRole('button', { name: 'Commit (0)' })).toBeVisible({ timeout: 15000 })

  const btn = publishBtn(page)
  await expect(btn).toBeEnabled({ timeout: 20000 })
  await expect(btn).toHaveText(/^\s*Publish \(\d+\)$/)

  await btn.click()
  await expect(page.locator('.pubst')).toContainText('published', { timeout: 20000 })
  await expect(btn).toBeDisabled()

  // The edit is in the remote's history, not just locally.
  const branch = git(SPACE, ['rev-parse', '--abbrev-ref', 'HEAD'])
  expect(git(bare, ['rev-parse', branch])).toBe(git(SPACE, ['rev-parse', 'HEAD']))
  expect(git(bare, ['show', `${branch}:notes/pub-edit.md`])).toContain('PUBLISHED-BY-E2E')
})

test('a rejected push is reported, and the space keeps its commits', async ({ page, request }) => {
  // Advance the remote behind the space's back so the next push is a non-fast-forward.
  const other = mkdtempSync(join(tmpdir(), 'grove-e2e-other-'))
  const branch = git(SPACE, ['rev-parse', '--abbrev-ref', 'HEAD'])
  git(other, ['clone', '-q', bare, '.'])
  git(other, [
    '-c',
    'user.email=o@local',
    '-c',
    'user.name=o',
    'commit',
    '-q',
    '--allow-empty',
    '-m',
    'other: divergent',
  ])
  git(other, ['push', '-q'])
  const remoteHead = git(other, ['rev-parse', 'HEAD'])

  // A local commit the remote hasn't seen (and can't fast-forward to).
  await request.put(`${SERVER}/incoming/notes/pub-reject.md`, {
    data: '# Pub Reject\n\nlocal only\n',
    headers: { 'content-type': 'text/plain' },
  })
  const localHead = git(SPACE, ['rev-parse', 'HEAD'])

  await page.goto('/')
  const btn = publishBtn(page)
  await expect(btn).toBeEnabled({ timeout: 20000 })
  await btn.click()

  // Failure is surfaced, not swallowed — and nothing local was rewritten or lost.
  await expect(page.locator('.pubst.err')).toContainText('publish failed', { timeout: 20000 })
  expect(git(SPACE, ['rev-parse', 'HEAD'])).toBe(localHead)
  expect(git(bare, ['rev-parse', branch])).toBe(remoteHead)

  rmSync(other, { recursive: true, force: true })
})
