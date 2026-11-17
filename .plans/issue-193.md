# Issue #193: Agente: Formato da resposta visual e Inserir dado no prompt

## Decisions

- `response_format.ts` parses JSON Schema with strict Zod schemas; anything else (nested objects,
  `oneOf`, `integer`, extra keys, invalid names, `required` outside `properties`) → `undefined`.
- `list` without `itemType` becomes `items: { type: "string" }`; `choice` becomes `{ type: "string", enum }`.
- An empty field list saves `outputSchema: undefined` (free answer), not an empty object schema.
- `ResponseFormatEditor` has tabs "Campos" and "JSON"; the JSON tab is the existing
  `OutputSchemaEditor` (label becomes "JSON Schema", no doc prop). Fields that are invalid (bad/duplicate
  name, choice without options) show an error and are not applied.
- `PromptEditor` takes a `ref` (React 19 prop) with `PromptEditorHandle { insertAtCursor(text) }` and a
  `toolbarActions` slot where the agent inspector puts `InsertDataButton`.
- `InsertDataButton` reuses `DataPickerPopover` (its `onTypePath` becomes optional) and the
  pointer-outside hook moved out of `data_picker.tsx` to `use_close_on_pointer_outside.ts`.
- `listConditionPaths` moves from `loop_rules.ts` to `shared/conditions.ts` so `agent_rules.ts` reuses it.
- `agent_without_response_format`: warning on the agent node, one per agent, when a condition node or a
  loop `until` reads `nodes.<slug>.result.<field>` and the agent has no `outputSchema`.

## Tasks

- [x] 1. `toJsonSchema` for each type + `fromJsonSchema` round trip and unsupported → undefined — `response_format.ts`/`.test.ts`
- [ ] 2. Rule `agent_without_response_format` (move `listConditionPaths`) — `agent_rules.ts`, `graph_validation.ts`, test
- [ ] 3. `OutputSchemaEditor` becomes the JSON tab; `ResponseFormatEditor` with field rows, presets and advanced-schema notice; wire in `agent_inspector.tsx`; tests
- [ ] 4. `PromptEditor` `insertAtCursor` + `InsertDataButton` in the prompt bar; test
- [ ] 5. Docs: outputSchema text and "Reviewer que devolve aprovado + notas" example — `agent_doc.ts`
- [ ] 6. Self-review checklist and feedback loops
