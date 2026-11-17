# Issue #196: Comando no inspector: presets, onde roda, variáveis de ambiente e controle de falha

## Decisions

- Summary of a script: `line1` = command (truncated), `line2` = "container do item · falha se ≠ 0" /
  "container isolado · continua se ≠ 0".
- The card labels and descriptions come from `script_doc.ts` (`fieldOptionCards`), so the doc options are
  rewritten with the texts of the issue ("Container do item", "Marcar o nó como falho (recomendado)",
  "Texto" / "JSON (saída inteira)" / "JSON (última linha)"). `env` stops being `advanced` (it is its own
  section); `parseOutput` label becomes "Formato da saída".
- The command editor reuses `PromptEditor` with a `language: "shell"` option (no markdown, its own label,
  4 to 12 lines high). Its handle gains `replaceAll(text)`; a preset writes its command through the editor
  (like typing, debounced), and the other preset fields go straight to the config.
- The ScriptInspector tests move from `other_inspectors.test.tsx` to `script_inspector.test.tsx`.
- A preset with `command` asks for inline confirmation when the current command is not empty; `custom` has
  no command and changes nothing about it.
- Env rows are edited locally (`env_var_rows.ts`, pure) and applied to the node only when every row is
  valid (same approach as `use_response_field_rows.ts`). Name errors are shown while typing.
- "Item obrigatório" notice: with `runIn: "item"` the "Onde roda" field says the node needs the item input;
  it disappears with "Container isolado" (the validator already ignores the item port then).
- Files beyond the list: `script_doc.ts` (labels), `prompt_editor_extensions.ts`, new
  `script_command_field.tsx`, `env_var_rows.ts`(+test), `other_inspectors.test.tsx` (tests moved).

## Tasks

- [x] 1. Test + implement the script summary with `runIn` and `onFailure` — `node_summary.ts`, `node_summary.test.ts`
- [x] 2. `SCRIPT_PRESETS` contract — `script_presets.ts`
- [x] 3. `PromptEditor` shell mode (label, no markdown, 4–12 lines) and `replaceAll` handle — `prompt_editor.tsx`, `prompt_editor_extensions.ts`
- [x] 4. Move the ScriptInspector tests to `script_inspector.test.tsx`; command in the shell editor with Inserir dado, the {{…}} notice and the docs link — `script_command_field.tsx`, `script_inspector.tsx`
- [x] 5. Test + implement: a preset chip fills an empty command with its config
- [x] 6. Test + implement: a preset over an existing command asks for inline confirmation (Substituir / Cancelar)
- [ ] 7. Test + implement: "Onde roda" cards with the item notice; doc texts — `script_doc.ts`
- [ ] 8. Test + implement: "Se o comando falhar" cards with the Decisão hint
- [ ] 9. Test + implement: "Formato da saída" cards with examples
- [ ] 10. Test + implement: Avançado with shell, workingDir, image (isolated only) and timeout
- [ ] 11. Test + implement the env rows logic (name validation, duplicates, to/from config) — `env_var_rows.ts`
- [ ] 12. Test + implement `EnvListEditor` with text vars: add, edit, remove, reorder, inline name error — `env_list_editor.tsx`
- [ ] 13. Test + implement credential vars: list the project credentials, save `credentialId`
- [ ] 14. Self-review checklist and feedback loops (typecheck, lint, test)
