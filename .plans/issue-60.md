# Issue #60: Imagem Docker do agente por projeto

## Decisions

- `AgentImageStatus`, `AgentImageSource` and the build result live in `src/shared/agent_image_types.ts`
  (used by server and web); the service file re-uses them, names exactly as in the issue contract.
- `createAgentImageService({ lookups, commands, fileExists, hostUser, defaultDockerfile })` in
  `src/server/agent_images/agent_image_service.ts`. `lookups.findTarget(projectId)` returns
  `{ repoPath, image }` (image = project setting `agentImage`), unknown project → `NotFoundError`.
- Lookups over the DB in `src/server/agent_images/agent_image_lookups.ts` (`findTarget`,
  `listImagesInUse`), like `settings_lookups.ts`.
- Project Dockerfile = `<repo>/.sandcastle/Dockerfile`, build context `<repo>/.sandcastle`; default =
  `runtimeAssetPath("assets", "agent-image", "Dockerfile")`, context its folder.
- Status via `docker image inspect <image>` (JSON array, parsed with Zod: `Created`, `Size` bytes → MB).
- Build: `docker build -t <image> --build-arg AGENT_UID=<uid> --build-arg AGENT_GID=<gid> -f <file> <ctx>`,
  timeout 30 min, stdout+stderr lines to `onLine`, `signal` passed to the runner; no host user (Windows) → 1000.
- Host user: move `currentHostUser()` from `main.ts` to `workspace_layout.ts` so routes reuse it.
- Diagnostics: `DiagnosticServiceDeps.checks` becomes `listChecks: () => DiagnosticCheck[]`, so the route
  adds one `createAgentImageCheck(image)` per distinct image in use (default image when there are no
  projects). Error detail "Imagem <image> não encontrada", fix "Construir imagem".
- SSE build route: unknown project answered 404 before hijacking; each line `event: line` with JSON
  `{ line }`, final `event: done` with `{ ok, exitCode }`; client disconnect aborts the build.
- Web: `readServerSentEvents` (fetch body reader → frames) in `src/web/api/server_sent_events.ts`;
  hooks in `src/web/app/projects/use_agent_image.ts`; the panel goes in the "Container" section through
  a `containerPanel` prop of `ProjectSettingsForm`.

## Tasks

- [x] 1. Default Dockerfile — `assets/agent-image/Dockerfile`
- [x] 2. Shared types — `src/shared/agent_image_types.ts`
- [x] 3. Test+impl: status picks the project `.sandcastle/Dockerfile` or the Forja default — `agent_image_service(.test).ts`
- [x] 4. Test+impl: status reports exists/createdAt/sizeMb from `docker image inspect`, and missing image
- [x] 5. Test+impl: build runs docker build with the contract args (host UID/GID, 1000 without host user, timeout)
- [x] 6. Test+impl: build streams lines, returns ok/exitCode, passes the abort signal (cancel)
- [x] 7. Move `currentHostUser` to `workspace_layout.ts`; lookups `agent_image_lookups.ts`
- [x] 8. Test+impl: routes GET status and POST build SSE (lines + done, 404) — `agent_images_routes(.test).ts`
- [x] 9. Test+impl: diagnostic item per agent image in use — `diagnostic_checks.ts`, `diagnostic_service.ts`, `diagnostics_routes.ts`
- [x] 10. Test+impl: SSE reader for fetch bodies — `src/web/api/server_sent_events(.test).ts`
- [x] 11. Hooks `use_agent_image.ts` + panel `agent_image_panel.tsx` (status badge, build/cancel, live log)
- [x] 12. Wire the panel in the Container section — `project_settings_form.tsx`, `project_settings_page.tsx` (+ page test)
- [x] 13. Self-review checklist and feedback loops (typecheck, lint, test)
