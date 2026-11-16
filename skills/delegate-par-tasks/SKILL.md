---
name: delegate-par-tasks
description: Run every open task from the task list in parallel, one clean-context worker per task, via the /delegate procedure. Use when the user invokes /delegate-par-tasks.
argument-hint: "[instructions for every worker]"
disable-model-invocation: true
---

Arguments: $ARGUMENTS

Invoking this is the go for every picked task: it overrides the stop after each task. Stop once, after the report.

## 1. Pick tasks

Read the task list (`TaskList`). Take pending tasks with no unfinished blockers. Skip the rest, and name the skipped ones in the report.

## 2. Build segments

Make one **par** segment per task: its subject and description, plus the arguments (if any) as extra instructions for every worker. Read `../delegate/SKILL.md` (relative to this skill's base directory) and follow it with these segments. Its disjoint-scope rule and overlap warning apply.

## 3. Run

Every worker brief also says: no git commands; report the files you changed.

Mark each task `in_progress` (`TaskUpdate`) when its worker launches. Mark it `completed` when its worker reports success.

## 4. Report

One line per task: result, files changed. Then the skipped tasks. Flag any failure or conflict.

## 5. Commit

Only when the user asks. The main session commits, one task at a time; parallel commits race on git's index. Per task: `git add` that task's files only, then commit with the task's subject. If two tasks changed the same file, say so and ask how to split it.
