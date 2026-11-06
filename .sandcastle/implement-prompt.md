# TASK

Implement issue #{{TASK_ID}}: {{ISSUE_TITLE}}

You are working on branch `{{BRANCH}}`, which will be merged into `{{BASE_BRANCH}}`. Work only on this issue.

The code you write will be read and maintained by people. Correct behavior is the minimum; the real bar is
that a developer who has never seen this code can read it top to bottom and understand what it does
without comments. Follow @CODING_STANDARDS.md — it defines what "readable" means in this project.

# CONTEXT

## Progress already on this branch

You may be continuing work from a previous iteration. Check this before doing anything else.

<execution-plan>

!`cat .plans/issue-{{TASK_ID}}.md 2>/dev/null || echo "No execution plan yet."`

</execution-plan>

<branch-commits>

!`git log {{BASE_BRANCH}}..{{BRANCH}} --format="%h %s%n%b---"`

</branch-commits>

<branch-diff-stat>

!`git diff --stat {{BASE_BRANCH}}...{{BRANCH}}`

</branch-diff-stat>

## Recent commits on the base branch

<recent-commits>

!`git log {{BASE_BRANCH}} -n 10 --format="%h %ad %s" --date=short`

</recent-commits>

# 1. UNDERSTAND THE ISSUE

1. Read the issue: `gh issue view {{TASK_ID}} --comments`. Comments may contain notes from a previous iteration.
2. The issue body starts with a line `PRD: #N`. Read the PRD too (`gh issue view N`): it has the product
   context, the architecture, the domain rules (money in cents, stock rules, etc.) and the naming used
   across the project.
3. Note the issue's sections:
    - **Escopo / Não inclui** — the boundary. Don't implement things listed under "Não inclui"; another issue
      owns them and is probably being built in parallel. Expanding scope causes merge conflicts.
    - **Arquivos** — the files to create and change. Stay close to this list; if you need to touch other
      files, keep the change minimal and mention it in the commit.
    - **Contratos** — the exact names, types and signatures to use. Other issues depend on these names; don't
      rename them, even if you'd prefer another name.
    - **Critérios de aceite** and **Testes** — your definition of done.

# 2. EXPLORE BEFORE WRITING

Use the CodeGraph MCP tools (`mcp__codegraph__*`) to search and read code. Don't use `ls`, `cat`, `sed`,
`head`, `grep` or `find` in Bash to list, read or search source files: one `codegraph_explore` call returns
what several of those commands would, with the callers and tests. Fall back to Grep/Read only for what
CodeGraph doesn't cover (non-code files such as Markdown, JSON, SQL migrations, `.env.example`, or
plain-text searches):

- `codegraph_explore` with a short description of the area ("checkout payment", "stock movements") — returns
  the relevant symbols' source grouped by file, the call paths between them and what depends on them. Start
  here; the source it returns is the current file content, so don't Read those files again.
- `codegraph_search` to find a symbol by name, `codegraph_node` to read one symbol or file with its callers
  and callees.
- `codegraph_callers` / `codegraph_impact` before changing a function, type or component, to find every
  caller and test you must update.

Read the existing code that this issue touches or builds on, and the tests next to it. You are looking for:

- **What already exists** that you should reuse: helpers in `src/lib/`, components in `src/components/ui/`,
  fakes and factories in `src/test/`, services from earlier issues. Writing a second version of something
  that exists is the most common way codebases become hard to read.
- **The patterns already in use** — how services receive dependencies, how Server Actions return results,
  how tests are organized — so your code looks like it belongs.

# 3. WRITE THE EXECUTION PLAN

The plan at `.plans/issue-{{TASK_ID}}.md` is how a restarted agent knows where to pick up: the sandbox can be
killed at any moment (usage limit, timeout, crash), and the next agent starts with only the branch's commits.

**If the plan already exists** (see `<execution-plan>` above), don't rewrite it. Resume from the first
unchecked task. Before trusting a checked task, compare it with the branch commits; if the last task was left
half-done, finish it or redo it. Add tasks to the end only when you find work the plan missed.

**If it doesn't exist**, write it now, after exploring and before any production or test code:

```markdown
# Issue #{{TASK_ID}}: {{ISSUE_TITLE}}

## Decisions

- Choices that a restarted agent must keep (reused helpers, where new code lives, contract details).

## Tasks

- [ ] 1. Test: rejects the order when the store is paused — `src/server/orders/place_order.test.ts`
- [ ] 2. Implement the paused-store check in `placeOrder` — `src/server/orders/place_order.ts`
- [ ] 3. Refactor: extract `assertStoreIsOpen` and run the checks
      ...
- [ ] N. Self-review checklist (section 5) and feedback loops (section 6)
```

Rules for the tasks:

- **Micro tasks:** each one is a single step that fits in one RED → GREEN → REFACTOR cycle or less, and names
  the behavior and the file(s) it touches. A task that needs "and" to describe it is two tasks.
- **In order:** follow the acceptance criteria and the order that dependencies require.
- **Cover everything:** every acceptance criterion and every test listed in the issue maps to at least one task.

Commit the plan alone before starting (`RALPH: plan for #{{TASK_ID}}`), so it survives a restart right away.

**Keep it current:** when a task is done, change its `- [ ]` to `- [x]` and include the plan in the same commit
as the code for that task. The checkbox and the code it describes must never land in different commits.

# 4. IMPLEMENT WITH RED → GREEN → REFACTOR

Work task by task through the plan, in small cycles:

1. **RED:** write one test for the next behavior from the acceptance criteria. Name it as a sentence about
   behavior (`it("rejects the order when the store is paused")`). Run it and see it fail.
2. **GREEN:** write the simplest code that makes it pass.
3. **REFACTOR:** now make it readable — this step is not optional. With the test green, improve names,
   extract functions whose purpose can be named, flatten nesting with early returns, replace magic values
   with named constants, remove duplication. Run the tests again.
4. Check the task off in the plan and commit (section 7).
5. Repeat until every task is checked.

While writing, keep asking: _"Would a new developer understand this line without me explaining it?"_
If the answer is no, the fix is almost always a better name or an extracted function — not a comment.

# 5. SELF-REVIEW BEFORE COMMITTING

Read your full diff (`git diff {{BASE_BRANCH}}`) as if you were reviewing a colleague's pull request,
and fix what you find:

- [ ] Every name says what the thing is or does; no abbreviations, no `data`/`info`/`temp`/`handle`.
- [ ] Each function does one thing, at one level of abstraction; the top-level functions read like a summary.
- [ ] No nesting deeper than two levels; no nested ternaries; guard clauses instead of `else` after `return`.
- [ ] No magic numbers or strings; no `any`, unchecked `as` casts or non-null assertions (`value!.prop`).
- [ ] Comments only explain _why_; no comment restates the code; no commented-out code; no dead code.
- [ ] Nothing duplicated that already existed in the codebase.
- [ ] Names and signatures match the issue's contracts exactly.
- [ ] Tests describe behavior and cover the edge cases listed in the issue.
- [ ] Nothing outside the issue's scope.

# 6. FEEDBACK LOOPS

Before every commit, run:

```
npm run typecheck
npm run lint
npm run test
```

All three must pass. If one fails, fix the cause. Never skip, weaken or delete a test, disable a lint rule,
or add `any`/`@ts-ignore` to make a check pass — if a test is genuinely wrong, fix it and explain why in the
commit message.

(Before the project's foundation issue creates the `lint` script, `npm run lint` may not exist; in that case,
run only the commands that exist.)

`npm run test` runs without network, Docker, the `claude` CLI or `.env`. Use the fakes in `src/test/`
(`FakeAgentRuntime`, `FakeClock`, in-memory SQLite). If something can only be verified against the real thing
(Docker, the real `claude`, `git` worktrees on disk), write it as `*.integration.test.ts`; those run with
`npm run test:integration` outside this sandbox, so they don't have to pass here.

# 7. COMMIT

Commit in small, coherent steps: one commit per plan task (or a few related tasks), always with the plan's
updated checkboxes. Each message must:

1. Start with the `RALPH:` prefix
2. Say what was done and reference the issue (`#{{TASK_ID}}`) and the PRD
3. List key decisions made
4. List files changed
5. Note blockers or anything the next iteration needs to know

Keep it concise.

# 8. FINISH

If the issue is **not** complete when you stop, make sure the plan's checkboxes match what is committed, then
leave a comment on the issue (`gh issue comment {{TASK_ID}} --body "..."`) saying what is done, what is missing
and any decision the next iteration should respect.

Do not close the issue — that happens after merge.

When every task in the plan is checked, every acceptance criterion is met, the self-review checklist passes and
all checks are green, delete the plan (`git rm .plans/issue-{{TASK_ID}}.md`) and commit it
(`RALPH: remove the plan for #{{TASK_ID}}`) — it is a work file and must not reach `{{BASE_BRANCH}}`. Then
output <promise>COMPLETE</promise>.

# FINAL RULES

ONLY WORK ON ISSUE #{{TASK_ID}}.
THE PLAN IS THE SOURCE OF TRUTH FOR PROGRESS: READ IT FIRST, KEEP ITS CHECKBOXES IN SYNC WITH YOUR COMMITS.
READABLE CODE IS PART OF DONE: AN ISSUE WITH PASSING TESTS BUT HARD-TO-READ CODE IS NOT COMPLETE.
