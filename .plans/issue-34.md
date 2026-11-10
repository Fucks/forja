# Issue #34: Inspector do nó agente: prompt, modelo, effort e ferramentas

## Decisions

- New code lives in `src/web/canvas/inspector/`. Contract names from the issue are kept verbatim.
- `updateNodeConfig` replaces the node and drops the edges that reach input ports the update removed;
  `addInputPort` / `removeInputPort` are built on it with node-level helpers (`withInputPort`,
  `withoutInputPort`) that the `PortListEditor` uses through the inspector's `onChange`.
- `addInputPort` leaves the graph unchanged for non-agent nodes and for names already in use.
- Prompt variables come from `availableVariables` (`src/engine/prompt_template.ts`); highlighting uses
  `parsePromptTemplate` through a pure `prompt_highlighting.ts`.
- Inherited project values (model, effort, tool profile, credential) reach the inspectors through
  `InheritedSettingsContext` (provided by `InspectorPanel` from `useProjectSettings`), so the
  `InspectorComponent` props stay as in the contract.
- The "padrão" choice uses a sentinel option value and maps to `undefined` in the config.
- Model is a Select with suggested models + "padrão do projeto" + "Outro modelo…", which reveals an Input.
- Numeric limits come from constants exported by `src/shared/node_configs/agent_config.ts`.
- `Dialog` gains an optional `size` ("md" | "lg") for the full-screen prompt editor.

## Tasks

- [x] 1. Test + implement `updateNodeConfig` (replace node, prune edges of removed inputs) — `node_updates.ts`
- [x] 2. Test + implement `addInputPort` (agent only, unique name) — `node_updates.ts`
- [x] 3. Test + implement `removeInputPort` (removes the connected edge) — `node_updates.ts`
- [x] 4. Test + implement `promptCompletions` (after `{{`, prefix filter, inactive outside) — `prompt_completion.ts`
- [x] 5. Test + implement prompt variable highlighting ranges — `prompt_highlighting.ts`
- [x] 6. `PromptEditor` (CodeMirror markdown, highlight, autocomplete, debounce 300 ms, resize, fullscreen Dialog) — `prompt_editor.tsx`, `dialog.tsx`
- [x] 7. Test + implement `AgentInspector` model and effort fields ("padrão" removes the value) — `agent_inspector.tsx`, `agent_inspector.test.tsx`
- [x] 8. Test + implement `OutputSchemaEditor` (invalid JSON shows error and is not applied; example button) — `output_schema_editor.tsx`
- [x] 9. Tool profile + credential selects, execution fields with schema limits — `agent_inspector.tsx`
- [x] 10. Test + implement `PortListEditor` (add `spec: text`, remove port) — `port_list_editor.tsx`
- [x] 11. `inspectorRegistry` + `InspectorPanel` (flow summary for 0/many, registry for one) — `inspector_registry.ts`, `inspector_panel.tsx`
- [ ] 12. Mount the inspector in the editor + page test (select agent, edit, autosave) — `flow_editor_page.tsx`, `flow_editor_page.test.tsx`
- [ ] 13. Self-review checklist (section 5) and feedback loops (section 6)
