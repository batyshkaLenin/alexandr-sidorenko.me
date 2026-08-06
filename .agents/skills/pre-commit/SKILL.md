---
name: pre-commit
description: >-
  Prepare a Git repository for a commit by reconciling staged and unstaged
  changes with the user, applying the repository's versioning and changelog
  rules, staging generated release metadata, and running configured pre-commit
  checks. Use when the user asks to prepare, validate, or stage work before a
  commit, or when another commit workflow invokes this skill.
---

# Prepare a Commit

Prepare the current index safely. Do not create a commit, tag, release, or push.

## 1. Resolve instructions and repository state

1. Read applicable repository instructions such as `AGENTS.md`, `CLAUDE.md`,
   `CONTRIBUTING.md`, release documentation, and package-level equivalents.
   Treat them as repository-specific workflow overrides, subject to higher-level
   runtime instructions and the user's explicit request.
2. Resolve the repository root and inspect:
   - `git status --porcelain=v1 -uall`;
   - staged changes with `git diff --cached --name-status` and
     `git diff --cached`;
   - unstaged changes with `git diff --name-status` and `git diff`;
   - untracked files and partially staged files.
3. Stop on unresolved conflicts, an unfinished merge/rebase/cherry-pick that
   requires user action, or the absence of a Git repository. Preserve all
   existing changes; never reset, restore, clean, or overwrite them.
4. Resolve the language for commit and changelog prose in this order:
   - an explicit language rule in the applicable `AGENTS.md`, otherwise the
     predominant natural language of its instructions;
   - the predominant language of other applicable repository documentation;
   - the established language of recent relevant, non-automated commits;
   - English when no reliable convention exists.
   Prefer the nearest applicable instruction file in a nested repository. Do
   not use the conversation language merely because the user invoked the skill
   in that language.

## 2. Reconcile the index with the user

Interpret "not in the index" as both unstaged tracked changes and untracked
files, including the unstaged portion of a partially staged file.

Treat Git-ignored paths that remain outside the index as outside the commit.
Do not inspect or summarize their contents, use them to infer the change, or
mention them in a changelog or commit message. Mention an ignored path to the
user only when needed to explain staging scope or a missing requested file.

- If the user already explicitly authorized committing everything, review for
  obvious secrets, credentials, unexpectedly large files, generated artifacts,
  and scope mistakes, then stage all intended paths with `git add -A` from the
  repository root. Explicit authorization does not waive secret or destructive
  change safeguards.
- Otherwise, list the exact unstaged and untracked paths and explicitly ask
  whether to add all, none, or a named subset. Do not stage them before the user
  answers. Call out partially staged files because staging the whole file also
  stages their remaining hunks.
- When the user selects paths, stage only those paths using explicit pathspecs
  and `--` where supported. Leave declined paths untouched.
- If the resulting index is empty, report that there is nothing prepared to
  commit and stop.

## 3. Apply versioning rules

1. Discover version declarations, workspace/package boundaries, release tools,
   and repository policy. Examples include package manifests, lockfiles,
   Changesets, release-please, semantic-release, Cargo/Maven/Gradle metadata,
   charts, plugins, and application build metadata.
2. Do not introduce versioning into an unversioned project on your own
   initiative. Do not change a private manifest that intentionally has no
   version.
3. A project without any package manifest can still be versioned through Git
   itself: an annotated tag (`git tag -a vMAJOR.MINOR.PATCH -m "<description>"`)
   records both the version and a description directly in history, with no
   manifest required. A lightweight Git Flow-style scheme (a `develop`/release
   line and `vMAJOR.MINOR.PATCH` tags cut from it) is a reasonable default when
   the user wants a defined process, but any consistent annotated-tag scheme is
   fine — do not impose the full Git Flow branching model unless asked. Only
   set this up, or cut a new tag, when the user explicitly requests versioning
   or a release; this skill still only prepares the commit and changelog data
   the tag would describe; creating the tag itself is out of scope here (see
   the scope note above) and belongs to the explicit commit/release step.
4. If versioning exists, follow the project's own release policy and tooling.
   In a monorepo, update only affected versioned units and required dependants.
   If the repository uses release fragments or automated release PRs, create or
   update the expected metadata instead of fighting that workflow.
5. When no project-specific rule exists, apply Semantic Versioning to the
   affected public artifact:
   - `major` for an incompatible public API, schema, CLI, protocol, or persisted
     data change;
   - `minor` for backward-compatible functionality;
   - `patch` for backward-compatible fixes, performance work, or a required
     release containing only internal, documentation, test, build, or chore
     changes.
6. Ask before proceeding when the bump is materially ambiguous, especially for
   breaking behavior or multiple independently versioned packages.
7. Use the repository's package/release tool so related lockfiles remain
   consistent. Prevent that tool from committing, tagging, publishing, or
   pushing. For npm, for example, use
   `npm version <level> --no-git-tag-version` rather than editing
   `package-lock.json` manually. For the manifest-less Git-tag scheme in point
   3, the equivalent is: prepare the changelog entry here, and cut the actual
   `git tag -a` in the explicit commit/release step, never inside this skill.

## 4. Update changelog data

1. Find changelogs and fragment systems, including `CHANGELOG*`, `CHANGES*`,
   `HISTORY*`, Changesets, Towncrier fragments, and package-local equivalents.
2. Follow the existing format and release workflow. Update `Unreleased` when
   that is the established convention; otherwise add the new version and ISO
   date in the established style.
3. Use the resolved repository language while preserving the changelog's
   established terminology and structure. An explicit repository instruction
   overrides a conflicting historical convention.
4. Curate entries from the staged diff and use relevant session context only
   to clarify their impact. Record changes notable to consumers: additions,
   behavior changes, deprecations, removals, fixes, and security changes. Group
   related work and order it by importance instead of copying the commit log or
   listing files.
5. Exclude implementation noise and changes without meaningful consumer
   impact, such as validation or test results, commands run, formatting-only
   edits, routine maintenance, generated metadata, and ignored paths. Include
   internal work only when it materially changes compatibility, support,
   performance, security, distribution, or documented usage. Never invent
   changes, issue numbers, or outcomes.
6. Follow the existing category set. When establishing a Keep a Changelog
   structure, use `Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`, and
   `Security`; when the project explicitly follows Common Changelog, use its
   `Changed`, `Added`, `Removed`, and `Fixed` categories.
7. Update each affected package's changelog when the repository requires it.
8. Stage version files, lockfiles, changelog entries, and release fragments
   created by this workflow without asking again, then explicitly tell the user
   which files were added to the index and why.

## 5. Run configured checks

1. Discover the canonical pre-commit entrypoint from repository instructions,
   CI configuration, Git hooks, `core.hooksPath`, `.pre-commit-config.yaml`,
   Husky, lint-staged, Lefthook, package scripts, or equivalent tooling.
2. Prefer the installed top-level hook because it often delegates to the other
   tools. On a current Git version, use `git hook run --ignore-missing
   pre-commit`. If no hook is installed but a framework is explicitly
   configured, invoke that framework's documented staged-file command.
3. Run additional checks explicitly required by repository instructions for a
   commit. Use the detected package manager and existing dependencies. Do not
   download tools implicitly or change dependency files merely to run checks
   without user approval.
4. Avoid duplicate execution when a Git hook already invokes lint-staged,
   pre-commit, Lefthook, or package scripts. Never bypass checks with
   `--no-verify` or by disabling `core.hooksPath`.
5. Record the index and working-tree state immediately before and after checks.
   Report every command and its result.

## 6. Handle check-generated changes

- If checks modify the working tree and the user did not authorize everything,
  list the changed paths and explicitly ask whether to stage those changes.
- If a hook modifies the index directly, stop and ask whether to keep those
  newly staged changes; do not silently continue or undo them.
- If the user authorized everything, review and stage the check-generated
  changes, then rerun the relevant checks until the tree is stable. Stop and
  report an apparent modification loop rather than retrying indefinitely.
- If the user declines generated changes, leave them untouched and clearly
  explain whether the staged snapshot is still valid.
- If a check fails, report the failure and relevant output. Fix it only when the
  user's request authorizes the fix; do not weaken or skip the check.

## 7. Finish

Run `git diff --cached --check`, re-read the staged diff, and provide:

- staged paths and a concise scope summary;
- remaining unstaged/untracked paths;
- old and new versions, or why no bump applies;
- changelog/release metadata staged by the skill;
- checks run and their results;
- any blocker that prevents committing.

Leave the repository ready for a separate commit step.

## Standards

- [Git status](https://git-scm.com/docs/git-status)
- [Git hooks](https://git-scm.com/docs/githooks)
- [Semantic Versioning 2.0.0](https://semver.org/)
- [Common Changelog](https://common-changelog.org/)
- [Keep a Changelog 2.0.0](https://keepachangelog.com/en/2.0.0/)
