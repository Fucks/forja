# Issue #39: Versões do fluxo: lista, diff e restaurar

## Decisions

- `diffFlowGraphs` lives in `src/engine/graph_diff.ts` (pure). Nodes and groups match by `id`; edges
  match by their connection (`from` port → `to` port), so a re-created edge with a new id is no change.
- Field changes recurse into plain objects and report dotted paths (`config.effort`, `label`); arrays
  and primitives are compared as a whole. Nodes ignore `position`; groups ignore `position` and `size`.
- The recursive field comparison lives in `src/engine/field_changes.ts` to keep each file one concept.
- Line diff of prompts uses the `diff` package (`diffLines`), already a dependency.
- The page's data hooks go in `src/web/app/flows/use_flow_versions.ts` (existing): `useFlowVersions`
  (list), `useSavedFlowDraft` (read-only draft, own query key, not the editor's), `useRestoreVersion`.
- Comparison: the selected version against "the previous version" (default) or "Rascunho"; the older
  side is always `before`, the draft is always the newest. v1 has no previous, so it defaults to draft.
- `VersionDiffView` receives `{ before, after }` graphs and computes the diff, so it has node labels to
  describe edges.
- The "Versões" link goes in `EditorTopBar` (new `versionsPath` prop) rendered by the editor page.

## Tasks

- [x] 1. Test + implement: added/removed/changed nodes, position ignored — `src/engine/graph_diff.ts`,
      `src/engine/field_changes.ts`, `src/engine/graph_diff.test.ts`
- [x] 2. Test + implement: added/removed edges matched by connection — `src/engine/graph_diff.ts`
- [x] 3. Test + implement: added/removed/changed groups, position and size ignored — `src/engine/graph_diff.ts`
- [ ] 4. Hooks `useFlowVersions`, `useSavedFlowDraft`, `useRestoreVersion` — `use_flow_versions.ts`
- [ ] 5. Test + implement: versions page lists versions (number, date, note) — `versions_page.tsx`,
      `versions_page.test.tsx`
- [x] 6. Test + implement: diff with previous version shows `config.effort: medium → high` on "Reviewer",
      and "no differences" for position-only change — `version_diff_view.tsx`
- [x] 7. Test + implement: prompt changes show a line diff — `version_diff_view.tsx`
- [x] 8. Test + implement: compare with the draft — `versions_page.tsx`
- [x] 9. Test + implement: restore with confirmation posts restore and refreshes the draft — `versions_page.tsx`
- [x] 10. "Versões" link in the editor bar — `flow_editor_page.tsx`, `editor_top_bar.tsx`
- [ ] 11. Self-review checklist and feedback loops
