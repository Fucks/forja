# Issue #2: Configurar projeto TypeScript, scripts npm e Vitest

PRD: #1 · Key: F-01

## Decisions
- `package.json` is merged, never replaced: keep `"type": "module"`, the `sandcastle` script and
  `@ai-hero/sandcastle`, `tsx`, `zod` (sandcastle stays in devDependencies only).
- Every MVP dependency listed in the issue is installed here at its latest stable version, so later
  issues don't edit `package.json` in parallel.
- `tsconfig.json` follows the issue contract verbatim (includes `src`, `e2e`, `*.config.ts`).
- `src/test/setup.ts` only restores mocks after each test; `@testing-library/jest-dom` is added by
  F-04 (#5), not here.
- `vitest.config.ts` reads `VITEST_MAX_WORKERS`; without it Vitest uses its default.
- `vitest.integration.config.ts` reuses the main config and only includes `src/**/*.integration.test.ts`.

## Tasks
- [ ] 1. Install runtime and dev dependencies, keeping the original ones — `package.json`, `package-lock.json`
- [ ] 2. Add scripts `typecheck`, `test`, `test:watch`, `test:integration` — `package.json`
- [ ] 3. Create the strict TypeScript config with the `@/` alias — `tsconfig.json`
- [ ] 4. Create the Vitest config with setup file and integration exclusion — `vitest.config.ts`, `src/test/setup.ts`
- [ ] 5. Create the integration Vitest config — `vitest.integration.config.ts`
- [ ] 6. Test: `assertNever` throws with the given message — `src/lib/assert_never.test.ts`
- [ ] 7. Test: the default message includes the received value — `src/lib/assert_never.test.ts`
- [ ] 8. Implement `assertNever` — `src/lib/assert_never.ts`
- [ ] 9. Verify `*.integration.test.ts` is excluded from `npm run test` and included by `test:integration`
- [ ] 10. Self-review checklist and feedback loops (typecheck, test)
