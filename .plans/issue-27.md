# Issue #27: Fluxos e versões: persistência e API

## Decisions

- Branch fast-forwarded to `development` (dependencies #25, #26, #17 live there).
- `src/shared/flow_types.ts` holds `FlowSummary`, `FlowVersion`, `FlowDraft`, `FlowVersionSummary`
  and the Zod request schemas (shared with the web). `FlowService` interface + `createFlowService` live in
  `src/server/flows/flow_service.ts` (follows `project_service.ts`: sync repo wrapped in `resolveWith`).
- `FlowRepository` is a class over `ForjaDb` like `ProjectRepository`; graphs stored as JSON and re-read with
  `parseFlowGraph`.
- Optimistic concurrency: `UPDATE ... WHERE draft_revision = expected` (compare-and-set); 0 rows → `ConflictError`.
- One default per project: partial unique index `WHERE is_default = 1` + transaction in `markAsDefault`.
- Default graph = one manual trigger from `createDefaultNode("trigger", ...)`.
- `saveDraft` re-parses the graph (`parseFlowGraph`), `FlowGraphParseError` → `DomainValidationError` (422).
- `publish` errors → `DomainValidationError(message, issues)`; the error handler sends `details` = issues.
- Unknown project/flow/version → `NotFoundError`; repo has `projectExists`.
- Routes' `validationContext` returns `{}` until #20/#23 provide credentials/tool profiles (TODO with refs).

## Tasks

- [x] 1. Types, migration `0500_flows.sql`, schema `flows.ts`, repository skeleton
- [x] 2. Test+impl: create gives a draft with one trigger node and revision 1; unknown project → NotFound
- [x] 3. Test+impl: list (archived hidden unless includeArchived), rename, archive
- [x] 4. Test+impl: setDefault keeps a single default per project
- [x] 5. Test+impl: getDraft / saveDraft with optimistic revision (ConflictError) and shape validation
- [x] 6. Test+impl: publish valid graph → version last+1, emits `flow.published`; invalid → DomainValidationError with issues
- [x] 7. Test+impl: getVersion, listVersions, draft edit doesn't change published version, restoreVersionToDraft
- [ ] 8. Routes in `flows_routes.ts` + `flows_routes.test.ts` (status codes, 409, 422 body)
- [ ] 9. Self-review checklist and feedback loops
