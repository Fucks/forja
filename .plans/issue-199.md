# Issue #199: Validação que ensina e primeiros passos no editor (canvas vazio, tour, template Revisão com volta)

## Decisions

- `errorIssue`/`warningIssue` (`validation_issues.ts`) take one object `{ code, message, fix, fieldKey?, target }`;
  `fix` is required there, so a rule without a fix does not compile. `ValidationIssue.fix`/`fieldKey` stay optional.
- `fieldKey` is the config key used by the node docs (`prompt`, `command`, `runIn`, `env`, `until`, `condition`,
  `branches`, `bodyFrom`, `toolProfileId`, `credentialId`, `outputSchema`) or `label` for the node's name.
- Messages follow the guide: what is wrong in one sentence with typographic quotes (‘Dev’); `fix` starts with an
  imperative verb. The code is not in the message: the problems panel shows "(código: x)" after the fix.
- `VALIDATION_RULES` is exported so the test can iterate every registered rule over example invalid graphs.
- `use_focus_field.ts`: a per-editor store (`FieldFocusProvider`) holds one pending request `{ targetId, fieldKey }`.
  `useFocusField(fieldKey)` returns a ref for the field's wrapper; when the request matches the inspected element
  (`FocusTargetContext`, set by the inspector panel) it opens the enclosing `<details>`, focuses the first focusable
  element and clears the request. `InspectorTabs` switches to "Configurar" when a request targets its element.
  Without a provider the hooks do nothing (inspector tests keep working).
- A blank new flow starts with no nodes (`flow_service.createDefaultFlowGraph`), so it opens on `EmptyCanvas`.
- The template graph reaches the editor through a new route `GET /api/flow-templates/:templateId` → `{ graph }`
  (templates load prompts from disk, so the web bundle cannot build them).
- `FirstSteps` (`first_steps.tsx`), inside the editable canvas, shows `EmptyCanvas` for a graph without nodes or
  groups and the palette hint while a lone trigger is the only node. Both are overlays, so drops still reach the canvas.
- "Começar do zero" reuses `useAddNode().addNodeAtViewportCenter("trigger")`; the canvas then shows a hint with an
  arrow toward the palette while the trigger is the only node.
- Tour: Radix Dialog (modal: traps focus, Esc = Pular) placed next to `[data-tour-anchor]` elements (palette,
  inspector, publish) and React Flow's `.react-flow__node` / `.react-flow__handle`; centered when the anchor is
  missing. "Pular" closes it for this opening; finishing or "Não mostrar de novo" stores
  `forja.editorTour.dismissed` in `localStorage` (try/catch, `editor_tour_storage.ts`, React-free so `e2e/fixtures.ts`
  imports the key and pre-sets it in an init script). Steps in `editor_tour_steps.ts`, placement in `use_tour_placement.ts`.
- Template keeps id `review_loop`, name becomes "Revisão com volta"; labels "Dev"/"Reviewer" (slug `reviewer`).

## Tasks

- [x] 1. `ValidationIssue` and its Zod schema accept `fix` and `fieldKey` — `src/shared/validation_issue.ts` (+ test)
- [x] 2. Test: every registered rule produces a `fix` over example invalid graphs — `src/engine/graph_validation.test.ts`
- [x] 3. Rules teach: object-form `errorIssue`/`warningIssue`, revised messages with `fix`/`fieldKey` in
      `validation_rules/*` and `prompt_template.ts`; update the rule tests
- [x] 4. `use_focus_field`: a request focuses the matching field and opens its section — `src/web/canvas/inspector/use_focus_field.ts` (+ test)
- [x] 5. Inspector: tabs switch to Configurar on a focus request; fields register their `fieldKey` — inspector files
- [x] 6. Problems panel shows "Como corrigir:" and the code; click selects the target and requests the field focus — `problems_panel.tsx` (+ test)
- [x] 7. Editor page: provider wired; clicking "O Agente ‘Dev’ não tem prompt" focuses Dev's prompt — `flow_editor_page.tsx` (+ test)
- [x] 8. Route `GET /api/flow-templates/:templateId` returns the template graph — `flows_routes.ts` (+ test)
- [x] 9. A blank new flow starts without nodes — `flow_service.ts` (+ test)
- [x] 10. `EmptyCanvas` lists the templates; choosing one fills the draft — `src/web/canvas/empty_canvas.tsx` (+ test)
- [x] 11. "Começar do zero" adds a Gatilho and the canvas points to the palette — `empty_canvas.tsx`, `flow_canvas.tsx`
- [x] 12. `FlowCanvas` shows `EmptyCanvas` when the graph has no nodes — `flow_canvas.tsx` (+ test)
- [x] 13. Editor tour: 5 steps with "N de 5", Próximo/Voltar/Concluir — `src/web/canvas/editor_tour.tsx` (+ test)
- [x] 14. Editor tour: Pular and Esc close it; "Não mostrar de novo" is remembered; storage errors are tolerated — `editor_tour.test.tsx`
- [x] 15. Tour in the editor with its anchors; E2E fixtures dismiss it — `flow_editor_page.tsx`, `e2e/`
- [x] 16. Template "Revisão com volta": Fonte → Map[Loop[Dev → Reviewer]] → Comando → Git PR → Saída; exhausted → Precisa de humano — `review_loop.ts`, `flow_templates.test.ts`
- [x] 17. Template runs with the fake runtime: approved opens the PR; always rejected goes to "Precisa de humano" — `flow_templates.test.ts`
- [x] 18. Guided example in the concepts points to the template — `src/web/docs/concepts.ts`
- [ ] 19. Self-review checklist (section 5) and feedback loops (section 6)
