---
name: delegate
description: Hand one or more prompts to separate subagents, each given only the context it needs. Chain with /delegate, /delegate-seq, /delegate-par markers. Use when the user invokes /delegate.
argument-hint: "<prompt> [/delegate[-seq|-par] <prompt> ...]"
disable-model-invocation: true
---

Arguments: $ARGUMENTS

## 1. Split into segments

Split the arguments on the markers `/delegate`, `/delegate-seq`, `/delegate-par` (also written with `\` instead of `/`, or with a `wdev:` prefix). A marker counts only at the start of the arguments or after whitespace, and only when followed by whitespace or the end, so a path like `skills/delegate/SKILL.md` is not a marker. The text after a marker, up to the next marker, is one segment's prompt. Each marker sets its segment's mode:

- `/delegate`: auto
- `/delegate-seq`: seq
- `/delegate-par`: par

The first segment's mode is set by the command that loaded this procedure (auto unless stated otherwise above).

## 2. Resolve auto

For each auto segment pick: par if it needs no output from earlier segments and touches files disjoint from its par neighbours; otherwise seq.

## 3. Group into stages

Consecutive par segments form one stage and run in parallel (one message, one Agent call each). Each seq segment is a stage of its own. Stages run in order.

Stage k receives the output of stage k-1. A par stage's output is all its members' results. So a seq segment gets everything the preceding par group produced, and every member of a following par group gets the seq segment's output.

## 4. Brief each worker

Each worker is a `general-purpose` subagent with a clean context. Its prompt:

1. **Brief**: only the context from this session that the segment needs. Goal, constraints, decisions already made, relevant `path:line` refs. Nothing else.
2. **Previous stage output**, if any.
3. **Task**: the segment prompt, verbatim.
4. **Scope**: for par workers, the files it may change. Keep par scopes disjoint. If the user forced par and scopes overlap, warn the user and assign each worker its own scope.
5. **Return**: a short result report, including files changed.

## 5. Report

One line per segment: result, files changed. Flag any failure or conflict.
