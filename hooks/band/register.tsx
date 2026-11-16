import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionUsage } from 'claude-code'

import type { View } from '../../types'

const usage = atom({ plugin: 'wdev', key: 'usage' } as const, null)
const tasks = atom({ plugin: 'wdev', key: 'tasks' } as const, {})
const view = atom({ plugin: 'wdev', key: 'view' } as const, 'none')

const LIMITS: Record<string, string> = { five_hour: '5h', seven_day: '7d' }

/** A rate-limit kind as the band names it: `5h`, `7d`, or the kind as-is. */
const limitName = (kind: string) => LIMITS[kind] ?? kind

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

/** The band above the prompt: session usage, a task counter, and Review/Tasks/Details. */
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
  on('tool.call', { tool: 'TaskCreate' }, async ($, e, next) => {
    const ran = await next(e)
    if (e.agentId === undefined && ran.result !== undefined && !ran.isError) {
      const { id } = ran.result.task
      await update($, tasks, list => ({ ...list, [id]: { subject: e.subject, status: 'pending' } }))
    }

    return ran
  })

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
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const now = await read($, usage)
    if (now === null || e.props.hasSurvey) return next(e)

    const list = Object.entries(await read($, tasks))
    const open = await read($, view)
    const done = list.filter(([, task]) => task.status === 'completed').length
    const toggle = (to: View) => () => update($, view, v => (v === to ? 'none' : to))
    const lines =
      open === 'details' ? details(now) : open === 'tasks' ? list.map(([id, task]) => `#${id} ${task.status} ${task.subject}`) : []

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
          {list.length > 0 && <Button key="tasks" plain label={`Tasks ${done}/${list.length}`} onPress={toggle('tasks')} />}
          <Button key="details" plain label="Details" onPress={toggle('details')} />
        </Box>
        {lines.map(line => (
          <Text dimColor>{line}</Text>
        ))}
      </Box>
    )
  })
}
