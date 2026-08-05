---
name: commit
description: >-
  Prepare repository changes and create a focused Conventional Commit. Use
  when the user asks to commit current work, create a Git commit, or turn the
  session's completed changes into a commit while preserving repository rules,
  hooks, versioning, changelog updates, and explicit staging consent.
---

# Create a Conventional Commit

Create one intentional commit from the approved index. Do not push, publish,
tag, or amend unless the user explicitly requests that separate action.

## 1. Invoke pre-commit preparation

Invoke the `pre-commit` skill and follow it completely before composing a
message. If direct skill invocation is unavailable, read and follow
`../pre-commit/SKILL.md` as the authoritative preparation workflow.

Do not continue while that workflow is waiting for staging consent, has failing
checks, reports conflicts, or leaves the intended index ambiguous.

## 2. Understand the staged change

1. Inspect `git diff --cached --stat`, `git diff --cached --name-status`, and the
   complete staged diff. Commit only the index, never an assumed working-tree
   state.
2. Use relevant session context to understand intent and rationale, but verify
   every factual claim against the staged snapshot.
3. Use the language resolved by the `pre-commit` workflow. Inspect recent
   commit subjects and repository instructions for established scope names,
   line length, and footer conventions.
4. Stop if the index is empty or contains unrelated changes that cannot be
   described as one coherent commit. Ask whether to split genuinely independent
   changes instead of hiding them under a vague message.

## 3. Compose the message

Follow Conventional Commits:

```text
<type>[optional scope][!]: <concise description>

[optional body]

[optional footer(s)]
```

Choose the narrowest accurate type:

- `feat` — backward-compatible user-facing functionality;
- `fix` — a defect correction;
- `docs` — documentation only;
- `refactor` — code restructuring without feature or fix semantics;
- `perf` — performance improvement;
- `test` — tests only;
- `build` — build system or dependency changes;
- `ci` — CI configuration;
- `chore` — maintenance not covered above;
- `revert` — an explicit revert.

Use `!` and a `BREAKING CHANGE: ...` footer for incompatible changes. Add issue
or review trailers only when known. Never fabricate them.

Write a specific imperative subject, normally no more than 72 characters and
without a trailing period unless repository rules say otherwise.

Keep the message limited to information important for understanding the
committed change. Add a body only when it contributes material context that is
not clear from the subject, such as motivation, user impact, design rationale,
compatibility, or migration requirements. A body is optional; never pad it to
make the message appear detailed.

Describe only the staged snapshot. Do not mention ignored or uncommitted
changes, validation or test results, commands run, hook status, a mechanical
file inventory, release-workflow bookkeeping, or the process used to create the
commit. Do not restate the subject. Use footers only for actual trailers and
breaking-change information.

## 4. Commit safely

1. Create the commit with normal `git commit` behavior so `pre-commit`,
   `prepare-commit-msg`, and `commit-msg` hooks still run. Never use
   `--no-verify` or disable the hooks path.
2. Pass the prepared message through a safe multi-message or message-file
   mechanism. Do not interpolate untrusted diff content into a shell command.
3. Preserve configured signing behavior. Do not force signing off or introduce
   a new signing identity.
4. Do not use `--amend`, create a tag, publish a release, or push unless the
   user explicitly asks for that action.

If a commit hook fails or modifies files, do not bypass it. Confirm that no
commit was created, inspect the new index/worktree state, and invoke the
`pre-commit` consent and validation flow again before retrying.

## 5. Verify and report

After success, inspect the new commit and repository status. Report:

- commit hash and full subject;
- concise summary of committed behavior;
- version/changelog changes included;
- checks and commit hooks that passed;
- any remaining staged, unstaged, or untracked changes.

Do not imply that the commit was pushed.

## Standard

- [Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/)
- [Git commit](https://git-scm.com/docs/git-commit)
