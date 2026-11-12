# TASK

Issue #{{item.number}}: {{item.title}} is implemented and reviewed on branch `{{item.branch}}`. Gather the evidence
that it works and write the body of the pull request into `{{project.baseBranch}}`. A person will read this PR to
decide whether to merge it without running the code, so every claim must be backed by something they can see.

**Do not change code and do not commit.** If something is broken, report it — fixing is the implementer's job.

Return the PR body and whether the checks passed in your final output (step 5). Write the screenshots, if
any, inside `.pr-evidence/screenshots/` (it is gitignored).

# CONTEXT

## Commits on this branch

<branch-commits>

!`git log {{project.baseBranch}}..{{item.branch}} --format="%h %s"`

</branch-commits>

## Files changed

<branch-diff-stat>

!`git diff --stat {{project.baseBranch}}...{{item.branch}}`

</branch-diff-stat>

Read the issue with `gh issue view {{item.number}}`, especially **Critérios de aceite** and **Testes**.

# 1. RUN THE CHECKS

Run each script that exists in `package.json`, in this order, and keep its exit code and the end of its output:

```
npm run typecheck
npm run lint
npm run test
npm run build
```

There is no `.env` here and none is needed: Forja keeps its data in SQLite under a data directory that
defaults to a temporary folder in tests. `npm run test:integration` needs Docker and the real `claude` CLI,
which this sandbox doesn't have, so it is not part of the checks.

Any failure means the checks did not pass. Still write the PR body (it helps the next iteration), then report
it in the output below.

# 2. MAP EACH ACCEPTANCE CRITERION TO ITS PROOF

For each item under **Critérios de aceite**, find what proves it: the test that covers it (file and test name),
a command output, or a screenshot. Read the tests to confirm they really check the criterion — don't infer it
from the name. A criterion with no proof is marked as such; never invent one.

Find and read the code and tests with the CodeGraph MCP tools: `codegraph_explore` with the criterion's
subject, `codegraph_search` for a symbol by name, `codegraph_node` to read a symbol or file, and
`codegraph_callers` to find the tests that exercise a function. Use Grep/Read only for non-code files or
plain-text searches.

# 3. TAKE SCREENSHOTS (ONLY IF THE ISSUE CHANGES SOMETHING VISIBLE)

Skip this step when the change has no visible effect (configuration, domain helpers, services without a page).

Otherwise, start the production build in the background and capture the affected pages with the Playwright
CLI already installed in the image:

```
FORJA_DATA_DIR=/tmp/forja-evidence npm run start -- --port 3000 --seed-demo > /tmp/app.log 2>&1 &
timeout 60 sh -c 'until curl -sf http://localhost:3000 > /dev/null; do sleep 1; done'
playwright screenshot --full-page --viewport-size "1280,800" --wait-for-timeout 1000 \
  http://localhost:3000/<route> .pr-evidence/screenshots/<route>-desktop.png
playwright screenshot --full-page --viewport-size "390,844" --wait-for-timeout 1000 \
  http://localhost:3000/<route> .pr-evidence/screenshots/<route>-mobile.png
```

- Capture each affected route on desktop and mobile. If the issue is about themes, add `--color-scheme dark`
  for the dark variant. Keep it to at most 8 screenshots.
- Name files in lowercase with hyphens (`editor-desktop.png`).
- `--seed-demo` (once the issue that adds it is merged) fills the empty data directory with a demo project,
  the default flow and a finished run with logs, so the canvas, the run view and the board have something
  to show. Forja is a desktop-browser tool: the 390px capture only matters for pages the issue says must
  work narrow; skip it otherwise. Live states (a node running) can be captured by starting a demo run that
  uses the fake agent runtime, if the issue's tests or the README describe how.
- Look at each screenshot before using it; drop blank or error pages.
- If the app can't start without something unavailable here (Docker, the real `claude` CLI), don't fake it:
  explain in the PR why there are no screenshots. Stop the server when you are done.

# 4. WRITE THE PR BODY

Write the PR body in Portuguese, in this structure:

````markdown
## Resumo

<2–4 frases: o que a issue entrega e as decisões principais>

## Critérios de aceite

- [x] <critério> — <prova: `caminho/do/teste.test.ts` › "nome do teste", saída de comando ou screenshot>
- [ ] <critério sem prova> — <por quê>

## Checks

| Comando             | Resultado |
| ------------------- | --------- |
| `npm run typecheck` | ✅ / ❌   |
| ...                 | ...       |

<details><summary>Saída dos testes</summary>

```text
<final da saída do npm run test: arquivos e totais>
```

</details>

## Screenshots

![Catálogo no desktop](screenshots/catalogo-desktop.png)

## Como testar

<passos para o revisor reproduzir localmente>
````

- Link screenshots exactly as `screenshots/<file>.png`.
- Omit the **Screenshots** section when step 3 was skipped, or replace it with one line saying why.
- Don't add `Closes #{{item.number}}`; the pipeline appends it.

# 5. RETURN THE RESULT

End with the structured output, the PR body of step 4 in `body`:

```json
{ "checksPassed": true, "body": "<the PR body>" }
```

When any check failed, use
`{"checksPassed": false, "failureSummary": "<command that failed and why, one sentence>", "body": "<the PR body>"}`.
The pipeline only opens the PR when `checksPassed` is `true`.
