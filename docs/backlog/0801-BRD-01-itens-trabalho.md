---
key: BRD-01
title: "Itens de trabalho e itens locais"
type: issue
milestone: "Fase 8 — Board e itens"
labels: [tipo:feature, area:board]
depends_on: [PRJ-01]
---

## Contexto
Atende RF-BRD-02. Um item de trabalho (`WorkItem`) é o que atravessa a linha de montagem: uma issue do GitHub
(sincronizada em #{BRD-03}) ou um item criado na própria Forja. O executor (#{ENG-10}) recebe os itens por
`WorkItemService.snapshots`, e o board (#{BRD-05}) os lista.

## Objetivo
Existe um `work_item_service` testado com a API para criar, editar, listar e arquivar itens locais e consultar qualquer
item, incluindo dependências ("bloqueado por") e o branch que o item usa.

## Escopo
**Inclui:** tabela `work_items`, service, rotas, snapshots para o executor, cálculo do branch, evento `work_item.*`.
**Não inclui:** sincronização com o GitHub (#{BRD-03}), telas (#{BRD-05}, #{BRD-07}).

## Especificação técnica
### Arquivos
Criar:
- `src/shared/work_item_types.ts`
- `src/server/db/migrations/0700_work_items.sql`
- `src/server/db/schema/work_items.ts`
- `src/server/work_items/work_item_repository.ts`
- `src/server/work_items/work_item_service.ts`
- `src/server/work_items/work_item_service.test.ts`
- `src/server/work_items/work_items_routes.test.ts`
Alterar:
- `src/server/work_items/work_items_routes.ts` (substituir o stub de #{F-03})

### Contratos
```ts
export interface WorkItem {
    id: string; projectId: string; source: "github" | "local";
    number?: number; url?: string;                // issues do GitHub
    title: string; body: string; labels: string[]; state: "open" | "closed";
    blockedBy: string[];                          // ids de WorkItem do mesmo projeto
    branch: string;                               // forja/issue-<número> | forja/item-<8 primeiros chars do id>
    manualColumn?: "backlog" | "needs_human" | "done"; // definido pelo usuário ou pelo nó output
    archived: boolean; createdAt: string; updatedAt: string; syncedAt?: string;
}
export const localItemInput = z.object({ title: z.string().trim().min(1).max(200), body: z.string().max(50_000).default(""),
    labels: z.array(z.string()).default([]), blockedBy: z.array(z.string()).default([]) });
export interface WorkItemService {
    createLocal(projectId: string, input: LocalItemInput): Promise<WorkItem>;
    updateLocal(id: string, input: Partial<LocalItemInput> & { state?: "open" | "closed" }): Promise<WorkItem>; // github → 409
    setManualColumn(id: string, column: WorkItem["manualColumn"] | null): Promise<WorkItem>;
    list(projectId: string, opts?: { state?: "open" | "closed"; label?: string; includeArchived?: boolean }): Promise<WorkItem[]>;
    get(id: string): Promise<WorkItem>;
    isBlocked(item: WorkItem, all: Map<string, WorkItem>): boolean; // algum blockedBy ainda open
    snapshots(projectId: string, ids: string[]): Promise<WorkItemSnapshot[]>; // formato de #{ENG-10}
    upsertFromGithub(projectId: string, issues: GithubIssueData[]): Promise<{ created: number; updated: number }>; // usado por #{BRD-03}
}
```
`GithubIssueData` declarado aqui (`{ number, title, body, url, labels, state, blockedByNumbers: number[] }`), traduzido para
`blockedBy` por id. Tabela `work_items` com `UNIQUE(project_id, source, number)`.
Rotas: `GET/POST /api/projects/:projectId/work-items`, `GET/PATCH /api/work-items/:id`, `POST /api/work-items/:id/column`.

### Passo a passo
1. Tipos, migração, schema, repositório.
2. Service: branch calculado na criação (estável), eventos `work_item.created`/`updated`, `isBlocked` puro.
3. `upsertFromGithub` (cria/atualiza por número; resolve `blockedByNumbers` após inserir todos).
4. Rotas.

## Critérios de aceite
- [ ] Criar item local gera branch `forja/item-<prefixo>` estável.
- [ ] Editar item do GitHub pela API local → 409.
- [ ] `isBlocked` é verdadeiro se algum bloqueador está aberto e falso quando todos fecharam.
- [ ] `upsertFromGithub` duas vezes com os mesmos dados não duplica e resolve dependências entre issues do lote.
- [ ] `npm run typecheck`, `npm run lint` e `npm run test` passam.

## Testes
- `work_item_service.test.ts` e `work_items_routes.test.ts` com `createTestDb`.
