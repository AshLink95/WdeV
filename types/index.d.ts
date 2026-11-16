/** One task the main session made with TaskCreate, as TaskUpdate last left it. */
export type Task = { subject: string; status: string }

/** Which panel the band shows under its row. */
export type View = 'none' | 'details' | 'tasks'

declare module 'claude-code' {
  interface PluginState {
    wdev: {
      /** `$.session.usage()` as last read; null before the first read. */
      usage: SessionUsage | null
      /** Tasks by id. */
      tasks: Record<string, Task>
      view: View
    }
  }
}
