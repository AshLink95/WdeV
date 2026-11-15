---
name: delegate-seq
description: Like /delegate, but the first segment runs sequentially and its output feeds the next. Use when the user invokes /delegate-seq.
argument-hint: "<prompt> [/delegate[-seq|-par] <prompt> ...]"
disable-model-invocation: true
---

Arguments: $ARGUMENTS

The first segment's mode is **seq**. Read `../delegate/SKILL.md` (relative to this skill's base directory) and follow it with these arguments.
