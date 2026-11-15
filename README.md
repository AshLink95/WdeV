<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/logo.png">
    <img src="assets/logo.png" width="240" alt="WdeV, the chill expert peer">
  </picture>
</p>

# <div align=center> WdeV </div>

Agentic coding plugin for working with an agent as an expert peer: the agent writes most of the code, you own the engineering.

Currently only works with Claude Code.

- **Rules** (`AGENTS.md`): YAGNI, DRY, modular, review-sized diffs, doc comments over inline comments, follow hand-written code's style, plan first on big work, deliberate subagent use, XP on fresh repos. Injected at session start and into every subagent.
- **Canary**: every response starts with your name. A missing name means the rules fell out of context.
- **`/handoff [focus]`**: writes `.wdev/handoff.md` with only what the next session needs. Run `/clear` after; the new session loads it once and keeps it as `.wdev/handoff.last.md`.
- **`/delegate`, `/delegate-seq`, `/delegate-par`**: hand prompts to clean-context subagents, each briefed with only what it needs. Chain them in one message:

  ```
  /delegate-par audit hooks/ /delegate-par audit skills/ /delegate-seq merge both audits into one list
  ```

  Consecutive par segments run together. A seq segment gets the previous group's output and passes its own to the next group. Plain `/delegate` lets the model choose per segment.
- **`judge` agent**: settles between independent perspectives.
- **`physicist` agent**: classical mechanics, E&M, thermo/stat mech, quantum up to quantum information. Works from postulates only. Looks things up only on arXiv, APS, SciPost, Quantum, IOP, DOAJ, INSPIRE and doi.org; a hook blocks every other domain.

## Install

```
/plugin marketplace add /path/to/WDeV-Plugin
/plugin install wdev@wdev
```

Or try it without installing: `claude --plugin-dir /path/to/WDeV-Plugin`.

Commands are namespaced (`/wdev:handoff`) if another plugin uses the same name.

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
