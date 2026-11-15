---
name: review
description: Full review panel. 2-3 clean-context reviewers, each with a different lens, then the judge agent settles on one verdict. Use when the user invokes /review, or asks to review, evaluate, or give an opinion without asking for a brief or quick take.
argument-hint: "[target] [brief]"
---

Arguments: $ARGUMENTS

Always run the full panel. "brief" or "summary" in the arguments shortens only the final report. A brief review without the panel is a plain chat answer, not this command.

## 1. Scope

Name the target and its files. If the arguments don't name one, take it from the conversation; if that's unclear, ask. Reviewers read the files themselves: brief them with paths, not contents.

## 2. Pick lenses

2-3 lenses that fit the target and don't overlap, e.g. correctness and security; design and maintainability; fidelity to the spec; integration with the platform or framework; user impact. If a lens needs discipline knowledge, use the matching specialist (`physicist`) for it.

## 3. Run reviewers

One `general-purpose` subagent per lens, all in one message so they run in parallel. Each prompt:

1. **Target**: what is reviewed and its paths.
2. **Lens**: this reviewer's lens only. The other lenses are covered elsewhere.
3. **Rules**: read-only. No edits, no git.
4. **Return**: at most ~12 ranked findings, one line each: `path:line: severity: problem. fix.` Mark claims it could not verify.

## 4. Judge

Send `judge` the target and every reviewer's findings. Ask for: MUST FIX, SHOULD FIX, and SKIP (one-line reason each). Each kept item gets `path:line`, the fix, and which reviewer raised it. End with a one-line overall verdict.

## 5. Report

Verdict first, then MUST FIX and SHOULD FIX items, then a count of skipped items. Brief: the verdict and MUST FIX items only, a few lines.

Change nothing until the user says which fixes to apply.
