# Issue #37: Erros de validação no canvas e publicação de versão

## Decisions

- `normalizeFlowGraph` moves from `src/server/flows/flow_yaml.ts` to `src/shared/normalize_flow_graph.ts`;
  `withKeysInOrder` (also used by `flowToYaml` for the file keys) moves to `src/shared/with_keys_in_order.ts`.
- `useValidation(graph, context)` adds `checkPrompt: checkPromptVariables` itself, like the server's
  `assertGraphIsPublishable`, so the client sees the same issues. The editor passes
  `{ knownCredentialIds }` from `useCredentials` (the server does not check tool profiles yet, TODO #23).
- Debounce: the first graph is validated at once; later graphs after `VALIDATION_DEBOUNCE_MS = 250`
  (real timers, tested with `vi.useFakeTimers`). Memo by graph reference (each revision is a new graph).
- Overlay: `ValidationOverlayContext` (Map target id → issues) in `validation_overlay.tsx`, read by
  `FlowNodeCard`/`GroupNode` through `useTargetIssues`; the alert marker gets a tooltip with the
  messages. Edges get `data.invalid` in `flow_canvas.tsx`. `FlowCanvas` takes `issuesByTarget`.
- `PublishBar` gets one prop beyond the contract: `onRejected(issues)`, so a 422 from the server can be
  shown in the problems panel (the contract has no other channel for it).
- Server issues are kept in the page with the graph they were reported for; they are shown only while
  the graph is still that one (no effect to clear them).
- `draftDiffers`: parse both graphs with `parseFlowGraph` (canonical key order of configs), normalize
  and compare as JSON. Lives in `src/web/app/flows/use_draft_differs.ts` with the latest-version query.
- Publish invalidates the `project-flows` (latestVersion), `flow-version` and `flow-versions` queries.
- No new `role="status"` elements: the page test finds the save status by that role.

## Tasks

- [x] 1. Refactor: move `normalizeFlowGraph` to `src/shared/normalize_flow_graph.ts` (and
      `withKeysInOrder`), update `flow_yaml.ts` and its tests' imports
- [x] 2. Test + impl: `useValidation` groups issues by target and counts errors/warnings —
      `src/web/canvas/use_validation.ts`, `use_validation.test.ts`
- [x] 3. Test + impl: `useValidation` debounces graph changes by 250 ms — same files
- [x] 4. Test + impl: nodes and groups with issues are drawn invalid, marker tooltip lists messages —
      `validation_overlay.tsx`, `flow_node_card.tsx`, `group_node.tsx`, `flow_canvas.tsx`,
      `flow_canvas.test.tsx`
- [x] 5. Impl: edges with issues get `data.invalid` — `flow_canvas.tsx`, `validation_overlay.tsx`
- [x] 6. Test + impl: `PublishBar` disabled with errors ("Corrija 2 erros") and when the draft equals the
      latest version ("Nada novo para publicar") — `publish_bar.tsx`, `publish_bar.test.tsx`
- [x] 7. Test + impl: `PublishBar` publishes with the note, toasts "vN publicada", calls `onPublished`,
      invalidates version queries — same files
- [x] 8. Test + impl: `PublishBar` 422 calls `onRejected` with the server issues — same files
- [ ] 9. Impl: `useDraftDiffers` (latest version query + normalized comparison) —
      `src/web/app/flows/use_draft_differs.ts`
- [ ] 10. Impl: `ProblemsPanel` (collapsible, lists errors/warnings, click selects and centers) —
      `problems_panel.tsx`
- [ ] 11. Test + impl: editor page shows publish bar and problems panel; removing the trigger shows
      no_trigger; clicking a problem selects the node — `flow_editor_page.tsx`,
      `flow_editor_page.test.tsx`
- [ ] 12. Self-review checklist (section 5) and feedback loops (section 6)
