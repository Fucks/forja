# Issue #19: Cofre de segredos (AES-256-GCM) e redator de logs

## Decisions

- Everything lives in `src/integrations/secrets/`; contracts copied verbatim from the issue.
- `InvalidSecretError` is declared in `secret_box.ts` (message in pt-BR); `seal` output is
  `v1:<iv b64>:<tag b64>:<ciphertext b64>`, 12-byte random IV per call.
- `createSecretBox` rejects keys that are not 32 bytes with `InvalidMasterKeyError` (in `master_key.ts`).
- `maskSecret` lives in `secret_redactor.ts` (both hide secrets). The issue's example
  `sk-ant-api03-…a1b2` keeps the text up to and including the third "-" (the "2º" in the issue counts
  from zero); values without three hyphens show only "…" + last 4.
- The in-memory fs fake for `master_key.test.ts` stays inside the test file (only user).
- chmod failures are ignored only when `process.platform === "win32"`.
- Redactor: literal `replaceAll`, secrets applied longest first.

## Tasks

- [x] 1. Test + impl: `open(seal(x)) === x` and two seals differ — `secret_box.ts`, `secret_box.test.ts`
- [x] 2. Test + impl: tampered text, malformed text and wrong key throw `InvalidSecretError` — same files
- [x] 3. Test + impl: `createSecretBox` rejects a key that is not 32 bytes — same files, `master_key.ts`
- [x] 4. Test + impl: `loadOrCreateMasterKey` creates a 32-byte key with 0o600 once and reuses it — `master_key.ts`, `master_key.test.ts`
- [x] 5. Test + impl: chmod failure ignored on Windows, rethrown elsewhere — same files
- [ ] 6. Test + impl: `maskSecret` format — `secret_redactor.ts`, `secret_redactor.test.ts`
- [ ] 7. Test + impl: `createSecretRedactor` (all occurrences, several per line, < 8 chars ignored, overlapping longest first) — same files
- [ ] 8. Self-review checklist and feedback loops (typecheck, lint, test)
