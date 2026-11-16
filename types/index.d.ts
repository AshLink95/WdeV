/** One task the main session made with TaskCreate, as TaskUpdate last left it. */
export type Task = { subject: string; status: string }

/** One subagent spawned this session, as its last turn left it. */
export type Agent = { description: string; type: string; status: string }

/** Which panel the band shows under its row. */
export type View = 'none' | 'details' | 'tasks' | 'agents'

declare module 'claude-code' {
  interface PluginState {
    wdev: {
      /** `$.session.usage()` as last read; null before the first read. */
      usage: SessionUsage | null
      /** Tasks by id. */
      tasks: Record<string, Task>
      /** Subagents by id. */
      agents: Record<string, Agent>
      view: View
    }
  }
}
