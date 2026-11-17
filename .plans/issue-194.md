# Issue #194: Decisão: operadores conforme o tipo, frase legível, ramos Sim/Não e pré-visualização

## Decisions

- Engine operators live in `src/shared/conditions.ts`; wrong runtime type → `false`. `isEmpty` is the only
  comparison that is true on a missing path (besides `not`).
- Operator × type compatibility and its message live in the engine
  (`src/engine/validation_rules/condition_rules.ts`, registered in `graph_validation.ts`), because the engine
  cannot import web code. The web editor reuses the engine's `describeOperatorTypeMismatch` for the error under
  the rule; `condition_operators.test.ts` checks that every option `operatorsFor` offers is accepted by the engine.
- Field types come from `describeAvailableData`; a path without a known field (or of type `any`) is "unknown":
  no validation error, and the editor offers the generic operator list (keeps v1 `inputs.value.*` editable).
- `operatorsFor(type, { hasEnumValues })` returns `OperatorOption { id, label, operator, valueInput }`;
  `operatorsForField(field | undefined)` picks the list for a rule. Rule operators are the comparison ops plus
  `notExists` (= `not exists`). Booleans are `eq` with a fixed value (`é verdadeiro` / `é falso`).
- `toCondition(conditionRules, fields)` parses values by the option's `valueInput` (text stays text).
- Sentence: `conditionToSentenceParts` (data parts in bold in the editor) + `conditionToSentence(condition, fields)`.
  The technical `conditionToText` stays for the tooltip and for `describesSameCondition`.
- `summarizeNode(node, { agentDefaults, dataFields })`; `SimpleNode` gets the fields of a condition from
  `ConnectionGraphContext` with `useAvailableDataFields`.
- Preview: `fetchRecentRunViews` is exported from `use_last_node_run_sample.ts`; `findConditionPreviewSample`
  builds `{ inputs, nodes, run }` from the decision's last NodeRun and the outputs of the nodes of the same item
  in that run. Runs have no number: the header shows the short run id (`Run #<8 chars>`) and `describeItem`.

## Tasks

- [x] 1. Engine: `gte`/`lte`, `contains`/`notContains`/`startsWith` (text × list, wrong type) — `src/shared/conditions.ts`, `conditions.test.ts` (+ exhaustive switches in `condition_text.ts`, `loop_rules.ts`, `condition_rules.ts`)
- [x] 2. Engine: `in`, `isEmpty`/`isNotEmpty` (missing path), `minLength`, schema of the new ops — `conditions.ts`, `conditions.test.ts`
- [x] 3. Technical text of the new operators — `condition_text.ts`, `condition_text.test.ts`
- [ ] 4. `operatorsFor` table by type — `condition_operators.ts`, `condition_operators.test.ts`
- [ ] 5. Validation `condition_operator_type` (error on boolean `contains`, none for unknown type) — `src/engine/validation_rules/condition_rules.ts`, `graph_validation.ts`, test
- [ ] 6. Rules ↔ condition typed by the field (`notExists`, `in`, text stays text) — `condition_rules.ts`, `condition_rules.test.ts`
- [ ] 7. Changing the field resets an incompatible operator and value — `condition_rules.ts`, `use_condition_rules.ts`
- [ ] 8. Rule row with typed operator select and `condition_value_input.tsx` (boolean: no value; enum: multi-select; error under the rule) — `condition_rule_row.tsx`, `condition_editor.tsx`, `condition_editor.test.tsx`
- [ ] 9. `conditionToSentence` + sentence above the rules — `condition_text.ts`, `condition_editor.tsx`, tests
- [ ] 10. Node summary uses the sentence; ports show Sim/Não — `node_summary.ts`, `simple_nodes.tsx`, `use_available_data.ts`, `node_summary.test.ts`, `nodes.test.tsx`
- [ ] 11. `evaluate_condition_preview.ts` (sample from run views, branch, explanation) + tests
- [ ] 12. Preview against a run recorded in in-memory SQLite through the run routes — `src/server/runs/condition_preview_route.test.ts`
- [ ] 13. `condition_preview.tsx` in the condition inspector (disabled with tooltip without a run) — `use_last_node_run_sample.ts`, `condition_inspector.tsx`
- [ ] 14. v1 decisions (`inputs.value.*`) open and edit — `condition_editor.test.tsx`
- [ ] 15. Docs: operators and examples in `condition_doc.ts`, regenerate `docs/nos/condition.md`
- [ ] 16. Self-review checklist and feedback loops (typecheck, lint, test)
