# Issue #13: Componentes de feedback, overlay e StatusBadge

## Decisions

- `colorVar` holds the CSS variable name (`"--status-running"`); components paint with
  `var(${colorVar})`. SKIPPED reuses `--status-canceled` (PRD table "Cancelado / pulado"). PAUSED has
  no token in #11, so it reuses `--status-waiting-limit` (the "on hold" color); no new token is added.
- The `execution_status.test.ts` also checks that every `colorVar` is declared in `tokens.css`.
- `RUNNING` (`animated: true`) uses the existing `animate-ember` utility from `global.css`.
- `cn.ts` is owned by #12 (built in parallel): use `clsx` directly here to avoid a merge conflict.
- Dialog and Drawer share the Radix Dialog parts (overlay, surface classes, close button) in
  `src/web/components/ui/overlay_parts.tsx` (extra file, not in the issue's list).
- `Tooltip` wraps its own Radix `Provider`, so it works without anything in `main.tsx` (#12's
  `IconButton` may use it).
- `Tabs` is controlled: `{ label, value, onValueChange, tabs: { value, label, content }[] }`.
- `ToastProvider` + `useToast` live in `toast.tsx`; info/success disappear after 5 s, error stays
  until closed. `useToast` outside the provider throws.
- Close buttons are labelled "Fechar".

## Tasks

- [x] 1. Test: every node run and run status has a style with a declared `--status-*` color — `execution_status.test.ts`
- [x] 2. Implement `EXECUTION_STATUS_STYLES` — `execution_status.ts`
- [x] 3. Test + implement `StatusBadge` (icon + label; hidden label becomes aria-label) — `status_badge.tsx`
- [x] 4. Test + implement `Dialog` (focus trapped, closes with Esc) — `dialog.tsx`, `overlay_parts.tsx`
- [ ] 5. Test + implement `Drawer` right/bottom with `size` (focus trapped, Esc) — `drawer.tsx`
- [ ] 6. Test + implement `ToastProvider`/`useToast` (disappears after 5 s, error stays) — `toast.tsx`
- [ ] 7. Wrap the app with `ToastProvider` — `src/web/main.tsx`
- [ ] 8. Test + implement `Tabs` with keyboard navigation — `tabs.tsx`
- [ ] 9. Implement `Tooltip` — `tooltip.tsx`
- [ ] 10. Test + implement `Skeleton`, `EmptyState`, `KeyValue` — `skeleton.tsx`, `empty_state.tsx`, `key_value.tsx`
- [ ] 11. Self-review checklist (section 5) and feedback loops (section 6)
