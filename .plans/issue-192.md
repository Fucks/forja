# Issue #192: Modelo de dados disponíveis e seletor de dados (DataPicker)

## Decisions

- `src/shared/node_output_shapes.ts` holds JSON Schemas: `WORK_ITEM_SHAPE` (from `WorkItemSnapshot`),
  git `result` (`branch`, `prUrl`, `pushed`), script `result` (`exitCode`, `stdoutTail`), source/trigger
  `items` (array of work item). `findNodeOutputShape(nodeType, portName)` looks them up.
- `describeAvailableData` lives in `src/engine/available_data.ts` (pure). Labels join segments with
  `DATA_LABEL_SEPARATOR = " › "`; the first segment is the picker group ("Item atual", "Entradas deste
  nó", node label, "Projeto", "Execução"). `depth` 0 = port / top-level field, +1 per property level.
  Schema descent stops at 4 property levels; arrays are not descended.
- Port shape order: agent `result` → `outputSchema`; deterministic shapes; `port.schema`; port type
  (`text`/`branch`/`prUrl` → string, `json` → object without children, `workItem` → item shape,
  `workItemList` → list, `any` → any).
- `loopUntil` scope needs `groupId`; it lists only `nodes.*` of `nodesInsideGroup` (graph order).
- The picker shows samples through `PickableDataField = DataField & { sampleText?: string }` (in
  `data_picker.tsx`); `ConditionEditor` receives `fields: PickableDataField[]` (a plain `DataField[]` fits).
- Samples: `useLastNodeRunSamples` (new, in `use_last_node_run_sample.ts`, shares the fetch with
  `useLastNodeRunSample`); `use_available_data.ts` builds `{ inputs, nodes: { slug: outputs } }` from them
  and reads each field with `lookUpPath`.
- Port labels come from the catalog (`getNodeDoc`) in `use_available_data.ts`.
- No popover library: the DataPicker popover is an inline absolutely positioned panel.

## Tasks

- [x] 1. Fixed output shapes — `src/shared/node_output_shapes.ts`
- [x] 2. Test+impl: `nodes.<slug>.<port>` of upstream nodes, nearest first, agent outputSchema nested with enum/description, self and downstream left out — `src/engine/available_data.ts`, `.test.ts`
- [x] 3. Test+impl: deterministic shapes, `port.schema`, `text` and `json` without schema, 4-level limit
- [x] 4. Test+impl: `inputs.<port>` with the shape of the connected source port
- [x] 5. Test+impl: `item.*` only inside a Map; `project.*` and `run.*`
- [x] 6. Test+impl: `loopUntil` scope lists only nodes inside the group
- [ ] 7. Test+impl: `useLastNodeRunSamples` + `use_available_data.ts`
- [ ] 8. Test+impl: DataPicker tree, search, type labels and samples — `data_picker.tsx`, `.test.tsx`
- [ ] 9. Test+impl: DataPicker keyboard (arrows, Enter, Esc), empty state
- [ ] 10. Test+impl: DataPicker "Digitar caminho" and unknown-path warning
- [ ] 11. Condition editor/rule row use DataPicker with `fields`; picking writes the exact path — `condition_editor.tsx`, `condition_rule_row.tsx`, `condition_editor.test.tsx`
- [ ] 12. Condition inspector and loop fields pass `fields`; remove `condition_suggestions.ts`; update inspector tests
- [ ] 13. Self-review checklist (section 5) and feedback loops (section 6)
