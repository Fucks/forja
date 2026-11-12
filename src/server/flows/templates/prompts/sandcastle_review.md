# TASK

Review the changes on branch `{{item.branch}}` (issue #{{item.number}}: {{item.title}}) and improve their clarity,
consistency and maintainability **while preserving exact behavior**.

The standard is @CODING_STANDARDS.md: a developer who has never seen this code should understand it by
reading it, without comments. You are the last reader before this code is merged, so read it the way that
developer would.

# CONTEXT

## Branch diff

!`git diff {{project.baseBranch}}...{{item.branch}}`

## Commits on this branch

!`git log {{project.baseBranch}}..{{item.branch}} --oneline`

## The issue

Read it with `gh issue view {{item.number}}` — especially **Não inclui** (scope boundary) and **Contratos**
(names and signatures other issues depend on).

# REVIEW PROCESS

1. **Understand the change.** Read the diff and commits. Then read the touched files in full, not just the
   hunks — readability problems often show up only when you see the whole function or file. Use the CodeGraph
   MCP tools to search and read code: `codegraph_node` reads a file or symbol with its callers and callees,
   `codegraph_explore` reads an area of the code at once, and `codegraph_callers` / `codegraph_impact` show
   who uses what changed — check those callers too, and look for existing helpers the branch duplicated
   with `codegraph_search`. Use Grep/Read only for non-code files or plain-text searches.

2. **Check correctness first.**
    - Does the implementation do what the issue asks? Are the listed edge cases handled?
    - Are new behaviors covered by tests whose names describe the behavior?
    - Any `any`, unchecked `as` casts, non-null assertions (`value!.prop`) or unhandled promise?
    - Injection, credential leaks, data exposed to the client that shouldn't be?
      Fix real bugs you find (with a test) — that is the one exception to "don't change behavior", and it must be
      called out in the commit message.

3. **Improve readability.** Look for:
    - Names that don't say what the thing is or does; abbreviations; generic names (`data`, `info`, `handle`).
    - Functions doing more than one thing, or mixing orchestration with low-level details → extract named steps.
    - Nesting deeper than two levels, `else` after `return`, nested ternaries → guard clauses, `switch`, lookup objects.
    - Magic numbers/strings → named constants.
    - Comments that restate the code → delete them, and rename/extract if the code wasn't clear without them.
      Keep comments that explain _why_.
    - Duplication of something that already exists elsewhere in the codebase → reuse the existing code.
    - Dead code, unused exports, commented-out code → delete.
    - Files not ordered top-down (public function first, helpers below in call order).

4. **Keep the balance.** Don't over-simplify into clever code, don't merge unrelated concerns to save lines,
   and don't remove abstractions that make the code easier to follow or test. Explicit and slightly longer
   beats compact and puzzling.

5. **Respect the contracts and scope.** Don't rename anything listed in the issue's **Contratos** (other
   issues use those names), and don't add features listed under **Não inclui**.

# EXECUTION

If you find improvements:

1. Make the changes on this branch.
2. Run `npm run typecheck`, `npm run lint` and `npm run test` — all must pass. Never weaken or skip tests to get there.
3. Commit with the `RALPH:` prefix describing the refinements (and any bug fix, explicitly).

If the code already meets the standard, change nothing.

Once complete, output <promise>COMPLETE</promise>.
