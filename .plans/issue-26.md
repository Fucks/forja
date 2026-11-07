# Issue #26: Template de prompt com variáveis das portas

## Decisions

- Everything lives in `src/engine/prompt_template.ts` (pure, no I/O); tests in `src/engine/prompt_template.test.ts`.
- Reuse the dotted-path lookup of `src/shared/conditions.ts` by exporting `lookUpPath` (minimal change).
- `AgentNode = NodeOfType<"agent">` is exported from `prompt_template.ts` (kept out of `flow_graph.ts` to avoid
  conflicts with #25, which runs in parallel).
- Tokens: `{{ path }}` → `var` with trimmed path; `\{{` → literal `{{` merged into the surrounding `text` token;
  `start`/`end` are source offsets (end exclusive). Unclosed `{{` stays text.
- A path missing in the context or resolving to `undefined` throws `PromptRenderError` (field `variable`).
- `VariableInfo.type`: port type for `inputs.*`; `string`/`number`/`string[]` for item/project/run fields.
- Enclosing groups are found by walking `parentGroupId` (with a visited set, so a malformed cycle can't hang).
- `checkPromptVariables` reports one `error` per unknown occurrence, target `{ kind: "node", id }`.

## Tasks

- [x] 1. Test + implement `parsePromptTemplate`: text/var tokens with positions, spaces, escape — `src/engine/prompt_template.ts`
- [x] 2. Test + implement `renderPrompt` value formatting per type — export `lookUpPath` in `src/shared/conditions.ts`
- [x] 3. Test + implement `renderPrompt` errors (`PromptRenderError` for missing/undefined)
- [x] 4. Test + implement `availableVariables`: inputs, project, run, item via workItem port
- [x] 5. Test + implement `availableVariables` inside map (item.*) and loop (inputs.<carry>)
- [x] 6. Test + implement `checkPromptVariables` with `code: "unknown_variable"`
- [x] 7. Self-review checklist (section 5) and feedback loops (section 6)
