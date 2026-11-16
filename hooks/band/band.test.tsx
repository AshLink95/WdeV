import { expect, test } from 'claude-code/testing'
import type { SessionUsage } from 'claude-code'

const BAND = {
  plugin: 'wdev',
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 12, bodyColumns: 100, scroll: { offset: 0, bodyRows: 12 }, view: {} },
} as const

const USAGE: SessionUsage = {
  startedAt: 0,
  context: { tokens: 84_000, window: 200_000, percent: 42 },
  rateLimits: [
    { kind: 'five_hour', percentUsed: 31, resetsAt: '2026-11-16T18:00:00Z' },
    { kind: 'seven_day', percentUsed: 12 },
  ],
  cost: { usd: 1.5 },
}

const SURFACES = ['terminal', 'desktop'] as const

test('the row shows usage once read, and the engine draws until then', async ($, on) => {
  on('session.usage', () => ({ value: USAGE }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })

  const before = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await before.find({ key: 'review' })).toBeUndefined()
  await before.unmount()

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...BAND, surface })
    expect((await ui.find({ type: 'Text', text: /ctx/ }))?.text).toBe('ctx 42% · 84k tok · 5h 31% · 7d 12%')
    expect(await ui.find({ key: 'review' })).toBeDefined()
    expect(await ui.find({ key: 'details' })).toBeDefined()
    expect(await ui.find({ key: 'tasks' })).toBeUndefined()
    await ui.unmount()
  }
})

test('Details and Tasks each toggle their view, one open at a time', async ($, on) => {
  on('session.usage', () => ({ value: USAGE }))
  on('tool.call', () => ({ result: { task: { id: '1', subject: 'write tests' } } }))
  on('session.measure', (_, e) => ({ changed: e.changed }))
  await $.session.measure({ ...USAGE, changed: ['context'] })
  await $.tool.call({ tool: 'TaskCreate', subject: 'write tests', description: '' })

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...BAND, surface })
    await ui.press({ key: 'details' })
    expect((await ui.find({ type: 'Text', text: /^context/ }))?.text).toBe('context 84k / 200k')
    expect((await ui.find({ type: 'Text', text: /^5h/ }))?.text).toBe('5h 31% resets 2026-11-16T18:00:00Z')
    expect((await ui.find({ type: 'Text', text: /^cost/ }))?.text).toBe('cost $1.50')

    await ui.press({ key: 'tasks' })
    expect(await ui.find({ type: 'Text', text: /^context/ })).toBeUndefined()
    expect((await ui.find({ type: 'Text', text: /^#1/ }))?.text).toBe('#1 pending write tests')

    await ui.press({ key: 'tasks' })
    expect(await ui.find({ type: 'Text', text: /^#1/ })).toBeUndefined()
    await ui.unmount()
  }
})

test('TaskCreate and TaskUpdate move the counter', async ($, on) => {
  let id = 0
  on('session.usage', () => ({ value: USAGE }))
  on('tool.call', ($, e) =>
    e.tool === 'TaskCreate'
      ? { result: { task: { id: String(++id), subject: e.subject } } }
      : { result: { success: true, taskId: '', updatedFields: [] } },
  )
  on('session.measure', (_, e) => ({ changed: e.changed }))
  await $.session.measure({ ...USAGE, changed: ['context'] })
  await $.tool.call({ tool: 'TaskCreate', subject: 'a', description: '' })
  await $.tool.call({ tool: 'TaskCreate', subject: 'b', description: '' })
  await $.tool.call({ tool: 'TaskCreate', subject: 'c', description: '' })
  await $.tool.call({ tool: 'TaskUpdate', taskId: '1', status: 'completed' })
  await $.tool.call({ tool: 'TaskUpdate', taskId: '3', status: 'deleted' })
  await $.tool.call({ tool: 'TaskUpdate', taskId: '2', status: 'in_progress', subject: 'b2' })

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect((await ui.find({ key: 'tasks' }))?.text).toBe('Tasks 1/2 50%')
  await ui.press({ key: 'tasks' })
  expect((await ui.find({ type: 'Text', text: /^#2/ }))?.text).toBe('#2 in_progress b2')
  expect(await ui.find({ type: 'Text', text: /^#3/ })).toBeUndefined()
  await ui.unmount()
})

test('a TaskCreate result without a task leaves the list alone', async ($, on) => {
  on('session.usage', () => ({ value: USAGE }))
  on('tool.call', () => ({ result: {} as never }))
  on('session.measure', (_, e) => ({ changed: e.changed }))
  await $.session.measure({ ...USAGE, changed: ['context'] })
  const ran = await $.tool.call({ tool: 'TaskCreate', subject: 'a', description: '' })
  expect(ran.result).toEqual({})

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ key: 'tasks' })).toBeUndefined()
  await ui.unmount()
})

test('spawned agents show with their completion, ended by their last turn', async ($, on) => {
  let id = 0
  on('session.usage', () => ({ value: USAGE }))
  on('agent.spawn', () => ({ model: 'opus', agentId: `a${++id}` }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  on('session.measure', (_, e) => ({ changed: e.changed }))
  await $.session.measure({ ...USAGE, changed: ['context'] })
  const turn = { answer: '', durationMs: 1, isAborted: false, turnId: 't' }
  const spawn = { prompt: 'p', tool_use_id: 'u', provider: { plugin: 'engine', tier: 'builtin' }, parentModel: 'opus', background: true, fork: false } as const

  await $.agent.spawn({ ...spawn, description: 'audit hooks', subagentType: 'Explore' })
  await $.agent.spawn({ ...spawn, description: 'audit skills', subagentType: 'general-purpose' })
  await $.agent.spawn({ ...spawn, description: 'audit evals', subagentType: 'general-purpose' })
  await $.turn.complete({ ...turn, agentId: 'a1', reason: 'answer' })
  await $.turn.complete({ ...turn, agentId: 'a2', reason: 'aborted', isAborted: true })
  await $.turn.complete({ ...turn, agentId: 'a3', reason: 'error' })
  await $.turn.start({ text: 'more', turnId: 't2', agentId: 'a3' })
  await $.turn.complete({ ...turn, reason: 'answer' })

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...BAND, surface })
    expect((await ui.find({ key: 'agents' }))?.text).toBe('Agents 2/3 67%')
    await ui.press({ key: 'agents' })
    expect((await ui.find({ type: 'Text', text: /hooks$/ }))?.text).toBe('Explore completed audit hooks')
    expect((await ui.find({ type: 'Text', text: /skills$/ }))?.text).toBe('general-purpose killed audit skills')
    expect((await ui.find({ type: 'Text', text: /evals$/ }))?.text).toBe('general-purpose running audit evals')
    await ui.press({ key: 'agents' })
    await ui.unmount()
  }
})
