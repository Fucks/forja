---
key: PRJ-02
title: "Telas de projetos: lista, criação e visão geral"
type: issue
milestone: "Fase 2 — Projetos, credenciais e ferramentas"
labels: [tipo:feature, area:projetos]
depends_on: [PRJ-01, DS-04, F-09]
---

## Contexto

Atende RF-PRJ-01. Com a API de #{PRJ-01}, o usuário precisa cadastrar o primeiro projeto pela interface — é a porta
de entrada do produto. A visão geral do projeto vira o ponto de partida para fluxos, board e runs.

## Objetivo

Na página inicial o usuário vê seus projetos, cadastra um novo informando o caminho do repositório e abre a visão
geral do projeto com os dados detectados e atalhos para as áreas.

## Escopo

**Inclui:** `ProjectsPage`, diálogo de novo projeto, `ProjectPage` (visão geral), hooks de query, seletor de projeto na sidebar.
**Não inclui:** configurações do projeto (#{CFG-05}), contadores de runs/itens (entram com #{OBS-04} e #{BRD-05}).

## Especificação técnica

### Arquivos

Criar:

- `src/web/app/projects/use_projects.ts`
- `src/web/app/projects/new_project_dialog.tsx`
- `src/web/app/projects/projects_page.test.tsx`
  Alterar (substituir o placeholder):
- `src/web/app/projects/projects_page.tsx`
- `src/web/app/projects/project_page.tsx`
- `src/web/app/sidebar.tsx` (lista de projetos para trocar de projeto)

### Contratos

```ts
export function useProjects(): UseQueryResult<Project[]>;
export function useProject(id: string): UseQueryResult<Project>;
export function useCreateProject(): UseMutationResult<Project, ApiError, CreateProjectInput>;
```

Tipos importados de `src/server/projects/project_types.ts` **apenas como tipo** (`import type`) — ou mova os tipos
puros para `src/shared/project_types.ts` e reexporte no servidor (preferível; faça isso aqui).

### Passo a passo

1. Mova `Project` e `createProjectInput` para `src/shared/project_types.ts` (criar) e ajuste os imports de #{PRJ-01}.
2. Hooks com TanStack Query (chave `["projects"]`).
3. `ProjectsPage`: lista em tabela (nome, caminho em mono, repo GitHub, branch base) e botão "Novo projeto"; EmptyState com a mesma ação quando vazio.
4. `NewProjectDialog`: campos nome e caminho do repositório (texto; dica "ex.: C:\\dev\\meu-repo"); erros da API no campo.
5. `ProjectPage`: KeyValue com caminho, branch base, GitHub e o que foi detectado (CodeGraph, CODING_STANDARDS, Sandcastle) com dica de próximo passo; cards de atalho para Fluxos, Board, Runs.

### Notas de design

Superfície de formulários/listas. Caminhos e branches em JetBrains Mono. Detecções como badges neutros com ícone
`Check`. Erro de "não é repositório git" aparece sob o campo, não em toast.

## Critérios de aceite

- [ ] Sem projetos, a página mostra EmptyState com "Novo projeto".
- [ ] Criar projeto válido fecha o diálogo, atualiza a lista e navega para a visão geral.
- [ ] Erro 422/409 aparece no campo de caminho com a mensagem da API.
- [ ] A sidebar lista os projetos e troca de projeto mantendo a área atual.
- [ ] `npm run typecheck`, `npm run lint` e `npm run test` passam.

## Testes

- `projects_page.test.tsx` (API mockada): lista vazia, criação com sucesso, erro no campo, navegação.
