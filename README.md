<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/logo.png">
    <img src="assets/logo.png" width="240" alt="WdeV, the chill expert peer">
  </picture>
</p>

# <div align=center> WdeV </div>

Agentic coding plugin for working with an agent as an expert peer: the agent writes most of the code, you own the engineering.

Built for Claude Code. Other agents get the rules only (see [Other agents](#other-agents)).

- **Rules** (`AGENTS.md`): YAGNI, DRY, modular, review-sized diffs, doc comments over inline comments, follow hand-written code's style, plan first on big work, a task list and a stop after each plan and each task, state-changing git only on request, reviews by a panel unless you ask for brief, deliberate subagent use, XP on fresh repos. Injected at session start. Subagents get them minus the main-session-only parts (canary, plans and stops, spawning subagents).
- **Plan hook**: approving a plan makes the agent create its task list, show it, and wait for your go.
- **Git guard**: git that changes state asks for your approval, from the main agent or any subagent. Inspecting (`status`, `log`, `diff`, `show`, `blame`, `shortlog`, `ls-files`, `grep`, `rev-parse`, `describe`) runs freely.
- **Bar**: a one-line row above the prompt showing context % used, tokens, and 5h/7d rate-limit %. **Review** runs `/wdev:review`, **Tasks n/m** expands the task list, **Details** expands tokens/window, limit reset times and session cost.
- **Canary**: every response starts with your name. A missing name means the rules fell out of context.
- **`/handoff [focus]`**: writes `.wdev/handoff.md` with only what the next session needs. Run `/clear` after; the new session loads it once and keeps it as `.wdev/handoff.last.md`.
- **`/delegate`, `/delegate-seq`, `/delegate-par`**: hand prompts to clean-context subagents, each briefed with only what it needs. Chain them in one message:

  ```
  /delegate-par audit hooks/ /delegate-par audit skills/ /delegate-seq merge both audits into one list
  ```

  Consecutive par segments run together. A seq segment gets the previous group's output and passes its own to the next group. Plain `/delegate` lets the model choose per segment.
- **`/delegate-par-tasks [instructions]`**: runs every open task from the task list in parallel, one worker per task. Workers don't commit; ask afterwards and each task gets its own commit with only its files.
- **`/review [target] [brief]`**: full review panel. 2-3 clean-context reviewers, each with a different lens, then `judge` settles on one verdict. `brief` shortens only the report. Asking for a review in plain words runs the same panel unless you say brief or quick.
- **`judge` agent**: settles between independent perspectives.
- **`physicist` agent**: classical mechanics, E&M, thermo/stat mech, quantum up to quantum information. Works from postulates only. Looks things up only on arXiv, APS, SciPost, Quantum, IOP, DOAJ, INSPIRE and doi.org; a hook blocks every other domain.

## Install

```
/plugin marketplace add /path/to/WDeV-Plugin
/plugin install wdev@wdev
```

Or try it without installing: `claude --plugin-dir /path/to/WDeV-Plugin`.

Commands are namespaced: `/wdev:handoff`, `/wdev:review`.

## Other agents

Copy `AGENTS.md` into your project root, or into the agent's global rules file. Add `User name: <your name>` at the top for the canary. Hooks and commands are Claude Code only: no git guard, physicist source allowlist, handoff loading, or slash commands.

## Config

Canary name, first found wins:

1. `WDEV_NAME` environment variable
2. `name` in `~/.config/wdev/config.json` (`$XDG_CONFIG_HOME/wdev/config.json` if set)
3. `git config user.name`

Add `.wdev/` to your projects' `.gitignore`.

## Develop

```
node --test tests/
```

Requires Node on `PATH`.

Benchmark (with vs without the plugin; costs API usage, 5 cases × 2 arms):

```
claude plugin eval . --scaffold --runs 1 --max-cost-usd 3 --no-publish --allow-tools "Bash(git:*)"
```
