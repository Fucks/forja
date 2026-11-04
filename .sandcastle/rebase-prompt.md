# TASK

Branch `{{BRANCH}}` (issue #{{TASK_ID}}: {{ISSUE_TITLE}}) is being rebased onto `{{BASE_BRANCH}}`, and the
rebase stopped on conflicts. Finish the rebase so the branch keeps everything `{{BASE_BRANCH}}` gained while
this issue was being worked on **and** everything this issue added.

# CONTEXT

## Rebase status

!`git status`

## Commits this issue adds

!`git log {{BASE_BRANCH}}..ORIG_HEAD --oneline`

## What changed on `{{BASE_BRANCH}}` since the branch started

!`git log ORIG_HEAD..{{BASE_BRANCH}} --oneline`

Read the issue with `gh issue view {{TASK_ID}}` if you need to know what a change on this branch is for.

# RESOLVING

For each conflicted file:

1. Read both sides and understand what each one was trying to do. Most conflicts are two branches adding
   different things next to each other — keep both. To see how a conflicted symbol is used, use the CodeGraph
   MCP tools (`codegraph_node`, `codegraph_callers`, `codegraph_search`) rather than Grep. The index may lag
   behind the conflict markers, so read the conflicted file itself with Read.
2. Never drop a change from `{{BASE_BRANCH}}`: it is already merged and other issues depend on it.
3. `package.json`: merge both sides' entries. `package-lock.json`: don't edit it by hand — take
   `{{BASE_BRANCH}}`'s version (`git checkout --ours package-lock.json`; during a rebase "ours" is the base),
   then run `npm install` to add this branch's dependencies.
4. `git add` the file, then `git rebase --continue` (use `GIT_EDITOR=true` to keep the commit message). Repeat
   until the rebase finishes.

Do not use `git rebase --skip` or `--abort`, and do not squash or reword the commits.

# CHECKING

When the rebase has finished, run:

```
npm run typecheck
npm run lint
npm run test
```

A clean rebase can still break things — for example, code from `{{BASE_BRANCH}}` that this branch's changes
don't account for. If a check fails, fix the cause in a new commit with the `RALPH:` prefix that says it
adapts the branch to `{{BASE_BRANCH}}`. Never skip, weaken or delete a test or disable a lint rule.

When the rebase is finished and all checks pass, output <promise>COMPLETE</promise>.
