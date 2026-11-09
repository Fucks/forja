# Issue #16: LogViewer virtualizado (componente base)

## Decisions

- Contracts from the issue are kept verbatim: `LogLineKind`, `LogLine` in `src/web/logs/log_types.ts`,
  `findMatches(lines, query): number[]` (seqs) in `log_search.ts`, `LogViewer(props)` in `log_viewer.tsx`.
- Virtualization with `useVirtualizer` from `@tanstack/react-virtual`: estimate 20 px per row,
  `measureElement` ref on each row for dynamic heights (expanded rows), `getItemKey` = `seq`.
- Follow-the-end: `follow` is optional controlled state (internal state defaults to `true`;
  `onFollowChange` is called on every change). Following scrolls to the last index whenever the line
  count changes. A scroll upwards that leaves the end (distance from end computed with
  `virtualizer.getTotalSize()`, not `scrollHeight`) turns following off and shows "Ir para o fim".
  Navigating to a search match also turns following off.
- Search state and navigation live in a hook (`use_log_search.ts`); follow logic in `use_log_follow.ts`;
  clipboard text formatting in `log_clipboard.ts` (extra files to keep `log_viewer.tsx` small).
- Offsets use `formatRelativeOffset` from `src/lib/format.ts`. Loading uses `Skeleton`, empty uses `EmptyState`.
- Tests: jsdom has no layout and no `Element.scrollTo`. `scrollTo` polyfill added to
  `src/test/fakes/jsdom_polyfills.ts` (sets `scrollTop` and dispatches `scroll`); element sizes stubbed
  per test with `src/test/fakes/fake_element_size.ts` (`vi.spyOn` on `clientHeight`/`offsetHeight`).
- Accessibility: scroll container `role="log"` labelled "Logs"; rows are `listitem`s in a `list`;
  expandable rows use a `button` with `aria-expanded` (click + Enter/Space).

## Tasks

- [x] 1. `log_types.ts` + `findMatches` tests (case-insensitive, `detail`, empty query) and implementation — `src/web/logs/log_search.ts`, `log_search.test.ts`
- [ ] 2. Test infra: `scrollTo` polyfill and `fake_element_size.ts` — `src/test/fakes/`
- [ ] 3. Test + implement virtualized rendering (< 200 row elements with 100k lines), loading and empty states — `log_viewer.tsx`, `log_line.tsx`, `log_viewer.test.tsx`
- [ ] 4. Test + implement expand/collapse by click and keyboard — `log_line.tsx`
- [ ] 5. Test + implement follow-the-end (follows new lines, scrolling up turns off, "Ir para o fim") — `use_log_follow.ts`
- [ ] 6. Test + implement toolbar search: Ctrl/Cmd+F focus, Enter/Shift+Enter navigation, highlight — `log_toolbar.tsx`, `use_log_search.ts`
- [ ] 7. Test + implement copy line, copy all and download — `log_clipboard.ts`, `log_toolbar.tsx`, `log_line.tsx`
- [ ] 8. Styleguide LogViewer section with 10k generated lines — `src/web/app/styleguide/log_viewer_samples.tsx`, `styleguide_page.tsx`, test
- [ ] 9. Self-review checklist and feedback loops (typecheck, lint, test)
