# Issue #197: Decisão com vários caminhos (switch com Senão)

## Decisions

- `PORT_NAME_PATTERN` moves to `src/shared/port_name.ts` so `condition_config.ts` can use it without a
  circular import with `flow_graph.ts`.
- `condition_config.ts` exports `conditionConfigSchema` (preprocess + discriminated union on `mode`),
  `OTHERWISE_PORT`, `ConditionConfig`, `IfConditionConfig`, `SwitchConditionConfig`, `SwitchBranch`.
- `src/shared/node_configs/condition_branches.ts` holds the pure rules shared by server, engine and web:
  `branchPortsOf`, `listDecisionConditions`, `chooseBranchPort`.
- New branch ports are `branch1`, `branch2`… (first unused); the port never changes when the label is
  edited, so renaming keeps the edges. Removing a branch drops its edges through `updateNodeConfig`, which
  now also drops edges leaving outputs the node no longer has (one `applyGraph` = one undo step).
- No match without Senão: outputs `{}` + `item_outcome` artifact `{ moveItemTo: "needs_human", reason }`.
- Summary is not truncated (like the condition sentence): "3 caminhos: A · B · C · Senão".
- Canvas port labels of a switch come from the branch labels; `otherwise` is documented as "Senão".

## Tasks

- [x] 1. Refactor: move `PORT_NAME_PATTERN` to `src/shared/port_name.ts`
- [x] 2. Test + implement the `mode` schema (preprocess, branch limits) — `condition_config.ts`,
      `condition_config.test.ts`; add `mode: "if"` to defaults, templates, docs examples and test literals
- [x] 3. Test + implement `branchPortsOf` — `condition_branches.ts`, `condition_branches.test.ts`
- [x] 4. Test + implement the switch executor (first true wins, Senão) — `condition_executor.ts`,
      `deterministic_executors.test.ts`
- [x] 5. Test + implement no match without Senão (needs_human artifact with reason)
- [x] 6. Scheduler harness chooses ports with `chooseBranchPort` — `scheduler_harness.ts`
- [x] 7. Validation: operator types and agent result reads cover every branch — `condition_rules.ts`,
      `agent_rules.ts`
- [x] 8. Test + implement validation of duplicate/reserved ports and empty rules — `condition_rules.ts`,
      `graph_validation.test.ts`
- [x] 9. Test + implement validation of edges leaving a port the Decisão does not have
- [ ] 10. Test + implement `updateNodeConfig` dropping edges of removed outputs — `node_updates.ts`
- [ ] 11. Test + implement branch editor: add a branch — `condition_branches_editor.tsx`, `condition_branch_edits.ts`
- [ ] 12. Test + implement reorder (up/down) and remove branch
- [ ] 13. Test + implement the Senão switch and editing the branch name
- [ ] 14. Test + implement the mode toggle in the inspector (if→switch, switch→if with confirmation) —
      `condition_inspector.tsx`
- [ ] 15. Test + implement canvas port labels from branch labels — `port_label.ts` / `flow_node_card.tsx`
- [x] 16. Test + implement the switch summary — `node_summary.ts`
- [x] 17. Docs: `condition_doc.ts`, regenerate `docs/nos/condition.md`, adapt `node_docs.test.ts`
- [ ] 18. Test: YAML export/import preserves branches — `flow_yaml.test.ts`
- [ ] 19. Self-review checklist and feedback loops
