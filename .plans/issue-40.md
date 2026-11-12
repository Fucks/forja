# Issue #40: Lista de fluxos: novo a partir de template, importar e exportar

## Decisions

- `useFlows(projectId)` lives in `src/web/app/flows/use_flows.ts` and lists archived flows too
  (`?includeArchived=true`); the page hides archived ones unless "Mostrar arquivados" is on. Its query
  key starts with `PROJECT_FLOWS_QUERY_KEY`, so every existing invalidation refreshes it as well.
  `projectFlowsPath` is exported from `use_flow_summary.ts` and reused.
- Mutations in `use_flows.ts`: `useCreateFlow` (no `templateId` → `POST /projects/:id/flows`, with it →
  `POST /projects/:id/flows/from-template`), `useImportFlow` (yaml sent as the JSON string body; the
  route's `z.string()` accepts it), `useRenameFlow`, `useSetDefaultFlow`, `useArchiveFlow`. All invalidate
  `PROJECT_FLOWS_QUERY_KEY`.
- Export is a plain download link to `/api/flows/:id/export?version=<n|draft>` with `download`; the
  server's content-disposition names it `<slug>.forja.yaml`. One `ExportFlowMenu`
  (`export_flow_menu.tsx`, native `<details>`, no new dependency) is used by the list rows and the editor.
- The import error shows the API message, which already carries "linha X, coluna Y".
- Creating or importing opens the editor (`flowEditorPath`).
- Extra files (keep the page thin): `flows_table.tsx`, `rename_flow_dialog.tsx`, `export_flow_menu.tsx`.
- No unarchive endpoint exists: archived rows show an "Arquivado" badge and no archive action.

## Tasks

- [x] 1. Test + impl: empty list offers "Novo fluxo" — `flows_page.test.tsx`, `flows_page.tsx`, `use_flows.ts`
- [x] 2. Test + impl: table lists name, default star, latest version, updated at — `flows_table.tsx`
- [x] 3. Test + impl: archived hidden, "Mostrar arquivados" shows them — `flows_page.tsx`
- [x] 4. Test + impl: create from "Fábrica básica" posts from-template and opens editor; blank creates
      without template; name required — `new_flow_dialog.tsx`, `use_flows.ts`
- [x] 5. Test + impl: import posts the file and opens the editor; invalid YAML shows the line —
      `import_flow_button.tsx`, `use_flows.ts`
- [x] 6. Test + impl: marking default posts and the previous default loses the star — `flows_table.tsx`
- [x] 7. Test + impl: rename dialog — `rename_flow_dialog.tsx`
- [x] 8. Test + impl: archive action — `flows_table.tsx`
- [ ] 9. Test + impl: export links (version and draft) in rows and in the editor top bar —
      `export_flow_menu.tsx`, `editor_top_bar.tsx`, `flow_editor_page.tsx`, `flow_editor_page.test.tsx`
- [ ] 10. Self-review checklist and feedback loops (typecheck, lint, test)
