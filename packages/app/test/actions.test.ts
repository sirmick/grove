import { expect, test } from 'vitest'
import { parseActions } from '../src/lib/overview/actions'

test('parses titles, counts, and request bodies; sorts most-asked first', () => {
  const md = `# Frequent actions

intro prose that is not an action

## Refresh prices
**Asked:** 2×

Update every price.

## Pull new cars
**Asked:** 7×

Fetch new models and add the missing ones as \`_status: review\`.
`
  const actions = parseActions(md)
  expect(actions.map((a) => a.title)).toEqual(['Pull new cars', 'Refresh prices'])
  expect(actions[0]).toMatchObject({ count: 7 })
  expect(actions[0].request).toContain('Fetch new models')
  expect(actions[0].request).not.toContain('Asked')
})

test('tolerates missing count (sorted last) and empty/missing input', () => {
  expect(parseActions(undefined)).toEqual([])
  expect(parseActions('   ')).toEqual([])
  const actions = parseActions('## One off\n\nDo the thing.\n## Counted\n**Asked:** 3×\n\nx')
  expect(actions.map((a) => a.title)).toEqual(['Counted', 'One off'])
  expect(actions.find((a) => a.title === 'One off')?.count).toBeNull()
})
