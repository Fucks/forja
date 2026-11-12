# Issue #82: Tela de aprovações com diff e artefatos

## Decisions

- Backend from #81 only lists pending approvals. To show resolved ones, `listApprovalsQuery.status`
  accepts `"pending" | "resolved"` (default `"pending"`); the service gains `listResolved` (most recent
  first, capped). Minimal change outside the issue's file list, mentioned in the commit.
- The selected approval lives in the URL as `?nodeRun=<gate NodeRun id>` (reuses
  `OPEN_NODE_RUN_PARAM`): an approval belongs to exactly one gate NodeRun, so the gate drawer can
  link to it without knowing the approval id. `approvalPath(projectId, nodeRunId)` in
  `src/web/config/navigation.ts`. Without the param, the first listed approval is shown.
- Hooks in `src/web/app/approvals/use_approvals.ts`: `usePendingApprovals`, `useResolvedApprovals`,
  `useResolveApproval`, `useApprovalArtifacts`; both lists reload on `approval.*` events
  (`useEventStream({ projectId })`). The topbar counter reuses `usePendingApprovals`.
- Artifacts = artifacts of the NodeRuns of the same run and item (spec, Reviewer summary), loaded
  through the run view + NodeRun details; rendered with the existing `NodeRunArtifacts` (JsonView).
- Logs link goes to the run page (`runPath`).
- Diff colors follow `prompt_line_diff.tsx` (`bg-status-succeeded/15`, `bg-status-failed/15`).
- Gate drawer: `NodeRunDrawer` passes `approvalPath` to `NodeRunDetail` only for gate nodes.

## Tasks

- [x] 1. Test + implement `parseUnifiedDiff` (files, hunks, add/del/ctx counts) — `parse_unified_diff.ts`
- [x] 2. Test + implement binary, renamed, new/deleted files and the leading stat — `parse_unified_diff.ts`
- [x] 3. Backend: list resolved approvals (`status=resolved`) — `approval_types.ts`, repo, service, routes + tests
- [ ] 4. Test + implement the page list: pending first with item and age, then resolved — `approvals_page.tsx`, `use_approvals.ts`
- [ ] 5. Test + implement the detail: message, item, `StatusBadge`, collapsible diff per file — `approval_detail.tsx`, `diff_viewer.tsx`
- [ ] 6. Test + implement artifacts (JsonView) and the logs link — `approval_detail.tsx`, `use_approvals.ts`
- [ ] 7. Test + implement approve (no comment) and reject (comment required) — `approval_detail.tsx`, `use_approvals.ts`
- [ ] 8. Test + implement live updates on `approval.*` — `use_approvals.ts`
- [ ] 9. Test + implement the topbar pending counter — `topbar.tsx`
- [ ] 10. Test + implement the gate drawer "Abrir aprovação" link — `node_run_detail.tsx`, `node_run_drawer.tsx`
- [ ] 11. Self-review checklist and feedback loops (typecheck, lint, test)
