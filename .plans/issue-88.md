# Issue #88: Empacotamento npm, docker-compose opcional e README

## Decisions

- Package name `@fucks/forja` (provisional name from #89), `version` 0.1.0, `private` removed,
  `files: ["dist", "assets", "README.md"]`, `publishConfig.access` public, `bin.forja` -> `dist/cli.js`.
- Web-only libraries (React, Radix, CodeMirror, ...) move to `devDependencies`: Vite bundles them into
  `dist/web`, so `npx` installs only what `dist/cli.js` imports. tsup externalizes only `dependencies`.
- Reproducible build: `build` starts with `clean` (removes `dist`), and `prepack` runs `build`, so
  `npm pack`/`npm publish` always ship a fresh bundle.
- The smoke test gets the session cookie from `GET /` (index.html) before `GET /api/health`, as the
  browser does: every `/api` route needs the cookie. It uses a free port and `--data-dir <tmp>`, and it
  also checks the tarball lists only `dist/`, `assets/`, `README.md` and `package.json`.
- The server only listens on 127.0.0.1 (FORJA_HOST is a literal, #86). In the container, `socat`
  relays the container's own IP:4317 to 127.0.0.1:4317, so the published port `127.0.0.1:4317:4317`
  reaches it while the Host header and the loopback-only rules stay intact.
- Compose mounts `~/.forja` and the repositories dir at the same absolute paths as on the host, because
  the agent containers are started through the host's Docker socket with host paths. It runs as the
  host user (`FORJA_UID`/`FORJA_GID`) plus the socket's group (`DOCKER_GID`).
- `.dockerignore` is an extra file (not in the issue list) so `COPY . .` does not copy node_modules.

## Tasks

- [x] 1. Publishable `package.json` (name, files, publishConfig, deps split, clean/prepack) — `package.json`
- [x] 2. Smoke test of the package — `scripts/smoke_test_package.mjs`
- [x] 3. Manual release workflow — `.github/workflows/release.yml`
- [x] 4. Server image — `Dockerfile.server`, `.dockerignore`
- [ ] 5. Optional compose — `docker-compose.yml`
- [ ] 6. README covering every topic of the issue — `README.md`
- [ ] 7. Self-review checklist and feedback loops (typecheck, lint, test, smoke test)
