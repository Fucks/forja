# Issue #24: Configurações do projeto e globais

## Decisions

- Schemas and types (`ProjectSettings`, `GlobalSettings`) live in `src/shared/settings_types.ts`, exactly as
  the issue's contract; defaults come from `schema.parse({})`.
- The repository stores the JSON and re-parses it with the schema on read, so new fields get their defaults.
- `createSettingsService({ repo, lookups, clock })`: `lookups` (`SettingsLookups`) answers
  `projectExists`/`credentialExists`/`toolProfileExists`; routes build it from `ProjectRepository`,
  `CredentialRepository`, `ToolProfileRepository` + `findPresetById`. Missing project → `NotFoundError`
  (404); unknown credential/profile → `DomainValidationError` (422) with `{ field }`.
- Routes: `GET/PUT /api/projects/:projectId/settings`, `GET/PUT /api/settings`; PUT bodies are the schemas
  (missing fields take defaults).
- `AgentDefaults` and `resolveAgentDefaults` live in `src/server/settings/resolve_agent_defaults.ts`.
- Web: hooks in `src/web/app/projects/use_settings.ts`; the page keeps a draft per level (`undefined` = no
  changes). Fields equal to the default are shown blank with placeholder "padrão: X"; blank fields are
  saved as the default. One fixed bottom save bar saves the changed levels.

## Tasks

- [x] 1. Shared schemas/types `src/shared/settings_types.ts`, migration `0400_settings.sql`, drizzle schema `src/server/db/schema/settings.ts`
- [x] 2. Test + implement: project without settings returns the defaults; global without row returns defaults — `settings_service.test.ts`, `settings_repository.ts`, `settings_service.ts`
- [x] 3. Test + implement: saving project and global settings and reading them back
- [x] 4. Test + implement: unknown project → NotFoundError; unknown credential (default/github) or tool profile → DomainValidationError
- [x] 5. Routes `settings_routes.ts` (GET/PUT both levels, 404/422) with a routes test `settings_routes.test.ts`
- [x] 6. Test + implement `resolveAgentDefaults` override combinations — `resolve_agent_defaults.ts`
- [ ] 7. Web hooks `use_settings.ts` and draft helpers `settings_draft.ts` (blank ↔ default)
- [ ] 8. Test: editing effort and saving sends the PUT — `project_settings_page.test.tsx`
- [ ] 9. Page: project sections (Agentes, Execução, Container), global section "Toda a Forja", fixed save bar — `project_settings_page.tsx` + form components
- [ ] 10. Test: global section saves and the page reloads both levels
- [ ] 11. Self-review checklist and feedback loops (typecheck, lint, test)
