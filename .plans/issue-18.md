# Issue #18: Telas de projetos: lista, criação e visão geral

## Decisions

- Pure project types (`Project`, `ProjectDetection`, `projectDetectionSchema`, `createProjectInput`,
  `CreateProjectInput`, `renameProjectInput`) move to `src/shared/project_types.ts`; the server's
  `project_types.ts` keeps `ProjectService` and re-exports the moved names so #17 and parallel
  branches keep compiling. `src/test/factories/project_factory.ts` imports from shared.
- Hooks in `src/web/app/projects/use_projects.ts` use `apiClient` and the query key `["projects"]`
  (detail: `["projects", id]`); creation invalidates `["projects"]`.
- Web tests stub `fetch` with `stubFetchRoutes` (`src/test/fakes/fake_fetch.ts`, keys like
  `"GET /api/projects"`, unknown routes answer 404) and render the real routes with
  `renderAppAt` (`src/test/render_app_at.tsx`: fresh `QueryClient` without retries + ToastProvider +
  memory router). `app_shell.test.tsx` reuses it.
- `ProjectPage` shows "Projeto" as the title while loading/failed and the project name once loaded.
- 422/409 (`ApiError.status`) go under the path field; other errors show as a form-level alert.
- Sidebar project switcher: `Select` labelled "Projeto", hidden while collapsed; switching keeps the
  current area via `switchProjectPath(pathname, projectId)` in `src/web/config/navigation.ts`
  (area kept, deeper ids dropped; overview when no area).

## Tasks

- [x] 1. Move pure project types to `src/shared/project_types.ts` and re-export them on the server
- [x] 2. Test helpers `stubFetchRoutes` and `renderAppAt`; `app_shell.test.tsx` uses them
- [x] 3. Hooks `useProjects`, `useProject`, `useCreateProject` — `use_projects.ts`
- [x] 4. Test + impl: empty list shows EmptyState with "Novo projeto" — `projects_page.tsx`
- [x] 5. Test + impl: projects listed in a table (name link, path mono, GitHub repo, base branch)
- [ ] 6. Test + impl: creating a project closes the dialog, refreshes the list and opens the overview
      — `new_project_dialog.tsx`
- [ ] 7. Test + impl: 422/409 error under the path field
- [ ] 8. Test + impl: `ProjectPage` overview (KeyValue, detection badges with next-step hint,
      shortcut cards to Fluxos/Board/Runs) — `project_page.tsx`
- [ ] 9. Test + impl: `switchProjectPath` keeps the current area — `navigation.ts`
- [ ] 10. Test + impl: sidebar lists projects and switches project keeping the area — `sidebar.tsx`
- [ ] 11. Self-review checklist and feedback loops (typecheck, lint, test)
