---
key: GIT-05
title: "Template Pipeline Sandcastle de ponta a ponta"
type: issue
milestone: "Fase 10 — Git, gates e PR"
labels: [tipo:feature, area:fluxo]
depends_on: [GIT-03, GIT-02, FLW-06]
---

## Contexto

Atende RF-EDT-08 e a oportunidade 10 do benchmark: a Forja deve substituir o pipeline que o usuário roda hoje
(`.sandcastle/main.mts`): sync → plan → implement (até 100 iterações) → review → rebase → evidence (checks, critérios de
aceite, screenshots) → PR, com guarda de limite de uso e retentativas. Com todos os tipos de nó prontos, esta issue monta
esse fluxo como template, com os prompts reais do repositório, e prova de ponta a ponta com o runtime fake.

## Objetivo

O template "Pipeline Sandcastle" reproduz o pipeline atual no canvas, publica sem erros e roda de ponta a ponta no
`FakeAgentRuntime` abrindo PRs (fake) para itens desbloqueados.

## Escopo

**Inclui:** template, prompts adaptados (`plan`, `implement`, `review`, `rebase`, `evidence`), teste de ponta a ponta, nota de migração no README.
**Não inclui:** screenshots reais no fake (o nó de evidência só precisa produzir o corpo do PR).

## Especificação técnica

### Arquivos

Criar:

- `src/server/flows/templates/sandcastle_pipeline.ts`
- `src/server/flows/templates/prompts/sandcastle_implement.md`
- `src/server/flows/templates/prompts/sandcastle_review.md`
- `src/server/flows/templates/prompts/sandcastle_evidence.md`
- `src/server/flows/templates/sandcastle_pipeline.test.ts`
  Alterar:
- `src/server/flows/templates/flow_template_registry.ts`

### Contratos (estrutura do fluxo)

1. `trigger(manual)` → `source(github, label "Sandcastle", skipBlocked, limit 10)` — substitui o _planner_ (a ordem e o
   bloqueio por dependência já são do `source`, #{BRD-04}).
2. `map "Implementar e revisar"` (concorrência 1 por padrão — igual ao pipeline atual, um item por vez; o usuário sobe para 3):
    - `agent "Implementer"`: workspace `item`, `maxIterations` 100, `idleTimeoutMinutes` 15, prompt de `implement-prompt.md`
      com `{{item.number}}`, `{{item.title}}`, `{{item.branch}}`, `{{project.baseBranch}}`; perfil `tlp_builtin_codegraph`.
    - `condition "Fez commits?"` sobre `implementer.result.commits` (saída `{ commits: number }` — o executor de agente acrescenta `commits` ao `result`: altere `src/server/runtime/executors/agent_executor.ts` para incluir `commitCount` na saída `result` quando não houver schema).
      Falso → `output(needs_human)`.
    - `agent "Reviewer"` (`maxIterations` 1, prompt de `review-prompt.md`).
    - `git rebase`.
    - `agent "Evidence"` (prompt de `evidence-prompt.md`, saída estruturada `{ checksPassed: boolean, failureSummary?: string, body: string }`).
    - `condition "Checks passaram?"` → verdadeiro: `git open_pr` (`bodyFrom: "evidence.body"`) → `output(done)`; falso → `output(needs_human)`.
3. Margem de limite de uso e retentativas herdadas das configurações (o `usage_guard` vira configuração).

Os prompts: copie de `.sandcastle/*.md` e troque `{{TASK_ID}}`→`{{item.number}}`, `{{ISSUE_TITLE}}`→`{{item.title}}`,
`{{BRANCH}}`→`{{item.branch}}`, `{{BASE_BRANCH}}`→`{{project.baseBranch}}`, `{{EVIDENCE_DIR}}`→`.pr-evidence`. Mantenha
as diretivas `` !`…` `` (o runtime da Forja as executa no workspace, #{RT-02}).

### Passo a passo

1. Prompts adaptados e template.
2. Ajuste do `agent_executor` (`commitCount`).
3. Teste de ponta a ponta: 3 issues no `FakeGitHubProvider` (uma bloqueada pela outra), `FakeAgentRuntime` com commits na
   2ª e falha de checks na 3ª: verificar PR aberto para a 1ª, a bloqueada não começa, a 3ª vai para "precisa de humano".
4. Seção no README "Migrando do `.sandcastle/main.mts`".

## Critérios de aceite

- [ ] O template aparece na lista e publica sem erros.
- [ ] No teste de ponta a ponta, o item desbloqueado gera PR com o corpo da evidência e `Closes #N`.
- [ ] O item bloqueado não entra na run.
- [ ] Implementer sem commits leva o item a "Precisa de humano".
- [ ] Checks falhando levam o item a "Precisa de humano" com o resumo da falha.
- [ ] `npm run typecheck`, `npm run lint` e `npm run test` passam.

## Testes

- `sandcastle_pipeline.test.ts`: validade do template e o cenário de ponta a ponta acima.
