<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/logo.png">
    <img src="assets/logo.png" width="240" alt="WdeV, the chill expert peer">
  </picture>
</p>

# <div align=center> WdeV </div>

Agentic coding plugin for working with an agent as an expert peer: the agent writes most of the code, you own the engineering.

Built for Claude Code. Other agents get the rules only (see [Other agents](#other-agents)).

- **Rules** (`AGENTS.md`): chill peer tone that reads you charitably and confirms or corrects your explain-backs, YAGNI, DRY, modular, review-sized diffs, doc comments over inline comments, follow hand-written code's style, docs both descriptive and concise, plan first on big work, a task list and a stop after each plan and each task, state-changing git only on request, reviews by a panel unless you ask for a brief or quick take, deliberate subagent use, XP on fresh repos. Injected at session start. Subagents get them minus the Response, Plan first and Subagents sections.
- **Plan hook**: approving a plan makes the agent create its task list, show it, and wait for your go.
- **Git guard**: `commit`, `reset`, `add`, `push`, `pull`, `stash`, and branch changes (`branch <name>`/`-d`/`-m`, `checkout`, `switch`, `merge`, `rebase`) ask for your approval, from the main agent or any subagent. Everything else runs freely, including listing branches and stashes. A git command your message spells out (`git push`) runs without asking until your next message.
- **Bar**: a one-line row above the prompt showing context % used, tokens, and each rate limit's % with the time until it renews. **Review** runs `/wdev:review` on the conversation's current target, **Tasks n/m %** (once the main session has tasks) expands the task list, **Agents n/m %** (once a subagent spawns) expands the subagents, each line with its status and %, **Details** expands tokens/window, limit reset times and session cost.
- **Progress**: the model reports how far a task or a subagent is through a `progress` tool the bar registers, as a rule in `AGENTS.md` tells it. Until it does, a task shows 0/50/100% by status and an agent its own tasks done.
- **Canary**: every response starts with your name. A missing name means the rules fell out of context.
- **`/wdev:handoff [focus]`**: writes `.wdev/handoff.md` with only what the next session needs. Run `/clear` after; the new session loads it once and keeps it as `.wdev/handoff.last.md`.
- **`/wdev:delegate`, `/wdev:delegate-seq`, `/wdev:delegate-par`**: hand prompts to clean-context subagents, each briefed with only what it needs. Chain them in one message:

  ```
  /wdev:delegate-par audit hooks/ /wdev:delegate-par audit skills/ /wdev:delegate-seq merge both audits into one list
  ```

  Consecutive par segments run together. A seq segment gets the previous group's output and passes its own to the next group. Plain `/wdev:delegate` lets the model choose per segment.
- **`/wdev:delegate-par-tasks [instructions]`**: runs pending tasks with no unfinished blockers in parallel, one worker per task, and lists the rest as skipped. Workers don't commit; ask afterwards and each task gets its own commit with only its files.
- **`/wdev:review [target] [short]`**: full review panel. 2-3 clean-context reviewers, each with a different lens, then `judge` settles on one verdict. `short` shortens only the report. Asking for a review in plain words runs the panel; say brief or quick for an inline answer without one.
- **`judge` agent**: settles between independent perspectives.
- **`physicist` agent**: classical mechanics, E&M, thermo/stat mech, quantum up to quantum information. Derives from postulates; anything looked up gets cited. Looks things up only on arXiv, APS, SciPost, Quantum, IOP, DOAJ, INSPIRE and doi.org; a hook blocks every other domain.

## Install

```
/plugin marketplace add AshLink95/WdeV
/plugin install wdev@wdev
```

If the shorthand fails: `/plugin marketplace add https://github.com/AshLink95/WdeV.git`.

Try it without installing: `git clone https://github.com/AshLink95/WdeV && claude --plugin-dir ./WdeV`.

Requires Node on `PATH`: every hook runs on Node. Without it the rules, canary, git guard and handoff silently do nothing.

## Other agents

Copy `AGENTS.md` into your project root, or into the agent's global rules file. Add `User name: <your name>` at the top for the canary. Hooks and commands are Claude Code only: no git guard, physicist source allowlist, handoff loading, or slash commands. The copy mentions things those agents lack (hook approval for git, the `progress` tool, the `judge` and `physicist` agents, the review skill): adapt or drop those lines.

Don't copy `AGENTS.md` into a project that also uses the plugin. Claude Code loads it too, doubling the rules and giving subagents the main-session sections.

## Config

Canary name, first found wins:

1. `WDEV_NAME` environment variable
2. `name` in `~/.config/wdev/config.json` (`$XDG_CONFIG_HOME/wdev/config.json` if set)
3. `git config user.name`

Add `.wdev/` to your projects' `.gitignore`

## Develop

```
node --test tests/
claude plugin test .
```

`node --test` covers the hooks. The bar's test (`hooks/band/band.test.tsx`) imports `claude-code/testing`, so only `claude plugin test` runs it.

Benchmark (with vs without the plugin; costs API usage, 5 cases × 2 arms):

```
claude plugin eval . --scaffold --runs 1 --max-cost-usd 3 --no-publish --allow-tools "Bash(git:*)"
```
