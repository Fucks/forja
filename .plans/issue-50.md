# Issue #50: Itens de trabalho e itens locais

## Decisions

- Follow the flows domain pattern: `WorkItemRepository` class over drizzle (sync), `createWorkItemService(deps)`
  with `{ repo, events, clock }`, every sync method wrapped in `resolveWith`. `WorkItemService` interface lives in
  `work_item_service.ts` (like `FlowService`); shared types/schemas in `src/shared/work_item_types.ts`.
- `WorkItemSnapshot` (format of #51) and `GithubIssueData` are declared in `src/shared/work_item_types.ts`.
- Local branch: `forja/item-<8 chars>` taken from the **random tail** of the ULID, lowercased. The leading 8
  characters of a ULID are its timestamp, so items created in the same second would share a branch (PRD: never
  two items on the same branch). Stored in the row at creation, so it never changes. GitHub: `forja/issue-<n>`.
- PATCH schema (`updateLocalItemInput`) is built from field schemas without defaults: `localItemInput.partial()`
  would re-apply `body: ""`/`labels: []` and wipe fields that were not sent.
- `archive(id)` added to the service + `POST /api/work-items/:id/archive` (objective says "arquivar itens locais";
  the contract has no method for it). GitHub items → 409 too, like `updateLocal`.
- `blockedBy` must reference items of the same project and not the item itself → `DomainValidationError` (422).
- `isBlocked`: a blocker missing from the map does not block.
- `upsertFromGithub`: pre-assigns ids to new issues, resolves `blockedByNumbers` against the project's GitHub items
  plus the batch (unknown numbers dropped), writes everything in one transaction. `updated` counts only items whose
  synced fields changed; `syncedAt` is always refreshed. Keeps `manualColumn`/`archived`. Events per changed item.
- List filters (`state`, `label`, `includeArchived`) applied in the service over the project's rows.

## Tasks

- [x] 1. Types/schemas, migration `0700_work_items.sql`, drizzle schema, repository (insert/find/list)
- [x] 2. Test+impl: `createLocal` stores the item with a stable `forja/item-` branch and publishes `work_item.created`; 404 unknown project
- [x] 3. Test+impl: `createLocal` rejects `blockedBy` ids outside the project (422)
- [x] 4. Test+impl: `get` returns the item; 404 for unknown id
- [x] 5. Test+impl: `updateLocal` edits fields, keeps branch, publishes `work_item.updated`; github item → ConflictError; self-block rejected
- [x] 6. Test+impl: `setManualColumn` sets and clears the column
- [x] 7. Test+impl: `archive` hides the item from `list` unless `includeArchived`
- [x] 8. Test+impl: `list` filters by state and label, ordered by creation
- [x] 9. Test+impl: `isBlocked` true while a blocker is open, false when all closed
- [x] 10. Test+impl: `snapshots` returns items in the requested order; 404 for an id of another project
- [x] 11. Test+impl: `upsertFromGithub` creates items with `forja/issue-<n>` and resolves dependencies inside the batch
- [x] 12. Test+impl: `upsertFromGithub` twice with the same data does not duplicate (`created: 0, updated: 0`) and updates changed issues
- [x] 13. Routes + `work_items_routes.test.ts` (list/create/get/patch/column/archive, 404/409/400/422)
- [x] 14. Self-review checklist (section 5) and feedback loops (section 6)
