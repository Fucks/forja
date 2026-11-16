# Issue #190: Inspector padronizado: cabeçalho, abas Configurar/Dados/Ajuda, ajuda por campo e cartões de opção

## Decisions

- Field docs come from `getNodeDoc(type).fields` through `fieldDoc(type, key)` in
  `src/web/canvas/inspector/field_doc.ts`; it always throws `UndocumentedFieldError` for an unknown key
  (every inspector is rendered in tests, and `node_docs.test.ts` guarantees each config key has a doc).
  `fieldOptionCards(doc, values)` builds typed `OptionCards` options from `doc.options`.
- With `doc`, a field's visible label is `doc.label` (labels change: e.g. "Limite de itens" → "Máximo de
  itens"); tests that queried the old labels are updated because the spec renames them.
- `FieldHelp` is a hand-made disclosure (no Radix popover installed): a button "Ajuda sobre <label>" with
  `aria-expanded` and a `role="dialog"` panel; Esc closes and returns focus to the button.
- The help sits next to the label through a new optional `labelAddon` prop on `ui/field.tsx`. Controls
  without a `Field` (switch, slider, option cards, prompt, schema, condition) use `FieldHeading` /
  `SwitchField`.
- `OptionCards` implements the WAI-ARIA radio group itself (roving tabindex, arrows select).
- `InspectorTabs` receives `type` too (to remember the tab per type); key
  `forja.inspector.tab.<type>`; read/write wrapped in try/catch. Uses `ui/tabs.tsx` (Radix, arrows), which
  gains an optional `listClassName` to make the tab list sticky.
- `node_inspector_frame.tsx` exports `InspectorFrame` (type, label, onLabelChange, data, children) used by
  the group inspector, and `NodeInspectorFrame` (node, graph, onChange, children) used by node inspectors.
  `LabelField` becomes unused and is deleted; the header has an inline "Rótulo" input.
- Data tab: input source text is `← <node label> › <port doc label>` (port name when undocumented);
  an unconnected `workItem` input inside a Map is "automático", other unconnected inputs "não ligada".
  Pure logic in `node_input_sources.ts`.
- `useLastNodeRunSample({ projectId, flowId, nodeId })` lists the 5 most recent runs of the flow
  (`GET /projects/:id/runs?limit=5&flowId=`), then reads run views newest first and returns the
  inputs/outputs of the last NodeRun of the node, or `undefined`.
- Advanced (from `FieldDoc.advanced`): agent maxTurns, retries, timeoutMinutes, idleTimeoutMinutes,
  toolProfileId, credentialId and expandPromptCommands (new switch, required by the criteria); script
  timeoutMinutes; git bodyFrom.
- Output "não mover" stays as an extra option card (value `keep`) that reports `undefined`.

## Tasks

- [x] 1. Test + implement `FieldHelp` (description, default, options; Esc closes) — `field_help.tsx`, `field_help.test.tsx`
- [x] 2. Test + implement `OptionCards` (radiogroup, arrows, onChange) — `option_cards.tsx`, `option_cards.test.tsx`
- [x] 3. `fieldDoc` and `fieldOptionCards` helpers with tests — `field_doc.ts`, `field_doc.test.ts`
- [x] 4. Optional `doc` on TextField/TextAreaField, SelectField/OptionalSelectField, IntegerField, InheritableSelect (+ `labelAddon` on `ui/field.tsx`)
- [x] 5. `FieldHeading` and `SwitchField` — `field_heading.tsx`, `switch_field.tsx`
- [x] 6. Test + implement `InspectorTabs` (switch tab, remembered per type, localStorage throwing) — `inspector_tabs.tsx`, `inspector_tabs.test.tsx`, `ui/tabs.tsx`
- [x] 7. `InspectorHeader` (icon, title, tagline, Documentação drawer, inline label) — `inspector_header.tsx`, `text_field.tsx`
- [x] 8. `AdvancedSection`, `InspectorFields`, and `NodeInspectorFrame`/`InspectorFrame` with header and tabs (Ajuda = NodeDocView; Dados placeholder) — `advanced_section.tsx`, `inspector_section.tsx`, `node_inspector_frame.tsx`
- [x] 9. Migrate trigger, source (provider OptionCards), script (timeout in Avançado), condition, gate inspectors — and their tests
- [x] 10. Migrate git (action OptionCards, bodyFrom in Avançado) and output (destination OptionCards) inspectors — and their tests
- [x] 11. Migrate the agent inspector (workspace OptionCards, Avançado with idle timeout and expandPromptCommands, docs on every field) — `agent_inspector.tsx`, `execution_fields.tsx`, `tools_credential_fields.tsx`, `model_effort_fields.tsx`, `agent_inspector.test.tsx`
- [x] 12. Migrate the group inspector and loop fields — `group_inspector.tsx`, `loop_fields.tsx`, `group_inspector.test.tsx`
- [x] 13. Test: every node inspector and the group inspector has header and ⓘ; Ajuda tab shows NodeDocView — `other_inspectors.test.tsx`, `group_inspector.test.tsx`
- [ ] 14. `listInputSources` (connected, automático, não ligada) — `node_input_sources.ts`, `node_input_sources.test.ts`
- [ ] 15. `useLastNodeRunSample` — `use_last_node_run_sample.ts`
- [ ] 16. `NodeDataTab` (inputs, outputs, last sample or empty message) wired in the frames; tests with and without run (fake API), Reviewer shows `context ← Dev › Resumo em texto` and `item automático` — `node_data_tab.tsx`, `other_inspectors.test.tsx`
- [ ] 17. Delete `LabelField`; update labels in `flow_editor_page.test.tsx` and `e2e/project_and_flow.spec.ts`
- [ ] 18. Self-review checklist and feedback loops (typecheck, lint, test)
