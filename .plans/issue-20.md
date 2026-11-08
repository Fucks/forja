# Issue #20: Credenciais: API e tela

## Decisions

- Mirror the tool profiles domain (#23): `CredentialRepository` class over Drizzle, service built by
  `createCredentialService(deps)` with `resolveWith`, route module builds the service from `AppDeps`.
- `credentialInput` keeps the contract shape and adds a `superRefine` requiring `envVar` for
  `generic_env`, so the route answers 400. Kinds other than `generic_env` always use `ENV_VAR_BY_KIND`.
- `updateCredentialInput` (`name` and/or `value`, at least one) lives in `src/shared/credential_types.ts`.
- `StoredCredential` (summary + `sealedValue`) is server-only, defined in `credential_repository.ts`.
- Boot registration: `registerStoredCredentialValues(deps)` exported from `credential_service.ts`, called
  by the credentials route module.
- `AppDeps` gains `secrets: SecretBox` and `redactor: SecretRedactor`; `main.ts` builds them from
  `loadOrCreateMasterKey(paths.masterKey, fs)`. `ServerDeps` omits them. Tests use `createTestSecretBox()`
  from `src/test/test_secrets.ts` (fixed key).
- `apiClient` gains `patch` (minimal change outside the issue's file list).
- Flows: resolve TODO(#20) in `flows_routes.ts` by passing `knownCredentialIds`.
- UI: table like `projects_page.tsx`; kind labels and help texts live in `credential_form_dialog.tsx`.

## Tasks

- [x] 1. Shared types and schemas — `src/shared/credential_types.ts`
- [x] 2. Migration, Drizzle schema and repository — `0200_credentials.sql`, `schema/credentials.ts`,
      `credential_repository.ts`
- [x] 3. Test + implement `create` (sealed in DB, masked, env var by kind, redactor) —
      `credential_service.ts`, `credential_service.test.ts`, `src/test/test_secrets.ts`
- [x] 4. Test + implement `list`, `rename`, `replaceValue`, `remove` (NotFound) — service
- [x] 5. Test + implement `revealForRuntime` and `recordCheck` — service
- [x] 6. Test + implement `registerStoredCredentialValues` (boot) — service
- [x] 7. `AppDeps` secrets/redactor, `main.ts` master key, test deps — `app.ts`, `main.ts`,
      `test_app_deps.ts`
- [x] 8. Test + implement routes (no value in responses, generic_env 400, PATCH, DELETE) —
      `credentials_routes.ts`, `credentials_routes.test.ts`
- [x] 9. Pass known credential ids to flow validation — `flows_routes.ts`
- [x] 10. `apiClient.patch` and `use_credentials.ts` hooks
- [ ] 11. Page test + implement list and create flow — `credentials_page.tsx`,
      `credential_form_dialog.tsx`, `credentials_page.test.tsx`
- [ ] 12. Page test + implement rename/replace value — page, dialog
- [ ] 13. Page test + implement remove with confirmation dialog — page
- [ ] 14. Self-review checklist and feedback loops
