import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionUsage } from 'claude-code'

import type { View } from '../../types'

const usage = atom({ plugin: 'wdev', key: 'usage' } as const, null)
const tasks = atom({ plugin: 'wdev', key: 'tasks' } as const, {})
const agents = atom({ plugin: 'wdev', key: 'agents' } as const, {})
const view = atom({ plugin: 'wdev', key: 'view' } as const, 'none')

const LIMITS: Record<string, string> = { five_hour: '5h', seven_day: '7d' }

/** A rate-limit kind as the band names it: `5h`, `7d`, or the kind as-is. */
const limitName = (kind: string) => LIMITS[kind] ?? kind

/** The status an agent's ended turn leaves it in, by the turn's reason; any other reason is `failed`. */
const ENDED: Record<string, string> = { answer: 'completed', aborted: 'killed' }

/** A button's label with its completion: `Tasks 1/2 50%`. */
const progress = (name: string, done: number, total: number) => `${name} ${done}/${total} ${Math.round((done / total) * 100)}%`

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

/** Sets a tracked agent's status; one the band never saw spawn stays out. */
const setStatus = ($: EngineInterface, id: string, status: string) =>
  update($, agents, list => (list[id] === undefined ? list : { ...list, [id]: { ...list[id], status } }))

/** The band above the prompt: session usage, task and agent counters, and Review/Tasks/Agents/Details. */
export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await readUsage($)

    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    await readUsage($)

    return next(e)
  })

  // Both skip a subagent's calls (agentId set): its tasks are its own list, not the main session's.
  // They only observe, so their .catch hands back the tool's own result instead of refusing it.
  on('tool.call', { tool: 'TaskCreate' }, async ($, e, next) => {
    const ran = await next(e)
    const id = ran.result?.task?.id
    if (e.agentId === undefined && id !== undefined && !ran.isError) {
      await update($, tasks, list => ({ ...list, [id]: { subject: e.subject, status: 'pending' } }))
    }

    return ran
  }).catch(($, e, next) => next(e))

  on('tool.call', { tool: 'TaskUpdate' }, async ($, e, next) => {
    const ran = await next(e)
    if (e.agentId === undefined && ran.result !== undefined && !ran.isError) {
      await update($, tasks, ({ [e.taskId]: task, ...rest }) =>
        task === undefined || e.status === 'deleted'
          ? rest
          : { ...rest, [e.taskId]: { subject: e.subject ?? task.subject, status: e.status ?? task.status } },
      )
    }

    return ran
  }).catch(($, e, next) => next(e))

  on('agent.spawn', async ($, e, next) => {
    const ran = await next(e)
    const id = ran.agentId
    if (id !== undefined) {
      await update($, agents, list => ({ ...list, [id]: { description: e.description, type: e.subagentType, status: 'running' } }))
    }

    return ran
  }).catch(($, e, next) => next(e))

  // A message can resume an ended agent under the same id.
  on('turn.start', async ($, e, next) => {
    if (e.agentId !== undefined) await setStatus($, e.agentId, 'running')

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const ran = await next(e)
    if (e.agentId !== undefined) await setStatus($, e.agentId, ENDED[e.reason] ?? 'failed')

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
          ? list.map(([id, task]) => [id, `#${id} ${task.status} ${task.subject}`])
          : open === 'agents'
            ? spawned.map(([id, agent]) => [id, `${agent.type} ${agent.status} ${agent.description}`])
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
