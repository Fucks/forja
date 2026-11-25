# Issue #219: RTK (Rust Token Killer) na imagem padrão do agente para reduzir tokens da saída de comandos

## Decisions

- Only the image and the docs change: nothing mounts over `/home/agent/.claude` at runtime
  (`workspace_layout.ts` mounts only the worktree, the git common dir and `/home/agent/.forja`) and
  `buildClaudeArgs` passes no `--setting-sources`/`--settings`, so the global hook merges with the
  worktree's `.claude/settings.json`. The stream-json parser ignores unknown messages and keeps the
  Bash input as a string, so `rtk ...` commands show up in the logs unchanged.
- `rtk-oss` v1.2.1, musl tarball per `dpkg --print-architecture` (amd64 → x86_64, arm64 → aarch64),
  SHA-256 pinned in the Dockerfile (values from the release's `checksums.txt`), installed to
  `/usr/local/bin` as root.
- `rtk init --global` alone does not patch `settings.json` without a TTY (it defaults to "N");
  `--auto-patch` is needed. It also writes `~/.claude/RTK.md` + `@RTK.md` in `~/.claude/CLAUDE.md`,
  which tell the agent about `rtk bypass <cmd>` — kept.
- `ENV RTK_TELEMETRY_DISABLED=1` unconditionally, like `CODEGRAPH_TELEMETRY=0`.
- Guide: new `docs/imagem-agente.md`, linked from README's "Construir a imagem do agente".
- No Docker in the sandbox: the RUN scripts were checked by running them in a shell.

## Tasks

- [x] 1. Install the pinned `rtk-oss` binary behind `ARG INSTALL_RTK=true` with telemetry off — `assets/agent-image/Dockerfile`
- [x] 2. Register the Claude Code hook as `agent` with `rtk init --global --auto-patch` — `assets/agent-image/Dockerfile`
- [x] 3. Agent image guide (what RTK does, how to turn it off, how to run a command unfiltered) — `docs/imagem-agente.md`, `README.md`
- [ ] 4. Self-review checklist and feedback loops (typecheck, lint, test)
