---
key: ENG-13
title: "Executores dos nós trigger, script, condition e output"
type: issue
milestone: "Fase 5 — Motor de execução"
labels: [tipo:feature, area:motor]
depends_on: [ENG-12]
---

## Contexto

Atende RF-RUN-03 (o loop depende de um `script` de testes) e as boas práticas do benchmark: verificação determinística
no loop, não só a opinião de outro agente. O registro `node_executors.ts` de #{ENG-10} recebe aqui os executores que
não são agentes. O `script` roda **dentro do container do item** (`workspace.exec`), igual ao agente.

## Objetivo

Os nós `trigger`, `script`, `condition` e `output` executam numa run real com o `FakeAgentRuntime`, com saídas no formato
de #{FLW-01}.

## Escopo

**Inclui:** quatro executores, cauda do stdout como saída, eventos de log das linhas do script.
**Não inclui:** source (#{BRD-04}), git (#{GIT-01}), gate (#{GIT-03}); comentar na issue (feito em #{GIT-02}).

## Especificação técnica

### Arquivos

Criar:

- `src/server/runtime/executors/trigger_executor.ts`
- `src/server/runtime/executors/script_executor.ts`
- `src/server/runtime/executors/condition_executor.ts`
- `src/server/runtime/executors/output_executor.ts`
- `src/server/runtime/executors/deterministic_executors.test.ts`
  Alterar:
- `src/server/runtime/node_executors.ts`

### Contratos e semântica

- `trigger`: `outputs.items` = itens da run (snapshots); termina na hora.
- `script`: `workspace.exec(config.command, { timeoutMs, signal, onOutput })`; cada linha vira `AgentEvent` `raw`
  (aparece nos logs); `outputs.result = { exitCode, stdoutTail }` (últimas 200 linhas). **Exit code ≠ 0 não é falha do
  nó** — o resultado é um dado que a condição do loop avalia; falha do nó só em timeout ou erro de workspace.
- `condition`: `evaluateCondition(config.condition, inputs.value)`; `outputs.true` ou `outputs.false` recebe o valor de
  entrada; o scheduler pula o ramo não escolhido (#{ENG-03}).
- `output`: registra artefato `{ name: "item_outcome", kind: "json", value: { moveItemTo } }` — o board (#{BRD-05}) lê
  esse artefato para "Concluído"/"Precisa de humano".

### Passo a passo

1. Implemente os executores e registre-os.
2. Teste de ponta a ponta com `buildLoopFlow()`: o script de testes devolve exit 1 na iteração 1 e 0 na 2 (roteirizado no fake), e o loop sai na 2.

## Critérios de aceite

- [ ] Script com exit 1 produz `result.exitCode = 1` e o NodeRun termina `SUCCEEDED`.
- [ ] Script que excede o timeout falha com `timeout_total`.
- [ ] Linhas do script chegam como eventos de log.
- [ ] Condition envia o valor para a porta certa e o outro ramo é pulado.
- [ ] Output grava o artefato `item_outcome`.
- [ ] `npm run typecheck`, `npm run lint` e `npm run test` passam.

## Testes

- `deterministic_executors.test.ts`: unidade de cada executor e o cenário do loop de ponta a ponta.
