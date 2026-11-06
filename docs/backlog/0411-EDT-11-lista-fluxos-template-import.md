---
key: EDT-11
title: "Lista de fluxos: novo a partir de template, importar e exportar"
type: issue
milestone: "Fase 4 — Editor visual"
labels: [tipo:feature, area:editor]
depends_on: [EDT-10, FLW-06]
---

## Contexto

Atende RF-PRJ-03, RF-EDT-08 e RF-EDT-09. A porta de entrada dos fluxos de um projeto: ver os fluxos, criar um novo a
partir de um template (#{FLW-06}) ou em branco, importar um `.forja.yaml` e exportar a versão publicada ou o rascunho
(#{FLW-05}).

## Objetivo

Em `/projects/:projectId/flows` o usuário lista, cria (template ou em branco), importa, exporta, renomeia, marca como
padrão e arquiva fluxos.

## Escopo

**Inclui:** `FlowsPage`, diálogo de novo fluxo com cartões de template, importar arquivo, exportar (download), ações por fluxo.
**Não inclui:** prévia gráfica do template (pode ser uma lista de etapas em texto).

## Especificação técnica

### Arquivos

Criar:

- `src/web/app/flows/use_flows.ts`
- `src/web/app/flows/new_flow_dialog.tsx`
- `src/web/app/flows/import_flow_button.tsx`
- `src/web/app/flows/flows_page.test.tsx`
  Alterar:
- `src/web/app/flows/flows_page.tsx` (substituir o placeholder)
- `src/web/app/flows/flow_editor_page.tsx` (menu "Exportar")

### Contratos

```ts
export function useFlows(projectId: string): UseQueryResult<FlowSummary[]>;
export function useFlowTemplates(): UseQueryResult<
    { id: string; name: string; description: string }[]
>;
export function useCreateFlow(
    projectId: string,
): UseMutationResult<FlowSummary, ApiError, { name: string; templateId?: string }>;
export function useImportFlow(
    projectId: string,
): UseMutationResult<FlowSummary, ApiError, string /* yaml */>;
```

### Passo a passo

1. Hooks.
2. Tabela: nome, padrão (estrela), última versão, atualizado em; ações: abrir, renomear, padrão, exportar (versão/rascunho), arquivar.
3. Novo fluxo: cartões "Em branco", "Fábrica básica", "Dev ↔ Review em loop", e os que existirem; nome obrigatório; ao criar, abre o editor.
4. Importar: input de arquivo `.yaml/.yml`; erro 422 mostra a posição.
5. Exportar baixa `<slug>.forja.yaml`.

## Critérios de aceite

- [ ] Criar a partir de "Fábrica básica" abre o editor com o fluxo canônico.
- [ ] Importar um YAML exportado recria o fluxo; YAML inválido mostra o erro com linha.
- [ ] Marcar como padrão desmarca o anterior na lista.
- [ ] Arquivados ficam ocultos, com filtro "mostrar arquivados".
- [ ] `npm run typecheck`, `npm run lint` e `npm run test` passam.

## Testes

- `flows_page.test.tsx`: lista vazia, criar por template, importar com erro, padrão.
