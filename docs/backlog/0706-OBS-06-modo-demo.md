---
key: OBS-06
title: "Modo demo: runtime roteirizado e --seed-demo"
type: issue
milestone: "Fase 7 — Execução ao vivo e logs"
labels: [tipo:feature, area:execucao-ao-vivo]
depends_on: [OBS-03, FLW-06, RT-05, BRD-04]
---

## Contexto

O pipeline Sandcastle tira screenshots das telas em cada PR (`.sandcastle/evidence-prompt.md` roda
`FORJA_DATA_DIR=/tmp/forja-evidence npm run start -- --port 3000 --seed-demo`), mas o sandbox não tem Docker nem
`claude`. O E2E (#{QA-01}) também precisa de execuções sem credenciais. Esta issue cria um runtime roteirizado de
produção (`FORJA_AGENT_RUNTIME=fake`) e o seed de demonstração.

## Objetivo

Com `--seed-demo` num diretório de dados vazio, a Forja sobe com um projeto de demonstração, o fluxo "Fábrica básica"
publicado, itens locais e uma run concluída com logs; com `FORJA_AGENT_RUNTIME=fake`, novas runs executam com agentes
simulados que geram eventos realistas em segundos.

## Escopo

**Inclui:** `ScriptedAgentRuntime` (código de produção, relógio real, sem Docker), seed idempotente, flag do CLI.
**Não inclui:** dados de demonstração no board além de itens locais.

## Especificação técnica

### Arquivos

Criar:

- `src/integrations/agent_runtime/scripted_agent_runtime.ts`
- `src/integrations/agent_runtime/scripted_agent_runtime.test.ts`
- `src/server/demo/seed_demo.ts`
- `src/server/demo/demo_script.ts`
- `src/server/demo/seed_demo.test.ts`
  Alterar:
- `src/server/main.ts` (`FORJA_AGENT_RUNTIME=fake` → `ScriptedAgentRuntime`; `options.seedDemo` → `seedDemo()` antes de escutar)

### Contratos

```ts
export function createScriptedAgentRuntime(opts: {
    clock: Clock;
    speed?: number /* 1 = tempo de demo padrão */;
    script?: DemoScript;
}): AgentRuntime;
// cada run de agente: 3–8 s, emite texto e tool calls plausíveis (Read, Grep, Edit, Bash "npm run test"), usage aleatório determinístico por nodeRunId,
// saída que satisfaz o outputSchema (gera valor mínimo válido: boolean true, string "ok", number 0); workspace/exec simulados em memória
export async function seedDemo(deps: AppServices): Promise<{ created: boolean; projectId: string }>;
// cria: projeto "Demo — loja de café" (repoPath = diretório temporário com `git init`), 5 itens locais, fluxo da "Fábrica básica" publicado,
// e executa uma run completa com o ScriptedAgentRuntime em velocidade alta (speed 50) até terminar — gera NodeRuns, logs e uso reais
```

Idempotente: se já existe um projeto com `app_meta.demo_seeded = true`, não faz nada.
A "Fábrica básica" usa `source(github)`; no demo, troque o provider do nó source para `local` antes de publicar.

### Passo a passo

1. `ScriptedAgentRuntime` com geração determinística (semente = `nodeRunId`).
2. Gerador de valor mínimo válido para um JSON Schema (reutilize `jsonSchemaToZod` de #{RT-02} se útil).
3. `seedDemo` usando os services reais.
4. Wiring no `main.ts`.

## Critérios de aceite

- [ ] `FORJA_DATA_DIR=<vazio> FORJA_AGENT_RUNTIME=fake npm run start -- --no-open --seed-demo` sobe com o projeto demo, o fluxo publicado e uma run concluída com logs.
- [ ] Rodar o seed de novo não duplica nada.
- [ ] Uma nova run no modo fake percorre o fluxo canônico em menos de 1 min, com estados ao vivo no canvas.
- [ ] Saídas simuladas passam na validação de `outputSchema`.
- [ ] `npm run typecheck`, `npm run lint` e `npm run test` passam.

## Testes

- `scripted_agent_runtime.test.ts` (FakeClock): determinismo, saída válida, eventos.
- `seed_demo.test.ts` (banco e diretório temporários): criação, idempotência, run concluída.
