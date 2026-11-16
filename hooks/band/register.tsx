import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionUsage } from 'claude-code'

import type { Agent, Task, View } from '../../types'

const usage = atom({ plugin: 'wdev', key: 'usage' } as const, null)
const tasks = atom({ plugin: 'wdev', key: 'tasks' } as const, {})
const agents = atom({ plugin: 'wdev', key: 'agents' } as const, {})
const view = atom({ plugin: 'wdev', key: 'view' } as const, 'none')

const LIMITS: Record<string, string> = { five_hour: '5h', seven_day: '7d' }

/** A rate-limit kind as the band names it: `5h`, `7d`, or the kind as-is. */
const limitName = (kind: string) => LIMITS[kind] ?? kind

/** The status an agent's ended turn leaves it in, by the turn's reason; any other reason is `failed`. */
const ENDED: Record<string, string> = { answer: 'completed', aborted: 'killed' }

/** `done` of `total` as a whole percentage. */
const percent = (done: number, total: number) => Math.round((done / total) * 100)

/** A button's label with its completion: `Tasks 1/2 50%`. */
const progress = (name: string, done: number, total: number) => `${name} ${done}/${total} ${percent(done, total)}%`

/** A task's completion by its status, when the model reported none. */
const TASK_PERCENT: Record<string, number> = { pending: 0, in_progress: 50 }

/** A task's completion: 100% once completed, else what the model reported, else by its status. */
const taskPercent = (task: Task) => (task.status === 'completed' ? 100 : (task.percent ?? TASK_PERCENT[task.status] ?? 0))

/** An agent's completion: 100% once completed, else what it reported, else its own tasks done. */
const agentPercent = ({ status, tasks, percent: reported }: Agent) => {
  const own = Object.values(tasks)
  if (status === 'completed') return 100
  if (reported !== undefined) return reported
  return own.length === 0 ? 0 : percent(own.filter(task => task.status === 'completed').length, own.length)
}

/** The tool the model reports progress through, as the model calls it. */
const PROGRESS = 'mcp__wdev__progress'

type TaskList = Record<string, Task>

/** A task list as a TaskUpdate leaves it: a task it never saw, or a deleted one, stays out. */
const updated = (list: TaskList, id: string, change: { subject?: string; status?: string }): TaskList => {
  const { [id]: task, ...rest } = list
  return task === undefined || change.status === 'deleted'
    ? rest
    : { ...rest, [id]: { ...task, subject: change.subject ?? task.subject, status: change.status ?? task.status } }
}

/** Tokens in thousands: `84k`. */
const k = (tokens: number) => `${Math.round(tokens / 1000)}k`

/** The compact row's figures, each left out when the engine has none. */
const summary = ({ context, rateLimits }: SessionUsage) =>
  [
    context.percent !== undefined && `ctx ${context.percent}%`,
    context.tokens !== undefined && `${k(context.tokens)} tok`,
    ...rateLimits.map(limit => `${limitName(limit.kind)} ${limit.percentUsed}%`),
  ]
    .filter(Boolean)
    .join(' · ')

/** The details view's lines: context fill, each limit's reset, and cost. */
const details = ({ context, rateLimits, cost }: SessionUsage) => [
  `context ${context.tokens === undefined ? '?' : k(context.tokens)} / ${k(context.window)}`,
  ...rateLimits.map(limit => `${limitName(limit.kind)} ${limit.percentUsed}%${limit.resetsAt ? ` resets ${limit.resetsAt}` : ''}`),
  ...(cost ? [`cost $${cost.usd.toFixed(2)}`] : []),
]

const readUsage = async ($: EngineInterface) => {
  const now = await $.session.usage()
  await update($, usage, () => now)
}

/** Changes a tracked agent; one the band never saw spawn stays out. */
const updateAgent = ($: EngineInterface, id: string, change: (agent: Agent) => Agent) =>
  update($, agents, list => {
    const agent = list[id]
    return agent === undefined ? list : { ...list, [id]: change(agent) }
  })

/** Changes the main session's task list, or, from inside a subagent (`agentId`), that agent's own. */
const updateTasks = ($: EngineInterface, agentId: string | undefined, change: (list: TaskList) => TaskList) =>
  agentId === undefined ? update($, tasks, change) : updateAgent($, agentId, agent => ({ ...agent, tasks: change(agent.tasks) }))

/** The band above the prompt: session usage, task and agent counters, and Review/Tasks/Agents/Details. */
export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await readUsage($)
    const started = await next(e)
    await $.tool.register({
      name: 'progress',
      description:
        'Reports how far along work is, as a whole percent, for the wdev bar. With taskId: that task of your task list. Without: your own progress, when you are a subagent.',
      inputSchema: {
        type: 'object',
        properties: { percent: { type: 'integer', minimum: 0, maximum: 100 }, taskId: { type: 'string' } },
        required: ['percent'],
      },
      isDeferred: false,
    })

    return started
  })

  on('session.measure', async ($, e, next) => {
    await readUsage($)

    return next(e)
  })

  // A subagent's calls (agentId set) go to its own list, which makes its completion, not the main session's.
  // Both only observe, so their .catch hands back the tool's own result instead of refusing it.
  on('tool.call', { tool: 'TaskCreate' }, async ($, e, next) => {
    const ran = await next(e)
    const id = ran.result?.task?.id
    if (id !== undefined && !ran.isError) {
      await updateTasks($, e.agentId, list => ({ ...list, [id]: { subject: e.subject, status: 'pending' } }))
    }

    return ran
  }).catch(($, e, next) => next(e))

  on('tool.call', { tool: 'TaskUpdate' }, async ($, e, next) => {
    const ran = await next(e)
    if (ran.result !== undefined && !ran.isError) await updateTasks($, e.agentId, list => updated(list, e.taskId, e))

    return ran
  }).catch(($, e, next) => next(e))

  on('tool.call', { tool: PROGRESS }, async ($, e) => {
    const { percent: reported, taskId } = e as unknown as { percent: unknown; taskId?: string }
    if (typeof reported !== 'number' || !(reported >= 0 && reported <= 100)) return { result: 'percent must be a number from 0 to 100' }
    const percent = Math.round(reported)
    if (taskId !== undefined) {
      await updateTasks($, e.agentId, list => {
        const task = list[taskId]
        return task === undefined ? list : { ...list, [taskId]: { ...task, percent } }
      })
    } else if (e.agentId !== undefined) {
      await updateAgent($, e.agentId, agent => ({ ...agent, percent }))
    }

    return { result: 'ok' }
  })

  on('agent.spawn', async ($, e, next) => {
    const ran = await next(e)
    const id = ran.agentId
    if (id !== undefined) {
      await update($, agents, list => ({ ...list, [id]: { description: e.description, type: e.subagentType, status: 'running', tasks: {} } }))
    }

    return ran
  }).catch(($, e, next) => next(e))

  // A message can resume an ended agent under the same id.
  on('turn.start', async ($, e, next) => {
    if (e.agentId !== undefined) await updateAgent($, e.agentId, agent => ({ ...agent, status: 'running' }))

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const ran = await next(e)
    if (e.agentId !== undefined) await updateAgent($, e.agentId, agent => ({ ...agent, status: ENDED[e.reason] ?? 'failed' }))

    return ran
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const now = await read($, usage)
    if (now === null || e.props.hasSurvey) return next(e)

    const list = Object.entries(await read($, tasks))
    const spawned = Object.entries(await read($, agents))
    const open = await read($, view)
    const done = list.filter(([, task]) => task.status === 'completed').length
    const ended = spawned.filter(([, agent]) => agent.status !== 'running').length
    const toggle = (to: View) => () => update($, view, v => (v === to ? 'none' : to))
    const lines =
      open === 'details'
        ? details(now).map(line => [line, line])
        : open === 'tasks'
          ? list.map(([id, task]) => [id, `#${id} ${taskPercent(task)}% ${task.status} ${task.subject}`])
          : open === 'agents'
            ? spawned.map(([id, agent]) => [id, `${agent.type} ${agentPercent(agent)}% ${agent.status} ${agent.description}`])
            : []

    const { Box, Button, Text } = $.ui.resolve(e)
    // bodyColumns counts terminal cells; a graphical surface draws Buttons wider than their cells, so a row sized to it wraps there.
    const width = e.surface === 'terminal' ? e.props.bodyColumns : undefined

    return (
      <Box flexDirection="column" width={width}>
        <Box flexDirection="row" gap={2}>
          <Text>
            <Text color="suggestion">●</Text> wdev
          </Text>
          <Text dimColor>{summary(now)}</Text>
          <Box flexGrow={1} />
          <Button key="review" plain label="Review" onPress={() => $.command.run({ command: 'wdev:review', args: '' })} />
          {list.length > 0 && <Button key="tasks" plain label={progress('Tasks', done, list.length)} onPress={toggle('tasks')} />}
          {spawned.length > 0 && <Button key="agents" plain label={progress('Agents', ended, spawned.length)} onPress={toggle('agents')} />}
          <Button key="details" plain label="Details" onPress={toggle('details')} />
        </Box>
        {lines.map(([key, line]) => (
          <Text key={key} dimColor>
            {line}
          </Text>
        ))}
      </Box>
    )
  })
}
