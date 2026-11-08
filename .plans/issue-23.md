# Issue #23: Perfis de ferramentas: MCP, CodeGraph e permissões

## Decisions

- Contracts (`mcpServerSchema`, `toolProfileInput`, `ToolProfile`) live in `src/shared/tool_profile_types.ts`
  exactly as in the issue; `ToolProfileInput = z.input`/`z.infer` derived there.
- Presets live in code (`tool_profile_presets.ts`), never in the DB; `list()` returns presets first, then
  stored profiles in creation order. Preset timestamps are a fixed constant.
- Service follows the `project_service.ts` pattern: `createToolProfileService(deps)` with `repo` + `clock`,
  `resolveWith` for the sync repository, domain errors from `src/server/errors.ts`
  (`DomainValidationError` → 422, `ConflictError` → 409, `NotFoundError` → 404).
- No `CredentialService` exists yet: `${cred:<id>}` references are validated by format only (#61 resolves).
- Duplicating copies the profile as a non-builtin one named `<nome> (cópia)`, truncated to fit 60 chars.
- Table stores lists as JSON text columns (like `projects.detected_json`).
- Web: data hooks in `src/web/app/settings/use_tool_profiles.ts` (TanStack Query + `apiClient`); form split
  into small components next to `tool_profile_form.tsx`. `app_shell.test.tsx` gets a `QueryClientProvider`
  because the page now queries the API.

## Tasks

- [ ] 1. Contracts in `src/shared/tool_profile_types.ts`
- [ ] 2. Test + impl: list returns the three builtin presets — presets, service `list`/`get`
- [ ] 3. Test + impl: create persists a profile listed after presets — migration, schema, repository, service
- [ ] 4. Test + impl: create rejects two MCP servers with the same name (DomainValidationError)
- [ ] 5. Test + impl: create rejects malformed `${cred:...}` references
- [ ] 6. Test + impl: update a profile; updating a preset → ConflictError
- [ ] 7. Test + impl: remove a profile; removing a preset → ConflictError
- [ ] 8. Test + impl: duplicate a preset and a custom profile
- [ ] 9. Routes + `tool_profiles_routes.test.ts` (201/204, 422 duplicate MCP, 400 invalid mode, 409 preset)
- [ ] 10. Web: `use_tool_profiles.ts` query/mutation hooks
- [ ] 11. Test + impl: page lists profiles, presets marked "embutido" without edit/remove
- [ ] 12. Test + impl: form creates a profile with one MCP and two tools — `tool_profile_form.tsx`
- [ ] 13. Test + impl: page edits, duplicates and removes profiles
- [ ] 14. Wrap `app_shell.test.tsx` render in `QueryClientProvider`
- [ ] 15. Self-review checklist and feedback loops (typecheck, lint, test)
