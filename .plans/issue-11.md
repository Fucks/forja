# Issue #11: Tokens de design, fontes e tema Tailwind

## Decisions

- Raw values live only in `src/web/styles/tokens.css` (`:root`/`[data-theme="dark"]` default and
  `[data-theme="light"]`); `global.css` maps them into Tailwind v4 with `@theme inline`, so utilities
  (`bg-surface`, `text-status-failed`) follow the active theme at runtime.
- Status colors are theme-independent and declared once on `:root`.
- `theme.ts` follows the contract exactly: `ThemeName`, `readStoredTheme(storage)`, `applyTheme(theme, root, storage)`;
  storage key `THEME_STORAGE_KEY = "forja.theme"`; anything not `"dark"`/`"light"` falls back to `"dark"`.
- Fonts come from `@fontsource/*` imports in `main.tsx` (bundled by Vite, no network).
- `prefers-reduced-motion: reduce` zeroes `--duration-*` and disables `.animate-ember`.

## Tasks

- [x] 1. Color, status, typography, radius, shadow and motion tokens — `src/web/styles/tokens.css`
- [x] 2. Tailwind `@theme` mapping, body base, `ember` keyframes and reduced motion — `src/web/styles/global.css`
- [x] 3. Test + implement: `readStoredTheme` defaults to `dark` — `src/web/styles/theme.ts`, `theme.test.ts`
- [x] 4. Test + implement: invalid stored value falls back to `dark`; stored `light` is read
- [x] 5. Test + implement: `applyTheme` sets `data-theme` and stores the theme
- [x] 6. Import fonts and apply the stored theme on boot — `src/web/main.tsx`
- [x] 7. Verify the build emits the token utilities and fonts locally; compute AA contrast values for the PR
- [ ] 8. Self-review checklist and feedback loops (typecheck, lint, test)
