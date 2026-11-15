---
name: handoff
description: Distill this session into a handoff file so a fresh session (after /clear) starts from only the context it needs. Use when the user invokes /handoff.
argument-hint: "[focus of the next session]"
disable-model-invocation: true
---

Write `.wdev/handoff.md` in the project root, then stop.

Next session focus: $ARGUMENTS (if empty, infer it from the current task).

Include only what the next session needs to continue that focus:

- **Goal**: what is being built or fixed, and why.
- **Decisions**: what was chosen and why, including what the user ruled out.
- **State**: done, in progress, not started.
- **Files**: `path:line` references that matter, one line each on why.
- **Open questions**: anything blocked on the user.
- **Next step**: the first concrete action.

Drop dead ends unless knowing them prevents a repeat. No transcript, no narrative. Terse lists.

Then tell the user, in one line: run `/clear`; the new session loads the handoff automatically.
