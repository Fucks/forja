---
key: FLW-04
title: "Fluxos e versões: persistência e API"
type: issue
milestone: "Fase 3 — Modelo de fluxo"
labels: [tipo:feature, area:fluxo]
depends_on: [FLW-02, FLW-03, PRJ-01]
---

## Contexto

Atende RF-PRJ-03 e RF-EDT-07. Um projeto tem vários fluxos; cada fluxo tem um **rascunho** editável e **versões
publicadas imutáveis**. Uma run fica presa à versão em que começou (regra fixa do PRD), então editar o fluxo nunca
altera o que está rodando. O editor (#{EDT-01}) salva o rascunho continuamente; publicar valida com #{FLW-02}.

## Objetivo

Existe `flow_service` testado e a API para criar, listar, renomear, arquivar fluxos, salvar o rascunho, publicar
versão (com validação) e ler versões.

## Escopo

**Inclui:** tabelas `flows` e `flow_versions`, service, rotas, evento `flow.published`, controle de concorrência do rascunho.
**Não inclui:** YAML (#{FLW-05}), templates (#{FLW-06}), diff (#{EDT-10}).

## Especificação técnica

### Arquivos

Criar:

- `src/shared/flow_types.ts`
- `src/server/db/migrations/0500_flows.sql`
- `src/server/db/schema/flows.ts`
- `src/server/flows/flow_repository.ts`
- `src/server/flows/flow_service.ts`
- `src/server/flows/flow_service.test.ts`
- `src/server/flows/flows_routes.test.ts`
  Alterar:
- `src/server/flows/flows_routes.ts` (substituir o stub de #{F-03})

### Contratos

```ts
export interface FlowSummary {
    id: string;
    projectId: string;
    name: string;
    isDefault: boolean;
    archived: boolean;
    latestVersion?: number;
    draftUpdatedAt: string;
    draftRevision: number;
}
export interface FlowVersion {
    flowId: string;
    version: number;
    graph: FlowGraph;
    publishedAt: string;
    note?: string;
}
export interface FlowDraft {
    flowId: string;
    graph: FlowGraph;
    revision: number;
    updatedAt: string;
}

export interface FlowService {
    create(projectId: string, input: { name: string; graph?: FlowGraph }): Promise<FlowSummary>; // grafo padrão: só um trigger manual
    list(projectId: string, opts?: { includeArchived?: boolean }): Promise<FlowSummary[]>;
    rename(flowId: string, name: string): Promise<FlowSummary>;
    setDefault(flowId: string): Promise<void>; // desmarca os outros do projeto
    archive(flowId: string): Promise<void>;
    getDraft(flowId: string): Promise<FlowDraft>;
    saveDraft(flowId: string, graph: FlowGraph, expectedRevision: number): Promise<FlowDraft>; // ConflictError se revision mudou
    publish(flowId: string, note?: string): Promise<FlowVersion>; // DomainValidationError com issues se houver erro
    getVersion(flowId: string, version: number): Promise<FlowVersion>;
    listVersions(flowId: string): Promise<Omit<FlowVersion, "graph">[]>;
    restoreVersionToDraft(flowId: string, version: number): Promise<FlowDraft>;
}
export function createFlowService(deps: {
    repo: FlowRepository;
    events: EventBus;
    clock: Clock;
    validationContext(projectId: string): Promise<ValidationContext>;
}): FlowService;
```

Tabelas: `flows(id, project_id FK, name, is_default, archived, draft_json, draft_revision, draft_updated_at, created_at)` e
`flow_versions(flow_id FK, version, graph_json, published_at, note, PRIMARY KEY(flow_id, version))`.
Rotas sob `/api/projects/:projectId/flows` e `/api/flows/:flowId` (`GET/PUT draft`, `POST publish`, `GET versions`,
`GET versions/:version`, `POST versions/:version/restore`, `PATCH`, `POST archive`, `POST default`).

### Passo a passo

1. Tipos, migração, schema, repositório.
2. Service: `saveDraft` valida o shape (`parseFlowGraph`) mas aceita grafo semanticamente inválido (é rascunho); `publish` roda `validateFlowGraph` com `checkPrompt: checkPromptVariables` e recusa se houver `error`; versão = última + 1; emite `flow.published`.
3. O `validationContext` real (perfis e credenciais existentes) é montado nas rotas a partir dos services de #{CFG-02} e #{CFG-04}.
4. Rotas com Zod.

## Critérios de aceite

- [ ] Criar fluxo gera rascunho com um nó trigger e `revision` 1.
- [ ] `saveDraft` com `expectedRevision` antiga → 409.
- [ ] Publicar grafo com erro → 422 com a lista de `ValidationIssue`; sem erro → nova versão imutável.
- [ ] Editar o rascunho depois de publicar não altera a versão publicada.
- [ ] Só um fluxo padrão por projeto.
- [ ] `npm run typecheck`, `npm run lint` e `npm run test` passam.

## Testes

- `flow_service.test.ts`: criação, revisão otimista, publicação válida/inválida, numeração, restaurar, padrão único, evento emitido.
- `flows_routes.test.ts`: status codes e corpo do 422.
