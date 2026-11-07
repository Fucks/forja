# Issue #14: App shell, rotas, navegação e /styleguide

## Decisions

- Routes are exported as `APP_ROUTES: RouteObject[]` from `src/web/app/routes.tsx`; `createAppRouter()` wraps
  them in `createBrowserRouter`. Tests mount them with `createMemoryRouter`, so the shell test exercises the
  real route table.
- Every route (pages, `/styleguide`, `*` 404) is a child of one layout route whose element is `<AppShell />`.
- Active nav item uses `NavLink` (sets `aria-current="page"`); the "Projetos" link at `/` uses `end`.
- Topbar shows the active project from `:projectId` (the project name lookup belongs to #18, which owns the
  projects API on the web side). Live indicator is driven only by the `connected` prop of `AppShell`.
- Theme toggle reuses `readStoredTheme`/`applyTheme` from `src/web/styles/theme.ts` via a `useTheme` hook in
  `src/web/styles/use_theme.ts`.
- Sidebar collapses by user toggle or when the viewport is narrower than 1024 px (`useMediaQuery` in
  `src/web/app/use_media_query.ts`); `src/test/setup.ts` gets a minimal `matchMedia` stub because jsdom lacks it.
- Collapsed sidebar: icon-only links with `aria-label` and wrapped in the existing `Tooltip`.
- Page titles share `PageTitle` (`src/web/app/page_title.tsx`): IBM Plex Sans Condensed 600, 20 px.
- Tokens only switch on `:root[data-theme]`, so `/styleguide` shows both themes through the topbar toggle.
- Styleguide sections live in `src/web/app/styleguide/` to keep each file around one concept.

## Tasks

- [x] 1. `navigation.ts` with `NavItem`, `PROJECT_NAV`, `GLOBAL_NAV` — `src/web/config/navigation.ts`
- [x] 2. `PageTitle` and `PlaceholderPage` — `src/web/app/page_title.tsx`, `src/web/app/placeholder_page.tsx`
- [x] 3. Placeholder page files for every route in the issue table
- [x] 4. Test: renders a project route inside the shell with the active item marked — `app_shell.test.tsx`
- [x] 5. Implement `AppShell`, `Sidebar`, `Topbar` and `APP_ROUTES` (all routes) — `src/web/app/*`
- [x] 6. Test + implement: every listed route renders inside the shell
- [x] 7. Test + implement: unknown route shows the 404 — `not_found_page.tsx`
- [x] 8. Test + implement: collapsing the sidebar keeps icons with tooltip and accessible name
- [x] 9. Test + implement: sidebar collapses below 1024 px — `use_media_query.ts`, `src/test/setup.ts`
- [x] 10. Test + implement: live indicator from `connected` and theme toggle — `topbar.tsx`, `use_theme.ts`
- [x] 11. Remove `home_page.tsx` and its test
- [x] 12. Test + implement `/styleguide` with every form, feedback and status component —
      `styleguide_page.tsx`, `src/web/app/styleguide/*`
- [ ] 13. Self-review checklist (section 5) and feedback loops (section 6)
