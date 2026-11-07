# Issue #9: CI no GitHub Actions (Ubuntu e Windows)

## Decisions

- Workflow follows the issue contract verbatim: job `checks`, matrix `os: [ubuntu-latest, windows-latest]`,
  Node 22 with `cache: npm`, steps `npm ci`, `npm run typecheck`, `npm run lint`, `npm run test`.
- Triggers: `pull_request` to `development`/`main`, `push` to `development`.
- `.gitattributes` holds only `* text=auto eol=lf` so Windows checkouts keep LF (Prettier/ESLint).
- The local `package-lock.json` drift (root `version`/`bin` synced by `npm install`) is committed so the
  versioned lock matches `package.json` for `npm ci`.
- No E2E or integration tests in CI (#84 and Docker/`claude`).

## Tasks

- [ ] 1. Add `.gitattributes` with LF normalization — `.gitattributes`
- [ ] 2. Add the CI workflow — `.github/workflows/ci.yml`
- [ ] 3. Confirm `npm ci` works with the versioned lock — `package-lock.json`
- [ ] 4. Self-review checklist (section 5) and feedback loops (section 6)
