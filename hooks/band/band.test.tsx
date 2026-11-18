import { expect, mock, test } from 'claude-code/testing'
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
  mock.clock(on, { now: Date.parse('2026-11-16T15:46:00Z') })
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
    expect((await ui.find({ type: 'Text', text: /ctx/ }))?.text).toBe('ctx 42% · 84k tok · 2h14m 31% · 7d 12%')
    expect(await ui.find({ key: 'review' })).toBeDefined()
    expect(await ui.find({ key: 'details' })).toBeDefined()
    expect(await ui.find({ key: 'tasks' })).toBeUndefined()
    await ui.unmount()
  }
})

test('the row counts down to each reset while idle', async ($, on) => {
  const clock = mock.clock(on, { now: Date.parse('2026-11-16T15:46:00Z') })
  const rateLimits = [
    { kind: 'five_hour', percentUsed: 31, resetsAt: '2026-11-16T18:00:00Z' },
    { kind: 'seven_day', percentUsed: 12, resetsAt: '2026-11-20T00:00:00Z' },
  ]
  on('session.usage', () => ({ value: { ...USAGE, rateLimits } }))
  on('tool.register', (_, e) => ({ value: { tool: e.name } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  const row = async () => (await ui.find({ type: 'Text', text: /ctx/ }))?.text
  expect(await row()).toBe('ctx 42% · 84k tok · 2h14m 31% · 3d8h 12%')
  await clock.advance(2 * 60 * 60_000)
  expect(await row()).toBe('ctx 42% · 84k tok · 14m 31% · 3d6h 12%')
  await clock.advance(14 * 60_000)
  expect(await row()).toBe('ctx 42% · 84k tok · <1m 31% · 3d6h 12%')
  await ui.unmount()
})

test('Details and Tasks each toggle their view, one open at a time', async ($, on) => {
  mock.clock(on)
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
    expect((await ui.find({ type: 'Text', text: /^#1/ }))?.text).toBe('#1 0% pending write tests')

    await ui.press({ key: 'tasks' })
    expect(await ui.find({ type: 'Text', text: /^#1/ })).toBeUndefined()
    await ui.unmount()
  }
})

test('TaskCreate and TaskUpdate move the counter', async ($, on) => {
  mock.clock(on)
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
  expect((await ui.find({ type: 'Text', text: /^#2/ }))?.text).toBe('#2 50% in_progress b2')
  expect(await ui.find({ type: 'Text', text: /^#3/ })).toBeUndefined()
  await ui.unmount()
})

test('a TaskCreate result without a task leaves the list alone', async ($, on) => {
  mock.clock(on)
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
  mock.clock(on)
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
    expect((await ui.find({ type: 'Text', text: /hooks$/ }))?.text).toBe('Explore 100% completed audit hooks')
    expect((await ui.find({ type: 'Text', text: /skills$/ }))?.text).toBe('general-purpose 0% killed audit skills')
    expect((await ui.find({ type: 'Text', text: /evals$/ }))?.text).toBe('general-purpose 0% running audit evals')
    await ui.press({ key: 'agents' })
    await ui.unmount()
  }
})

test('reported progress shows per task and per agent; an agent without reports goes by its own tasks', async ($, on) => {
  mock.clock(on)
  let task = 0
  on('session.usage', () => ({ value: USAGE }))
  on('session.measure', (_, e) => ({ changed: e.changed }))
  on('agent.spawn', (_, e) => ({ model: 'opus', agentId: e.description }))
  on('tool.call', ($, e) =>
    e.tool === 'TaskCreate'
      ? { result: { task: { id: String(++task), subject: e.subject } } }
      : { result: { success: true, taskId: '', updatedFields: [] } },
  )
  await $.session.measure({ ...USAGE, changed: ['context'] })
  const spawn = { prompt: 'p', tool_use_id: 'u', provider: { plugin: 'engine', tier: 'builtin' }, parentModel: 'opus', background: true, fork: false } as const
  const progress = (input: { percent: number; taskId?: string; agentId?: string }) =>
    $.tool.call({ tool: 'mcp__wdev__progress', ...input } as never)

  await $.tool.call({ tool: 'TaskCreate', subject: 'main task', description: '' })
  await progress({ percent: 80, taskId: '1' })
  await $.agent.spawn({ ...spawn, description: 'reporter', subagentType: 'Explore' })
  await progress({ percent: 10, agentId: 'reporter' })
  await $.agent.spawn({ ...spawn, description: 'lister', subagentType: 'Explore' })
  await $.tool.call({ tool: 'TaskCreate', subject: 'x', description: '', agentId: 'lister' } as never)
  await $.tool.call({ tool: 'TaskCreate', subject: 'y', description: '', agentId: 'lister' } as never)
  await $.tool.call({ tool: 'TaskUpdate', taskId: '2', status: 'completed', agentId: 'lister' } as never)
  const bad = await progress({ percent: 150, agentId: 'reporter' })
  expect(bad.result).toBe('percent must be a number from 0 to 100')

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...BAND, surface })
    expect((await ui.find({ key: 'tasks' }))?.text).toBe('Tasks 0/1 0%')
    await ui.press({ key: 'tasks' })
    expect((await ui.find({ type: 'Text', text: /^#1/ }))?.text).toBe('#1 80% pending main task')
    await ui.press({ key: 'agents' })
    expect((await ui.find({ type: 'Text', text: /reporter$/ }))?.text).toBe('Explore 10% running reporter')
    expect((await ui.find({ type: 'Text', text: /lister$/ }))?.text).toBe('Explore 50% running lister')
    await ui.press({ key: 'agents' })
    await ui.unmount()
  }
})
