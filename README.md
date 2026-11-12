# Forja

Fluxos de agentes de código num canvas, rodando local: um servidor Node no host, a interface no navegador e
os dados em SQLite em `~/.forja`.

```
npm install
npm run dev
```

## Migrando do `.sandcastle/main.mts`

O pipeline que este repositório roda com `npm run sandcastle` existe na Forja como o template de fluxo
**Pipeline Sandcastle**. Na lista de fluxos do projeto, clique em **Novo fluxo**, escolha o template
"Pipeline Sandcastle" e publique o fluxo.

| `.sandcastle/main.mts`                           | Pipeline Sandcastle                                                                                         |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| sync das issues com label `Sandcastle` + planner | Nó **Fonte** (GitHub, label `Sandcastle`, até 10 issues, pula as bloqueadas por outra issue aberta)         |
| uma issue por vez                                | Grupo **Implementar e revisar** com concorrência 1 (suba para 3 no canvas para trabalhar em paralelo)       |
| implementer, até 100 iterações                   | Agente **Implementer** (`sandcastle_implement.md`, perfil CodeGraph, 100 iterações)                         |
| implementer sem commits                          | Condição **Fez commits?** → saída "precisa de humano"                                                       |
| reviewer                                         | Agente **Reviewer** (`sandcastle_review.md`, uma iteração)                                                  |
| rebase                                           | Nó **Git: rebase** (chama um agente só quando há conflito)                                                  |
| evidence (`body.md` e `result.json`)             | Agente **Evidence** (`sandcastle_evidence.md`, saída estruturada `{ checksPassed, failureSummary?, body }`) |
| PR só com os checks verdes                       | Condição **Checks passaram?** → **Abrir PR** com o corpo da evidência e `Closes #N`                         |
| checks falhando                                  | Saída "precisa de humano", com o resumo da falha comentado na issue                                         |
| `usage_guard.mts`                                | Configurações: margem após o limite de uso e tentativas de cada nó                                          |

Diferenças que importam na migração:

- Os prompts ficam em `src/server/flows/templates/prompts/sandcastle_*.md` e usam as variáveis da Forja:
  `{{TASK_ID}}` → `{{item.number}}`, `{{ISSUE_TITLE}}` → `{{item.title}}`, `{{BRANCH}}` → `{{item.branch}}`,
  `{{BASE_BRANCH}}` → `{{project.baseBranch}}`. As diretivas `` !`…` `` continuam: a Forja as executa no
  workspace do item antes de enviar o prompt.
- O branch de cada issue é `forja/issue-<número>`, num worktree em `~/.forja/worktrees/` montado num container
  por item.
- As screenshots da evidência ficam em `.pr-evidence/screenshots/`, mas a Forja não as envia ao PR.
- Quando o limite de uso do Claude é atingido, a run pausa e retoma sozinha depois do reset mais a
  "Margem após o limite de uso" das **Configurações do projeto**; o `tokenBudgetPerWindow` vira o orçamento por
  run, por nó ou por dia.
