# ISSUES

Here are the open issues in the repo:

<issues-json>

!`gh issue list --state open --label Sandcastle --limit 100 --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'`

</issues-json>

The list above has already been filtered to issues ready for work.

## Issues awaiting PR review

These issues are already implemented and have an open pull request that a person still has to review and merge:

{{AWAITING_REVIEW}}

Never include them in the plan. Until their PR is merged they are still open, so they keep blocking the issues
that depend on them.

# TASK

Analyze the open issues and build a dependency graph. For each issue, determine whether it **blocks** or **is blocked by** any other open issue.

Each issue body has a **Dependências** section listing `Bloqueada por: #N` and a **Arquivos** section listing
the files it creates and changes. Treat declared dependencies as authoritative: an issue is blocked while any
issue it lists is still open (issues missing from the list above are closed, so they no longer block).
Then apply the rules below to catch conflicts the declarations missed.

An issue B is **blocked by** issue A if:

- B requires code or infrastructure that A introduces
- B and A modify overlapping files or modules (compare their **Arquivos** sections), making concurrent work likely to produce merge conflicts
- B's requirements depend on a decision or API shape that A will establish

An issue is **unblocked** if it has zero blocking dependencies on other open issues.

For each unblocked issue, assign a branch name using the exact format `sandcastle/issue-{id}` (no slug or other suffix). This must be deterministic so that re-planning the same issue always produces the same branch name and accumulated progress is preserved.

# OUTPUT

Output your plan as a JSON object wrapped in `<plan>` tags:

<plan>
{"issues": [{"id": "42", "title": "Fix auth bug", "branch": "sandcastle/issue-42"}]}
</plan>

Include only unblocked issues, ordered by priority: the loop works them one at a time, starting with the first
one, and plans again after each issue. Put first the issue that unblocks the most other issues. If every issue
is blocked:

- and at least one blocker is awaiting PR review, output an empty plan — the work resumes after the PR is merged;
- otherwise (e.g. a dependency cycle), include the single highest-priority candidate (the one with the fewest or weakest dependencies).

Always emit the `<plan>` tags, even when there is nothing to do. If there are no issues to work on at all, output `<plan>{"issues": []}</plan>` and the loop will check again later.
