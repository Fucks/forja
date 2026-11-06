# Issue #3: Configurar ESLint e Prettier com os padrões do projeto

## Decisions

- Dependencies already in `package.json` (from #2); no installs needed.
- `eslint.config.mjs` uses flat config: typed rules (`recommendedTypeChecked`) only on `src/**/*.{ts,tsx}`
  with `projectService`; check-file `SNAKE_CASE` for filenames and folders in `src/**`.
- Ignore `dist/`, `.sandcastle/`, `coverage/` in ESLint; `.prettierignore` follows the issue contract exactly.
- Leave the pre-existing unstaged `package-lock.json` change (npm install artifact) out of the commits.

## Tasks

- [x] 1. Prettier config and ignore list — `.prettierrc.json`, `.prettierignore`
- [x] 2. `format` and `format:check` scripts, run `npm run format` — `package.json` (+ reformatted files)
- [x] 3. ESLint flat config with typescript-eslint, react-hooks, check-file, prettier — `eslint.config.mjs`
- [x] 4. `lint` script and fix what lint reports — `package.json`
- [x] 5. Verify `src/lib/BadName.ts` fails lint and `.sandcastle/` is not linted (not committed)
- [x] 6. Self-review checklist and feedback loops (typecheck, lint, test)
