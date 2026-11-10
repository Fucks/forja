# Issue #35: Inspector dos demais tipos de nó

## Decisions

- `conditionToText` (`src/web/canvas/inspector/condition_text.ts`) replaces the private `describeCondition`
  of `node_summary.ts`; the node summary calls it. Connectives follow the contract in upper case
  (`E`, `OU`, `NÃO`), so the existing node_summary test expectation changes from " e " to " E ".
- Condition suggestions (`<rótulo-slug>.<porta>` of every upstream node) live in a pure
  `condition_suggestions.ts` with its own test (extra file, not in the issue's list).
- The rule rows of the `ConditionEditor` (flat list of comparisons joined by E/OU) are converted to and from
  `Condition` by a pure `condition_rules.ts` (extra file + test). A condition the rows cannot express
  (`not`, nested groups) is shown as text with a button to restart it as rules.
- Rule values typed as `true`/`false` become booleans and numbers become numbers; `>`/`<` require a number.
- `withAgentConfig` in `node_updates.ts` becomes the generic `withNodeConfig(node, type, changes)`.
- `LabelField` moves out of `agent_inspector.tsx` into `label_field.tsx`; text fields that commit on blur use a
  shared `TextField` (`text_field.tsx`).
- Option labels (source provider, git action, item destination, trigger kind) are exported from
  `node_summary.ts` instead of being declared twice.
- Source limit bounds are exported from `source_config.ts`; the script timeout gets `MIN_SCRIPT_TIMEOUT_MINUTES`.
- Trigger link uses a new `triggersPath(projectId)` in `src/web/config/navigation.ts` and `useParams`.

## Tasks

- [x] 1. `conditionToText` for each operator and nesting — `condition_text.ts`, `condition_text.test.ts`
- [x] 2. Node summary uses `conditionToText` — `node_summary.ts`, `node_summary.test.ts`
- [x] 3. Generic `withNodeConfig` replacing `withAgentConfig` — `node_updates.ts`, `agent_inspector.tsx`
- [x] 4. Extract `LabelField` and add `TextField` — `label_field.tsx`, `text_field.tsx`, `agent_inspector.tsx`
- [x] 5. Source inspector (provider, label, limit 1–100, skip blocked) + test — `source_inspector.tsx`, `other_inspectors.test.tsx`
- [x] 6. Script inspector (mono command with hint, timeout) + test — `script_inspector.tsx`
- [x] 7. Gate inspector (message, sections shown, optional timeout hours) + test — `gate_inspector.tsx`
- [x] 8. Git inspector (action, base branch, draft, PR body port) + test — `git_inspector.tsx`
- [x] 9. Output inspector (move item to, comment on issue) + test — `output_inspector.tsx`
- [x] 10. Trigger inspector (read-only kind + "Configurar gatilhos" link) + test — `trigger_inspector.tsx`, `navigation.ts`
- [x] 11. Upstream condition path suggestions (`listUpstreamOutputPaths`) — `condition_suggestions.ts` + test
- [ ] 12. Condition rules conversion — `condition_rules.ts` + test
- [ ] 13. `ConditionEditor` builds an `and` of two rules + test — `condition_editor.tsx`
- [ ] 14. Condition inspector + test — `condition_inspector.tsx`
- [ ] 15. Register every inspector — `inspector_registry.ts`
- [ ] 16. Self-review checklist (section 5) and feedback loops (section 6)
